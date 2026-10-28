import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/session/session_controller.dart';
import 'package:pbl6_technician/features/session/session_models.dart';

import 'support/session_fixture.dart';

void main() {
  late SessionFixture f;
  setUp(() => f = SessionFixture());
  tearDown(() => f.dispose());

  test(
    'login forwards chosen tenant, stores one pair and logs out with 204',
    () async {
      await f.login();
      expect(f.controller.phase, SessionPhase.authenticated);
      expect(f.controller.user!.id, 'user-a');
      final login = jsonDecode(f.requests.single.body) as Map;
      expect(login['tenantCode'], 'DEMO');
      expect(login['email'], 'technician@demo.local');
      expect(f.store.value!.refreshPending, false);
      await f.controller.logout();
      expect(f.store.value, isNull);
      expect(f.controller.user, isNull);
      expect(f.controller.phase, SessionPhase.signedOut);
      expect(f.count('/logout'), 1);
    },
  );

  test('restores saved session through me without logging in again', () async {
    await f.login();
    await f.controller.restore();
    expect(f.controller.phase, SessionPhase.authenticated);
    expect(f.count('/login'), 1);
    expect(f.count('/me'), 1);
    expect(f.requests.last.headers['authorization'], 'Bearer access-0');
  });

  test('concurrent expired-token reads share a single rotation persisted before use', () async {
    await f.login();
    f.expireAccess();
    final gate = Completer<http.Response>();
    final entered = Completer<void>();
    f.handler = (r) async {
      if (r.url.path.endsWith('/refresh')) {
        entered.complete();
        return gate.future;
      }
      if (r.url.path == '/jobs') {
        expect(f.store.value!.refreshPending, false);
        expect(f.store.value!.tokens.accessToken, 'access-1');
      }
      return f.standard(r);
    };
    final requests = List.generate(
      5,
      (_) => f.controller.authorizedRequest('GET', '/jobs'),
    );
    await entered.future;
    expect(f.store.writes.last.refreshPending, true);
    expect(f.count('/refresh'), 1);
    gate.complete(jsonResponse(f.pair(version: 1)));
    await Future.wait(requests);
    expect(f.count('/refresh'), 1);
    expect(f.count('/jobs'), 5);
    expect(f.store.value!.tokens.refreshToken, 'refresh-1-test-only');
  });

  test(
    'late 401 for old access token does not refresh the new pair again',
    () async {
      await f.login();
      final late = Completer<http.Response>();
      var oldReads = 0;
      f.handler = (r) async {
        if (r.url.path == '/jobs' &&
            r.headers['authorization'] == 'Bearer access-0') {
          oldReads++;
          if (oldReads == 2) return late.future;
          return jsonResponse({'code': 'UNAUTHORIZED'}, 401);
        }
        return f.standard(r);
      };
      final first = f.controller.authorizedRequest('GET', '/jobs');
      final second = f.controller.authorizedRequest('GET', '/jobs');
      await first;
      late.complete(jsonResponse({'code': 'UNAUTHORIZED'}, 401));
      await second;
      expect(f.count('/refresh'), 1);
    },
  );

  test('401 retried only once, then ends the session', () async {
    await f.login();
    f.handler = (r) async => r.url.path == '/jobs'
        ? jsonResponse({'code': 'UNAUTHORIZED'}, 401)
        : f.standard(r);
    await expectLater(
      f.controller.authorizedRequest('GET', '/jobs'),
      throwsA(isA<ApiException>()),
    );
    expect(f.count('/jobs'), 2);
    expect(f.count('/refresh'), 1);
    expect(f.controller.phase, SessionPhase.signedOut);
    expect(f.store.value, isNull);
  });

  test(
    '403 for a business API neither refreshes nor ends the session',
    () async {
      await f.login();
      f.handler = (r) async => jsonResponse({'code': 'FORBIDDEN'}, 403);
      await expectLater(
        f.controller.authorizedRequest('GET', '/jobs'),
        throwsA(isA<ApiException>()),
      );
      expect(f.count('/refresh'), 0);
      expect(f.controller.phase, SessionPhase.authenticated);
    },
  );

  test('mutation is sent once even when renewal follows its 401', () async {
    await f.login();
    f.handler = (r) async => r.url.path == '/complete'
        ? jsonResponse({'code': 'UNAUTHORIZED'}, 401)
        : f.standard(r);
    await expectLater(
      f.controller.authorizedRequest(
        'POST',
        '/complete',
        body: {'result': 'RESOLVED'},
      ),
      throwsA(
        isA<ApiException>().having((e) => e.code, 'code', 'CHECK_BEFORE_RETRY'),
      ),
    );
    expect(f.count('/complete'), 1);
    expect(f.count('/refresh'), 1);
  });

  test(
    'restart with durable pending marker requires login without reusing token',
    () async {
      await f.login();
      final saved = f.store.value!;
      f.store.value = StoredSession(
        saved.tokens,
        saved.userId,
        saved.tenantId,
        refreshPending: true,
      );
      await f.controller.restore();
      expect(f.controller.phase, SessionPhase.signedOut);
      expect(f.count('/refresh'), 0);
      expect(f.store.value, isNull);
    },
  );

  test(
    'ambiguous refresh response is never retried with the old token',
    () async {
      await f.login();
      f.expireAccess();
      f.handler = (r) async {
        if (r.url.path.endsWith('/refresh')) {
          throw http.ClientException('secret transport detail');
        }
        return f.standard(r);
      };
      await expectLater(
        f.controller.authorizedRequest('GET', '/jobs'),
        throwsA(isA<ApiException>()),
      );
      expect(f.controller.phase, SessionPhase.signedOut);
      await f.controller.restore();
      expect(f.count('/refresh'), 1);
      expect(f.store.value, isNull);
      expect(f.controller.message, isNot(contains('secret')));
    },
  );

  test('rejects expired refresh locally without a network request', () async {
    await f.login();
    f.now = f.now.add(const Duration(days: 2));
    await f.controller.restore();
    expect(f.count('/refresh'), 0);
    expect(f.count('/me'), 0);
    expect(f.controller.phase, SessionPhase.signedOut);
  });

  test('transient me failure retains the known pair for retry', () async {
    await f.login();
    f.handler = (r) async => jsonResponse({'code': 'UNAVAILABLE'}, 503);
    await f.controller.restore();
    expect(f.controller.phase, SessionPhase.unavailable);
    expect(f.store.value, isNotNull);
    f.handler = null;
    await f.controller.restore();
    expect(f.controller.phase, SessionPhase.authenticated);
    expect(f.count('/refresh'), 0);
  });

  test(
    'saved rotation survives profile lookup outage without old-token replay',
    () async {
      await f.login();
      f.expireAccess();
      f.handler = (r) async => r.url.path.endsWith('/me')
          ? jsonResponse({'code': 'UNAVAILABLE'}, 503)
          : f.standard(r);
      await f.controller.restore();
      expect(f.controller.phase, SessionPhase.unavailable);
      expect(f.store.value!.tokens.refreshToken, 'refresh-1-test-only');
      expect(f.store.value!.refreshPending, false);
      f.handler = null;
      await f.controller.restore();
      expect(f.controller.phase, SessionPhase.authenticated);
      expect(f.count('/refresh'), 1);
    },
  );

  test(
    'logout during refresh revokes the returned new token without resurrection',
    () async {
      await f.login();
      f.expireAccess();
      final gate = Completer<http.Response>();
      final entered = Completer<void>();
      f.handler = (r) async {
        if (r.url.path.endsWith('/refresh')) {
          entered.complete();
          return gate.future;
        }
        return f.standard(r);
      };
      final read = f.controller.authorizedRequest('GET', '/jobs');
      final rejected = expectLater(read, throwsA(isA<ApiException>()));
      await entered.future;
      final logout = f.controller.logout();
      gate.complete(jsonResponse(f.pair(version: 1)));
      await logout;
      await rejected;
      expect(f.controller.phase, SessionPhase.signedOut);
      expect(f.store.value, isNull);
      expect(
        jsonDecode(
          f.requests.lastWhere((r) => r.url.path.endsWith('/logout')).body,
        )['refreshToken'],
        'refresh-1-test-only',
      );
    },
  );

  test('a late login response cannot restore a logged-out session', () async {
    await f.controller.restore();
    final gate = Completer<http.Response>();
    final entered = Completer<void>();
    f.handler = (r) async {
      if (r.url.path.endsWith('/login')) {
        entered.complete();
        return gate.future;
      }
      return f.standard(r);
    };
    final login = f.controller.login(
      tenantCode: 'DEMO',
      email: 'technician@demo.local',
      password: 'test-only',
    );
    await entered.future;
    await f.controller.logout();
    gate.complete(jsonResponse({...f.pair(), 'user': f.profile}));
    await login;
    expect(f.controller.phase, SessionPhase.signedOut);
    expect(f.store.value, isNull);
    expect(f.count('/logout'), 1);
  });

  for (final role in ['CUSTOMER_USER', 'SERVICE_MANAGER', 'PLATFORM_ADMIN']) {
    test('rejects $role login and revokes the issued session', () async {
      f.profile = {
        ...f.profile,
        'roles': [role],
      };
      await f.login();
      expect(f.controller.phase, SessionPhase.signedOut);
      expect(f.store.value, isNull);
      expect(f.count('/logout'), 1);
    });
  }

  test('role removed on the server invalidates a restored session', () async {
    await f.login();
    f.profile = {
      ...f.profile,
      'roles': ['DISPATCHER'],
    };
    await f.controller.restore();
    expect(f.controller.phase, SessionPhase.signedOut);
    expect(f.store.value, isNull);
  });

  test(
    'profile with a different tenant cannot adopt stored credentials',
    () async {
      await f.login();
      f.profile = {...f.profile, 'tenantId': 'tenant-b'};
      await f.controller.restore();
      expect(f.controller.phase, SessionPhase.signedOut);
      expect(f.store.value, isNull);
    },
  );

  test(
    'storage write failure cannot produce an authenticated screen',
    () async {
      f.store.failWrite = true;
      await f.login();
      expect(f.controller.phase, SessionPhase.signedOut);
      expect(f.count('/logout'), 1);
    },
  );

  test(
    'storage read failure is recoverable and does not attempt login',
    () async {
      f.store.failRead = true;
      await f.controller.restore();
      expect(f.controller.phase, SessionPhase.unavailable);
      expect(f.requests, isEmpty);
      f.store.failRead = false;
      await f.controller.restore();
      expect(f.controller.phase, SessionPhase.signedOut);
    },
  );

  test(
    'failed refresh rotation persistence never reuses the prior pair',
    () async {
      await f.login();
      f.expireAccess();
      f.handler = (r) async {
        if (r.url.path.endsWith('/refresh')) f.store.failWrite = true;
        return f.standard(r);
      };
      await expectLater(
        f.controller.authorizedRequest('GET', '/jobs'),
        throwsA(isA<ApiException>()),
      );
      expect(f.controller.phase, SessionPhase.signedOut);
      expect(f.store.value, isNull);
      expect(f.count('/refresh'), 1);
      expect(f.count('/logout'), 1);
    },
  );

  test('denied refresh ends the session without retry', () async {
    await f.login();
    f.expireAccess();
    f.handler = (r) async => r.url.path.endsWith('/refresh')
        ? jsonResponse({'code': 'REFRESH_TOKEN_REUSED'}, 401)
        : f.standard(r);
    await expectLater(
      f.controller.authorizedRequest('GET', '/jobs'),
      throwsA(isA<ApiException>()),
    );
    expect(f.controller.phase, SessionPhase.signedOut);
    await f.controller.restore();
    expect(f.count('/refresh'), 1);
    expect(f.store.value, isNull);
  });

  test('intent persistence failure prevents the refresh POST', () async {
    await f.login();
    f.expireAccess();
    f.store.failWrite = true;
    await expectLater(
      f.controller.authorizedRequest('GET', '/jobs'),
      throwsA(isA<ApiException>()),
    );
    expect(f.count('/refresh'), 0);
    expect(f.controller.phase, SessionPhase.signedOut);
  });

  test(
    'actual refresh timeout requires login instead of reusing old credentials',
    () async {
      f.dispose();
      f = SessionFixture(timeout: const Duration(milliseconds: 10));
      await f.login();
      f.expireAccess();
      f.handler = (r) async {
        if (r.url.path.endsWith('/refresh')) {
          await Future<void>.delayed(const Duration(milliseconds: 50));
        }
        return f.standard(r);
      };
      await expectLater(
        f.controller.authorizedRequest('GET', '/jobs'),
        throwsA(isA<ApiException>()),
      );
      expect(f.controller.phase, SessionPhase.signedOut);
      expect(f.controller.message, contains('gián đoạn'));
      await f.controller.restore();
      expect(f.count('/refresh'), 1);
    },
  );

  test(
    'logout deletion failure stays blocked and can be cleared on retry',
    () async {
      await f.login();
      f.store.failClear = true;
      await f.controller.logout();
      expect(f.controller.phase, SessionPhase.unavailable);
      expect(f.controller.user, isNull);
      f.store.failClear = false;
      await f.controller.logout();
      expect(f.controller.phase, SessionPhase.signedOut);
      expect(f.store.value, isNull);
    },
  );

  test('double logout shares one server revocation', () async {
    await f.login();
    await Future.wait([f.controller.logout(), f.controller.logout()]);
    expect(f.count('/logout'), 1);
    expect(f.controller.phase, SessionPhase.signedOut);
  });

  test('logout outage clears local session and reports unconfirmed server revocation', () async {
    await f.login();
    f.handler = (r) async => jsonResponse({'code': 'UNAVAILABLE'}, 503);
    await f.controller.logout();
    expect(f.controller.phase, SessionPhase.signedOut);
    expect(f.store.value, isNull);
    expect(f.controller.message, contains('chưa xác nhận'));
  });
}
