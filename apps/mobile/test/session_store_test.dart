import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/session/session_store.dart';

import 'support/session_fixture.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('pbl6/session_storage');
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async => null);
  });
  tearDown(
    () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null),
  );

  test(
    'secure store preserves one record and isolates Gateway environments',
    () async {
      final f = SessionFixture();
      addTearDown(f.dispose);
      await f.login();
      final first = SecureSessionStore(scope: 'https://one.test');
      final second = SecureSessionStore(scope: 'https://two.test');
      await first.write(f.store.value!);
      expect(
        (await first.read())!.tokens.refreshToken,
        f.store.value!.tokens.refreshToken,
      );
      expect(await second.read(), isNull);
      await second.write(f.store.value!);
      await first.clear();
      expect(await first.read(), isNull);
      expect(await second.read(), isNotNull);
    },
  );

  test('queued clear wins over earlier write', () async {
    final f = SessionFixture();
    addTearDown(f.dispose);
    await f.login();
    final store = SecureSessionStore(scope: 'https://one.test');
    await Future.wait([store.write(f.store.value!), store.clear()]);
    expect(await store.read(), isNull);
  });

  test('write waits for the native disk flush acknowledgement', () async {
    final f = SessionFixture();
    addTearDown(f.dispose);
    await f.login();
    final entered = Completer<void>(), release = Completer<void>();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async {
          entered.complete();
          await release.future;
          return null;
        });
    final store = SecureSessionStore(scope: 'https://one.test');
    var finished = false;
    final write = store.write(f.store.value!).then((_) => finished = true);
    await entered.future;
    expect(finished, false);
    release.complete();
    await write;
    expect(finished, true);
  });

  test('native disk flush failure fails the write', () async {
    final f = SessionFixture();
    addTearDown(f.dispose);
    await f.login();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          channel,
          (_) async => throw PlatformException(code: 'STORAGE_FAILED'),
        );
    final store = SecureSessionStore(scope: 'https://one.test');
    await expectLater(
      store.write(f.store.value!),
      throwsA(
        isA<ApiException>().having((e) => e.code, 'code', 'STORAGE_FAILED'),
      ),
    );
  });

  test(
    'corrupt session is deleted without disturbing unrelated settings',
    () async {
      final f = SessionFixture();
      addTearDown(f.dispose);
      await f.login();
      final store = SecureSessionStore(scope: 'https://one.test');
      await store.write(f.store.value!);
      const raw = FlutterSecureStorage(
        aOptions: AndroidOptions(
          resetOnError: false,
          storageNamespace: 'pbl6_session_v1',
        ),
      );
      final key = (await raw.readAll()).keys.single;
      await raw.write(key: key, value: '{not valid json');
      await raw.write(key: 'unrelated.setting', value: 'keep');
      expect(await store.read(), isNull);
      expect(await raw.read(key: key), isNull);
      expect(await raw.read(key: 'unrelated.setting'), 'keep');
    },
  );
}
