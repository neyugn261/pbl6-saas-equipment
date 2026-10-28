import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:pbl6_technician/features/session/session_app.dart';

import 'support/session_fixture.dart';

void main() {
  late SessionFixture f;
  setUp(() => f = SessionFixture());
  tearDown(() => f.dispose());
  Future<void> open(WidgetTester tester) async {
    await tester.pumpWidget(TechnicianApp(session: f.controller));
    await tester.pumpAndSettle();
  }

  Future<void> fill(WidgetTester tester) async {
    await tester.enterText(
      find.byKey(const Key('email')),
      'technician@demo.local',
    );
    await tester.enterText(
      find.byKey(const Key('password')),
      'test-only-password',
    );
    await tester.ensureVisible(find.byKey(const Key('login')));
  }

  testWidgets('validates form locally, password is obscured', (tester) async {
    await open(tester);
    expect(
      tester
          .widget<TextFormField>(find.byKey(const Key('password')))
          .controller!
          .text,
      isEmpty,
    );
    expect(
      tester
          .widget<TextField>(
            find.descendant(
              of: find.byKey(const Key('password')),
              matching: find.byType(TextField),
            ),
          )
          .obscureText,
      true,
    );
    await tester.tap(find.byKey(const Key('login')));
    await tester.pumpAndSettle();
    expect(find.text('Nhập email hợp lệ.'), findsOneWidget);
    expect(f.count('/login'), 0);
  });

  testWidgets('submits only once and shows profile then logs out', (
    tester,
  ) async {
    await open(tester);
    await fill(tester);
    final gate = Completer<http.Response>();
    f.handler = (r) async =>
        r.url.path.endsWith('/login') ? gate.future : f.standard(r);
    await tester.tap(find.byKey(const Key('login')));
    await tester.pump();
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('login'))).onPressed,
      isNull,
    );
    await tester.tap(find.byKey(const Key('login')));
    await tester.pump();
    expect(f.count('/login'), 1);
    gate.complete(jsonResponse({...f.pair(), 'user': f.profile}));
    await tester.pumpAndSettle();
    expect(find.text('Xin chào, Demo Technician'), findsOneWidget);
    await tester.tap(find.byKey(const Key('logout')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('login')), findsOneWidget);
    expect(find.text('Xin chào, Demo Technician'), findsNothing);
  });

  testWidgets('wrong password shows safe error and keeps login form', (
    tester,
  ) async {
    await open(tester);
    await fill(tester);
    f.handler = (r) async => jsonResponse({
      'code': 'INVALID_CREDENTIALS',
      'message': 'sensitive backend detail',
    }, 401);
    await tester.tap(find.byKey(const Key('login')));
    await tester.pumpAndSettle();
    expect(find.textContaining('chưa đúng'), findsOneWidget);
    expect(find.textContaining('sensitive'), findsNothing);
    expect(find.byKey(const Key('login')), findsOneWidget);
  });

  testWidgets('session restore outage offers retry, does not claim logout', (
    tester,
  ) async {
    await f.login();
    f.handler = (r) async => jsonResponse({'code': 'UNAVAILABLE'}, 503);
    await open(tester);
    expect(find.text('Thử lại'), findsOneWidget);
    expect(find.text('Xóa phiên trên máy'), findsOneWidget);
    expect(f.store.value, isNotNull);
    f.handler = null;
    await tester.tap(find.text('Thử lại'));
    await tester.pumpAndSettle();
    expect(find.text('Xin chào, Demo Technician'), findsOneWidget);
  });

  testWidgets('login layout supports a small screen and large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(720, 1280);
    tester.view.devicePixelRatio = 2;
    tester.platformDispatcher.textScaleFactorTestValue = 1.8;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    await open(tester);
    await fill(tester);
    expect(tester.takeException(), isNull);
  });
}
