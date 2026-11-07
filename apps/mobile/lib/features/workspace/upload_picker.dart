import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:file_picker/file_picker.dart' hide AndroidOptions;
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/api/api_exception.dart';
import '../session/session_models.dart';
import 'attachment_client.dart';
import 'upload_store.dart';
import 'workspace_store.dart';

typedef CaptureRecord = Map<String, dynamic>;

abstract interface class CaptureJournal {
  Future<CaptureRecord?> read();
  Future<void> write(CaptureRecord? record);
}

class SecureCaptureJournal implements CaptureJournal {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      resetOnError: false,
      storageNamespace: 'pbl6_session_v1',
    ),
  );
  @override
  Future<CaptureRecord?> read() async {
    try {
      final raw = await _storage.read(key: 'pbl6.capture.v1');
      return raw == null ? null : jsonObject(jsonDecode(raw));
    } catch (_) {
      throw const ApiException('WORKSPACE_STORAGE_FAILED');
    }
  }

  @override
  Future<void> write(CaptureRecord? record) async {
    try {
      if (record == null) {
        await _storage.delete(key: 'pbl6.capture.v1');
      } else {
        await _storage.write(key: 'pbl6.capture.v1', value: jsonEncode(record));
      }
      if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
        await const MethodChannel('pbl6/session_storage')
            .invokeMethod<void>('flush');
      }
    } catch (_) {
      throw const ApiException('WORKSPACE_STORAGE_FAILED');
    }
  }
}

String uploadMime(String name, Uint8List bytes) {
  final lower = name.toLowerCase();
  bool starts(List<int> prefix) =>
      bytes.length >= prefix.length &&
      List.generate(
        prefix.length,
        (i) => bytes[i] == prefix[i],
      ).every((v) => v);
  if ((lower.endsWith('.jpg') || lower.endsWith('.jpeg')) &&
      starts([255, 216, 255])) {
    return 'image/jpeg';
  }
  if (lower.endsWith('.png') && starts([137, 80, 78, 71, 13, 10, 26, 10])) {
    return 'image/png';
  }
  if (lower.endsWith('.pdf') && starts([37, 80, 68, 70, 45])) {
    return 'application/pdf';
  }
  throw const ApiException('ATTACHMENT_TYPE_UNSUPPORTED', status: 415);
}

/// Owns the platform's single capture channel. Journal ownership is recorded
/// before launching another Activity, and is never inferred from the next login.
class UploadRuntime {
  UploadRuntime(
    this.origin, {
    CaptureJournal? journal,
    this.storeFactory,
    this.selectFile,
    this.lostFile,
  }) : journal = journal ?? SecureCaptureJournal();
  final String origin;
  final CaptureJournal journal;
  final Future<DurableUploads> Function(CaptureRecord)? storeFactory;
  final Future<XFile?> Function(String)? selectFile;
  final Future<XFile?> Function()? lostFile;
  CaptureRecord? recovered;
  String? error;
  bool _busy = false;
  Future<DurableUploads> persistence(CaptureRecord owner) async {
    if (storeFactory != null) return storeFactory!(owner);
    final directory = await getApplicationSupportDirectory();
    final key = sha256
        .convert(
          utf8.encode(
            jsonEncode([owner['origin'], owner['tenantId'], owner['userId']]),
          ),
        )
        .toString();
    return DurableUploads(
      WorkspaceRecords(
        SecureWorkspaceStore(
          origin: owner['origin'] as String,
          tenantId: owner['tenantId'] as String,
          userId: owner['userId'] as String,
        ),
      ),
      PrivateUploadFiles(Directory('${directory.path}/uploads-v1/$key')),
    );
  }

  ScopedUploads forUser(SessionUser user) => ScopedUploads(this, {
    'origin': origin,
    'tenantId': user.tenantId,
    'userId': user.id,
  });
  Future<void> recover() async {
    if (_busy) return;
    _busy = true;
    try {
      final context = await journal.read();
      recovered = context;
      XFile? file;
      if (context?['sourcePath'] is String) {
        file = XFile(context!['sourcePath'] as String);
      } else if (context?['source'] != 'document' && lostFile != null) {
        file = await lostFile!();
      } else if (context?['source'] != 'document' &&
          defaultTargetPlatform == TargetPlatform.android) {
        final lost = await ImagePicker().retrieveLostData();
        if (lost.exception != null) throw lost.exception!;
        if (lost.files?.isNotEmpty == true) file = lost.files!.first;
      }
      if (context == null) {
        return; // Never attach unowned plugin data to a new user/WO.
      }
      if (file == null) {
        recovered = context;
        error = const ApiException('PICKER_INTERRUPTED').userMessage;
        await journal.write(null);
        return;
      }
      await finish(
        context,
        file.path,
        context['sourceName'] as String? ?? file.name,
      );
      recovered = context;
      error = null;
    } on ApiException catch (e) {
      error = e.userMessage;
      if ([
        'ATTACHMENT_TOO_LARGE',
        'ATTACHMENT_TYPE_UNSUPPORTED',
        'VALIDATION_FAILED',
        'PICKER_DENIED',
      ].contains(e.code)) {
        try {
          await journal.write(null);
        } catch (_) {
          error = 'Chưa lưu được trạng thái chọn tệp. Thử khôi phục trước khi chọn tiếp.';
        }
      }
    } catch (_) {
      error = 'Chưa khôi phục được lần chọn tệp. Thử khôi phục trước khi chọn tiếp.';
    } finally {
      _busy = false;
    }
  }

