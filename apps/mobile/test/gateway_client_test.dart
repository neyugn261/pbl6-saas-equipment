import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pbl6_technician/config/app_config.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/core/api/gateway_client.dart';

void main() {
  test('requires an origin and HTTPS in release', () {
    for (final value in [
      '',
      'file:///tmp/a',
      'http://user:secret@host',
      'http://host/api',
      'http://host?q=secret',
      'http://host#secret',
    ]) {
      expect(() => AppConfig(value), throwsFormatException);
    }
    expect(
      () => AppConfig('http://host', release: true),
      throwsFormatException,
    );
    expect(
      AppConfig('https://host/', release: true).baseUrl.origin,
      'https://host',
    );
  });

  test(
    'pins host, sends auth/correlation, refuses redirects and accepts 204',
    () async {
      final client = GatewayClient(
        AppConfig('http://gateway.test'),
        client: MockClient((r) async {
          expect(
            r.url.toString(),
            'http://gateway.test/api/identity/auth/logout',
          );
          expect(r.headers['authorization'], 'Bearer test-access');
          expect(
            r.headers['x-correlation-id'],
            matches(RegExp(r'^[0-9a-f]{32}$')),
          );
          expect(r.followRedirects, false);
          return http.Response('', 204);
        }),
      );
      addTearDown(client.close);
      expect(
        await client.request(
          'POST',
          '/api/identity/auth/logout',
          body: {'refreshToken': 'test-only'},
          accessToken: 'test-access',
        ),
        isNull,
      );
      for (final route in ['https://external.test/a', '//external.test/a']) {
        await expectLater(
          client.request('GET', route, accessToken: 'test-access'),
          throwsArgumentError,
        );
      }
    },
  );

  test(
    'malformed success and HTML upstream failure have safe errors',
    () async {
      var status = 200;
      final client = GatewayClient(
        AppConfig('http://gateway.test'),
        client: MockClient(
          (r) async => http.Response('secret upstream HTML', status),
        ),
      );
      addTearDown(client.close);
      await expectLater(
        client.request('GET', '/test'),
        throwsA(
          isA<ApiException>().having((e) => e.code, 'code', 'INVALID_RESPONSE'),
        ),
      );
      status = 502;
      try {
        await client.request('GET', '/test');
        fail('Expected failure');
      } on ApiException catch (e) {
        expect(e.status, 502);
        expect(e.userMessage, isNot(contains('secret')));
        expect(e.toString(), isNot(contains('secret')));
      }
    },
  );

  test('timeouts and network errors never automatically retry', () async {
    var calls = 0;
    final client = GatewayClient(
      AppConfig('http://gateway.test'),
      timeout: const Duration(milliseconds: 5),
      client: MockClient((r) async {
        calls++;
        await Future<void>.delayed(const Duration(milliseconds: 30));
        return http.Response('{}', 200);
      }),
    );
    addTearDown(client.close);
    await expectLater(
      client.request('POST', '/test'),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'TIMEOUT')),
    );
    expect(calls, 1);
  });
}
