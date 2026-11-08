import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/workspace/attachment_client.dart';
import 'package:pbl6_technician/features/workspace/upload_store.dart';
import 'package:pbl6_technician/features/workspace/workspace_store.dart';

import 'workspace_fixture.dart' show orderId;

Uint8List testPng() => base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0f8AAAAASUVORK5CYII=',
);
const uploadId = '00000000-0000-4000-8000-000000000401';
const attachmentId = '00000000-0000-4000-8000-000000000402';
const uploadScope = 'tenant-a/user-a';

class UploadBackend {
  final prepareKeys = <String?>[], finalizeKeys = <String?>[];
  int puts = 0, aborts = 0;
  bool attached = false,
      aborted = false,
      lostFinalize = false,
      lostPrepare = false,
      expired = false;
  Map<String, dynamic>? prepared;
  Map<String, dynamic> get metadata => {
    'id': attachmentId,
    'fileName': prepared?['fileName'] ?? 'proof.png',
    'mimeType': 'image/png',
    'sizeBytes': prepared?['sizeBytes'] ?? testPng().length,
    'uploadedBy': 'user-a',
    'visibility': 'INTERNAL',
    'createdAt': '2026-11-07T01:00:00Z',
  };
  Future<Object?> api(
    String method,
    String path, {
    Object? body,
    String? idempotencyKey,
  }) async {
    if (method == 'GET') {
      return {
        'items': attached ? [metadata] : [],
        'page': 1,
        'pageSize': 100,
        'total': attached ? 1 : 0,
      };
    }
    if (method == 'DELETE') {
      aborts++;
      if (attached) {
        throw const ApiException(
          'UPLOAD_ALREADY_ATTACHED',
          status: 409,
          attachmentId: attachmentId,
        );
      }
      aborted = true;
      return null;
    }
    if (path.endsWith('/attachment-uploads')) {
      prepareKeys.add(idempotencyKey);
      prepared ??= Map<String, dynamic>.from(body as Map);
      if (attached) {
        throw const ApiException(
          'UPLOAD_ALREADY_ATTACHED',
          status: 409,
          attachmentId: attachmentId,
        );
      }
      if (aborted) throw const ApiException('UPLOAD_ABORTED', status: 409);
      if (expired) throw const ApiException('UPLOAD_EXPIRED', status: 409);
      if (lostPrepare) {
        lostPrepare = false;
        throw const ApiException('TIMEOUT');
      }
      return {
        'uploadId': uploadId,
        'method': 'PUT',
        'uploadUrl': 'https://storage.test/staging?signature=secret',
        'headers': {'Content-Type': 'image/png'},
        'expiresAt': DateTime.now()
            .add(const Duration(minutes: 5))
            .toIso8601String(),
      };
    }
    finalizeKeys.add(idempotencyKey);
    attached = true;
    if (lostFinalize) {
      lostFinalize = false;
      throw const ApiException('TIMEOUT');
    }
    return metadata;
  }

  AttachmentClient client(DurableUploads store, {String Function()? scope}) =>
      AttachmentClient(
        api: api,
        sessionScope: scope ?? () => uploadScope,
        storage: MockClient((r) async {
          puts++;
          if (r.headers['authorization'] != null) {
            throw StateError('Bearer leaked');
          }
          return http.Response('', 200);
        }),
      )..persistence = store;
  AttachmentAttempt attempt(AttachmentClient client) => client.create(
    workOrderId: orderId,
    report: false,
    fileName: 'proof.png',
    mimeType: 'image/png',
    bytes: testPng(),
    authorityId: 'assignment',
    uploadedBy: 'user-a',
  );
}

class FailingWorkspaceStore implements WorkspaceStore {
  final inner = MemoryWorkspaceStore();
  bool failWrite = false;
  @override
  Future<LocalRecord?> read(String id) => inner.read(id);
  @override
  Future<void> write(String id, LocalRecord value) async {
    if (failWrite) throw const ApiException('WORKSPACE_STORAGE_FAILED');
    await inner.write(id, value);
  }
}