  Future<AttachmentAttempt> finish(
    CaptureRecord context,
    String path,
    String name,
  ) async {
    // retrieveLostData is one-shot; keep the returned source before reading it.
    await journal.write({...context, 'sourcePath': path, 'sourceName': name});
    final file = XFile(path);
    final size = await file.length();
    if (size < 1 || size > 10485760) {
      throw const ApiException('ATTACHMENT_TOO_LARGE', status: 413);
    }
    final bytes = await file.readAsBytes();
    if (name.isEmpty ||
        name.length > 255 ||
        name == '.' ||
        name == '..' ||
        name.contains(RegExp(r'[/\\\x00-\x1f\x7f]'))) {
      throw const ApiException('VALIDATION_FAILED', status: 400);
    }
    final mime = uploadMime(name, bytes);
    final data = {
      ...context,
      'version': 1,
      'fileName': name,
      'mimeType': mime,
      'sizeBytes': bytes.length,
      'checksumSha256': sha256.convert(bytes).toString(),
      'scope': '${context['tenantId']}/${context['userId']}',
      'uploadedBy': context['userId'],
      'localReady': false,
    };
    final store = await persistence(context);
    final old = await store.records.get(
      context['workOrderId'] as String,
      'pendingUpload',
    );
    if (old != null && old['prepareKey'] != context['prepareKey']) {
      throw const ApiException('PICKER_BUSY');
    }
    if (old != null) {
      var existing = await store.load(
        context['workOrderId'] as String,
        '${context['tenantId']}/${context['userId']}',
      );
      if (existing!.checksumSha256 != data['checksumSha256'] ||
          existing.fileName != name) {
        throw const ApiException('ATTACHMENT_LOCAL_FILE_MISSING');
      }
      if (existing.bytes.isEmpty &&
          existing.attachmentId == null &&
          !existing.aborted) {
        existing = AttachmentAttempt.restore(old, bytes)..localReady = false;
        await store.save(existing);
      }
      await journal.write(null);
      return existing;
    }
    final attempt = AttachmentAttempt.restore(data, bytes);
    await store.save(attempt, initial: old == null);
    await journal.write(null);
    return attempt;
  }
}

class ScopedUploads implements AttachmentSelection {
  @override
  Future<void> recover() => runtime.recover();
  ScopedUploads(this.runtime, this.owner);
  final UploadRuntime runtime;
  final CaptureRecord owner;
  Future<DurableUploads> get persistence => runtime.persistence(owner);
  bool get _ownsRecovery =>
      runtime.recovered != null &&
      [
        'origin',
        'tenantId',
        'userId',
      ].every((k) => runtime.recovered![k] == owner[k]);
  @override
  String? get recoveryOrderId =>
      _ownsRecovery ? runtime.recovered!['workOrderId'] as String? : null;
  @override
  String? get recoveryMessage => _ownsRecovery
      ? runtime.error ?? 'Đã khôi phục tệp đang chọn. Mở công việc để xem lại và chủ động tải lên.'
      : null;
  @override
  Future<AttachmentAttempt?> pick(
    String orderId,
    bool report,
    String authorityId,
    String source,
  ) async {
    if (runtime._busy) {
      throw const ApiException('PICKER_BUSY');
    }
    runtime._busy = true;
    final context = {
      ...owner,
      'source': source,
      'workOrderId': orderId,
      'report': report,
      'authorityId': authorityId,
      'prepareKey': attachmentOperationId(),
      'finalizeKey': attachmentOperationId(),
    };
    try {
      if (await runtime.journal.read() != null) {
        throw const ApiException('PICKER_BUSY');
      }
      await runtime.journal.write(context);
      String? path, name;
      if (runtime.selectFile != null) {
        final file = await runtime.selectFile!(source);
        if (file != null) {
          path = file.path;
          name = file.name;
        }
      } else if (source == 'document') {
        final file = await FilePicker.pickFile(
          type: FileType.custom,
          allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
        );
        if (file != null) {
          path = file.path;
          name = file.name;
        }
      } else {
        final file = await ImagePicker().pickImage(
          source: source == 'camera' ? ImageSource.camera : ImageSource.gallery,
          imageQuality: 90,
        );
        if (file != null) {
          path = file.path;
          name = file.name;
        }
      }
      if (path == null || name == null) {
        await runtime.journal.write(null);
        return null;
      }
      return await runtime.finish(context, path, name);
    } on PlatformException catch (e) {
      await runtime.journal.write(null);
      throw ApiException(
        e.code.contains('denied') || e.code.contains('restricted')
            ? 'PICKER_DENIED'
            : 'PICKER_INTERRUPTED',
      );
    } on ApiException catch (e) {
      if ([
        'ATTACHMENT_TOO_LARGE',
        'ATTACHMENT_TYPE_UNSUPPORTED',
      ].contains(e.code)) {
        await runtime.journal.write(null);
      }
      rethrow;
    } finally {
      runtime._busy = false;
    }
  }
}
