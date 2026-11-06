import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/session/session_app.dart';
import 'package:pbl6_technician/features/workspace/job_parts.dart';
import 'package:pbl6_technician/features/workspace/job_reads.dart';
import 'package:pbl6_technician/features/workspace/workspace_repository.dart';

import 'support/parts_fixture.dart';
import 'support/session_fixture.dart';
import 'support/workflow_server.dart';
import 'support/workspace_fixture.dart' as work;

void main() {
  Widget panel(
    WorkspaceRepository repo, {
    String id = work.orderId,
    int revision = 0,
  }) => MaterialApp(
    home: Scaffold(
      body: SingleChildScrollView(
        child: JobParts(repo: repo, orderId: id, revision: revision),
      ),
    ),
  );
  Future<void> tap(WidgetTester t, Finder finder) async {
    t.testTextInput.hide();
    await t.pumpAndSettle();
    await t.ensureVisible(finder);
    await t.pumpAndSettle();
    await t.tap(finder);
    await t.pumpAndSettle();
  }

  testWidgets(
    'shows historical names, exact quantities and linked return conditions',
    (t) async {
      final repo = WorkspaceRepository((_) async => [usage()], workflowUser);
      addTearDown(repo.dispose);
      await t.pumpWidget(panel(repo));
      await t.pumpAndSettle();
      await tap(t, find.text('Dầu bảo trì 1'));
      expect(find.text('5.50'), findsOneWidget);
      expect(find.text('1.75'), findsOneWidget);
      expect(find.text('0.00'), findsOneWidget);
      expect(find.text('3.75'), findsNWidgets(2));
      expect(find.text('1.25 · Tốt'), findsOneWidget);
      expect(find.text('0.50 · Hư hỏng'), findsOneWidget);
      expect(find.text('123.45'), findsNothing);
      expect(find.text('USD'), findsNothing);
    },
  );
  testWidgets(
    'filters already loaded rows by code or warehouse without additional APIs',
    (t) async {
      var reads = 0;
      final repo = WorkspaceRepository((_) async {
        reads++;
        return [usage(1), usage(2)];
      }, workflowUser);
      addTearDown(repo.dispose);
      await t.pumpWidget(panel(repo));
      await t.pumpAndSettle();
      await t.enterText(find.byKey(const Key('parts-search')), 'oil-2');
      await t.pumpAndSettle();
      expect(find.text('Dầu bảo trì 1'), findsNothing);
      expect(find.text('Dầu bảo trì 2'), findsOneWidget);
      await t.enterText(find.byKey(const Key('parts-search')), 'not found');
      await t.pumpAndSettle();
      expect(
        find.text('Không có phụ tùng phù hợp với bộ lọc.'),
        findsOneWidget,
      );
      expect(reads, 1);
    },
  );
  testWidgets(
    'only a successful empty array is an empty state; outage retries',
    (t) async {
      var outage = true;
      final repo = WorkspaceRepository((_) async {
        if (outage) throw const ApiException('UNAVAILABLE', status: 503);
        return <Json>[];
      }, workflowUser);
      addTearDown(repo.dispose);
      await t.pumpWidget(panel(repo));
      await t.pumpAndSettle();
      expect(
        find.text('Chưa có phụ tùng được cấp cho công việc này.'),
        findsNothing,
      );
      outage = false;
      await tap(t, find.text('Thử lại'));
      expect(
        find.text('Chưa có phụ tùng được cấp cho công việc này.'),
        findsOneWidget,
      );
    },
  );
  testWidgets(
    'legacy fields remain unknown and reversal records remain visible',
    (t) async {
      final repo = WorkspaceRepository(
        (_) async => [
          {
            ...usage(),
            'partSnapshot': null,
            'warehouseSnapshot': null,
            'confirmations': [
              confirmation(1),
              confirmation(2, kind: 'REVERSE', reversesId: partId(9001)),
            ],
          },
        ],
        workflowUser,
      );
      addTearDown(repo.dispose);
      await t.pumpWidget(panel(repo));
      await t.pumpAndSettle();
      await tap(t, find.text('Phụ tùng chưa có tên lưu tại lúc cấp'));
      expect(find.textContaining('chưa được lưu đầy đủ'), findsOneWidget);
      expect(find.text('0.25 · Xác nhận đã được đính chính'), findsOneWidget);
      expect(find.text('0.25 · Đính chính xác nhận'), findsOneWidget);
    },
  );
  testWidgets('changing WO discards a late result from the previous WO', (
    t,
  ) async {
    final old = Completer<Object?>(), fresh = Completer<Object?>();
    final repo = WorkspaceRepository(
      (path) => path.contains(work.orderId) ? old.future : fresh.future,
      workflowUser,
    );
    addTearDown(repo.dispose);
    await t.pumpWidget(panel(repo));
    await t.pump();
    await t.pumpWidget(panel(repo, id: partId(99)));
    await t.pump();
    fresh.complete([usage(2, partId(99))]);
    await t.pumpAndSettle();
    old.complete([usage()]);
    await t.pumpAndSettle();
    expect(find.text('Dầu bảo trì 2'), findsOneWidget);
    expect(find.text('Dầu bảo trì 1'), findsNothing);
  });
  testWidgets(
    'WO parts tab is read-only for terminal work and refreshes on foreground',
    (t) async {
      var data = usage();
      final server = WorkflowServer('IN_PROGRESS')
        ..apply('complete', validReport);
      final calls = <String>[];
      final repo = WorkspaceRepository(
        (path) async {
          calls.add(path);
          if (path.startsWith('/api/inventory')) return [data];
          return await server.read(path);
        },
        workflowUser,
        write: (_, _) async => fail('Parts tab must not send a mutation'),
      );
      addTearDown(repo.dispose);
      // Establish a valid completed-WO fixture before mounting the detail route.
      await repo.order(work.orderId);
      await t.pumpWidget(
        MaterialApp(
          home: JobReadScreen(repo: repo, id: work.orderId),
        ),
      );
      await t.pumpAndSettle();
      expect(
        find.text('Phụ tùng'),
        findsOneWidget,
        reason: t
            .widgetList<Text>(find.byType(Text))
            .map((w) => w.data)
            .join(' | '),
      );
      await tap(t, find.text('Phụ tùng'));
      expect(find.text('Dầu bảo trì 1'), findsOneWidget);
      data = usage(2);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await t.pumpAndSettle();
      expect(find.text('Dầu bảo trì 2'), findsOneWidget);
      expect(find.text('Dầu bảo trì 1'), findsNothing);
      expect(find.text('Xác nhận sử dụng'), findsNothing);
      expect(find.text('Cấp phụ tùng'), findsNothing);
      expect(
        calls.where((path) => path.startsWith('/api/inventory')).length,
        2,
      );
    },
  );
  testWidgets('expanded parts fit a narrow screen with large text', (t) async {
    t.view.physicalSize = const Size(720, 1280);
    t.view.devicePixelRatio = 2;
    t.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(() {
      t.view.resetPhysicalSize();
      t.view.resetDevicePixelRatio();
      t.platformDispatcher.clearTextScaleFactorTestValue();
    });
    final repo = WorkspaceRepository((_) async => [usage()], workflowUser);
    addTearDown(repo.dispose);
    await t.pumpWidget(panel(repo));
    await t.pumpAndSettle();
    await tap(t, find.text('Dầu bảo trì 1'));
    expect(t.takeException(), isNull);
  });
  testWidgets(
    'logout prevents a late parts response from leaking into the next session',
    (t) async {
      final session = SessionFixture();
      addTearDown(session.dispose);
      final gate = Completer<Object?>();
      session.handler = (r) async => r.url.path.startsWith('/api/inventory')
          ? jsonResponse(await gate.future)
          : work.workspaceResponse(r, session);
      await session.login();
      await t.pumpWidget(TechnicianApp(session: session.controller));
      await t.pumpAndSettle();
      await tap(t, find.byKey(const Key('nav-jobs')));
      await tap(t, find.text('Công việc từ API'));
      await t.ensureVisible(find.text('Phụ tùng'));
      await t.pumpAndSettle();
      await t.tap(find.text('Phụ tùng'));
      await t.pump();
      await session.controller.logout();
      await t.pumpAndSettle();
      gate.complete([usage()]);
      await t.pumpAndSettle();
      expect(find.byKey(const Key('login')), findsOneWidget);
      expect(find.text('Dầu bảo trì 1'), findsNothing);
      expect(
        session.requests
            .where((r) => r.url.path.startsWith('/api/inventory'))
            .every((r) => r.method == 'GET'),
        true,
      );
      expect(t.takeException(), isNull);
    },
  );
}
