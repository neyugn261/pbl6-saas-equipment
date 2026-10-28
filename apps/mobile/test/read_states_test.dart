import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/session/session_models.dart';
import 'package:pbl6_technician/features/workspace/job_reads.dart';
import 'package:pbl6_technician/features/workspace/read_widgets.dart';
import 'package:pbl6_technician/features/workspace/workspace_repository.dart';

const user = SessionUser(
  id: 'user-a',
  tenantId: 'tenant-a',
  email: 'a@test.local',
  fullName: 'A',
);
void main() {
  for (final entry in {
    'RESTRICTED': 'không có quyền',
    'UNAVAILABLE': 'tạm thời không khả dụng',
    'NOT_FOUND': 'không còn trong phạm vi',
    'NOT_CONFIGURED': 'chưa được cấu hình',
  }.entries) {
    testWidgets('composition ${entry.key} does not pretend to be empty', (
      t,
    ) async {
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SectionView(
              section: {'status': entry.key, 'data': null},
              builder: (_) => const Text('Không có mục nào'),
            ),
          ),
        ),
      );
      expect(find.textContaining(entry.value), findsOneWidget);
      expect(find.text('Không có mục nào'), findsNothing);
    });
  }
  testWidgets(
    'malformed available section displays safe invalid-response notice',
    (t) async {
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SectionView(
              section: const {'status': 'AVAILABLE', 'data': 'bad'},
              builder: (v) => Text('${rows(v).length}'),
            ),
          ),
        ),
      );
      expect(
        find.textContaining('Phản hồi máy chủ không hợp lệ'),
        findsOneWidget,
      );
      expect(t.takeException(), isNull);
    },
  );
  testWidgets('report not yet submitted is distinct from access denied', (
    t,
  ) async {
    Future<void> render(ApiException e) async {
      final repo = WorkspaceRepository((_) async => throw e, user);
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ServiceReportRead(
              key: ValueKey(e.code),
              repo: repo,
              workOrderId: 'wo',
            ),
          ),
        ),
      );
      await t.pumpAndSettle();
    }

    await render(const ApiException('SERVICE_REPORT_NOT_FOUND', status: 404));
    expect(find.text('Công việc chưa có báo cáo dịch vụ.'), findsOneWidget);
    await render(const ApiException('FORBIDDEN', status: 403));
    expect(find.text('Công việc chưa có báo cáo dịch vụ.'), findsNothing);
    expect(find.textContaining('không có quyền'), findsOneWidget);
  });
  testWidgets(
    'partial result uses the actual backend enum; failed report read retries',
    (t) async {
      var calls = 0;
      final repo = WorkspaceRepository((_) async {
        if (calls++ == 0) throw const ApiException('NETWORK_ERROR');
        return {
          'id': 'report',
          'result': 'PARTIALLY_RESOLVED',
          'problemDescription': 'Chẩn đoán',
          'solution': 'Giải pháp',
          'customerSummary': 'Cần tiếp tục xử lý',
        };
      }, user);
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ServiceReportRead(repo: repo, workOrderId: 'wo'),
          ),
        ),
      );
      await t.pumpAndSettle();
      await t.tap(find.text('Thử lại'));
      await t.pumpAndSettle();
      expect(find.text('Xử lý một phần'), findsOneWidget);
      expect(calls, 2);
      expect(t.takeException(), isNull);
    },
  );
}
