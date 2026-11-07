import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/workspace/checklist_panel.dart';
import 'package:pbl6_technician/features/workspace/job_reads.dart';
import 'package:pbl6_technician/features/workspace/report_form.dart';
import 'package:pbl6_technician/features/workspace/workspace_repository.dart';
import 'package:pbl6_technician/features/workspace/workspace_store.dart';
import 'package:pbl6_technician/features/workspace/work_order_workflow.dart';

import 'support/workflow_server.dart';
import 'support/workspace_fixture.dart' show orderId;

class ChecklistBackend {
  final server = WorkflowServer('IN_PROGRESS');
  int version = 0, saves = 0;
  List<Json> results = [];
  bool loseResponse = false;
  Completer<void>? gate;
  Future<Object?> read(String path) async {
    if (!path.endsWith('/checklist')) return server.read(path);
    return {
      'version': version,
      'canEdit':
          server.current['status'] != 'COMPLETED' &&
          nested(server.current, 'currentAssignment')['technicianUserId'] ==
              workflowUser.id,
      'items': [
        {
          'id': 'filter',
          'title': 'Kiểm tra bộ lọc',
          'action': 'INSPECT',
          'instructions': 'Quan sát',
          'required': true,
          'allowNotApplicable': true,
        },
      ],
      'results': jsonDecode(jsonEncode(results)),
    };
  }

  Future<Object?> write(String path, Json body) async {
    if (!path.endsWith('/checklist')) return server.write(path, body);
    saves++;
    await gate?.future;
    if (body['expectedVersion'] != version) {
      throw const ApiException('CHECKLIST_VERSION_CONFLICT', status: 409);
    }
    results = rows(body['results']);
    version++;
    if (loseResponse) throw const ApiException('NETWORK_ERROR');
    return read(path);
  }

  WorkspaceRepository repository(WorkspaceStore store) =>
      WorkspaceRepository(read, workflowUser, write: write, store: store);
}

