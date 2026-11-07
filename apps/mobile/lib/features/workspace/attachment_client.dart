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

String attachmentOperationId() {
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
      sizeBytes = bytes.length,
      prepareKey = attachmentOperationId(),
      finalizeKey = attachmentOperationId();

  AttachmentAttempt.restore(Map<String, dynamic> data, this.bytes)
    : workOrderId = data['workOrderId'] as String,
      report = data['report'] as bool,
      fileName = data['fileName'] as String,
      mimeType = data['mimeType'] as String,
      scope = data['scope'] as String,
      checksumSha256 = data['checksumSha256'] as String,
      sizeBytes = data['sizeBytes'] as int,
      prepareKey = data['prepareKey'] as String,
      finalizeKey = data['finalizeKey'] as String {
    uploadId = data['uploadId'] as String?;
    attachmentId = data['attachmentId'] as String?;
    authorityId = data['authorityId'] as String?;
    uploadedBy = data['uploadedBy'] as String?;
    putSucceeded = data['putSucceeded'] == true;
    prepareStarted = data['prepareStarted'] == true;
    finalizeStarted = data['finalizeStarted'] == true;
    localReady = data['localReady'] == true;
    aborted = data['aborted'] == true;
    staged = true;
  }

  final String workOrderId, fileName, mimeType, checksumSha256;
  final bool report;
  final Uint8List bytes;
  final int sizeBytes;
  final String scope, prepareKey, finalizeKey;
  String? authorityId, uploadedBy;
  bool prepareStarted = false,
      finalizeStarted = false,
      localReady = false,
      staged = false,
      aborted = false;
  bool inFlight = false, pauseRequested = false;
  Map<String, dynamic> toJson() => {
    'version': 1,
    'workOrderId': workOrderId,
    'report': report,
    'fileName': fileName,
    'mimeType': mimeType,
    'scope': scope,
    'checksumSha256': checksumSha256,
    'sizeBytes': sizeBytes,
    'prepareKey': prepareKey,
    'finalizeKey': finalizeKey,
    'uploadId': uploadId,
    'attachmentId': attachmentId,
    'authorityId': authorityId,
    'uploadedBy': uploadedBy,
    'putSucceeded': putSucceeded,
    'prepareStarted': prepareStarted,
    'finalizeStarted': finalizeStarted,
    'localReady': localReady,
    'aborted': aborted,
  };
  String? uploadId, uploadUrl, attachmentId;
  Map<String, String>? headers;
  DateTime? expiresAt;
  bool putSucceeded = false;
  Completer<void>? _abortPut;
  bool get isPutActive => _abortPut != null;
}

abstract interface class AttachmentPersistence {
  Future<void> save(AttachmentAttempt attempt, {bool initial = false});
  Future<AttachmentAttempt?> load(String orderId, String scope);
  Future<void> remove(AttachmentAttempt attempt);
}

abstract interface class AttachmentSelection {
  Future<void> recover();
  Future<AttachmentAttempt?> pick(
    String orderId,
    bool report,
    String authorityId,
    String source,
  );
  String? get recoveryOrderId;
  String? get recoveryMessage;
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
  AttachmentPersistence? persistence;
  Future<AttachmentPersistence>? persistenceReady;
  Future<bool> Function(AttachmentAttempt)? mayWrite;
  bool _closed = false;
  final _flights = <AttachmentAttempt, Future<Map<String, dynamic>>>{};
  final _activeOrders = <String, AttachmentAttempt>{};

  AttachmentAttempt create({
    required String workOrderId,
    required bool report,
    required String fileName,
    required String mimeType,
    required Uint8List bytes,
    String? authorityId,
    String? uploadedBy,
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
      )
      ..authorityId = authorityId
      ..uploadedBy = uploadedBy;
  }

  void _check(AttachmentAttempt attempt) {
    if (_closed || sessionScope() != attempt.scope) {
      throw const ApiException('SESSION_CHANGED');
    }
  }

  Map<String, dynamic> _object(Object? value) {
    if (value is Map<String, dynamic>) return value;
    throw const ApiException('INVALID_RESPONSE');
  }

  bool cancelActivePut(AttachmentAttempt attempt) {
    _check(attempt);
    final trigger = attempt._abortPut;
    if (trigger == null || trigger.isCompleted) return false;
    trigger.complete();
    return true;
  }

