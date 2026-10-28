import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/workspace/job_reads.dart';
import 'package:pbl6_technician/features/workspace/report_form.dart';
import 'package:pbl6_technician/ui/theme.dart';

import 'support/workflow_server.dart';
import 'support/workspace_fixture.dart' show orderId;

void main() {
  late WorkflowServer server;
  Future<void> open(WidgetTester t, [String state = 'ASSIGNED']) async {
    server = WorkflowServer(state);
    final repo = server.repository();
    addTearDown(repo.dispose);
    await t.pumpWidget(
      MaterialApp(
        theme: technicianTheme(),
        home: JobReadScreen(repo: repo, id: orderId),
      ),
    );
    await t.pumpAndSettle();
  }

  Future<void> tap(WidgetTester t, String key) async {
    await t.tap(find.byKey(Key(key)));
    await t.pumpAndSettle();
  }

  Future<void> form(WidgetTester t) async {
    await tap(t, 'wo-complete');
    await t.enterText(
      find.byKey(const Key('report-problem')),
      validReport['problemDescription'] as String,
    );
    await t.enterText(
      find.byKey(const Key('report-cause')),
      validReport['rootCause'] as String,
    );
    await tap(t, 'report-next');
    await t.enterText(
      find.byKey(const Key('report-solution')),
      validReport['solution'] as String,
    );
    await tap(t, 'report-next');
    await t.enterText(
      find.byKey(const Key('report-summary')),
      validReport['customerSummary'] as String,
    );
    await tap(t, 'report-next');
  }

  testWidgets(
    'accept/travel/start/hold/resume and note submit real callbacks',
    (t) async {
      await open(t);
      for (final action in [
        'accept',
        'start-travel',
        'start',
        'hold',
        'resume',
      ]) {
        await tap(t, 'wo-$action');
        if (action == 'hold') {
          await tap(t, 'confirm-command');
          expect(find.text('Vui lòng nhập nội dung.'), findsOneWidget);
          await t.enterText(
            find.byKey(const Key('command-text')),
            'Chờ khách xác nhận',
          );
        }
        await tap(t, 'confirm-command');
      }
      await tap(t, 'wo-log');
      await t.enterText(find.byKey(const Key('command-text')), 'Đã kiểm tra');
      await tap(t, 'confirm-command');
      expect(server.current['status'], 'IN_PROGRESS');
      expect(server.logs.single['note'], 'Đã kiểm tra');
      expect(server.writes, 6);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'pending confirmation disables repeat and blocks leaving while sending',
    (t) async {
      await open(t);
      final gate = Completer<void>();
      server.beforeWrite = (_) => gate.future;
      await tap(t, 'wo-accept');
      await t.tap(find.byKey(const Key('confirm-command')));
      await t.pump();
      expect(
        t
            .widget<FilledButton>(find.byKey(const Key('confirm-command')))
            .onPressed,
        isNull,
      );
      await t.tap(find.byKey(const Key('confirm-command')));
      await t.pump();
      for (var i = 0; i < 10 && server.writes == 0; i++) {
        await t.pump(const Duration(milliseconds: 1));
      }
      expect(server.writes, 1);
      gate.complete();
      await t.pumpAndSettle();
      expect(server.current['status'], 'ACCEPTED');
    },
  );
  testWidgets('note failure keeps entered text and never claims success', (
    t,
  ) async {
    await open(t, 'IN_PROGRESS');
    server.beforeWrite = (_) async {
      throw const ApiException('VALIDATION_FAILED', status: 422);
    };
    await tap(t, 'wo-log');
    await t.enterText(
      find.byKey(const Key('command-text')),
      'Nội dung giữ lại',
    );
    await tap(t, 'confirm-command');
    expect(
      t
          .widget<TextFormField>(find.byKey(const Key('command-text')))
          .controller!
          .text,
      'Nội dung giữ lại',
    );
    expect(server.logs, isEmpty);
    expect(find.textContaining('Dữ liệu chưa hợp lệ'), findsWidgets);
  });
  testWidgets(
    'report validates steps, previews and submits atomic complete once',
    (t) async {
      await open(t, 'IN_PROGRESS');
      await tap(t, 'wo-complete');
      await t.tap(find.text('3. Kết quả'));
      await t.pumpAndSettle();
      expect(find.byKey(const Key('report-problem')), findsOneWidget);
      await tap(t, 'report-next');
      expect(find.text('Vui lòng nhập nội dung bắt buộc.'), findsOneWidget);
      await t.enterText(
        find.byKey(const Key('report-problem')),
        'Chẩn đoán nội bộ',
      );
      await tap(t, 'report-next');
      await t.enterText(
        find.byKey(const Key('report-solution')),
        'Đã sửa kết nối',
      );
      await tap(t, 'report-next');
      await t.enterText(
        find.byKey(const Key('report-summary')),
        'Thiết bị đã được xử lý',
      );
      await tap(t, 'report-next');
      expect(find.text('Xem trước · Chưa gửi'), findsOneWidget);
      expect(server.writes, 0);
      await tap(t, 'report-submit');
      expect(server.writes, 1);
      expect(server.report!['rootCause'], isNull);
      expect(find.text('Báo cáo đã ghi nhận'), findsOneWidget);
      expect(find.text('Thiết bị đã được xử lý'), findsOneWidget);
      await tap(t, 'report-done');
      expect(find.byKey(const Key('wo-complete')), findsNothing);
      expect(server.current['status'], 'COMPLETED');
    },
  );
  testWidgets('report dirty exit confirmation preserves fields when staying', (
    t,
  ) async {
    await open(t, 'IN_PROGRESS');
    await tap(t, 'wo-complete');
    await t.enterText(find.byKey(const Key('report-problem')), 'Bản chưa gửi');
    await t.tap(find.byTooltip('Đóng báo cáo'));
    await t.pumpAndSettle();
    await t.tap(find.text('Tiếp tục nhập'));
    await t.pumpAndSettle();
    expect(
      t
          .widget<TextFormField>(find.byKey(const Key('report-problem')))
          .controller!
          .text,
      'Bản chưa gửi',
    );
    expect(server.writes, 0);
  });
  testWidgets(
    'report 409 keeps draft, refreshes state and disables invalid complete',
    (t) async {
      await open(t, 'IN_PROGRESS');
      await form(t);
      server.beforeWrite = (_) async {
        server.setStatus('ON_HOLD');
        throw const ApiException('INVALID_STATE_TRANSITION', status: 409);
      };
      await tap(t, 'report-submit');
      expect(find.textContaining('Công việc đã thay đổi'), findsOneWidget);
      expect(
        t
            .widget<FilledButton>(find.byKey(const Key('report-submit')))
            .onPressed,
        isNull,
      );
      expect(
        find.text(validReport['problemDescription'] as String),
        findsWidgets,
      );
      await t.scrollUntilVisible(
        find.text(validReport['customerSummary'] as String),
        150,
        scrollable: find
            .descendant(
              of: find.byType(LiveReportForm),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      expect(
        find.text(validReport['customerSummary'] as String),
        findsOneWidget,
      );
      expect(server.report, isNull);
      expect(server.writes, 1);
      server.beforeWrite = null;
      await tap(t, 'report-resume');
      await tap(t, 'confirm-command');
      expect(
        t
            .widget<FilledButton>(find.byKey(const Key('report-submit')))
            .onPressed,
        isNotNull,
      );
      await tap(t, 'report-submit');
      expect(server.report!['customerSummary'], validReport['customerSummary']);
    },
  );
  testWidgets(
    'timeout keeps draft locked and check confirms completion without POST replay',
    (t) async {
      await open(t, 'IN_PROGRESS');
      await form(t);
      server.timeoutBeforeApply = true;
      await tap(t, 'report-submit');
      expect(find.byKey(const Key('report-check')), findsOneWidget);
      expect(server.writes, 1);
      await tap(t, 'report-check');
      expect(server.writes, 1);
      server.apply('complete', validReport);
      await tap(t, 'report-check');
      expect(find.text('Báo cáo đã ghi nhận'), findsOneWidget);
      expect(server.writes, 1);
    },
  );
  testWidgets(
    'reassigned WO cannot receive a report drafted for the old assignment',
    (t) async {
      await open(t, 'IN_PROGRESS');
      await form(t);
      server.setStatus(
        'IN_PROGRESS',
        owner: 'user-a',
        assignmentId: 'new-assignment',
      );
      await t
          .widget<LiveReportForm>(find.byType(LiveReportForm))
          .workflow
          .load();
      await t.pumpAndSettle();
      expect(
        t
            .widget<FilledButton>(find.byKey(const Key('report-submit')))
            .onPressed,
        isNull,
      );
      expect(find.textContaining('Phân công đã thay đổi.'), findsOneWidget);
      expect(server.writes, 0);
    },
  );
  testWidgets(
    'action bar and report fit small screen, large font and keyboard insets',
    (t) async {
      t.view.physicalSize = const Size(720, 1280);
      t.view.devicePixelRatio = 2;
      t.platformDispatcher.textScaleFactorTestValue = 1.4;
      addTearDown(() {
        t.view.resetPhysicalSize();
        t.view.resetDevicePixelRatio();
        t.platformDispatcher.clearTextScaleFactorTestValue();
        t.view.resetViewInsets();
      });
      await open(t, 'IN_PROGRESS');
      expect(t.takeException(), isNull);
      await tap(t, 'wo-complete');
      t.view.viewInsets = const FakeViewPadding(bottom: 500);
      await t.pumpAndSettle();
      expect(
        find.byKey(const Key('report-next')).hitTestable(),
        findsOneWidget,
      );
      expect(
        t.getRect(find.byKey(const Key('report-next'))).bottom,
        lessThanOrEqualTo(390),
      );
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'system Back immediately after typing also protects the dirty report',
    (t) async {
      await open(t, 'IN_PROGRESS');
      await tap(t, 'wo-complete');
      await t.enterText(
        find.byKey(const Key('report-problem')),
        'Bản nháp chưa gửi',
      );
      await t.pump();
      await t.binding.handlePopRoute();
      await t.pumpAndSettle();
      expect(find.text('Rời báo cáo đang nhập?'), findsOneWidget);
      await t.tap(find.text('Tiếp tục nhập'));
      await t.pumpAndSettle();
      expect(
        t
            .widget<TextFormField>(find.byKey(const Key('report-problem')))
            .controller!
            .text,
        'Bản nháp chưa gửi',
      );
      expect(server.writes, 0);
    },
  );
}
