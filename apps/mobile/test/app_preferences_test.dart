import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/features/preferences/app_preferences.dart';
import 'package:pbl6_technician/features/preferences/preferences_screen.dart';
import 'package:pbl6_technician/features/session/session_app.dart';

import 'support/session_fixture.dart';
import 'support/workspace_fixture.dart' as api;

class FaultyPreferencesStore extends MemoryPreferencesStore {
  bool failRead = false, failWrite = false;
  Completer<void>? gate;
  int writes = 0;
  @override
  Future<String?> read() async {
    if (failRead) throw StateError('private upstream detail');
    return super.read();
  }

  @override
  Future<void> write(String value) async {
    writes++;
    await gate?.future;
    if (failWrite) throw StateError('private upstream detail');
    await super.write(value);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'appearance persists across restart with no session or account data',
    () async {
      final store = MemoryPreferencesStore();
      final settings = AppPreferences(store);
      addTearDown(settings.dispose);
      await settings.load();
      expect(settings.themeMode, ThemeMode.system);
      await settings.setTheme(ThemeMode.dark);
      expect(jsonDecode(store.value!), {'version': 1, 'theme': 'dark'});
      final restored = AppPreferences(store);
      addTearDown(restored.dispose);
      await restored.load();
      expect(restored.themeMode, ThemeMode.dark);
    },
  );
  test('corrupt or unavailable preferences do not overwrite stored data; write failure never claims saved', () async {
    final store = FaultyPreferencesStore()..value = 'broken-json';
    final prefs = AppPreferences(store);
    addTearDown(prefs.dispose);
    await prefs.load();
    expect(prefs.themeMode, ThemeMode.system);
    expect(prefs.error, isNotNull);
    expect(store.writes, 0);
    await prefs.setTheme(ThemeMode.dark);
    expect(prefs.themeMode, ThemeMode.dark);
    store.failWrite = true;
    await prefs.setTheme(ThemeMode.light);
    expect(prefs.themeMode, ThemeMode.dark);
    expect(prefs.error, isNot(contains('private')));
    store.failRead = true;
    await prefs.load();
    expect(prefs.themeMode, ThemeMode.dark);
    expect(prefs.error, isNotNull);
    store.failRead = false;
    store.failWrite = false;
    await prefs.setTheme(ThemeMode.system);
    expect(prefs.error, isNull);
  });
  test('a pending durable preference write cannot be overtaken by another selection', () async {
    final store = FaultyPreferencesStore()..gate = Completer<void>();
    final prefs = AppPreferences(store);
    addTearDown(prefs.dispose);
    final pending = prefs.setTheme(ThemeMode.dark);
    expect(prefs.busy, isTrue);
    await prefs.setTheme(ThemeMode.light);
    expect(store.writes, 1);
    expect(prefs.themeMode, ThemeMode.system);
    store.gate!.complete();
    await pending;
    expect(prefs.themeMode, ThemeMode.dark);
    expect(prefs.busy, isFalse);
  });
  testWidgets(
    'system brightness applies to live login, explicit light overrides it',
    (t) async {
      final f = SessionFixture(),
          prefs = AppPreferences(MemoryPreferencesStore());
      addTearDown(f.dispose);
      addTearDown(prefs.dispose);
      t.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
      addTearDown(t.platformDispatcher.clearPlatformBrightnessTestValue);
      await t.pumpWidget(
        TechnicianApp(session: f.controller, preferences: prefs),
      );
      await t.pumpAndSettle();
      expect(
        Theme.of(t.element(find.byKey(const Key('login')))).brightness,
        Brightness.dark,
      );
      await prefs.setTheme(ThemeMode.light);
      await t.pumpAndSettle();
      expect(
        Theme.of(t.element(find.byKey(const Key('login')))).brightness,
        Brightness.light,
      );
    },
  );
  testWidgets(
    'changing appearance preserves private navigation and an unsent report',
    (t) async {
      final f = SessionFixture(),
          prefs = AppPreferences(MemoryPreferencesStore());
      addTearDown(f.dispose);
      addTearDown(prefs.dispose);
      f.handler = (r) async => api.workspaceResponse(r, f);
      await f.login();
      await t.pumpWidget(
        TechnicianApp(session: f.controller, preferences: prefs),
      );
      await t.pumpAndSettle();
      await t.tap(find.byKey(const Key('nav-jobs')));
      await t.pumpAndSettle();
      await t.ensureVisible(find.text('Công việc từ API'));
      await t.tap(find.text('Công việc từ API'));
      await t.pumpAndSettle();
      await t.ensureVisible(find.byKey(const Key('wo-complete')));
      await t.tap(find.byKey(const Key('wo-complete')));
      await t.pumpAndSettle();
      await t.enterText(
        find.byKey(const Key('report-problem')),
        'Nháp cần giữ',
      );
      await prefs.setTheme(ThemeMode.dark);
      await t.pumpAndSettle();
      expect(
        t
            .widget<TextFormField>(find.byKey(const Key('report-problem')))
            .controller!
            .text,
        'Nháp cần giữ',
      );
      expect(find.byKey(const Key('login')), findsNothing);
      expect(f.count('/complete'), 0);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'version is read from the installed binary; unavailable read retries without a fake value',
    (t) async {
      const channel = MethodChannel('pbl6/app_info');
      var fail = true;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            expect(call.method, 'version');
            if (fail) throw PlatformException(code: 'UNAVAILABLE');
            return {'version': '7.4.2', 'build': '82'};
          });
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null),
      );
      await t.pumpWidget(const MaterialApp(home: AppInformationScreen()));
      await t.pumpAndSettle();
      expect(find.text('7.4.2'), findsNothing);
      fail = false;
      await t.tap(find.text('Thử lại'));
      await t.pumpAndSettle();
      expect(find.text('7.4.2'), findsOneWidget);
      expect(find.text('82'), findsOneWidget);
    },
  );
  testWidgets(
    'profile remains read-only, help explains recovery and cancelling logout keeps session',
    (t) async {
      final f = SessionFixture();
      addTearDown(f.dispose);
      f.handler = (r) async => api.workspaceResponse(r, f);
      await f.login();
      await t.pumpWidget(TechnicianApp(session: f.controller));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const Key('nav-profile')));
      await t.pumpAndSettle();
      Future<void> tap(Finder finder) async {
        await t.scrollUntilVisible(
          finder,
          250,
          scrollable: find.byType(Scrollable).hitTestable().first,
        );
        await t.tap(finder);
        await t.pumpAndSettle();
      }

      await tap(find.byKey(const Key('open-help')));
      expect(find.text('Nhận và thực hiện công việc'), findsOneWidget);
      await t.tap(find.byType(BackButton).hitTestable());
      await t.pumpAndSettle();
      await tap(find.byKey(const Key('logout')));
      expect(find.textContaining('Nháp báo cáo, checklist'), findsOneWidget);
      await t.tap(find.text('Ở lại'));
      await t.pumpAndSettle();
      expect(f.count('/logout'), 0);
      expect(find.byKey(const Key('login')), findsNothing);
      expect(
        f.requests
            .where((r) => !r.url.path.contains('/identity/'))
            .every((r) => r.method == 'GET'),
        isTrue,
      );
    },
  );
  testWidgets(
    'Identity revalidation updates the displayed name without losing the workspace',
    (t) async {
      final f = SessionFixture();
      addTearDown(f.dispose);
      f.handler = (r) async => api.workspaceResponse(r, f);
      await f.login();
      await t.pumpWidget(TechnicianApp(session: f.controller));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const Key('nav-profile')));
      await t.pumpAndSettle();
      f.profile = {
        ...f.profile,
        'fullName': 'Tên đã cập nhật',
        'email': 'updated@test.local',
      };
      await f.controller.revalidate();
      await t.pumpAndSettle();
      expect(find.text('Tên đã cập nhật'), findsOneWidget);
      expect(find.text('updated@test.local'), findsOneWidget);
      expect(find.text('Demo Technician'), findsNothing);
      expect(find.byKey(const Key('nav-profile')), findsOneWidget);
    },
  );
  testWidgets(
    'dark live tabs and preferences remain usable on narrow screens with large text',
    (t) async {
      t.view.physicalSize = const Size(720, 1280);
      t.view.devicePixelRatio = 2;
      t.platformDispatcher.textScaleFactorTestValue = 1.5;
      addTearDown(() {
        t.view.resetPhysicalSize();
        t.view.resetDevicePixelRatio();
        t.platformDispatcher.clearTextScaleFactorTestValue();
      });
      final f = SessionFixture(),
          prefs = AppPreferences(MemoryPreferencesStore());
      addTearDown(f.dispose);
      addTearDown(prefs.dispose);
      await prefs.setTheme(ThemeMode.dark);
      f.handler = (r) async => api.workspaceResponse(r, f);
      await f.login();
      await t.pumpWidget(
        TechnicianApp(session: f.controller, preferences: prefs),
      );
      await t.pumpAndSettle();
      for (final tab in ['home', 'jobs', 'schedule', 'equipment', 'profile']) {
        await t.tap(find.byKey(Key('nav-$tab')));
        await t.pumpAndSettle();
        expect(t.takeException(), isNull, reason: tab);
      }
      await t.scrollUntilVisible(
        find.byKey(const Key('open-appearance')),
        250,
        scrollable: find.byType(Scrollable).hitTestable().first,
      );
      await t.tap(find.byKey(const Key('open-appearance')));
      await t.pumpAndSettle();
      expect(find.byKey(const Key('theme-dark')), findsOneWidget);
      expect(t.takeException(), isNull);
      final colors = Theme.of(t.element(find.byType(PreferencesScreen)))
          .colorScheme;
      expect(
        (colors.onSurface.computeLuminance() + .05) /
            (colors.surfaceContainerLow.computeLuminance() + .05),
        greaterThanOrEqualTo(4.5),
      );
    },
  );
}
