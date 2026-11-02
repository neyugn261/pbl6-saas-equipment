import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

import '../../core/api/api_exception.dart';

typedef AttachmentApi = Future<Object?> Function(
  String method,
  String path, {
  Object? body,
  String? idempotencyKey,
});

String _uuid() {
  final bytes = List<int>.generate(16, (_) => Random.secure().nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

class AttachmentAttempt {
  AttachmentAttempt._(
    this.workOrderId,
    this.report,
    this.fileName,
    this.mimeType,
    this.bytes,
    this.scope,
  ) : checksumSha256 = sha256.convert(bytes).toString(),
      prepareKey = _uuid(),
      finalizeKey = _uuid();

  final String workOrderId, fileName, mimeType, checksumSha256;
  final bool report;
  final Uint8List bytes;
  final String scope, prepareKey, finalizeKey;
  String? uploadId, uploadUrl, attachmentId;
  Map<String, String>? headers;
  DateTime? expiresAt;
  bool putSucceeded = false;
}

/// One session's K8 transport. Callers retain an attempt after uncertain
/// responses and retry it with the same keys; it is never an offline queue.
class AttachmentClient {
  AttachmentClient({
    required this.api,
    required this.sessionScope,
    http.Client? storage,
  }) : _storage = storage ?? http.Client();

  final AttachmentApi api;
  final String Function() sessionScope;
  final http.Client _storage;

  AttachmentAttempt create({
    required String workOrderId,
    required bool report,
    required String fileName,
    required String mimeType,
    required Uint8List bytes,
  }) {
    if (bytes.isEmpty || bytes.length > 10 * 1024 * 1024) {
      throw const ApiException('ATTACHMENT_TOO_LARGE', status: 413);
    }
    if (!['image/jpeg', 'image/png', 'application/pdf'].contains(mimeType)) {
      throw const ApiException('ATTACHMENT_TYPE_UNSUPPORTED', status: 415);
    }
    if (fileName.isEmpty ||
        fileName.length > 255 ||
        fileName == '.' ||
        fileName == '..' ||
        fileName.contains(RegExp(r'[/\\\x00-\x1f\x7f]'))) {
      throw const ApiException('VALIDATION_FAILED', status: 400);
    }
    final scope = sessionScope();
    if (scope.isEmpty) throw const ApiException('SESSION_CHANGED');
    return AttachmentAttempt._(
      workOrderId,
      report,
      fileName,
      mimeType,
      bytes,
      scope,
    );
  }

  void _check(AttachmentAttempt attempt) {
    if (sessionScope() != attempt.scope) {
      throw const ApiException('SESSION_CHANGED');
    }
  }

  Map<String, dynamic> _object(Object? value) {
    if (value is Map<String, dynamic>) return value;
    throw const ApiException('INVALID_RESPONSE');
  }

  Future<Map<String, dynamic>> upload(AttachmentAttempt attempt) async {
    _check(attempt);
    if (attempt.uploadId == null) {
      final suffix = attempt.report ? '/service-report' : '';
      final ticket = _object(
        await api(
          'POST',
          '/api/workorders/work-orders/${attempt.workOrderId}$suffix/attachment-uploads',
          body: {
            'fileName': attempt.fileName,
            'mimeType': attempt.mimeType,
            'sizeBytes': attempt.bytes.length,
            'checksumSha256': attempt.checksumSha256,
          },
          idempotencyKey: attempt.prepareKey,
        ),
      );
      _check(attempt);
      if (ticket['method'] != 'PUT' ||
          ticket['uploadId'] is! String ||
          ticket['uploadUrl'] is! String ||
          ticket['headers'] is! Map ||
          ticket['expiresAt'] is! String) {
        throw const ApiException('INVALID_RESPONSE');
      }
      final expiry = DateTime.tryParse(ticket['expiresAt'] as String);
      final uri = Uri.tryParse(ticket['uploadUrl'] as String);
      final rawHeaders = ticket['headers'] as Map;
      if (rawHeaders.entries.any(
        (entry) => entry.key is! String || entry.value is! String,
      )) {
        throw const ApiException('INVALID_RESPONSE');
      }
      final headers = Map<String, String>.from(rawHeaders);
      if (expiry == null ||
          uri == null ||
          !['http', 'https'].contains(uri.scheme) ||
          uri.host.isEmpty ||
          uri.userInfo.isNotEmpty ||
          headers.length != 1 ||
          headers['Content-Type'] != attempt.mimeType) {
        throw const ApiException('INVALID_RESPONSE');
      }
      attempt.uploadId = ticket['uploadId'] as String;
      attempt.uploadUrl = ticket['uploadUrl'] as String;
      attempt.headers = headers;
      attempt.expiresAt = expiry;
    }
    if (!attempt.putSucceeded) {
      if (DateTime.now().isAfter(attempt.expiresAt!)) {
        throw const ApiException('UPLOAD_EXPIRED', status: 409);
      }
      final request = http.Request('PUT', Uri.parse(attempt.uploadUrl!))
        ..followRedirects = false
        ..headers.addAll(attempt.headers!)
        ..bodyBytes = attempt.bytes;
      try {
        final response = await _storage
            .send(request)
            .timeout(const Duration(seconds: 30));
        await response.stream.drain<void>();
        _check(attempt);
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw ApiException(
            'ATTACHMENT_STORAGE_UNAVAILABLE',
            status: response.statusCode,
          );
        }
        attempt.putSucceeded = true;
      } on TimeoutException {
        throw const ApiException('TIMEOUT');
      } on http.ClientException {
        throw const ApiException('NETWORK_ERROR');
      }
    }
    final result = _object(
      await api(
        'POST',
        '/api/workorders/attachment-uploads/${attempt.uploadId}/complete',
        body: <String, Object>{},
        idempotencyKey: attempt.finalizeKey,
      ),
    );
    _check(attempt);
    if (result['id'] is! String) throw const ApiException('INVALID_RESPONSE');
    attempt.attachmentId = result['id'] as String;
    return result;
  }

  Future<void> abort(AttachmentAttempt attempt) async {
    _check(attempt);
    if (attempt.uploadId == null || attempt.attachmentId != null) return;
    await api(
      'DELETE',
      '/api/workorders/attachment-uploads/${attempt.uploadId}',
    );
    _check(attempt);
  }

  void close() => _storage.close();
}
