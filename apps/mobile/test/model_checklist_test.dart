import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/session/session_models.dart';
import 'package:pbl6_technician/features/workspace/checklist_panel.dart';
import 'package:pbl6_technician/features/workspace/workspace_repository.dart';

const user = SessionUser(
  id: 'tech',
  tenantId: 'tenant',
  email: 'tech@test.local',
  fullName: 'Tech',
);
Json data({bool editable = true, int version = 0}) => {
  'version': version,
  'canEdit': editable,
  'items': [
    {
      'id': 'filter',
      'title': 'Filter',
      'action': 'INSPECT',
      'instructions': 'Inspect filter',
      'required': true,
      'allowNotApplicable': true,
    },
  ],
  'results': <Json>[],
};
Widget app(WorkspaceRepository repo) => MaterialApp(
  home: Scaffold(
    body: SingleChildScrollView(
      child: ChecklistPanel(repo: repo, orderId: 'order'),
    ),
  ),
);
void main() {
  testWidgets(
    'conflict preserves edits and never displays success; reload confirms discard',
    (tester) async {
      var posts = 0;
      Json? sent;
      final repo = WorkspaceRepository(
        (_) async => data(),
        user,
        write: (path, body) async {
          posts++;
          sent = body;
          throw const ApiException('CHECKLIST_VERSION_CONFLICT', status: 409);
        },
      );
      await tester.pumpWidget(app(repo));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), 'Observed dirt');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('checklist-save')));
      await tester.tap(find.byKey(const Key('checklist-save')));
      await tester.pumpAndSettle();
      expect(posts, 1);
      expect(sent?['expectedVersion'], 0);
      expect(find.byKey(const Key('checklist-error')), findsOneWidget);
      expect(find.text('Observed dirt'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('checklist-reload')));
      await tester.tap(find.byKey(const Key('checklist-reload')));
      await tester.pumpAndSettle();
      expect(
        find.text('Thay đổi chưa lưu sẽ được thay bằng kết quả trên máy chủ.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Giữ thay đổi'));
      await tester.pumpAndSettle();
      expect(find.text('Observed dirt'), findsOneWidget);
      expect(posts, 1);
    },
  );
  testWidgets('server edit permission disables controls and hides save', (
    tester,
  ) async {
    final repo = WorkspaceRepository((_) async => data(editable: false), user);
    await tester.pumpWidget(app(repo));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('checklist-save')), findsNothing);
    expect(
      tester.widget<TextFormField>(find.byType(TextFormField)).enabled,
      false,
    );
  });
}