  Future<Map<String, dynamic>> upload(
    AttachmentAttempt attempt, {
    void Function(int sentBytes, int totalBytes)? onProgress,
  }) {
    if (_flights.containsKey(attempt)) return _flights[attempt]!;
    final active = _activeOrders[attempt.workOrderId];
    if (active != null) {
      if (active.prepareKey != attempt.prepareKey) {
        return Future.error(const ApiException('UPLOAD_IN_PROGRESS'));
      }
      return _flights[active]!;
    }
    late final Future<Map<String, dynamic>> flight;
    flight = _upload(attempt, onProgress: onProgress).whenComplete(() {
      _flights.remove(attempt);
      if (identical(_activeOrders[attempt.workOrderId], attempt)) {
        _activeOrders.remove(attempt.workOrderId);
      }
      attempt.inFlight = false;
    });
    _flights[attempt] = flight;
    _activeOrders[attempt.workOrderId] = attempt;
    return flight;
  }

  Future<void> stage(AttachmentAttempt attempt) async {
    _check(attempt);
    if (persistenceReady != null) persistence = await persistenceReady;
    _check(attempt);
    await persistence?.save(attempt, initial: !attempt.staged);
    attempt.staged = true;
  }

  Future<AttachmentAttempt?> restore(String orderId) async {
    if (persistenceReady != null) persistence = await persistenceReady;
    return persistence?.load(orderId, sessionScope());
  }

  void _active(AttachmentAttempt attempt) {
    _check(attempt);
    if (attempt.pauseRequested) throw const ApiException('UPLOAD_PAUSED');
  }

  Future<void> _authority(AttachmentAttempt attempt) async {
    _active(attempt);
    if (mayWrite != null && !await mayWrite!(attempt)) {
      throw const ApiException('ATTACHMENT_PARENT_CHANGED');
    }
    _active(attempt);
  }

  Future<Map<String, dynamic>> _registered(
    AttachmentAttempt attempt,
    String id,
  ) async {
    final suffix = attempt.report ? '/service-report' : '';
    final page = _object(
      await api(
        'GET',
        '/api/workorders/work-orders/${attempt.workOrderId}$suffix/attachments?page=1&pageSize=100',
      ),
    );
    _check(attempt);
    final items = page['items'];
    if (items is! List) throw const ApiException('INVALID_RESPONSE');
    final found = items
        .whereType<Map<String, dynamic>>()
        .where((row) => row['id'] == id)
        .toList();
    if (found.length != 1) {
      throw const ApiException('ATTACHMENT_NOT_FOUND', status: 404);
    }
    return _confirmed(attempt, found.single);
  }

  Future<Map<String, dynamic>> _confirmed(
    AttachmentAttempt attempt,
    Map<String, dynamic> result,
  ) async {
    if (result['id'] is! String ||
        (attempt.uploadedBy != null &&
            (result['fileName'] != attempt.fileName ||
                result['mimeType'] != attempt.mimeType ||
                result['sizeBytes'] != attempt.sizeBytes ||
                result['uploadedBy'] != attempt.uploadedBy))) {
      throw const ApiException('INVALID_RESPONSE');
    }
    attempt.attachmentId = result['id'] as String;
    await stage(attempt); // Record proof before deleting local bytes.
    await persistence?.remove(attempt);
    return result;
  }

