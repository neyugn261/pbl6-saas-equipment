import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:pbl6_technician/features/session/session_app.dart';
import 'package:pbl6_technician/features/preferences/app_preferences.dart';
import 'package:pbl6_technician/features/workspace/work_calendar.dart';
import 'package:pbl6_technician/features/workspace/personal_jobs.dart';

import 'support/session_fixture.dart';
import 'support/workspace_fixture.dart' as api;

void main() {
  late SessionFixture f;
  late AppPreferences preferences;
  List<Map<String, dynamic>> orders = [];
  setUp(() {
    f = SessionFixture();
    preferences = AppPreferences(MemoryPreferencesStore());
    orders = [
      api.workOrder(),
      {
        ...api.workOrder(status: 'COMPLETED', current: false),
        'id': 'completed',
        'workOrderNo': 'WO-DONE',
        'title': 'Công việc đã xong',
      },
    ];
    f.handler = (r) async => r.url.path == '/api/workorders/work-orders'
        ? jsonResponse(api.page(orders, size: 100))
        : api.workspaceResponse(r, f);
  });
  tearDown(() {
    f.dispose();
    preferences.dispose();
  });
  Future<void> open(WidgetTester t) async {
    await f.login();
    await t.pumpWidget(
      TechnicianApp(session: f.controller, preferences: preferences),
    );
    await t.pumpAndSettle();
  }

  Future<void> nav(WidgetTester t, String tab) async {
    await t.tap(find.byKey(Key('nav-$tab')));
    await t.pumpAndSettle();
  }

  Future<void> tap(WidgetTester t, Finder finder) async {
    await t.ensureVisible(finder);
    await t.pumpAndSettle();
    await t.tap(finder);
    await t.pumpAndSettle();
  }

  Future<void> refresh(WidgetTester t) async {
    final list = find.byType(Scrollable).hitTestable().first;
    t.state<ScrollableState>(list).position.jumpTo(0);
    await t.pumpAndSettle();
    await t.tap(
      find.widgetWithIcon(IconButton, Icons.refresh_rounded).hitTestable(),
    );
    await t.pumpAndSettle();
  }

  testWidgets(
    'history, query and filters survive loading, outage, retry and foreground',
    (t) async {
      await open(t);
      await nav(t, 'jobs');
      await t.tap(find.text('Lịch sử'));
      await t.pumpAndSettle();
      await t.enterText(find.byKey(const Key('jobs-search')), 'WO-DONE');
      await t.pumpAndSettle();
      final filters = t
          .widget<PersonalJobs>(find.byType(PersonalJobs))
          .filters!;
      filters.type = 'REPAIR';
      filters.priority = 'HIGH';
      filters.dates = DateTimeRange(
        start: DateTime.utc(2026, 10, 28),
        end: DateTime.utc(2026, 10, 28),
      );
      final gate = Completer<http.Response>();
      f.handler = (r) async => r.url.path == '/api/workorders/work-orders'
          ? gate.future
          : api.workspaceResponse(r, f);
      await t.tap(
        find.widgetWithIcon(IconButton, Icons.refresh_rounded).hitTestable(),
      );
      await t.pump();
      await t.pump(const Duration(milliseconds: 100));
      expect(find.byType(PersonalJobs), findsNothing);
      expect(find.text('Công việc đã xong'), findsNothing);
      gate.complete(jsonResponse({'code': 'UNAVAILABLE'}, 503));
      await t.pumpAndSettle();
      expect(find.text('Thử lại'), findsOneWidget);
      expect(find.text('Công việc đã xong'), findsNothing);
      f.handler = (r) async => r.url.path == '/api/workorders/work-orders'
          ? jsonResponse(api.page(orders, size: 100))
          : api.workspaceResponse(r, f);
      await t.tap(find.text('Thử lại'));
      await t.pumpAndSettle();
      expect(
        t
            .widget<TextField>(find.byKey(const Key('jobs-search')))
            .controller!
            .text,
        'WO-DONE',
      );
      expect(filters.history, isTrue);
      expect(filters.type, 'REPAIR');
      expect(filters.priority, 'HIGH');
      expect(filters.dates, isNotNull);
      expect(find.text('Công việc đã xong'), findsOneWidget);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await t.pumpAndSettle();
      expect(
        t
            .widget<TextField>(find.byKey(const Key('jobs-search')))
            .controller!
            .text,
        'WO-DONE',
      );
      expect(filters.history, isTrue);
    },
  );
  testWidgets(
    'return from WO and root tab preserves query; explicit home shortcut resets it even repeated',
    (t) async {
      await open(t);
      await nav(t, 'jobs');
      await t.enterText(find.byKey(const Key('jobs-search')), 'WO-REAL');
      await t.pumpAndSettle();
      await tap(t, find.text('Công việc từ API'));
      await t.tap(find.byType(BackButton).hitTestable());
      await t.pumpAndSettle();
      expect(
        t
            .widget<TextField>(find.byKey(const Key('jobs-search')))
            .controller!
            .text,
        'WO-REAL',
      );
      await nav(t, 'profile');
      await nav(t, 'jobs');
      expect(
        t
            .widget<TextField>(find.byKey(const Key('jobs-search')))
            .controller!
            .text,
        'WO-REAL',
      );
      for (var i = 0; i < 2; i++) {
        await nav(t, 'home');
        await tap(t, find.text('Đang thực hiện').first);
        await t.pumpAndSettle();
        expect(
          t
              .widget<TextField>(find.byKey(const Key('jobs-search')))
              .controller!
              .text,
          isEmpty,
        );
        final filters = t
            .widget<PersonalJobs>(find.byType(PersonalJobs))
            .filters!;
        expect(filters.status, 'IN_PROGRESS,TRAVELLING');
        await t.enterText(find.byKey(const Key('jobs-search')), 'no-match');
        await t.pumpAndSettle();
      }
    },
  );
  testWidgets(
    'calendar date, mode, day focus and history survive refresh, detail, tabs and theme change',
    (t) async {
      await open(t);
      await nav(t, 'schedule');
      final view = t.widget<WorkCalendar>(find.byType(WorkCalendar)).selection!;
      view.date = DateTime.utc(2026, 10, 28);
      view.mode = CalendarMode.month;
      view.history = true;
      view.wholePeriod = false;
      await refresh(t);
      expect(find.text('10/2026'), findsOneWidget);
      expect(find.text('Công việc ngày 28/10/2026 · 2'), findsOneWidget);
      await tap(t, find.text('Công việc từ API'));
      await t.tap(find.byType(BackButton).hitTestable());
      await t.pumpAndSettle();
      await nav(t, 'jobs');
      await nav(t, 'schedule');
      await preferences.setTheme(ThemeMode.dark);
      await t.pumpAndSettle();
      expect(
        t.widget<WorkCalendar>(find.byType(WorkCalendar)).selection,
        same(view),
      );
      expect(view.date, DateTime.utc(2026, 10, 28));
      expect(view.history, isTrue);
      expect(view.wholePeriod, isFalse);
      expect(
        Theme.of(t.element(find.byType(WorkCalendar))).brightness,
        Brightness.dark,
      );
    },
  );
  testWidgets(
    'pagination is preserved when possible and clamped when data shrinks',
    (t) async {
      orders = List.generate(
        25,
        (i) => {
          ...api.workOrder(id: 'id-$i'),
          'workOrderNo': 'WO-$i',
          'title': 'Việc $i',
        },
      );
      await open(t);
      await nav(t, 'jobs');
      await tap(t, find.byTooltip('Trang sau'));
      expect(find.text('Trang 2 / 2 · 25 mục'), findsOneWidget);
      await refresh(t);
      expect(find.text('Trang 2 / 2 · 25 mục'), findsOneWidget);
      orders = orders.take(2).toList();
      await refresh(t);
      expect(find.text('Trang 1 / 1 · 2 mục'), findsOneWidget);
    },
  );
  testWidgets(
    'new session clears personal filters while device theme persists',
    (t) async {
      await open(t);
      await nav(t, 'jobs');
      await t.tap(find.text('Lịch sử'));
      await t.enterText(find.byKey(const Key('jobs-search')), 'WO-DONE');
      await t.pumpAndSettle();
      await preferences.setTheme(ThemeMode.dark);
      await f.controller.logout();
      await t.pumpAndSettle();
      expect(find.byKey(const Key('login')), findsOneWidget);
      expect(
        Theme.of(t.element(find.byKey(const Key('login')))).brightness,
        Brightness.dark,
      );
      await f.controller.login(
        tenantCode: 'DEMO',
        email: 'technician@demo.local',
        password: 'test-only',
      );
      await t.pumpAndSettle();
      await nav(t, 'jobs');
      final filters = t
          .widget<PersonalJobs>(find.byType(PersonalJobs))
          .filters!;
      expect(filters.query, isEmpty);
      expect(filters.history, isFalse);
    },
  );
}
