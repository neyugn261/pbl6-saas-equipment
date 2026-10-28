import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/workspace/work_order_workflow.dart';

import 'support/workflow_server.dart';
import 'support/workspace_fixture.dart' show orderId;

void main() {
  late WorkflowServer server;
  late WorkOrderWorkflow flow;
  Future<void> open([String state = 'ASSIGNED']) async {
    server = WorkflowServer(state);
    final repo = server.repository();
    flow = WorkOrderWorkflow(repo, orderId);
    addTearDown(flow.dispose);
    addTearDown(repo.dispose);
    await flow.load();
  }

  test(
    'full technician state graph and report use public POSTs once',
    () async {
      await open();
      for (final action in [
        'accept',
        'start-travel',
        'start',
        'hold',
        'resume',
      ]) {
        expect(flow.can(action), true);
        expect(
          await flow.execute(
            action,
            body: action == 'hold' ? {'reason': 'Chờ kiểm tra'} : {},
          ),
          true,
        );
      }
      expect(
        await flow.execute('logs', body: {'note': 'Ghi chú thực tế'}),
        true,
      );
      expect(await flow.execute('complete', body: validReport), true);
      expect(flow.order!.status, 'COMPLETED');
      expect(flow.can('complete'), false);
      expect(server.writes, 7);
      expect(server.report!['customerSummary'], validReport['customerSummary']);
      expect(server.requests.where((p) => p.contains('/internal/')), isEmpty);
    },
  );
  test('reject ends own current assignment and removes actions', () async {
    await open();
    expect(
      await flow.execute('reject', body: {'reason': 'Không phù hợp kỹ năng'}),
      true,
    );
    expect(flow.order!.status, 'CREATED');
    expect(flow.canNote, false);
    expect(flow.can('accept'), false);
    expect(server.history.single['reason'], 'Không phù hợp kỹ năng');
  });
  test(
    'concurrent/double submit shares one command slot across controllers',
    () async {
      await open();
      final gate = Completer<void>();
      server.beforeWrite = (_) => gate.future;
      final first = flow.execute('accept');
      await Future<void>.delayed(Duration.zero);
      expect(flow.busy, true);
      expect(await flow.execute('accept'), false);
      final second = WorkOrderWorkflow(flow.repo, orderId);
      addTearDown(second.dispose);
      await second.load();
      expect(await second.execute('accept'), false);
      expect(server.writes, 1);
      gate.complete();
      expect(await first, true);
      expect(server.writes, 1);
    },
  );
  test(
    'reassignment discovered at preflight never sends stale action',
    () async {
      await open();
      server.setStatus('ASSIGNED', owner: 'user-b', assignmentId: 'other');
      expect(await flow.execute('accept'), false);
      expect(server.writes, 0);
      expect(flow.can('accept'), false);
      expect(flow.notice, contains('đã thay đổi'));
    },
  );
  test('server 409 after preflight reloads and never repeats POST', () async {
    await open('IN_PROGRESS');
    server.beforeWrite = (_) async {
      server.setStatus('ON_HOLD');
      throw const ApiException('INVALID_STATE_TRANSITION', status: 409);
    };
    expect(await flow.execute('complete', body: validReport), false);
    expect(flow.order!.status, 'ON_HOLD');
    expect(flow.can('complete'), false);
    expect(server.writes, 1);
    expect(flow.uncertain, false);
  });
  for (final status in [403, 404]) {
    test(
      'write $status is an error, not a success or automatic retry',
      () async {
        await open();
        server.beforeWrite = (_) async {
          throw ApiException('DENIED', status: status);
        };
        expect(await flow.execute('accept'), false);
        expect(server.writes, 1);
        expect(flow.uncertain, false);
        expect(flow.order!.status, 'ASSIGNED');
      },
    );
  }
  test(
    'completion applied then response lost is proven by exact stored report',
    () async {
      await open('IN_PROGRESS');
      server.timeoutAfterApply = true;
      expect(await flow.execute('complete', body: validReport), true);
      expect(flow.confirmedReport!['result'], 'RESOLVED');
      expect(server.writes, 1);
      expect(flow.uncertain, false);
      expect(flow.order!.status, 'COMPLETED');
    },
  );
  test(
    'unproven timeout remains locked across navigation until outcome is known',
    () async {
      await open('IN_PROGRESS');
      server.timeoutBeforeApply = true;
      expect(await flow.execute('complete', body: validReport), false);
      expect(flow.uncertain, true);
      expect(await flow.execute('complete', body: validReport), false);
      expect(server.writes, 1);
      final reopened = WorkOrderWorkflow(flow.repo, orderId);
      addTearDown(reopened.dispose);
      await reopened.load();
      expect(reopened.uncertain, true);
      expect(reopened.can('complete'), false);
      server.apply('complete', validReport);
      expect(await reopened.checkOutcome(), true);
      expect(reopened.uncertain, false);
      expect(server.writes, 1);
    },
  );
  test(
    'a different server report is not claimed as this submitted draft',
    () async {
      await open('IN_PROGRESS');
      server.beforeWrite = (_) async {
        server.apply('complete', {
          ...validReport,
          'customerSummary': 'Kết quả từ phiên khác',
        });
        throw const ApiException('TIMEOUT');
      };
      expect(await flow.execute('complete', body: validReport), false);
      expect(flow.order!.status, 'COMPLETED');
      expect(flow.notice, contains('báo cáo khác'));
      expect(flow.uncertain, false);
      expect(server.writes, 1);
    },
  );
  test(
    'lost note response finds new matching log instead of adding a duplicate',
    () async {
      await open('IN_PROGRESS');
      server.timeoutAfterApply = true;
      expect(await flow.execute('logs', body: {'note': 'Đã kiểm tra'}), true);
      expect(server.logs.length, 1);
      expect(server.writes, 1);
    },
  );
  test(
    'existing identical note does not falsely prove a timed out new note',
    () async {
      await open('IN_PROGRESS');
      server.apply('logs', {'note': 'Giống nội dung cũ'});
      server.timeoutBeforeApply = true;
      expect(
        await flow.execute('logs', body: {'note': 'Giống nội dung cũ'}),
        false,
      );
      expect(flow.uncertain, true);
      expect(server.logs.length, 1);
    },
  );
  test('lost transition response is reconciled from new history even if state advanced', () async {
    await open();
    server.beforeWrite = (_) async {
      server.apply('accept', {});
      server.apply('start', {});
      throw const ApiException('NETWORK_ERROR');
    };
    expect(await flow.execute('accept'), true);
    expect(flow.order!.status, 'IN_PROGRESS');
    expect(server.writes, 1);
  });
  test('401 refreshed by session requires an explicit new confirmation, never replay', () async {
    await open();
    server.beforeWrite = (_) async {
      throw const ApiException('CHECK_BEFORE_RETRY');
    };
    expect(await flow.execute('accept'), false);
    expect(server.writes, 1);
    expect(flow.uncertain, false);
    expect(flow.notice, contains('Kiểm tra trạng thái'));
  });
  test(
    'transport read outage cannot send a command without a fresh WO',
    () async {
      await open();
      server.beforeRead = (_) async {
        throw const ApiException('NETWORK_ERROR');
      };
      expect(await flow.execute('accept'), false);
      expect(server.writes, 0);
      expect(flow.order, isNull);
    },
  );
  test(
    'leaving the scope during preflight cannot send a late mutation',
    () async {
      final backend = WorkflowServer();
      final repo = backend.repository();
      addTearDown(repo.dispose);
      final controller = WorkOrderWorkflow(repo, orderId);
      await controller.load();
      final gate = Completer<void>();
      backend.beforeRead = (_) => gate.future;
      final request = controller.execute('accept');
      await Future<void>.delayed(Duration.zero);
      controller.dispose();
      gate.complete();
      expect(await request, false);
      expect(backend.writes, 0);
    },
  );
}