void main() {
  Future<void> tap(WidgetTester t, Finder finder) async {
    t.testTextInput.hide();
    await t.pumpAndSettle();
    await t.ensureVisible(finder);
    await t.pumpAndSettle();
    await t.tap(finder);
    await t.pumpAndSettle();
  }

  Widget app(Widget child) => MaterialApp(home: child);
  Widget panel(WorkspaceRepository repo) => app(
    Scaffold(
      body: SingleChildScrollView(
        child: ChecklistPanel(repo: repo, orderId: orderId),
      ),
    ),
  );

  testWidgets(
    'checklist note survives tabs without a mutation and complete is disabled while dirty',
    (t) async {
      final backend = ChecklistBackend(), store = MemoryWorkspaceStore();
      final repo = backend.repository(store);
      addTearDown(repo.dispose);
      await t.pumpWidget(app(JobReadScreen(repo: repo, id: orderId)));
      await t.pumpAndSettle();
      await tap(t, find.text('Checklist'));
      await t.enterText(find.byType(TextFormField), 'Observed dirty filter');
      await t.pumpAndSettle();
      expect(
        t.widget<FilledButton>(find.byKey(const Key('wo-complete'))).onPressed,
        isNull,
      );
      await tap(t, find.text('Tổng quan'));
      await tap(t, find.text('Checklist'));
      expect(find.text('Observed dirty filter'), findsOneWidget);
      expect(backend.saves, 0);
    },
  );

  testWidgets('Back asks before leaving and can persist or discard checklist', (
    t,
  ) async {
    final backend = ChecklistBackend(), store = MemoryWorkspaceStore();
    final repo = backend.repository(store);
    addTearDown(repo.dispose);
    await t.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => JobReadScreen(repo: repo, id: orderId),
                ),
              ),
              child: const Text('Open job'),
            ),
          ),
        ),
      ),
    );
    await tap(t, find.text('Open job'));
    await tap(t, find.text('Checklist'));
    await t.enterText(find.byType(TextFormField), 'Keep this inspection');
    await t.pumpAndSettle();
    await t.binding.handlePopRoute();
    await t.pumpAndSettle();
    expect(find.text('Rời checklist đang nhập?'), findsOneWidget);
    await tap(t, find.text('Lưu nháp và rời'));
    expect(find.text('Open job'), findsOneWidget);
    expect(
      (await repo.records.get(orderId, 'checklistDraft'))!['results'],
      isNotEmpty,
    );
    await tap(t, find.text('Open job'));
    await tap(t, find.text('Checklist'));
    expect(find.text('Keep this inspection'), findsOneWidget);
    await t.binding.handlePopRoute();
    await t.pumpAndSettle();
    await tap(t, find.text('Bỏ thay đổi'));
    expect(await repo.records.get(orderId, 'checklistDraft'), isNull);
    expect(backend.saves, 0);
  });

  testWidgets(
    'a new workspace restores checklist after process loss and preserves old assignment read-only',
    (t) async {
      final backend = ChecklistBackend(), store = MemoryWorkspaceStore();
      final old = backend.repository(store);
      await t.pumpWidget(panel(old));
      await t.pumpAndSettle();
      await t.enterText(
        find.byType(TextFormField),
        'Draft from old assignment',
      );
      await t.pump(const Duration(milliseconds: 300));
      await t.pumpWidget(const SizedBox());
      await t.pumpAndSettle();
      old.dispose();
      backend.server.setStatus(
        'ASSIGNED',
        owner: 'user-a',
        assignmentId: 'replacement-assignment',
      );
      final repo = backend.repository(store);
      addTearDown(repo.dispose);
      await t.pumpWidget(panel(repo));
      await t.pumpAndSettle();
      expect(find.text('Draft from old assignment'), findsOneWidget);
      expect(
        t.widget<TextFormField>(find.byType(TextFormField)).enabled,
        false,
      );
      expect(
        find.textContaining('Bản nháp cũ chỉ để đối chiếu'),
        findsOneWidget,
      );
      expect(backend.saves, 0);
    },
  );

  testWidgets(
    'required checklist progress updates and successful save clears only checklist draft',
    (t) async {
      final backend = ChecklistBackend(), store = MemoryWorkspaceStore();
      final repo = backend.repository(store);
      addTearDown(repo.dispose);
      await repo.records.put(orderId, 'reportDraft', {'private': 'keep'});
      await t.pumpWidget(panel(repo));
      await t.pumpAndSettle();
      expect(find.text('0/1 mục bắt buộc đã hoàn tất'), findsOneWidget);
      await tap(t, find.text('Chưa thực hiện'));
      await tap(t, find.text('Đã thực hiện').last);
      expect(find.text('1/1 mục bắt buộc đã hoàn tất'), findsOneWidget);
      await tap(t, find.byKey(const Key('checklist-save')));
      expect(backend.saves, 1);
      expect(await repo.records.get(orderId, 'checklistDraft'), isNull);
      expect(await repo.records.get(orderId, 'reportDraft'), {
        'private': 'keep',
      });
    },
  );

  testWidgets(
    'lost checklist response is reconciled after restart without another POST',
    (t) async {
      final backend = ChecklistBackend(), store = MemoryWorkspaceStore();
      final old = backend.repository(store);
      await t.pumpWidget(panel(old));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextFormField), 'Saved remotely');
      backend.loseResponse = true;
      await tap(t, find.byKey(const Key('checklist-save')));
      expect(old.pendingChecklists, isNotEmpty);
      await t.pumpWidget(const SizedBox());
      await t.pumpAndSettle();
      old.dispose();
      final repo = backend.repository(store);
      addTearDown(repo.dispose);
      await t.pumpWidget(panel(repo));
      await t.pumpAndSettle();
      expect(find.text('Saved remotely'), findsOneWidget);
      expect(find.textContaining('đã có trên máy chủ'), findsOneWidget);
      expect(repo.pendingChecklists, isEmpty);
      expect(backend.saves, 1);
    },
  );

  testWidgets('in-flight checklist cannot be left or sent twice', (t) async {
    final backend = ChecklistBackend(), store = MemoryWorkspaceStore();
    final repo = backend.repository(store);
    addTearDown(repo.dispose);
    await t.pumpWidget(app(JobReadScreen(repo: repo, id: orderId)));
    await t.pumpAndSettle();
    await tap(t, find.text('Checklist'));
    await t.enterText(find.byType(TextFormField), 'Inspection');
    await t.pumpAndSettle();
    backend.gate = Completer<void>();
    t.testTextInput.hide();
    await t.pumpAndSettle();
    await t.ensureVisible(find.byKey(const Key('checklist-save')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('checklist-save')));
    await t.pump();
    await t.ensureVisible(find.text('Tổng quan'));
    await t.tap(find.text('Tổng quan'));
    await t.pump();
    expect(find.text('Checklist thực hiện'), findsOneWidget);
    await t.binding.handlePopRoute();
    await t.pump();
    expect(find.byType(AlertDialog), findsNothing);
    backend.gate!.complete();
    await t.pumpAndSettle();
    expect(backend.saves, 1);
  });

  testWidgets(
    'report survives fresh controller and becomes read-only after reassignment',
    (t) async {
      final server = WorkflowServer('IN_PROGRESS'),
          store = MemoryWorkspaceStore();
      final old = WorkspaceRepository(
        server.read,
        workflowUser,
        write: server.write,
        store: store,
      );
      final flow = WorkOrderWorkflow(old, orderId);
      await flow.load();
      await t.pumpWidget(app(LiveReportForm(workflow: flow)));
      await t.pumpAndSettle();
      await t.enterText(
        find.byKey(const Key('report-problem')),
        'Durable report draft',
      );
      await t.pump(const Duration(milliseconds: 300));
      await t.pumpWidget(const SizedBox());
      await t.pumpAndSettle();
      flow.dispose();
      old.dispose();
      server.setStatus(
        'IN_PROGRESS',
        owner: 'user-a',
        assignmentId: 'new-assignment',
      );
      final repo = WorkspaceRepository(
        server.read,
        workflowUser,
        write: server.write,
        store: store,
      );
      final restored = WorkOrderWorkflow(repo, orderId);
      addTearDown(restored.dispose);
      addTearDown(repo.dispose);
      await restored.load();
      await t.pumpWidget(app(LiveReportForm(workflow: restored)));
      await t.pumpAndSettle();
      expect(find.text('Durable report draft'), findsOneWidget);
      expect(
        t
            .widget<TextFormField>(find.byKey(const Key('report-problem')))
            .enabled,
        false,
      );
      expect(find.textContaining('Phân công đã thay đổi'), findsOneWidget);
      expect(server.writes, 0);
    },
  );
  testWidgets('erasing all report text removes the previous saved draft', (
    t,
  ) async {
    final server = WorkflowServer('IN_PROGRESS'),
        store = MemoryWorkspaceStore();
    final repo = WorkspaceRepository(
      server.read,
      workflowUser,
      write: server.write,
      store: store,
    );
    final flow = WorkOrderWorkflow(repo, orderId);
    addTearDown(flow.dispose);
    addTearDown(repo.dispose);
    await flow.load();
    await t.pumpWidget(app(LiveReportForm(workflow: flow)));
    await t.pumpAndSettle();
    final problem = find.byKey(const Key('report-problem'));
    await t.enterText(problem, 'Saved text');
    await t.pump(const Duration(milliseconds: 300));
    expect(await repo.records.get(orderId, 'reportDraft'), isNotNull);
    await t.enterText(problem, '');
    await t.pump(const Duration(milliseconds: 300));
    expect(await repo.records.get(orderId, 'reportDraft'), isNull);
    expect(server.writes, 0);
  });
}
