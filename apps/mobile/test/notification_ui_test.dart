import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/notifications/notification_controller.dart';
import 'package:pbl6_technician/features/notifications/notification_repository.dart';
import 'package:pbl6_technician/features/notifications/notification_screens.dart';
import 'package:pbl6_technician/features/session/session_app.dart';
import 'package:pbl6_technician/features/workspace/workspace_repository.dart';

import 'support/notification_fixture.dart';
import 'support/session_fixture.dart';
import 'support/workflow_server.dart';
import 'support/workspace_fixture.dart' as work;

void main() {
  late NotificationBackend backend;
  late WorkflowServer jobs;
  WorkspaceRepository? workspace;
  late NotificationController center;
  setUp(() {
    backend = NotificationBackend();
    jobs = WorkflowServer();
    workspace = null;
    center = NotificationController(NotificationRepository(backend.call));
  });
  tearDown(() {
    center.dispose();
    workspace?.dispose();
  });
  Widget inbox() => MaterialApp(
    home: NotificationInbox(
      controller: center,
      workspace: workspace ??= jobs.repository(),
    ),
  );
  Future<void> tap(WidgetTester t, Finder finder) async {
    await t.ensureVisible(finder);
    await t.pumpAndSettle();
    await t.tap(finder);
    await t.pumpAndSettle();
  }

  testWidgets(
    'filters and paging use complete server totals and reset to page one',
    (t) async {
      backend.items.addAll(List.generate(39, (i) => notification(i + 4)));
      await t.pumpWidget(inbox());
      await t.pumpAndSettle();
      expect(find.text('42 thông báo chưa đọc'), findsOneWidget);
      expect(find.text('Trang 1 / 3 · 42 mục'), findsOneWidget);
      await tap(t, find.byTooltip('Trang sau'));
      expect(find.text('Thông báo thật 21'), findsOneWidget);
      await tap(t, find.text('Chưa đọc').first);
      expect(find.text('Thông báo thật 1'), findsOneWidget);
      expect(
        backend.calls.last,
        contains('page=1&pageSize=20&readStatus=UNREAD'),
      );
      await tap(t, find.text('Đã đọc').first);
      expect(find.text('Không có thông báo phù hợp.'), findsOneWidget);
    },
  );
  testWidgets(
    'mark read removes an unread item and refreshes the shared badge count',
    (t) async {
      await t.pumpWidget(inbox());
      await t.pumpAndSettle();
      await tap(t, find.text('Chưa đọc').first);
      await tap(
        t,
        find.byKey(Key('notification-read-${notification(1)['id']}')),
      );
      expect(backend.writes, 1);
      expect(center.unreadCount, 2);
      expect(find.text('Thông báo thật 1'), findsNothing);
      await tap(t, find.text('Đã đọc').first);
      expect(find.text('Thông báo thật 1'), findsOneWidget);
    },
  );
  testWidgets(
    'opening a notice marks read and authorizes a fresh WO before navigation',
    (t) async {
      await t.pumpWidget(inbox());
      await t.pumpAndSettle();
      await tap(t, find.text('Thông báo thật 1'));
      expect(find.text('Chi tiết thông báo'), findsOneWidget);
      expect(backend.writes, 1);
      await tap(t, find.byKey(const Key('notification-open-work-order')));
      expect(find.text('Chi tiết công việc'), findsOneWidget);
      expect(
        jobs.requests
            .where(
              (r) => r == 'GET /api/workorders/work-orders/${work.orderId}',
            )
            .length,
        greaterThanOrEqualTo(2),
      );
    },
  );
  testWidgets('a stale notification cannot navigate through a 404', (t) async {
    jobs.beforeRead = (_) async =>
        throw const ApiException('NOT_FOUND', status: 404);
    await t.pumpWidget(inbox());
    await t.pumpAndSettle();
    await tap(t, find.text('Thông báo thật 1'));
    await tap(t, find.byKey(const Key('notification-open-work-order')));
    expect(
      find.textContaining('không còn trong phạm vi truy cập'),
      findsOneWidget,
    );
    expect(find.text('Chi tiết công việc'), findsNothing);
    expect(find.text('Công việc được phân công 1'), findsOneWidget);
  });
  testWidgets(
    'non-WO references display the notice without treating the ID as a WO',
    (t) async {
      backend.items[0] = notification(1, type: 'SERVICE_REQUEST');
      await t.pumpWidget(inbox());
      await t.pumpAndSettle();
      await tap(t, find.text('Thông báo thật 1'));
      expect(
        find.byKey(const Key('notification-open-work-order')),
        findsNothing,
      );
      expect(jobs.requests, isEmpty);
      expect(find.text('Công việc được phân công 1'), findsOneWidget);
    },
  );
  testWidgets(
    'a failed read acknowledgement is visible and not claimed as success',
    (t) async {
      center.dispose();
      center = NotificationController(
        NotificationRepository((method, path) async {
          if (method == 'PATCH') throw const ApiException('TIMEOUT');
          return backend.call(method, path);
        }),
      );
      await t.pumpWidget(inbox());
      await t.pumpAndSettle();
      await tap(t, find.text('Thông báo thật 1'));
      expect(find.text('Thử lại đánh dấu đã đọc'), findsOneWidget);
      expect(find.text('Chưa đọc'), findsOneWidget);
      expect(backend.items[0]['readAt'], isNull);
    },
  );
  testWidgets(
    'outage is an error rather than zero or an empty inbox; retry recovers',
    (t) async {
      center.dispose();
      var outage = true;
      center = NotificationController(
        NotificationRepository((method, path) async {
          if (outage) throw const ApiException('UNAVAILABLE', status: 503);
          return backend.call(method, path);
        }),
      );
      await t.pumpWidget(inbox());
      await t.pumpAndSettle();
      expect(find.text('Chưa xác định số thông báo chưa đọc'), findsOneWidget);
      expect(find.text('Không có thông báo phù hợp.'), findsNothing);
      outage = false;
      await tap(t, find.text('Thử lại'));
      expect(find.text('Thông báo thật 1'), findsOneWidget);
      await tap(t, find.text('Tải lại số chưa đọc'));
      expect(center.unreadCount, 3);
    },
  );
  testWidgets('filter switches discard a response from the older filter', (
    t,
  ) async {
    center.dispose();
    final gate = Completer<Object?>();
    center = NotificationController(
      NotificationRepository(
        (method, path) => path.endsWith('readStatus=ALL')
            ? gate.future
            : backend.call(method, path),
      ),
    );
    await t.pumpWidget(inbox());
    await t.pump();
    await t.tap(find.text('Đã đọc').first);
    await t.pumpAndSettle();
    expect(find.text('Không có thông báo phù hợp.'), findsOneWidget);
    gate.complete(work.page([notification(1)]));
    await t.pumpAndSettle();
    expect(find.text('Thông báo thật 1'), findsNothing);
  });
  testWidgets(
    'foreground re-reads count and inbox; long text fits a narrow phone',
    (t) async {
      t.view.physicalSize = const Size(720, 1280);
      t.view.devicePixelRatio = 2;
      t.platformDispatcher.textScaleFactorTestValue = 1.5;
      addTearDown(() {
        t.view.resetPhysicalSize();
        t.view.resetDevicePixelRatio();
        t.platformDispatcher.clearTextScaleFactorTestValue();
      });
      await t.pumpWidget(inbox());
      await t.pumpAndSettle();
      backend.items.add(notification(4));
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await t.pumpAndSettle();
      expect(center.unreadCount, 4);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'live badge uses the real count and logout discards late inbox data',
    (t) async {
      final session = SessionFixture();
      addTearDown(session.dispose);
      final gate = Completer<Object?>();
      var delayInbox = false;
      session.handler = (r) async {
        if (r.url.path.startsWith('/api/notifications')) {
          return jsonResponse(
            delayInbox && r.url.path == '/api/notifications'
                ? await gate.future
                : await backend.call(
                    r.method,
                    r.url.toString().replaceFirst('http://gateway.test', ''),
                  ),
          );
        }
        return work.workspaceResponse(r, session);
      };
      await session.login();
      await t.pumpWidget(TechnicianApp(session: session.controller));
      await t.pumpAndSettle();
      expect(find.byTooltip('Thông báo · 3 chưa đọc'), findsOneWidget);
      delayInbox = true;
      await t.tap(find.byKey(const Key('notifications-open')));
      await t.pump();
      await session.controller.logout();
      await t.pumpAndSettle();
      gate.complete(work.page([notification(1)]));
      await t.pumpAndSettle();
      expect(find.byKey(const Key('login')), findsOneWidget);
      expect(find.text('Thông báo thật 1'), findsNothing);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets('foreground polling refreshes inbox and stops when inactive', (
    t,
  ) async {
    await t.pumpWidget(inbox());
    await t.pumpAndSettle();
    center.setForeground(true);
    backend.items.add(notification(4));
    await t.pump(const Duration(seconds: 31));
    await t.pumpAndSettle();
    expect(center.unreadCount, 4);
    expect(find.text('Thông báo thật 4'), findsOneWidget);
    center.setForeground(false);
    final requests = backend.calls.length;
    await t.pump(const Duration(seconds: 90));
    expect(backend.calls.length, requests);
  });
  testWidgets('badge exposes its meaning and count to Android accessibility', (
    t,
  ) async {
    await center.refreshCount();
    final semantics = t.ensureSemantics();
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: NotificationBell(controller: center, onOpen: () {}),
        ),
      ),
    );
    expect(
      t.getSemantics(find.byKey(const Key('notifications-open'))).label,
      'Thông báo · 3 chưa đọc',
    );
    semantics.dispose();
  });
  testWidgets(
    'PATCH is not replayed automatically after a 401 and token refresh',
    (t) async {
      final session = SessionFixture();
      addTearDown(session.dispose);
      var patchCalls = 0;
      session.handler = (r) async {
        if (r.url.path.startsWith('/api/notifications')) {
          if (r.method == 'PATCH' && ++patchCalls == 1) {
            return jsonResponse({'code': 'INVALID_ACCESS_TOKEN'}, 401);
          }
          return jsonResponse(
            await backend.call(
              r.method,
              r.url.toString().replaceFirst('http://gateway.test', ''),
            ),
          );
        }
        return work.workspaceResponse(r, session);
      };
      await session.login();
      await t.pumpWidget(TechnicianApp(session: session.controller));
      await t.pumpAndSettle();
      await tap(t, find.byKey(const Key('notifications-open')));
      await tap(t, find.text('Thông báo thật 1'));
      expect(patchCalls, 1);
      expect(session.rotation, 1);
      expect(find.text('Thử lại đánh dấu đã đọc'), findsOneWidget);
      await tap(t, find.text('Thử lại đánh dấu đã đọc'));
      expect(patchCalls, 2);
      expect(backend.items[0]['readAt'], isNotNull);
    },
  );
  testWidgets(
    'a revoked recipient projection refreshes and removes cached inbox rows',
    (t) async {
      center.dispose();
      var revoked = false;
      center = NotificationController(
        NotificationRepository((method, path) async {
          if (revoked) throw const ApiException('FORBIDDEN', status: 403);
          return backend.call(method, path);
        }),
      );
      await t.pumpWidget(inbox());
      await t.pumpAndSettle();
      expect(find.text('Thông báo thật 1'), findsOneWidget);
      revoked = true;
      await center.refreshCount();
      await t.pumpAndSettle();
      expect(find.text('Thông báo thật 1'), findsNothing);
      expect(find.text('Không có thông báo phù hợp.'), findsNothing);
      expect(find.textContaining('không có quyền'), findsWidgets);
      expect(center.unreadCount, isNull);
    },
  );
}
