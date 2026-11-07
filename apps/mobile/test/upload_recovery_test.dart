import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/workspace/attachment_client.dart';
import 'package:pbl6_technician/features/workspace/upload_store.dart';
import 'package:pbl6_technician/features/workspace/workspace_store.dart';

import 'support/upload_fixture.dart';
import 'support/workspace_fixture.dart' show orderId;

void main() {
  test('restart after committed finalize uses original receipt and only reads committed metadata', () async {
    final backend = UploadBackend()..lostFinalize = true;
    final records = WorkspaceRecords(MemoryWorkspaceStore()),
        files = MemoryUploadFiles();
    final store = DurableUploads(records, files),
        old = backend.client(DurableUploads(records, files));
    final first = backend.attempt(old);
    await expectLater(old.upload(first), throwsA(isA<ApiException>()));
    final saved = (await records.get(orderId, 'pendingUpload'))!;
    expect(jsonEncode(saved), isNot(contains('uploadUrl')));
    expect(jsonEncode(saved), isNot(contains('signature=secret')));
    old.close();
    final fresh = backend.client(store)..mayWrite = (_) async => false;
    addTearDown(fresh.close);
    final restored = (await fresh.restore(orderId))!;
    expect(restored.uploadUrl, isNull);
    expect(restored.finalizeKey, first.finalizeKey);
    expect((await fresh.upload(restored))['id'], attachmentId);
    expect(backend.puts, 1);
    expect(backend.finalizeKeys, [first.finalizeKey]);
    expect(backend.prepareKeys.toSet(), {first.prepareKey});
    expect(await records.get(orderId, 'pendingUpload'), isNull);
    expect(files.files, isEmpty);
  });
  test(
    'lost prepare response resumes with the same key after a fresh client',
    () async {
      final backend = UploadBackend()..lostPrepare = true;
      final store = DurableUploads(
        WorkspaceRecords(MemoryWorkspaceStore()),
        MemoryUploadFiles(),
      );
      final old = backend.client(store),
          attempt = backend.attempt(backend.client(store));
      await expectLater(old.upload(attempt), throwsA(isA<ApiException>()));
      old.close();
      final fresh = backend.client(store);
      addTearDown(fresh.close);
      await fresh.upload((await fresh.restore(orderId))!);
      expect(backend.prepareKeys, [attempt.prepareKey, attempt.prepareKey]);
      expect(backend.puts, 1);
    },
  );
  test(
    'failed disk checkpoint blocks prepare and every storage request',
    () async {
      final db = FailingWorkspaceStore()..failWrite = true,
          backend = UploadBackend();
      final client = backend.client(
        DurableUploads(WorkspaceRecords(db), MemoryUploadFiles()),
      );
      addTearDown(client.close);
      await expectLater(
        client.upload(backend.attempt(client)),
        throwsA(isA<ApiException>()),
      );
      expect(backend.prepareKeys, isEmpty);
      expect(backend.puts, 0);
    },
  );
  test(
    'expired upload keeps its identity and never silently creates a new intent',
    () async {
      final backend = UploadBackend()..expired = true;
      final store = DurableUploads(
        WorkspaceRecords(MemoryWorkspaceStore()),
        MemoryUploadFiles(),
      );
      final client = backend.client(store);
      addTearDown(client.close);
      final attempt = backend.attempt(client);
      await expectLater(client.upload(attempt), throwsA(isA<ApiException>()));
      await expectLater(
        client.upload((await client.restore(orderId))!),
        throwsA(isA<ApiException>()),
      );
      expect(backend.prepareKeys.toSet(), {attempt.prepareKey});
      expect(backend.puts, 0);
    },
  );
  test(
    'a reassignment prevents sending an old selected file before prepare',
    () async {
      final backend = UploadBackend(),
          store = DurableUploads(
            WorkspaceRecords(MemoryWorkspaceStore()),
            MemoryUploadFiles(),
          );
      final old = backend.client(store);
      final attempt = backend.attempt(old);
      await old.stage(attempt);
      old.close();
      final fresh = backend.client(store)..mayWrite = (_) async => false;
      addTearDown(fresh.close);
      await expectLater(
        fresh.upload((await fresh.restore(orderId))!),
        throwsA(
          isA<ApiException>().having(
            (e) => e.code,
            'code',
            'ATTACHMENT_PARENT_CHANGED',
          ),
        ),
      );
      expect(backend.prepareKeys, isEmpty);
      expect(backend.puts, 0);
    },
  );
  test('missing/corrupt local bytes retain the receipt and never upload replacement data', () async {
    for (final corrupt in [false, true]) {
      final backend = UploadBackend(), files = MemoryUploadFiles();
      final store = DurableUploads(
        WorkspaceRecords(MemoryWorkspaceStore()),
        files,
      );
      final client = backend.client(store);
      final attempt = backend.attempt(client);
      await client.stage(attempt);
      files.files[attempt.prepareKey] = corrupt
          ? Uint8List.fromList([0, 1])
          : Uint8List(0);
      final restored = (await client.restore(orderId))!;
      await expectLater(
        client.upload(restored),
        throwsA(
          isA<ApiException>().having(
            (e) => e.code,
            'code',
            'ATTACHMENT_LOCAL_FILE_MISSING',
          ),
        ),
      );
      expect(backend.prepareKeys, isEmpty);
      expect(await store.records.get(orderId, 'pendingUpload'), isNotNull);
      client.close();
    }
  });
  test(
    'concurrent resume calls share one operation and do not duplicate finalize',
    () async {
      final backend = UploadBackend(), gate = Completer<void>();
      final client = AttachmentClient(
        api: backend.api,
        sessionScope: () => uploadScope,
        storage: MockClient((_) async {
          backend.puts++;
          await gate.future;
          return http.Response('', 200);
        }),
      );
      addTearDown(client.close);
      final attempt = backend.attempt(client);
      final a = client.upload(attempt), b = client.upload(attempt);
      expect(identical(a, b), true);
      final restored = AttachmentAttempt.restore(
        attempt.toJson(),
        attempt.bytes,
      );
      expect(identical(client.upload(restored), a), true);
      await expectLater(
        client.upload(backend.attempt(client)),
        throwsA(
          isA<ApiException>().having(
            (e) => e.code,
            'code',
            'UPLOAD_IN_PROGRESS',
          ),
        ),
      );
      gate.complete();
      await Future.wait([a, b]);
      expect(backend.puts, 1);
      expect(backend.finalizeKeys.length, 1);
    },
  );
  test('pause while preparing cannot dispatch PUT or finalize and retains the receipt', () async {
    final backend = UploadBackend(), gate = Completer<void>();
    final store = DurableUploads(
      WorkspaceRecords(MemoryWorkspaceStore()),
      MemoryUploadFiles(),
    );
    final client = AttachmentClient(
      api: (method, path, {body, idempotencyKey}) async {
        if (path.endsWith('/attachment-uploads')) await gate.future;
        return backend.api(
          method,
          path,
          body: body,
          idempotencyKey: idempotencyKey,
        );
      },
      sessionScope: () => uploadScope,
      storage: MockClient((_) async {
        backend.puts++;
        return http.Response('', 200);
      }),
    )..persistence = store;
    addTearDown(client.close);
    final attempt = backend.attempt(client);
    final send = client.upload(attempt);
    final assertion = expectLater(send, throwsA(isA<ApiException>()));
    final pause = client.pause(attempt);
    gate.complete();
    await pause;
    await assertion;
    expect(backend.puts, 0);
    expect(backend.finalizeKeys, isEmpty);
    expect(await store.records.get(orderId, 'pendingUpload'), isNotNull);
  });
  test('abort after unknown completion reconciles the existing attachment without deleting it', () async {
    final backend = UploadBackend()..lostFinalize = true;
    final store = DurableUploads(
      WorkspaceRecords(MemoryWorkspaceStore()),
      MemoryUploadFiles(),
    );
    final client = backend.client(store);
    addTearDown(client.close);
    final attempt = backend.attempt(client);
    await expectLater(client.upload(attempt), throwsA(isA<ApiException>()));
    await client.abort(attempt);
    expect(backend.attached, true);
    expect(attempt.attachmentId, attachmentId);
    expect(await store.records.get(orderId, 'pendingUpload'), isNull);
  });
  test('private files survive a new adapter and cannot cross directories or traverse paths', () async {
    final root = await Directory.systemTemp.createTemp('pbl6-m4-');
    addTearDown(() => root.delete(recursive: true));
    final a = PrivateUploadFiles(Directory('${root.path}/scope-a')),
        b = PrivateUploadFiles(Directory('${root.path}/scope-b'));
    final id = attachmentOperationId();
    await a.write(id, testPng());
    expect(
      await PrivateUploadFiles(Directory('${root.path}/scope-a')).read(id),
      testPng(),
    );
    expect(await b.read(id), isNull);
    await expectLater(
      a.write('../escape', testPng()),
      throwsA(isA<ApiException>()),
    );
    await a.delete(id);
    expect(await a.read(id), isNull);
  });
  test(
    'old receipt cleanup cannot erase a newer upload or a report draft',
    () async {
      final backend = UploadBackend(),
          files = MemoryUploadFiles(),
          records = WorkspaceRecords(MemoryWorkspaceStore());
      final store = DurableUploads(records, files),
          client = backend.client(DurableUploads(records, files));
      addTearDown(client.close);
      final old = backend.attempt(client);
      await client.stage(old);
      await records.put(orderId, 'reportDraft', {'body': 'keep'});
      await records.put(orderId, 'pendingUpload', {'prepareKey': 'new'});
      await store.remove(old);
      expect(await records.get(orderId, 'pendingUpload'), {
        'prepareKey': 'new',
      });
      expect(await records.get(orderId, 'reportDraft'), {'body': 'keep'});
    },
  );
}
