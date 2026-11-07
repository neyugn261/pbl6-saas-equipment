import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/features/workspace/work_calendar.dart';
import 'package:pbl6_technician/features/workspace/workspace_repository.dart';

import 'support/workspace_fixture.dart' as api;
import 'support/workflow_server.dart' show workflowUser;

void main() {
  test(
    'Monday week and exclusive day/month boundaries across year and leap year',
    () {
      final week = CalendarRange(DateTime.utc(2027, 1, 3), CalendarMode.week);
      expect(week.start, DateTime.utc(2026, 12, 28));
      expect(week.end, DateTime.utc(2027, 1, 4));
      final month = CalendarRange(
        DateTime.utc(2028, 2, 29),
        CalendarMode.month,
      );
      expect(month.end.difference(month.start).inDays, 29);
      expect(month.contains(DateTime.utc(2028, 3, 1)), isFalse);
      expect(
        CalendarRange.move(DateTime.utc(2028, 1, 31), CalendarMode.month, 1),
        DateTime.utc(2028, 2, 29),
      );
      expect(
        CalendarRange.move(DateTime.utc(2027, 1, 31), CalendarMode.month, 1),
        DateTime.utc(2027, 2, 28),
      );
      expect(
        CalendarRange.move(DateTime.utc(2026, 12, 31), CalendarMode.day, 1),
        DateTime.utc(2027, 1, 1),
      );
    },
  );
  testWidgets(
    'start-only Vietnam calendar, true counts, day focus, history and unscheduled work',
    (t) async {
      final repo = WorkspaceRepository((_) async => {}, workflowUser);
      addTearDown(repo.dispose);
      WorkOrder order(
        String id,
        String? start, {
        String? end,
        bool current = true,
      }) => WorkOrder({
        ...api.workOrder(
          id: id,
          status: current ? 'IN_PROGRESS' : 'COMPLETED',
          current: current,
        ),
        'title': id,
        'scheduledStart': start,
        'scheduledEnd': end,
      });
      final work = PersonalWork({}, [
        order('midnight', '2026-10-27T17:00:00Z'),
        order('before', '2026-10-27T16:59:59Z', end: '2026-10-28T10:00:00Z'),
        order('next', '2026-10-28T17:00:00Z'),
        order('unscheduled', null),
        order('old-unscheduled', null, current: false),
        order('done', '2026-10-27T18:00:00Z', current: false),
      ], 'user-a');
      final selection = CalendarSelection(date: DateTime.utc(2026, 10, 28));
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: WorkCalendar(work: work, repo: repo, selection: selection),
            ),
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('midnight'), findsOneWidget);
      expect(find.text('before'), findsNothing);
      expect(find.text('next'), findsNothing);
      expect(find.text('unscheduled'), findsOneWidget);
      expect(find.text('old-unscheduled'), findsNothing);
      expect(find.text('done'), findsNothing);
      await t.tap(find.text('Tuần'));
      await t.pumpAndSettle();
      expect(find.text('before'), findsOneWidget);
      expect(find.text('next'), findsOneWidget);
      await t.tap(find.byKey(const Key('calendar-day-2026-10-28')));
      await t.pumpAndSettle();
      expect(find.text('before'), findsNothing);
      expect(find.text('next'), findsNothing);
      await t.ensureVisible(find.byType(SwitchListTile));
      await t.tap(find.byType(SwitchListTile));
      await t.pumpAndSettle();
      expect(find.text('done'), findsOneWidget);
      expect(find.text('Công việc ngày 28/10/2026 · 2'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'month grid and day controls fit 360dp with large text and leap day',
    (t) async {
      t.view.physicalSize = const Size(720, 1280);
      t.view.devicePixelRatio = 2;
      t.platformDispatcher.textScaleFactorTestValue = 1.5;
      addTearDown(() {
        t.view.resetPhysicalSize();
        t.view.resetDevicePixelRatio();
        t.platformDispatcher.clearTextScaleFactorTestValue();
      });
      final repo = WorkspaceRepository((_) async => {}, workflowUser);
      addTearDown(repo.dispose);
      final selection = CalendarSelection(date: DateTime.utc(2028, 2, 29))
        ..mode = CalendarMode.month;
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: WorkCalendar(
                work: PersonalWork({}, [], 'user-a'),
                repo: repo,
                selection: selection,
              ),
            ),
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.byKey(const Key('calendar-day-2028-02-29')), findsOneWidget);
      expect(find.byKey(const Key('calendar-day-2028-03-01')), findsNothing);
      await t.tap(find.byTooltip('Kỳ sau'));
      await t.pumpAndSettle();
      expect(selection.date, DateTime.utc(2028, 3, 29));
      expect(t.takeException(), isNull);
    },
  );
}