  Future<Map<String, dynamic>> _upload(
    AttachmentAttempt attempt, {
    void Function(int, int)? onProgress,
  }) async {
    _check(attempt);
    attempt.inFlight = true;
    attempt.pauseRequested = false;
    await stage(attempt);
    if (attempt.aborted) {
      throw const ApiException('UPLOAD_ABORTED', status: 409);
    }
    if (attempt.attachmentId != null) {
      return _registered(attempt, attempt.attachmentId!);
    }
    if (attempt.uploadId == null && attempt.bytes.length != attempt.sizeBytes) {
      throw const ApiException('ATTACHMENT_LOCAL_FILE_MISSING');
    }
    if (attempt.uploadUrl == null ||
        (attempt.finalizeStarted &&
            mayWrite != null &&
            !await mayWrite!(attempt))) {
      if (attempt.uploadId == null) await _authority(attempt);
      attempt.prepareStarted = true;
      await stage(attempt);
      final suffix = attempt.report ? '/service-report' : '';
      Map<String, dynamic> ticket;
      try {
        ticket = _object(
          await api(
            'POST',
            '/api/workorders/work-orders/${attempt.workOrderId}$suffix/attachment-uploads',
            body: {
              'fileName': attempt.fileName,
              'mimeType': attempt.mimeType,
              'sizeBytes': attempt.sizeBytes,
              'checksumSha256': attempt.checksumSha256,
            },
            idempotencyKey: attempt.prepareKey,
          ),
        );
      } on ApiException catch (e) {
        if (e.code == 'UPLOAD_ALREADY_ATTACHED' && e.attachmentId != null) {
          return _registered(attempt, e.attachmentId!);
        }
        rethrow;
      }
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
      if (attempt.uploadId != null && attempt.uploadId != ticket['uploadId']) {
        throw const ApiException('INVALID_RESPONSE');
      }
      attempt.uploadId = ticket['uploadId'] as String;
      attempt.uploadUrl = ticket['uploadUrl'] as String;
      attempt.headers = headers;
      attempt.expiresAt = expiry;
      await stage(attempt); // Intent ID is durable before PUT is allowed.
    }
    await _authority(attempt);
    if (!attempt.putSucceeded) {
      if (attempt.bytes.length != attempt.sizeBytes ||
          sha256.convert(attempt.bytes).toString() != attempt.checksumSha256) {
        throw const ApiException('ATTACHMENT_LOCAL_FILE_MISSING');
      }
      if (DateTime.now().isAfter(attempt.expiresAt!)) {
        throw const ApiException('UPLOAD_EXPIRED', status: 409);
      }
      final abort = Completer<void>();
      attempt._abortPut = abort;
      final request =
          http.AbortableStreamedRequest(
              'PUT',
              Uri.parse(attempt.uploadUrl!),
              abortTrigger: abort.future,
            )
            ..followRedirects = false
            ..headers.addAll(attempt.headers!)
            ..contentLength = attempt.bytes.length;
      try {
        final responseFuture = _storage
            .send(request)
            .timeout(const Duration(seconds: 30));
        onProgress?.call(0, attempt.bytes.length);
        for (
          var offset = 0;
          offset < attempt.bytes.length;
          offset += 64 * 1024
        ) {
          if (sessionScope() != attempt.scope && !abort.isCompleted) {
            abort.complete();
          }
          if (abort.isCompleted) break;
          final end = min(offset + 64 * 1024, attempt.bytes.length);
          request.sink.add(attempt.bytes.sublist(offset, end));
          onProgress?.call(end, attempt.bytes.length);
          await Future<void>.delayed(Duration.zero);
        }
        unawaited(request.sink.close());
        final response = await responseFuture;
        await response.stream.drain<void>().timeout(
          const Duration(seconds: 30),
        );
        _check(attempt);
        if (abort.isCompleted) throw const ApiException('UPLOAD_CANCELLED');
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw ApiException(
            'ATTACHMENT_STORAGE_UNAVAILABLE',
            status: response.statusCode,
          );
        }
        attempt.putSucceeded = true;
      } on TimeoutException {
        if (!abort.isCompleted) abort.complete();
        throw const ApiException('TIMEOUT');
      } on http.RequestAbortedException {
        _check(attempt);
        throw const ApiException('UPLOAD_CANCELLED');
      } on http.ClientException {
        _check(attempt);
        if (abort.isCompleted) throw const ApiException('UPLOAD_CANCELLED');
        throw const ApiException('NETWORK_ERROR');
      } finally {
        attempt._abortPut = null;
      }
      await stage(attempt); // Only a confirmed PUT can survive as putSucceeded.
    }
    await _authority(attempt);
    attempt.finalizeStarted = true;
    await stage(attempt);
    final result = _object(
      await api(
        'POST',
        '/api/workorders/attachment-uploads/${attempt.uploadId}/complete',
        body: <String, Object>{},
        idempotencyKey: attempt.finalizeKey,
      ),
    );
    _check(attempt);
    return _confirmed(attempt, result);
  }

  Future<void> pause(AttachmentAttempt attempt) async {
    attempt.pauseRequested = true;
    final abort = attempt._abortPut;
    if (abort != null && !abort.isCompleted) abort.complete();
    try {
      await _flights[attempt];
    } catch (_) {
      /* Durable receipt remains. */
    }
  }

  Future<void> abort(AttachmentAttempt attempt) async {
    _check(attempt);
    await pause(attempt);
    if (attempt.attachmentId != null) {
      await _registered(attempt, attempt.attachmentId!);
      return;
    }
    // Without an acknowledged intent ID, no PUT/finalize was ever dispatched.
    // An unknown prepare can only retain its temporary slot until expiry.
    if (attempt.uploadId == null) {
      attempt.aborted = true;
      await stage(attempt);
      await persistence?.remove(attempt);
      return;
    }
    try {
      await api(
        'DELETE',
        '/api/workorders/attachment-uploads/${attempt.uploadId}',
      );
    } on ApiException catch (e) {
      if (e.code == 'UPLOAD_ALREADY_ATTACHED' && e.attachmentId != null) {
        await _registered(attempt, e.attachmentId!);
        return;
      }
      rethrow;
    }
    _check(attempt);
    attempt.aborted = true;
    await stage(attempt);
    await persistence?.remove(attempt);
  }

  Future<void> forget(AttachmentAttempt attempt) async {
    if (attempt.inFlight) throw const ApiException('UPLOAD_IN_PROGRESS');
    await persistence?.remove(attempt);
  }

  void close() {
    _closed = true;
    for (final attempt in _flights.keys) {
      final abort = attempt._abortPut;
      if (abort != null && !abort.isCompleted) abort.complete();
    }
    _storage.close();
  }
}
