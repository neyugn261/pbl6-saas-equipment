import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:pbl6_technician/features/session/session_app.dart';
import 'package:pbl6_technician/features/workspace/read_widgets.dart';

import 'support/session_fixture.dart';
import 'support/workspace_fixture.dart' as api;

void main() {
  late SessionFixture f;
  setUp(() {
    f = SessionFixture();
    f.handler = (r) async => api.workspaceResponse(r, f);
  });
  tearDown(() => f.dispose());
  Future<void> open(WidgetTester t) async {
    await f.login();
    await t.pumpWidget(TechnicianApp(session: f.controller));
    await t.pumpAndSettle();
  }

  Future<void> nav(WidgetTester t, String tab) async {
    await t.tap(find.byKey(Key('nav-$tab')));
    await t.pumpAndSettle();
  }

  Future<void> show(WidgetTester t, Finder finder) async {
    await t.scrollUntilVisible(
      finder,
      250,
      scrollable: find.byType(Scrollable).hitTestable().first,
    );
    await t.pumpAndSettle();
  }

  testWidgets(
    'backend jobs, dossier, activity, report, calendar and profile render',
    (t) async {
      await open(t);
      expect(find.text('Xin chào, Demo Technician'), findsOneWidget);
      expect(find.text('Dữ liệu minh họa'), findsNothing);
      expect(find.text('Kiểm tra lỗi hiển thị E12'), findsNothing);
      await nav(t, 'jobs');
      await t.tap(find.text('Công việc từ API'));
      await t.pumpAndSettle();
      expect(find.text('Chi tiết công việc'), findsOneWidget);
      await show(t, find.text('Máy từ backend'));
      expect(find.text('Máy từ backend'), findsOneWidget);
      await show(t, find.text('Khách hàng từ API'));
      expect(find.text('Khách hàng từ API'), findsOneWidget);
      await t.fling(find.byType(ListView).first, const Offset(0, 1800), 6000);
      await t.pumpAndSettle();
      await t.tap(find.text('Hoạt động'));
      await t.pumpAndSettle();
      await show(t, find.text('Nhật ký thật từ API'));
      expect(find.text('Nhật ký thật từ API'), findsOneWidget);
      await t.fling(find.byType(ListView).first, const Offset(0, 1800), 6000);
      await t.pumpAndSettle();
      await t.tap(find.text('Báo cáo'));
      await t.pumpAndSettle();
      expect(find.text('Chẩn đoán từ API'), findsOneWidget);
      expect(find.text('Xử lý một phần'), findsOneWidget);
      await t.pageBack();
      await t.pumpAndSettle();
      await nav(t, 'schedule');
      expect(find.text('Lịch công việc'), findsOneWidget);
      await nav(t, 'equipment');
      await t.tap(find.text('Máy từ backend'));
      await t.pumpAndSettle();
      expect(find.text('Hồ sơ thiết bị'), findsOneWidget);
      await t.tap(find.text('Thông số'));
      await t.pumpAndSettle();
      expect(find.text('Model từ API'), findsOneWidget);
      await t.tap(find.text('Bảo hành'));
      await t.pumpAndSettle();
      expect(find.text('Còn bảo hành'), findsOneWidget);
      await t.tap(find.text('Lịch sử'));
      await t.pumpAndSettle();
      expect(find.text('Chưa ghi nhận lịch sử thiết bị.'), findsOneWidget);
      await t.pageBack();
      await t.pumpAndSettle();
      await nav(t, 'profile');
      expect(find.text('TECH-API'), findsOneWidget);
      await show(t, find.text('Chi nhánh từ API'));
      expect(find.text('Chi nhánh từ API'), findsOneWidget);
      await show(t, find.text('Điện · Cấp 4/5'));
      expect(find.text('Điện · Cấp 4/5'), findsOneWidget);
      final business = f.requests
          .where((r) => !r.url.path.startsWith('/api/identity/'))
          .toList();
      expect(business, isNotEmpty);
      expect(
        business.every(
          (r) =>
              r.method == 'GET' &&
              r.headers['authorization'] == 'Bearer access-0',
        ),
        true,
      );
      expect(business.any((r) => r.url.path.contains('/internal/')), false);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets('outage retries the backend, with no fixture fallback', (
    t,
  ) async {
    var outage = true;
    f.handler = (r) async =>
        outage && r.url.path == '/api/workorders/work-orders'
        ? jsonResponse({'code': 'UNAVAILABLE'}, 503)
        : api.workspaceResponse(r, f);
    await open(t);
    expect(find.text('Thử lại'), findsOneWidget);
    expect(find.text('Kiểm tra lỗi hiển thị E12'), findsNothing);
    outage = false;
    await t.tap(find.text('Thử lại'));
    await t.pumpAndSettle();
    expect(find.text('Công việc từ API'), findsWidgets);
    expect(f.count('/work-orders'), 2);
    expect(t.takeException(), isNull);
  });
  testWidgets('missing Technician profile still permits equipment reads', (
    t,
  ) async {
    f.handler = (r) async => r.url.path == '/api/workorders/technicians/me'
        ? jsonResponse({'code': 'TECHNICIAN_PROFILE_MISSING'}, 404)
        : api.workspaceResponse(r, f);
    await open(t);
    expect(find.textContaining('chưa được liên kết'), findsOneWidget);
    expect(f.count('/work-orders'), 0);
    await nav(t, 'equipment');
    expect(find.text('Máy từ backend'), findsOneWidget);
    expect(find.byKey(const Key('login')), findsNothing);
  });
  testWidgets('empty work list is a true empty state', (t) async {
    f.handler = (r) async => r.url.path == '/api/workorders/work-orders'
        ? jsonResponse(api.page([], size: 100))
        : api.workspaceResponse(r, f);
    await open(t);
    await nav(t, 'jobs');
    expect(find.text('Không có công việc phù hợp.'), findsOneWidget);
    expect(find.text('Công việc từ API'), findsNothing);
  });
  testWidgets('logout discards a late business response', (t) async {
    final gate = Completer<http.Response>();
    f.handler = (r) async => r.url.path == '/api/workorders/work-orders'
        ? gate.future
        : api.workspaceResponse(r, f);
    await f.login();
    await t.pumpWidget(TechnicianApp(session: f.controller));
    await t.pump();
    await t.pump();
    await f.controller.logout();
    await t.pumpAndSettle();
    gate.complete(jsonResponse(api.page([api.workOrder()], size: 100)));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('login')), findsOneWidget);
    expect(find.text('Công việc từ API'), findsNothing);
    expect(t.takeException(), isNull);
  });
  testWidgets(
    'read state ignores out-of-order responses after filter changes',
    (t) async {
      final old = Completer<String>(), latest = Completer<String>();
      Widget view(int key, Future<String> response) => MaterialApp(
        home: Scaffold(
          body: ReadView<String>(
            requestKey: key,
            load: () => response,
            builder: (v) => Text(v),
          ),
        ),
      );
      await t.pumpWidget(view(1, old.future));
      await t.pump();
      await t.pumpWidget(view(2, latest.future));
      await t.pump();
      latest.complete('Thiết bị mới');
      await t.pumpAndSettle();
      old.complete('Thiết bị cũ');
      await t.pumpAndSettle();
      expect(find.text('Thiết bị mới'), findsOneWidget);
      expect(find.text('Thiết bị cũ'), findsNothing);
    },
  );
  testWidgets('all real tabs fit narrow phones and large text', (t) async {
    t.view.physicalSize = const Size(720, 1280);
    t.view.devicePixelRatio = 2;
    t.platformDispatcher.textScaleFactorTestValue = 1.4;
    addTearDown(() {
      t.view.resetPhysicalSize();
      t.view.resetDevicePixelRatio();
      t.platformDispatcher.clearTextScaleFactorTestValue();
    });
    await open(t);
    for (final tab in ['home', 'jobs', 'schedule', 'equipment', 'profile']) {
      await nav(t, tab);
      expect(t.takeException(), isNull, reason: tab);
    }
  });
}
