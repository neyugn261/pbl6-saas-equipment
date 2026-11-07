import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import '../../core/api/api_exception.dart';
import 'attachment_client.dart';
import 'workspace_store.dart';

abstract interface class UploadFiles {
  Future<void> write(String id, Uint8List bytes);
  Future<Uint8List?> read(String id);
  Future<void> delete(String id);
}

class MemoryUploadFiles implements UploadFiles {
  final files = <String, Uint8List>{};
  @override
  Future<void> write(String id, Uint8List bytes) async {
    files[id] = Uint8List.fromList(bytes);
  }

  @override
  Future<Uint8List?> read(String id) async => files[id];
  @override
  Future<void> delete(String id) async {
    files.remove(id);
  }
}

/// App-private files, with a hash-derived Gateway/tenant/user directory. No paths
/// from a persisted record or a remote response are used to address this vault.
class PrivateUploadFiles implements UploadFiles {
  PrivateUploadFiles(this.directory);
  final Directory directory;
  File _file(String id) {
    if (!RegExp(r'^[a-f0-9-]{36}$').hasMatch(id)) {
      throw const ApiException('WORKSPACE_STORAGE_FAILED');
    }
    return File('${directory.path}/$id.bin');
  }

  @override
  Future<void> write(String id, Uint8List bytes) async {
    try {
      await directory.create(recursive: true);
      final file = _file(id), temporary = File('${_file(id).path}.tmp');
      await temporary.writeAsBytes(bytes, flush: true);
      await temporary.rename(file.path);
    } catch (_) {
      throw const ApiException('WORKSPACE_STORAGE_FAILED');
    }
  }

  @override
  Future<Uint8List?> read(String id) async {
    try {
      final file = _file(id);
      if (!await file.exists()) return null;
      if (await file.length() > 10 * 1024 * 1024) {
        throw const ApiException('ATTACHMENT_LOCAL_FILE_MISSING');
      }
      return await file.readAsBytes();
    } on ApiException {
      rethrow;
    } catch (_) {
      throw const ApiException('WORKSPACE_STORAGE_FAILED');
    }
  }

  @override
  Future<void> delete(String id) async {
    try {
      for (final file in [_file(id), File('${_file(id).path}.tmp')]) {
        if (await file.exists()) await file.delete();
      }
    } catch (_) {
      throw const ApiException('WORKSPACE_STORAGE_FAILED');
    }
  }
}

class DurableUploads implements AttachmentPersistence {
  DurableUploads(this.records, this.files);
  final WorkspaceRecords records;
  final UploadFiles files;
  @override
  Future<void> save(AttachmentAttempt attempt, {bool initial = false}) async {
    await records.putUpload(
      attempt.workOrderId,
      attempt.toJson(),
      allowAbsent: initial,
    );
    if (!attempt.localReady) {
      if (attempt.bytes.length != attempt.sizeBytes ||
          sha256.convert(attempt.bytes).toString() != attempt.checksumSha256) {
        throw const ApiException('ATTACHMENT_LOCAL_FILE_MISSING');
      }
      await files.write(attempt.prepareKey, attempt.bytes);
      attempt.localReady = true;
      await records.putUpload(attempt.workOrderId, attempt.toJson());
    }
  }

  @override
  Future<AttachmentAttempt?> load(String orderId, String scope) async {
    final data = await records.get(orderId, 'pendingUpload');
    if (data == null) return null;
    try {
      if (data['version'] != 1 ||
          data['fileName'] is! String ||
          (data['fileName'] as String).isEmpty ||
          (data['fileName'] as String).length > 255 ||
          (data['fileName'] as String).contains(
            RegExp(r'[/\\\x00-\x1f\x7f]'),
          ) ||
          ![
            'image/jpeg',
            'image/png',
            'application/pdf',
          ].contains(data['mimeType']) ||
          data['scope'] != scope ||
          data['workOrderId'] != orderId ||
          data['report'] is! bool ||
          data['sizeBytes'] is! int ||
          (data['sizeBytes'] as int) < 1 ||
          (data['sizeBytes'] as int) > 10485760 ||
          !RegExp(r'^[a-f0-9]{64}$')
              .hasMatch(data['checksumSha256'] as String) ||
          !RegExp(r'^[a-f0-9-]{36}$').hasMatch(data['prepareKey'] as String) ||
          !RegExp(r'^[a-f0-9-]{36}$').hasMatch(data['finalizeKey'] as String)) {
        throw const FormatException();
      }
      var bytes =
          await files.read(data['prepareKey'] as String) ?? Uint8List(0);
      if (bytes.isNotEmpty &&
          (bytes.length != data['sizeBytes'] ||
              sha256.convert(bytes).toString() != data['checksumSha256'])) {
        bytes = Uint8List(0);
      }
      return AttachmentAttempt.restore(data, bytes);
    } on ApiException {
      rethrow;
    } catch (_) {
      throw const ApiException('WORKSPACE_STORAGE_FAILED');
    }
  }

  @override
  Future<void> remove(AttachmentAttempt attempt) async {
    // Proof of ATTACHED/ABORTED is saved before this, so a crash between byte
    // cleanup and receipt cleanup can be reconciled without uploading again.
    await files.delete(attempt.prepareKey);
    await records.removeIf(
      attempt.workOrderId,
      'pendingUpload',
      'prepareKey',
      attempt.prepareKey,
    );
  }
}
