import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/config/app_config.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/core/api/gateway_client.dart';
import 'package:pbl6_technician/features/session/session_controller.dart';
import 'package:pbl6_technician/features/workspace/work_order_workflow.dart';
import 'package:pbl6_technician/features/workspace/workspace_repository.dart';

import 'support/session_fixture.dart' show MemoryStore;

void main() {
  final runtimeFile = Platform.environment['PBL6_N6_RUNTIME_FILE'];
  test(
    'real N5 Gateway workflow, partial report, terminal history and assignment scope',
    () async {
      final runtime = jsonDecode(
        File(runtimeFile!).readAsStringSync(),
      ) as Map<String, dynamic>;
      expect(runtime['gateway'], 'http://127.0.0.1:13000');
      expect(
        runtime['env']['WORKORDER_DATABASE_URL'],
        contains('_mobile_n6_test_db'),
      );
      final client = GatewayClient(AppConfig(runtime['gateway'] as String));
      final session = SessionController(client, MemoryStore());
      addTearDown(session.dispose);
      await session.restore();
      await session.login(
        tenantCode: 'DEMO',
        email: 'technician@demo.local',
        password: runtime['password'] as String,
      );
      expect(session.phase, SessionPhase.authenticated);
      final manager = object(
        await client.request(
          'POST',
          '/api/identity/auth/login',
          body: {
            'tenantCode': 'DEMO',
            'email': 'service.manager@demo.local',
            'password': runtime['password'],
          },
        ),
      );
      var conflictInjected = false;
      final repo = WorkspaceRepository(
        (path) => session.authorizedRequest('GET', path),
        session.user!,
        write: (path, body) async {
          if (path.endsWith('/complete') && !conflictInjected) {
            conflictInjected = true;
            await client.request(
              'POST',
              path.replaceFirst('/complete', '/hold'),
              body: {'reason': 'N6 concurrent manager hold'},
              accessToken: manager['accessToken'] as String,
            );
          }
          return session.authorizedRequest('POST', path, body: body);
        },
      );
      addTearDown(repo.dispose);
      final flow = WorkOrderWorkflow(repo, runtime['probeOrderId'] as String);
      addTearDown(flow.dispose);
      await flow.load();
      for (final action in ['accept', 'start', 'hold', 'resume']) {
        expect(
          await flow.execute(
            action,
            body: action == 'hold' ? {'reason': 'N6 SDK hold'} : {},
          ),
          true,
          reason: action,
        );
      }
      expect(
        await flow.execute('logs', body: {'note': 'N6 SDK internal note'}),
        true,
      );
      expect(
        await flow.execute(
          'complete',
          body: {
            'problemDescription': 'N6 SDK internal problem',
            'solution': 'N6 SDK partial solution',
            'result': 'PARTIALLY_RESOLVED',
            'customerSummary': 'N6 SDK partial customer result',
          },
        ),
        false,
      );
      expect(flow.order!.status, 'ON_HOLD');
      expect(flow.uncertain, false);
      expect(await flow.execute('resume'), true);
      expect(
        await flow.execute(
          'complete',
          body: {
            'problemDescription': 'N6 SDK internal problem',
            'solution': 'N6 SDK partial solution',
            'result': 'PARTIALLY_RESOLVED',
            'customerSummary': 'N6 SDK partial customer result',
          },
        ),
        true,
      );
      final report = await repo.get(
        '${WorkspaceRepository.wo}/work-orders/${flow.id}/service-report',
      );
      expect(report['result'], 'PARTIALLY_RESOLVED');
      expect(report['workOrderId'], flow.id);
      expect(await flow.execute('complete'), false);
      final personal = await repo.personalWork();
      expect(personal.history.any((w) => w.id == flow.id), true);
      expect(
        personal.orders.any((w) => w.id == runtime['hiddenOrderId']),
        false,
      );
      await expectLater(
        repo.order(runtime['hiddenOrderId'] as String),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 404)),
      );
      final denied = WorkOrderWorkflow(
        repo,
        runtime['hiddenOrderId'] as String,
      );
      addTearDown(denied.dispose);
      await denied.load();
      expect(denied.order, isNull);
      expect(denied.loadError!.status, 404);
      expect(denied.can('accept'), false);
      await session.logout();
      expect(session.phase, SessionPhase.signedOut);
    },
    skip: runtimeFile == null
        ? 'Opt-in isolated N6 fixture; see mobile-n5-n6.md.'
        : false,
  );
}
