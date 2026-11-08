import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/features/workspace/attachment_client.dart';
import 'package:pbl6_technician/features/workspace/job_reads.dart';
import 'package:pbl6_technician/features/workspace/upload_store.dart';
import 'package:pbl6_technician/features/workspace/work_order_workflow.dart';
import 'package:pbl6_technician/features/workspace/workspace_repository.dart';
import 'package:pbl6_technician/features/workspace/workspace_store.dart';

import 'support/upload_fixture.dart';
import 'support/workflow_server.dart';
import 'support/workspace_fixture.dart' show orderId, technician;

class FakeSelection implements AttachmentSelection {
  FakeSelection(this.client);
  final AttachmentClient client;
  @override
  String? get recoveryMessage => null;
  @override
  String? get recoveryOrderId => null;
  @override
  Future<void> recover() async {}
  @override
  Future<AttachmentAttempt?> pick(
    String orderId,
    bool report,
    String authorityId,
    String source,
  ) async => client.create(
    workOrderId: orderId,
    report: report,
    fileName: 'proof.png',
    mimeType: 'image/png',
    bytes: testPng(),
    authorityId: authorityId,
    uploadedBy: 'user-a',
  );
}

void main() {
  Future<void> tap(WidgetTester t, Finder finder) async {
    await t.ensureVisible(finder);
    await t.pumpAndSettle();
    await t.tap(finder);
    await t.pumpAndSettle();
  }

  WorkspaceRepository repo(
    UploadBackend backend,
    WorkspaceStore store,
    MemoryUploadFiles files, {
    AttachmentClient? transport,
  }) {
    final server = WorkflowServer('IN_PROGRESS');
    final client =
        transport ??
        backend.client(DurableUploads(WorkspaceRecords(store), files));
    return WorkspaceRepository(
      (path) async {
        if (path.contains('/attachments?')) return backend.api('GET', path);
        if (path.endsWith('/technicians/me')) return technician();
        return server.read(path);
      },
      workflowUser,
      store: store,
      attachments: client,
      selection: FakeSelection(client),
      write: server.write,
    );
  }

  Widget screen(WorkspaceRepository repo) => MaterialApp(
    home: JobReadScreen(repo: repo, id: orderId),
  );
  testWidgets(
    'selection stages a durable preview without POST; WO cannot complete with unsent evidence',
    (t) async {
      final backend = UploadBackend(),
          store = MemoryWorkspaceStore(),
          files = MemoryUploadFiles();
      final workspace = repo(backend, store, files);
      addTearDown(workspace.dispose);
      await t.pumpWidget(screen(workspace));
      await t.pumpAndSettle();
      await tap(t, find.text('Tệp'));
      await tap(t, find.byKey(const Key('attachment-pick-wo-camera')));
      expect(
        find.text('Đang lưu trên máy · Chưa gửi lên máy chủ'),
        findsOneWidget,
      );
      expect(backend.prepareKeys, isEmpty);
      expect(files.files.length, 1);
      final flow = WorkOrderWorkflow(workspace, orderId);
      addTearDown(flow.dispose);
      await flow.load();
      expect(flow.order!.allows('complete', workspace.user.id), isTrue);
      expect(flow.can('complete'), isFalse);
      await tap(t, find.byKey(const Key('attachment-resume')));
      expect(find.text('Đã đính kèm proof.png.'), findsOneWidget);
      expect(backend.finalizeKeys.length, 1);
      expect(files.files, isEmpty);
    },
  );
  testWidgets('restored draft opens the file tab without auto-uploading', (
    t,
  ) async {
    final backend = UploadBackend(),
        store = MemoryWorkspaceStore(),
        files = MemoryUploadFiles();
    final old = backend.client(DurableUploads(WorkspaceRecords(store), files));
    final attempt = backend.attempt(old);
    await old.stage(attempt);
    old.close();
    final workspace = repo(backend, store, files);
    addTearDown(workspace.dispose);
    await t.pumpWidget(screen(workspace));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('attachment-resume')), findsOneWidget);
    expect(backend.prepareKeys, isEmpty);
    await tap(t, find.text('Tổng quan'));
    await tap(t, find.text('Tệp'));
    expect(find.text('proof.png'), findsOneWidget);
    expect(backend.prepareKeys, isEmpty);
  });
  testWidgets(
    'uncertain finalize is kept until explicit resume; no success banner on timeout',
    (t) async {
      final backend = UploadBackend()..lostFinalize = true,
          store = MemoryWorkspaceStore(),
          files = MemoryUploadFiles();
      final workspace = repo(backend, store, files);
      addTearDown(workspace.dispose);
      await t.pumpWidget(screen(workspace));
      await t.pumpAndSettle();
      await tap(t, find.text('Tệp'));
      await tap(t, find.byKey(const Key('attachment-pick-wo-gallery')));
      await tap(t, find.byKey(const Key('attachment-resume')));
      expect(find.text('Đã đính kèm proof.png.'), findsNothing);
      expect(workspace.pendingUploads, isNotEmpty);
      await tap(t, find.byKey(const Key('attachment-resume')));
      expect(find.text('Đã đính kèm proof.png.'), findsOneWidget);
      expect(backend.puts, 1);
      expect(backend.finalizeKeys.toSet().length, 1);
    },
  );
  testWidgets(
    'cancel removes a selected local file only after explicit confirmation',
    (t) async {
      final backend = UploadBackend(),
          store = MemoryWorkspaceStore(),
          files = MemoryUploadFiles();
      final workspace = repo(backend, store, files);
      addTearDown(workspace.dispose);
      await t.pumpWidget(screen(workspace));
      await t.pumpAndSettle();
      await tap(t, find.text('Tệp'));
      await tap(t, find.byKey(const Key('attachment-pick-wo-document')));
      await tap(t, find.text('Hủy lần tải'));
      expect(files.files.length, 1);
      await tap(t, find.text('Xác nhận'));
      expect(files.files, isEmpty);
      expect(workspace.pendingUploads, isEmpty);
      expect(backend.prepareKeys, isEmpty);
      expect(find.text('Khôi phục lần chọn tệp'), findsNothing);
    },
  );
}
