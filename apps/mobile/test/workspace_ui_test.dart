import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/ui/attachment_screens.dart';
import 'package:pbl6_technician/ui/equipment_screens.dart';
import 'package:pbl6_technician/ui/job_detail_screen.dart';
import 'package:pbl6_technician/ui/preview_data.dart';
import 'package:pbl6_technician/ui/report_screen.dart';
import 'package:pbl6_technician/ui/technician_workspace.dart';
import 'package:pbl6_technician/ui/theme.dart';

void main() {
  Future<void> open(WidgetTester tester) async {
    await tester.pumpWidget(const TechnicianPreviewApp());
    await tester.pumpAndSettle();
  }

  testWidgets(
    'preview opens offline and all five navigation destinations work',
    (tester) async {
      await open(tester);
      expect(find.text('Xin chào, Khương'), findsOneWidget);
      for (final (key, text) in [
        ('nav-jobs', 'Từng công việc. Từng bước vững vàng.'),
        ('nav-schedule', 'Thời gian bắt đầu dự kiến của công việc.'),
        ('nav-equipment', 'Hiểu thiết bị. Chủ động xử lý.'),
        ('nav-profile', 'Một hồ sơ rõ ràng. Một ngày chủ động.'),
      ]) {
        await tester.tap(find.byKey(Key(key)));
        await tester.pumpAndSettle();
        expect(find.text(text), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
      await tester.tap(find.byKey(const Key('nav-home')));
      await tester.pumpAndSettle();
      expect(find.text('Xin chào, Khương'), findsOneWidget);
    },
  );

  testWidgets(
    'job list supports local search, history and read-only report route',
    (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const Key('nav-jobs')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextField).hitTestable(),
        'không tồn tại',
      );
      await tester.pumpAndSettle();
      expect(find.text('Chưa có công việc phù hợp'), findsOneWidget);
      await tester.enterText(find.byType(TextField).hitTestable(), '');
      await tester.tap(find.text('Lịch sử'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hiệu chỉnh chất lượng hình ảnh'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xem báo cáo đã nộp'));
      await tester.pumpAndSettle();
      expect(find.text('Báo cáo kỹ thuật'), findsOneWidget);
      expect(find.text('Kết quả công việc'), findsOneWidget);
      expect(find.text('Sửa báo cáo'), findsNothing);
    },
  );

  testWidgets(
    'preview workflow action does not change fixture state or claim persistence',
    (tester) async {
      final job = PreviewData.jobs[1];
      await tester.pumpWidget(
        MaterialApp(
          theme: technicianTheme(),
          home: JobDetailScreen(job: job),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Nhận việc'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Đây là bản xem trước giao diện. Thao tác chưa gửi hoặc thay đổi dữ liệu.',
        ),
        findsOneWidget,
      );
      expect(job.stage, JobStage.assigned);
    },
  );

  testWidgets(
    'report walks through validation and preview without submitting',
    (tester) async {
      final job = PreviewData.jobs.first;
      await tester.pumpWidget(
        MaterialApp(
          theme: technicianTheme(),
          home: JobDetailScreen(job: job),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('open-report')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('report-next')));
      await tester.pumpAndSettle();
      expect(find.text('Vui lòng nhập nội dung.'), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('problem-description')),
        'Lỗi E12 trên thiết bị',
      );
      await tester.tap(find.byKey(const Key('report-next')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('solution')),
        'Kiểm tra và hiệu chỉnh kết nối',
      );
      await tester.tap(find.byKey(const Key('report-next')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('customer-summary')));
      await tester.enterText(
        find.byKey(const Key('customer-summary')),
        'Thiết bị đã được kiểm tra.',
      );
      await tester.tap(find.byKey(const Key('report-next')));
      await tester.pumpAndSettle();
      expect(find.text('Bản xem trước · Chưa gửi dữ liệu'), findsOneWidget);
      await tester.tap(find.text('Gửi báo cáo và hoàn thành'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Đây là bản xem trước giao diện. Thao tác chưa gửi hoặc thay đổi dữ liệu.',
        ),
        findsOneWidget,
      );
      expect(job.stage, JobStage.inProgress);
    },
  );

  testWidgets('leaving a dirty report asks for confirmation', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: technicianTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => ReportFormScreen(job: PreviewData.jobs.first),
                ),
              ),
              child: const Text('Mở form'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Mở form'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('problem-description')),
      'Nội dung đang nhập',
    );
    await tester.tap(find.byTooltip('Quay lại').first);
    await tester.pumpAndSettle();
    expect(find.text('Rời báo cáo đang nhập?'), findsOneWidget);
    await tester.tap(find.text('Tiếp tục nhập'));
    await tester.pumpAndSettle();
    expect(find.text('Nội dung đang nhập'), findsOneWidget);
  });

  testWidgets(
    'schedule unscheduled selection persists when changing root tabs',
    (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const Key('nav-schedule')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Chưa xếp lịch'));
      await tester.pumpAndSettle();
      expect(find.text('Cần xếp lịch'), findsOneWidget);
      expect(find.text('Kiểm tra nhiệt độ bảo quản'), findsOneWidget);
      await tester.tap(find.byKey(const Key('nav-equipment')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('nav-schedule')));
      await tester.pumpAndSettle();
      expect(find.text('Cần xếp lịch'), findsOneWidget);
    },
  );

  testWidgets(
    'equipment warranty and history are reachable without admin mutations',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: technicianTheme(),
          home: EquipmentDetailScreen(equipment: PreviewData.equipment.first),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Bảo hành'));
      await tester.tap(find.text('Bảo hành'));
      await tester.pumpAndSettle();
      expect(find.text('Đang trong thời hạn bảo hành'), findsOneWidget);
      await tester.tap(find.text('Lịch sử'));
      await tester.pumpAndSettle();
      expect(find.text('Hoàn thành công việc kỹ thuật'), findsOneWidget);
      expect(find.text('Chỉnh sửa thiết bị'), findsNothing);
    },
  );

  testWidgets(
    'upload view displays fixtures and retry remains a preview action',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: technicianTheme(),
          home: UploadPreviewScreen(job: PreviewData.jobs.first),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byTooltip('Thử tải lại'), 150);
      await tester.tap(find.byTooltip('Thử tải lại'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Đây là bản xem trước giao diện. Thao tác chưa gửi hoặc thay đổi dữ liệu.',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets('all root tabs fit a narrow phone with larger text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.4;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    await open(tester);
    for (final key in [
      'nav-home',
      'nav-jobs',
      'nav-schedule',
      'nav-equipment',
      'nav-profile',
    ]) {
      await tester.tap(find.byKey(Key(key)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: key);
    }
  });

  testWidgets('detail and supporting views fit a narrow phone', (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    final screens = <Widget>[
      ...PreviewData.jobs.map((j) => JobDetailScreen(job: j)),
      ReportFormScreen(job: PreviewData.jobs.first),
      ReportReadScreen(job: PreviewData.jobs[5]),
      EquipmentDetailScreen(equipment: PreviewData.equipment.first),
      UploadPreviewScreen(job: PreviewData.jobs.first),
      const QrPreviewScreen(),
    ];
    for (var i = 0; i < screens.length; i++) {
      await tester.pumpWidget(
        MaterialApp(
          key: ValueKey(i),
          theme: technicianTheme(),
          home: screens[i],
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: 'screen $i');
    }
  });
}
