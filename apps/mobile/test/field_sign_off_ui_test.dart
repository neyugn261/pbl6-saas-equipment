import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/features/workspace/job_reads.dart';
import 'package:pbl6_technician/features/workspace/report_form.dart';
import 'package:pbl6_technician/features/workspace/signature_pad.dart';
import 'package:pbl6_technician/ui/theme.dart';

import 'support/workflow_server.dart';
import 'support/workspace_fixture.dart' show orderId;

void main() {
  group('SignatureController & SignaturePad', () {
    test('controller tracks strokes, isNotEmpty and clears', () {
      final controller = SignatureController();
      expect(controller.isEmpty, isTrue);
      expect(controller.isNotEmpty, isFalse);

      controller.startStroke(const Offset(10, 10));
      controller.addPoint(const Offset(20, 20));
      controller.endStroke();

      expect(controller.isEmpty, isFalse);
      expect(controller.isNotEmpty, isTrue);
      expect(controller.strokes.length, 1);
      expect(controller.strokes.first.length, 2);

      controller.clear();
      expect(controller.isEmpty, isTrue);
      expect(controller.strokes, isEmpty);
    });

    test('toPngBytes returns null when empty, and valid PNG header when signed', () async {
      final controller = SignatureController();
      final emptyPng = await controller.toPngBytes();
      expect(emptyPng, isNull);

      controller.startStroke(const Offset(5, 5));
      controller.addPoint(const Offset(50, 50));
      controller.endStroke();

      final pngBytes = await controller.toPngBytes();
      expect(pngBytes, isNotNull);
      expect(pngBytes!.length, greaterThan(10));
      // PNG header magic: 137 80 78 71 13 10 26 10
      expect(pngBytes.sublist(0, 8), Uint8List.fromList([137, 80, 78, 71, 13, 10, 26, 10]));
    });

    testWidgets('SignaturePad supports touch drawing and clear button', (t) async {
      final controller = SignatureController();
      addTearDown(controller.dispose);

      await t.pumpWidget(
        MaterialApp(
          theme: technicianTheme(),
          home: Scaffold(
            body: Padding(
              padding: const EdgeInsets.all(16),
              child: SignaturePad(controller: controller),
            ),
          ),
        ),
      );
      await t.pumpAndSettle();

      expect(find.text('Khách hàng ký tên vào khung này'), findsOneWidget);
      expect(find.text('Chưa có chữ ký'), findsOneWidget);
      expect(find.byKey(const Key('signature-clear-btn')), findsNothing);

      // Perform a touch drag gesture
      await t.drag(
        find.byKey(const Key('signature-pad-gesture')),
        const Offset(100, 30),
      );
      await t.pumpAndSettle();

      expect(controller.isNotEmpty, isTrue);
      expect(find.text('Đã ký nhận'), findsOneWidget);
      expect(find.byKey(const Key('signature-clear-btn')), findsOneWidget);

      // Tap clear button
      await t.tap(find.byKey(const Key('signature-clear-btn')));
      await t.pumpAndSettle();

      expect(controller.isEmpty, isTrue);
      expect(find.text('Chưa có chữ ký'), findsOneWidget);
      expect(find.byKey(const Key('signature-clear-btn')), findsNothing);
    });
  });

  group('Field Sign-Off in LiveReportForm', () {
    late WorkflowServer server;

    Future<void> open(WidgetTester t, [String state = 'IN_PROGRESS']) async {
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

    Future<void> scrollDown(WidgetTester t, Finder finder) async {
      await t.scrollUntilVisible(
        finder,
        150,
        scrollable: find.descendant(of: find.byType(LiveReportForm), matching: find.byType(Scrollable)).first,
      );
      await t.pumpAndSettle();
    }

    Future<void> tap(WidgetTester t, String key) async {
      final finder = find.byKey(Key(key));
      await t.ensureVisible(finder);
      await t.pumpAndSettle();
      await t.tap(finder);
      await t.pumpAndSettle();
    }

    Future<void> enter(WidgetTester t, String key, String text) async {
      final finder = find.byKey(Key(key));
      await t.ensureVisible(finder);
      await t.pumpAndSettle();
      await t.enterText(finder, text);
      await t.pumpAndSettle();
    }

    Future<void> fillDiagnosticSteps(WidgetTester t) async {
      await tap(t, 'wo-complete');
      await enter(
        t,
        'report-problem',
        validReport['problemDescription'] as String,
      );
      await enter(
        t,
        'report-cause',
        validReport['rootCause'] as String,
      );
      await tap(t, 'report-next');
      await enter(
        t,
        'report-solution',
        validReport['solution'] as String,
      );
      await tap(t, 'report-next');
      await enter(
        t,
        'report-summary',
        validReport['customerSummary'] as String,
      );
    }

    testWidgets('completing with SIGNED sign-off captures signature and submits payload', (t) async {
      await open(t);
      await fillDiagnosticSteps(t);

      // Verify sign-off section is visible on step 2
      expect(find.text('Nghiệm thu tại hiện trường'), findsOneWidget);
      expect(find.byKey(const Key('signoff-chip-signed')), findsOneWidget);

      // Select "Khách ký tại chỗ"
      await tap(t, 'signoff-chip-signed');
      expect(find.byKey(const Key('report-signer-name')), findsOneWidget);
      expect(find.byKey(const Key('report-signer-title')), findsOneWidget);
      expect(find.byKey(const Key('report-signer-phone')), findsOneWidget);
      expect(find.byType(SignaturePad), findsOneWidget);

      // Trying to advance without entering signer name fails validation
      await tap(t, 'report-next');
      expect(find.text('Vui lòng nhập Họ tên người ký *.'), findsOneWidget);

      // Enter signer information
      await enter(t, 'report-signer-name', 'Nguyễn Văn Đại Diện');
      await enter(t, 'report-signer-title', 'Quản lý vận hành');
      await enter(t, 'report-signer-phone', '0987654321');

      // Trying to advance without signing triggers signature warning
      await tap(t, 'report-next');
      expect(find.text('Vui lòng yêu cầu khách hàng ký nhận vào ô chữ ký.'), findsOneWidget);
      ScaffoldMessenger.of(t.element(find.byType(LiveReportForm))).hideCurrentSnackBar();
      await t.pumpAndSettle();

      // Sign on signature pad
      await t.ensureVisible(find.byKey(const Key('signature-pad-gesture')));
      await t.pumpAndSettle();
      await t.drag(
        find.byKey(const Key('signature-pad-gesture')),
        const Offset(120, 0),
      );
      await t.pumpAndSettle();

      // Advance to preview
      await tap(t, 'report-next');
      expect(find.text('Xem trước · Chưa gửi'), findsOneWidget);
      await scrollDown(t, find.text('Xác nhận nghiệm thu hiện trường'));
      expect(find.text('Xác nhận nghiệm thu hiện trường'), findsOneWidget);
      expect(find.text('Nguyễn Văn Đại Diện'), findsOneWidget);
      expect(find.text('Quản lý vận hành'), findsOneWidget);

      // Submit report
      await tap(t, 'report-submit');
      expect(server.writes, 1);
      expect(server.lastBody!['signOff'], isNotNull);
      final signOff = server.lastBody!['signOff'] as Map<String, dynamic>;
      expect(signOff['status'], 'SIGNED');
      expect(signOff['signerName'], 'Nguyễn Văn Đại Diện');
      expect(signOff['signerTitle'], 'Quản lý vận hành');
      expect(signOff['signerPhone'], '0987654321');

      // Verify completion view renders
      expect(find.text('Báo cáo đã ghi nhận'), findsOneWidget);
      await scrollDown(t, find.text('Nguyễn Văn Đại Diện'));
      expect(find.text('Nguyễn Văn Đại Diện'), findsWidgets);
    });

    testWidgets('completing with CUSTOMER_ABSENT requires absence notes', (t) async {
      await open(t);
      await fillDiagnosticSteps(t);

      // Select "Khách vắng mặt"
      await tap(t, 'signoff-chip-absent');
      expect(find.byKey(const Key('report-signoff-notes')), findsOneWidget);
      expect(find.textContaining('Lý do khách hàng vắng mặt *'), findsOneWidget);

      // Attempting to advance without note fails
      await tap(t, 'report-next');
      expect(find.text('Vui lòng nhập nội dung bắt buộc.'), findsOneWidget);

      // Fill absence note
      await enter(
        t,
        'report-signoff-notes',
        'Khách đi họp ngoại tỉnh, bảo vệ nhận bàn giao máy',
      );

      // Advance to preview and submit
      await tap(t, 'report-next');
      await scrollDown(t, find.text('Xác nhận nghiệm thu hiện trường'));
      expect(find.text('Xác nhận nghiệm thu hiện trường'), findsOneWidget);
      expect(find.text('Khách vắng mặt'), findsOneWidget);

      await tap(t, 'report-submit');
      expect(server.writes, 1);
      final signOff = server.lastBody!['signOff'] as Map<String, dynamic>;
      expect(signOff['status'], 'CUSTOMER_ABSENT');
      expect(signOff['notes'], 'Khách đi họp ngoại tỉnh, bảo vệ nhận bàn giao máy');
    });

    testWidgets('completing with CUSTOMER_REFUSED requires refusal notes', (t) async {
      await open(t);
      await fillDiagnosticSteps(t);

      // Select "Khách từ chối ký"
      await tap(t, 'signoff-chip-refused');
      expect(find.byKey(const Key('report-signoff-notes')), findsOneWidget);
      expect(find.textContaining('Lý do khách từ chối ký *'), findsOneWidget);

      // Attempting to advance without note fails
      await tap(t, 'report-next');
      expect(find.text('Vui lòng nhập nội dung bắt buộc.'), findsOneWidget);

      // Fill refusal note
      await enter(
        t,
        'report-signoff-notes',
        'Khách yêu cầu giám đốc kỹ thuật kiểm tra lại trước khi ký',
      );

      // Advance to preview and submit
      await tap(t, 'report-next');
      await scrollDown(t, find.text('Xác nhận nghiệm thu hiện trường'));
      expect(find.text('Xác nhận nghiệm thu hiện trường'), findsOneWidget);
      expect(find.text('Khách từ chối ký'), findsOneWidget);

      await tap(t, 'report-submit');
      expect(server.writes, 1);
      final signOff = server.lastBody!['signOff'] as Map<String, dynamic>;
      expect(signOff['status'], 'CUSTOMER_REFUSED');
      expect(signOff['notes'], 'Khách yêu cầu giám đốc kỹ thuật kiểm tra lại trước khi ký');
    });

    testWidgets('draft persistence saves and restores sign-off selections', (t) async {
      await open(t);
      await fillDiagnosticSteps(t);

      // Select SIGNED and fill name
      await tap(t, 'signoff-chip-signed');
      await enter(t, 'report-signer-name', 'Trần Thị Thu');
      await enter(t, 'report-signer-title', 'Kế toán trưởng');
      await t.pump(const Duration(milliseconds: 300));

      // Leave report with save
      await t.tap(find.byTooltip('Đóng báo cáo'));
      await t.pumpAndSettle();
      await t.tap(find.text('Rời báo cáo'));
      await t.pumpAndSettle();

      // Re-open report
      await tap(t, 'wo-complete');
      await t.tap(find.text('3. Kết quả'));
      await t.pumpAndSettle();

      // Verify sign-off data restored
      expect(find.text('Trần Thị Thu'), findsOneWidget);
      expect(find.text('Kế toán trưởng'), findsOneWidget);
    });
  });
}
