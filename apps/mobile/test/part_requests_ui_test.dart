import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/features/workspace/job_reads.dart';
import 'package:pbl6_technician/ui/theme.dart';

import 'support/workflow_server.dart';
import 'support/workspace_fixture.dart' show orderId;

void main() {
  late WorkflowServer server;

  Future<void> openJobDetail(WidgetTester t, [String state = 'IN_PROGRESS']) async {
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
    // Switch to Parts tab (index 4)
    await t.tap(find.text('Phụ tùng'));
    await t.pumpAndSettle();
  }

  Future<void> tap(WidgetTester t, Finder finder) async {
    t.testTextInput.hide();
    await t.pumpAndSettle();
    await t.ensureVisible(finder);
    await t.pumpAndSettle();
    await t.tap(finder);
    await t.pumpAndSettle();
  }

  testWidgets(
    'can search catalog parts, select lines with quantities, and submit part request',
    (t) async {
      await openJobDetail(t, 'IN_PROGRESS');

      // Verify "Xin cấp phụ tùng" button is available
      final reqBtn = find.byKey(const Key('request-parts-button'));
      expect(reqBtn, findsOneWidget);
      await tap(t, reqBtn);

      // Verify modal sheet opens
      expect(find.text('Xin cấp phụ tùng'), findsWidgets);
      expect(find.text('Lọc gió động cơ'), findsOneWidget);
      expect(find.text('Dầu bôi trơn cao cấp'), findsOneWidget);

      // Search catalog
      await t.enterText(find.byKey(const Key('part-catalog-search')), 'Lọc');
      await t.pump(const Duration(milliseconds: 350));
      await t.pumpAndSettle();

      // Add "Lọc gió động cơ"
      await tap(t, find.byKey(const Key('add-part-part-1')));
      expect(find.text('Linh kiện đã chọn (1)'), findsOneWidget);

      // Enter reason
      await t.enterText(
        find.byKey(const Key('part-request-reason')),
        'Cần thay lọc gió mới do bám bụi nặng gây nóng máy.',
      );
      await t.pumpAndSettle();

      // Submit
      await tap(t, find.byKey(const Key('submit-part-request')));

      // Snackbar should show
      expect(find.textContaining('thành công'), findsOneWidget);

      // Switch to "Phiếu xin cấp" tab
      await tap(t, find.text('Phiếu xin cấp'));
      expect(find.text('1 phiếu xin cấp phụ tùng'), findsOneWidget);
      expect(find.text('PR-1001'), findsOneWidget);
      expect(find.text('Đang mở'), findsOneWidget);
      expect(find.text('Chưa xuất kho'), findsOneWidget);
      expect(find.textContaining('Cần thay lọc gió mới'), findsOneWidget);
      expect(find.text('Lọc gió động cơ'), findsOneWidget);
      expect(find.text('Đã cấp: 0 / 1 Cái'), findsOneWidget);
    },
  );

  testWidgets(
    'can cancel an open part request with a reasoned explanation',
    (t) async {
      await openJobDetail(t, 'IN_PROGRESS');

      // First create a request
      await tap(t, find.byKey(const Key('request-parts-button')));
      await tap(t, find.byKey(const Key('add-part-part-1')));
      await t.enterText(
        find.byKey(const Key('part-request-reason')),
        'Yêu cầu cấp thêm lọc gió',
      );
      await tap(t, find.byKey(const Key('submit-part-request')));

      // Switch to "Phiếu xin cấp" tab
      await tap(t, find.text('Phiếu xin cấp'));
      expect(find.text('PR-1001'), findsOneWidget);
      expect(find.text('Đang mở'), findsOneWidget);

      // Cancel button
      final cancelBtn = find.byKey(const Key('cancel-part-request-pr-1'));
      expect(cancelBtn, findsOneWidget);
      await tap(t, cancelBtn);

      // Verify cancel dialog
      expect(find.text('Hủy phiếu xin cấp'), findsOneWidget);
      expect(find.text('Bạn có chắc muốn hủy phiếu PR-1001?'), findsOneWidget);

      // Enter cancellation reason
      await t.enterText(
        find.byKey(const Key('cancel-reason-input')),
        'Đã tận dụng linh kiện cũ còn dùng tốt, không cần cấp mới.',
      );
      await tap(t, find.byKey(const Key('confirm-cancel-request')));

      // Request status should now be CANCELLED
      expect(find.text('Đã hủy'), findsOneWidget);
      expect(find.byKey(const Key('cancel-part-request-pr-1')), findsNothing);
    },
  );

  testWidgets(
    'can propose a return request for unreconciled issued parts',
    (t) async {
      await openJobDetail(t, 'IN_PROGRESS');

      // Expand first issued part (Dầu bảo trì 1)
      await tap(t, find.text('Dầu bảo trì 1'));

      // Check for "Đề nghị trả kho" button
      final returnBtn = find.text('Đề nghị trả kho');
      expect(returnBtn, findsOneWidget);
      await tap(t, returnBtn);

      // Verify return dialog
      expect(find.text('Đề nghị trả kho'), findsWidgets);
      expect(find.textContaining('Số lượng chưa đối soát có thể trả: 3.75'), findsOneWidget);

      // Try entering excess quantity
      await t.enterText(find.byKey(const Key('return-quantity-input')), '5.00');
      await t.enterText(
        find.byKey(const Key('return-reason-input')),
        'Dư phụ tùng sau sửa chữa',
      );
      await tap(t, find.byKey(const Key('submit-return-request')));

      // Validation error shown
      expect(find.textContaining('không được vượt quá số chưa đối soát'), findsOneWidget);

      // Correct quantity
      await t.enterText(find.byKey(const Key('return-quantity-input')), '2.00');
      await tap(t, find.byKey(const Key('submit-return-request')));

      // Switch to "Phiếu trả kho" tab
      await tap(t, find.text('Phiếu trả kho'));

      expect(find.text('1 đề nghị trả kho'), findsOneWidget);
      expect(find.text('RR-1001'), findsOneWidget);
      expect(find.text('Đang mở'), findsOneWidget);
      expect(find.text('Chưa nhận kho'), findsOneWidget);
      expect(find.textContaining('Số lượng đề nghị: 2.00'), findsOneWidget);
      expect(find.textContaining('Dư phụ tùng sau sửa chữa'), findsOneWidget);
    },
  );

  testWidgets(
    'can cancel an open return request with a reasoned explanation',
    (t) async {
      await openJobDetail(t, 'IN_PROGRESS');

      // Expand part and create return request
      await tap(t, find.text('Dầu bảo trì 1'));
      await tap(t, find.text('Đề nghị trả kho'));
      await t.enterText(find.byKey(const Key('return-quantity-input')), '1.00');
      await t.enterText(
        find.byKey(const Key('return-reason-input')),
        'Trả lại dầu bôi trơn thừa',
      );
      await tap(t, find.byKey(const Key('submit-return-request')));

      // Switch to return requests tab
      await tap(t, find.text('Phiếu trả kho'));
      expect(find.text('RR-1001'), findsOneWidget);
      final cancelReturnBtn = find.byKey(const Key('cancel-return-request-rr-1'));
      expect(cancelReturnBtn, findsOneWidget);
      await tap(t, cancelReturnBtn);

      // Cancel dialog
      expect(find.text('Hủy đề nghị trả kho'), findsOneWidget);
      expect(find.text('Bạn có chắc muốn hủy đề nghị RR-1001?'), findsOneWidget);
      await t.enterText(
        find.byKey(const Key('cancel-return-reason-input')),
        'Cần dùng tiếp dầu này cho máy khác, không trả kho nữa.',
      );
      await tap(t, find.byKey(const Key('confirm-cancel-return')));

      // Proposal status is now CANCELLED
      expect(find.text('Đã hủy'), findsOneWidget);
      expect(find.byKey(const Key('cancel-return-request-rr-1')), findsNothing);
    },
  );

  testWidgets(
    'terminal work order disables "Xin cấp phụ tùng" button',
    (t) async {
      await openJobDetail(t, 'COMPLETED');

      // "Xin cấp phụ tùng" must NOT be visible when WO is terminal/COMPLETED
      expect(find.byKey(const Key('request-parts-button')), findsNothing);
      expect(find.text('Xin cấp phụ tùng'), findsNothing);

      // Existing issued parts can still be viewed
      expect(find.text('Dầu bảo trì 1'), findsOneWidget);
    },
  );
}
