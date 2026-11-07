import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/session/session_models.dart';
import 'package:pbl6_technician/features/workspace/attachment_client.dart';
import 'package:pbl6_technician/features/workspace/upload_picker.dart';
import 'package:pbl6_technician/features/workspace/upload_store.dart';
import 'package:pbl6_technician/features/workspace/workspace_store.dart';

import 'support/upload_fixture.dart';
import 'support/workflow_server.dart' show workflowUser;
import 'support/workspace_fixture.dart' show orderId;

class MemoryJournal implements CaptureJournal {
  CaptureRecord? value;
  bool fail = false;
  @override
  Future<CaptureRecord?> read() async => value;
  @override
  Future<void> write(CaptureRecord? record) async {
    if (fail) throw const ApiException('WORKSPACE_STORAGE_FAILED');
    value = record == null
        ? null
        : jsonDecode(jsonEncode(record)) as CaptureRecord;
  }
}

class BrokenFiles extends MemoryUploadFiles {
  bool broken = true;
  @override
  Future<void> write(String id, bytes) async {
    if (broken) throw const ApiException('WORKSPACE_STORAGE_FAILED');
    await super.write(id, bytes);
  }
}

CaptureRecord context() => {
  'origin': 'https://old.test',
  'tenantId': workflowUser.tenantId,
  'userId': workflowUser.id,
  'source': 'camera',
  'workOrderId': orderId,
  'report': false,
  'authorityId': 'original-assignment',
  'prepareKey': attachmentOperationId(),
  'finalizeKey': attachmentOperationId(),
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory dir;
  setUp(
    () async => dir = await Directory.systemTemp.createTemp('pbl6-capture-'),
  );
  tearDown(() => dir.delete(recursive: true));
  Future<XFile> photo() async {
    final file = File('${dir.path}/original.png');
    await file.writeAsBytes(testPng());
    return XFile(file.path);
  }

  test('journals ownership before launching camera, then copies bytes outside cache', () async {
    final journal = MemoryJournal(), files = MemoryUploadFiles();
    final records = WorkspaceRecords(MemoryWorkspaceStore());
    final runtime = UploadRuntime(
      'https://old.test',
      journal: journal,
      storeFactory: (_) async => DurableUploads(records, files),
      selectFile: (source) async {
        expect(journal.value!['workOrderId'], orderId);
        expect(journal.value!['authorityId'], 'assignment');
        expect(journal.value!['userId'], workflowUser.id);
        return photo();
      },
    );
    final attempt = (await runtime
        .forUser(workflowUser)
        .pick(orderId, false, 'assignment', 'camera'))!;
    expect(journal.value, isNull);
    expect(files.files[attempt.prepareKey], testPng());
    expect(
      (await records.get(orderId, 'pendingUpload'))!['prepareKey'],
      attempt.prepareKey,
    );
  });
  test('Android lost data is restored to original Gateway/user/WO and never to the next login', () async {
    final journal = MemoryJournal()..value = context(),
        stores = <String, DurableUploads>{};
    Future<DurableUploads> store(CaptureRecord owner) async =>
        stores.putIfAbsent(
          '${owner['origin']}/${owner['userId']}',
          () => DurableUploads(
            WorkspaceRecords(MemoryWorkspaceStore()),
            MemoryUploadFiles(),
          ),
        );
    final runtime = UploadRuntime(
      'https://different.test',
      journal: journal,
      storeFactory: store,
      lostFile: photo,
    );
    final original = Map<String, dynamic>.from(journal.value!);
    await runtime.recover();
    final saved = await (await store(original)).load(orderId, uploadScope);
    expect(saved!.authorityId, 'original-assignment');
    expect(saved.prepareKey, original['prepareKey']);
    expect(
      runtime.forUser(workflowUser).recoveryOrderId,
      isNull,
    ); // different Gateway
    final sameOrigin = UploadRuntime('https://old.test', journal: journal)
      ..recovered = original;
    expect(sameOrigin.forUser(workflowUser).recoveryOrderId, orderId);
    expect(
      sameOrigin
          .forUser(
            const SessionUser(
              id: 'other',
              tenantId: 'tenant-a',
              email: 'other@test',
              fullName: 'Other',
            ),
          )
          .recoveryOrderId,
      isNull,
    );
  });
  test('a failed byte copy resumes from the one-shot source path without losing keys', () async {
    final journal = MemoryJournal(),
        files = BrokenFiles(),
        records = WorkspaceRecords(MemoryWorkspaceStore());
    final runtime = UploadRuntime(
      'https://old.test',
      journal: journal,
      storeFactory: (_) async => DurableUploads(records, files),
      selectFile: (_) => photo(),
    );
    await expectLater(
      runtime
          .forUser(workflowUser)
          .pick(orderId, false, 'assignment', 'camera'),
      throwsA(isA<ApiException>()),
    );
    final key = journal.value!['prepareKey'];
    expect(journal.value!['sourcePath'], isNotNull);
    files.broken = false;
    await runtime.recover();
    expect(journal.value, isNull);
    expect(files.files[key], testPng());
    expect((await records.get(orderId, 'pendingUpload'))!['prepareKey'], key);
  });
  test('recovery is idempotent when file and metadata were saved before journal cleanup', () async {
    final journal = MemoryJournal()..value = context(),
        files = MemoryUploadFiles(),
        records = WorkspaceRecords(MemoryWorkspaceStore());
    final runtime = UploadRuntime(
      'https://old.test',
      journal: journal,
      storeFactory: (_) async => DurableUploads(records, files),
    );
    final file = await photo(),
        original = Map<String, dynamic>.from(journal.value!);
    final first = await runtime.finish(original, file.path, file.name);
    journal.value = {
      ...original,
      'sourcePath': file.path,
      'sourceName': file.name,
    };
    await runtime.recover();
    expect(files.files.length, 1);
    expect(
      (await records.get(orderId, 'pendingUpload'))!['prepareKey'],
      first.prepareKey,
    );
  });
  test(
    'unowned lost image data never obtains a target from the current account',
    () async {
      var stored = false;
      final runtime = UploadRuntime(
        'https://now.test',
        journal: MemoryJournal(),
        lostFile: photo,
        storeFactory: (_) async {
          stored = true;
          throw StateError('Must not run');
        },
      );
      await runtime.recover();
      expect(stored, false);
      expect(runtime.recovered, isNull);
    },
  );
  test(
    'interrupted document chooser is not treated as an image-picker result',
    () async {
      var called = false;
      final journal = MemoryJournal()
        ..value = {...context(), 'source': 'document'};
      final runtime = UploadRuntime(
        'https://old.test',
        journal: journal,
        lostFile: () async {
          called = true;
          return photo();
        },
      );
      await runtime.recover();
      expect(called, false);
      expect(journal.value, isNull);
      expect(runtime.error, isNotNull);
    },
  );
  test('cancel and denied permission clear the capture marker without creating an upload', () async {
    for (final denied in [false, true]) {
      final journal = MemoryJournal();
      var stored = false;
      final runtime = UploadRuntime(
        'https://old.test',
        journal: journal,
        selectFile: (_) async {
          if (denied) {
            throw PlatformException(
              code: 'camera_access_denied',
              message: 'private platform details',
            );
          }
          return null;
        },
        storeFactory: (_) async {
          stored = true;
          throw StateError('Must not run');
        },
      );
      final selected = runtime.forUser(workflowUser);
      if (denied) {
        await expectLater(
          selected.pick(orderId, false, 'assignment', 'camera'),
          throwsA(
            isA<ApiException>().having((e) => e.code, 'code', 'PICKER_DENIED'),
          ),
        );
      } else {
        expect(
          await selected.pick(orderId, false, 'assignment', 'camera'),
          isNull,
        );
      }
      expect(stored, false);
      expect(journal.value, isNull);
    }
  });
  test(
    'storage failure occurs before the platform picker is launched',
    () async {
      var called = false;
      final runtime = UploadRuntime(
        'https://old.test',
        journal: MemoryJournal()..fail = true,
        selectFile: (_) async {
          called = true;
          return null;
        },
      );
      await expectLater(
        runtime
            .forUser(workflowUser)
            .pick(orderId, false, 'assignment', 'camera'),
        throwsA(isA<ApiException>()),
      );
      expect(called, false);
    },
  );
  test(
    'concurrent selection cannot overwrite the global capture owner',
    () async {
      final gate = Completer<XFile?>(), journal = MemoryJournal();
      final runtime = UploadRuntime(
        'https://old.test',
        journal: journal,
        selectFile: (_) => gate.future,
      );
      final first = runtime
          .forUser(workflowUser)
          .pick(orderId, false, 'assignment', 'camera');
      await expectLater(
        runtime
            .forUser(workflowUser)
            .pick('different', false, 'new', 'gallery'),
        throwsA(isA<ApiException>()),
      );
      gate.complete(null);
      await first;
      expect(journal.value, isNull);
    },
  );
  test(
    'file signatures, not just extensions, constrain image/PDF selection',
    () {
      expect(uploadMime('photo.PNG', testPng()), 'image/png');
      expect(
        () => uploadMime('photo.pdf', testPng()),
        throwsA(isA<ApiException>()),
      );
      expect(
        () => uploadMime('photo.png', Uint8List.fromList([1, 2, 3])),
        throwsA(isA<ApiException>()),
      );
    },
  );
}
