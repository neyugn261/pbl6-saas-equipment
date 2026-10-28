import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pbl6_technician/config/app_config.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/core/api/gateway_client.dart';
import 'package:pbl6_technician/features/session/session_controller.dart';
import 'package:pbl6_technician/features/session/session_models.dart';
import 'package:pbl6_technician/features/session/session_store.dart';

http.Response jsonResponse(Object? body, [int status = 200]) =>
    http.Response.bytes(
      utf8.encode(jsonEncode(body)),
      status,
      headers: {'content-type': 'application/json'},
    );

class MemoryStore implements SessionStore {
  StoredSession? value;
  final writes = <StoredSession>[];
  bool failWrite = false, failRead = false, failClear = false;
  @override
  Future<StoredSession?> read() async {
    if (failRead) throw const ApiException('STORAGE_FAILED');
    return value;
  }

  @override
  Future<void> write(StoredSession session) async {
    if (failWrite) throw const ApiException('STORAGE_FAILED');
    writes.add(session);
    value = session;
  }

  @override
  Future<void> clear() async {
    if (failClear) throw const ApiException('STORAGE_FAILED');
    value = null;
  }
}

class SessionFixture {
  SessionFixture({Duration timeout = const Duration(seconds: 1)}) {
    api = GatewayClient(
      AppConfig('http://gateway.test'),
      client: MockClient((r) async {
        requests.add(r);
        return handler == null ? standard(r) : await handler!(r);
      }),
      timeout: timeout,
    );
    controller = SessionController(api, store, now: () => now);
  }
  DateTime now = DateTime.utc(2026, 10, 28);
  final store = MemoryStore();
  final requests = <http.Request>[];
  late final GatewayClient api;
  late final SessionController controller;
  Future<http.Response> Function(http.Request)? handler;
  int rotation = 0;
  Map<String, dynamic> profile = {
    'id': 'user-a',
    'tenantId': 'tenant-a',
    'email': 'technician@demo.local',
    'fullName': 'Demo Technician',
    'userType': 'TENANT_STAFF',
    'status': 'ACTIVE',
    'roles': ['TECHNICIAN'],
  };

  Map<String, dynamic> pair({int? version, int ttl = 300}) => {
    'tokenType': 'Bearer',
    'accessToken': 'access-${version ?? rotation}',
    'refreshToken': 'refresh-${version ?? rotation}-test-only',
    'expiresIn': ttl,
    'refreshTokenExpiresAt': now.add(const Duration(days: 1)).toIso8601String(),
  };

  http.Response standard(http.Request r) {
    if (r.url.path.endsWith('/login')) {
      return jsonResponse({...pair(), 'user': profile});
    }
    if (r.url.path.endsWith('/refresh')) {
      rotation++;
      return jsonResponse(pair());
    }
    if (r.url.path.endsWith('/logout')) return http.Response('', 204);
    if (r.url.path.endsWith('/me')) return jsonResponse(profile);
    return jsonResponse({'ok': true});
  }

  int count(String suffix) =>
      requests.where((r) => r.url.path.endsWith(suffix)).length;
  Future<void> login() async {
    await controller.restore();
    await controller.login(
      tenantCode: ' DEMO ',
      email: ' technician@demo.local ',
      password: 'test-only-password',
    );
  }

  void expireAccess() => now = now.add(const Duration(minutes: 6));
  void dispose() => controller.dispose();
}
