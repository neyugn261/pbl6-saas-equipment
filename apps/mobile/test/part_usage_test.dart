import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/workspace/part_usage.dart';
import 'package:pbl6_technician/features/workspace/workspace_repository.dart';

import 'support/parts_fixture.dart';
import 'support/workflow_server.dart' show workflowUser;
import 'support/workspace_fixture.dart' show orderId;

void main() {
  test('issued minus returned is outstanding, not confirmed use', () {
    final row = PartUsage.forOrder([usage()], orderId).single;
    expect(row.issued.value, '5.50');
    expect(row.returned.value, '1.75');
    expect(row.outstanding.value, '3.75');
    expect(row.confirmed.value, '0.00');
    expect(row.unreconciled.value, '3.75');
  });
  test('decimal arithmetic stays exact at the maximum supported quantity', () {
    final row = PartUsage.forOrder([
      {
        ...usage(),
        'quantityUsed': '9999999999.99',
        'quantityIssued': '9999999999.99',
        'quantityReturned': '9999999999.98',
        'quantityOutstanding': '0.01',
        'quantityUnreconciled': '0.01',
      },
    ], orderId).single;
    expect(row.unreconciled.hundredths, BigInt.one);
    expect(row.issued.value, '9999999999.99');
  });
  test(
    'numbers, rounding, invalid decimal formats and overflow fail closed',
    () {
      for (final value in [
        1.25,
        -1,
        '-1',
        '1.001',
        '1e2',
        '1,25',
        '01.25',
        '10000000000',
        null,
      ]) {
        expect(() => PartQuantity(value), throwsA(isA<ApiException>()));
      }
    },
  );
  test(
    'inconsistent quantities and consumed aliases are never silently repaired',
    () {
      for (final change in [
        {'quantityConsumed': '3.75'},
        {'quantityOutstanding': '5.50'},
        {'quantityUnreconciled': '5.50'},
        {'quantityIssued': '1.00'},
        {'quantityConfirmedUsed': null},
      ]) {
        expect(
          () => PartUsage.forOrder([
            {...usage(), ...change},
          ], orderId),
          throwsA(isA<ApiException>()),
        );
      }
    },
  );
  test('rejects another WO, duplicate rows and mismatched linked history', () {
    for (final rows in [
      [usage(1, partId(99))],
      [usage(), usage()],
      [
        {
          ...usage(),
          'returns': [
            {
              ...((usage()['returns'] as List).first as Json),
              'referenceId': partId(99),
            },
          ],
        },
      ],
      [
        {
          ...usage(),
          'confirmations': [
            {...confirmation(1), 'workOrderId': partId(99)},
          ],
        },
      ],
    ]) {
      expect(
        () => PartUsage.forOrder(rows, orderId),
        throwsA(isA<ApiException>()),
      );
    }
    expect(
      () => PartUsage.forOrder({'items': []}, orderId),
      throwsA(isA<ApiException>()),
    );
  });
  test('legacy metadata stays unknown; current catalogue cannot replace historical names', () {
    final row = PartUsage.forOrder([
      {
        ...usage(),
        'partSnapshot': null,
        'warehouseSnapshot': null,
        'part': {'name': 'Current name must not be substituted'},
      },
    ], orderId).single;
    expect(row.name, isNull);
    expect(row.unit, isNull);
    expect(row.incompleteHistory, true);
    expect(row.issued.value, '5.50');
    expect(row.incompleteReturnHistory, false);
    expect(
      PartUsage.forOrder([
        {...usage(), 'returns': []},
      ], orderId).single.incompleteReturnHistory,
      true,
    );
  });
  test('confirmed history retains both the original and its reversal', () {
    final row = PartUsage.forOrder([
      {
        ...usage(),
        'confirmations': [
          confirmation(1),
          confirmation(2, kind: 'REVERSE', reversesId: partId(9001)),
        ],
      },
    ], orderId).single;
    expect(row.confirmations.length, 2);
    expect(row.isReversed(row.confirmations.first), true);
    expect(row.confirmed.value, '0.00');
  });
  test(
    'repository only reads the public WO parts route and preserves API errors',
    () async {
      final calls = <String>[];
      final repo = WorkspaceRepository(
        (path) async {
          calls.add(path);
          return [usage()];
        },
        workflowUser,
        write: (_, _) async => fail('Parts must never mutate Inventory'),
      );
      addTearDown(repo.dispose);
      expect((await repo.workOrderParts(orderId)).length, 1);
      expect(calls, ['/api/inventory/work-orders/$orderId/parts']);
      for (final status in [403, 404, 503]) {
        final broken = WorkspaceRepository(
          (_) async => throw ApiException('UNAVAILABLE', status: status),
          workflowUser,
        );
        await expectLater(
          broken.workOrderParts(orderId),
          throwsA(
            isA<ApiException>().having((e) => e.status, 'status', status),
          ),
        );
        broken.dispose();
      }
    },
  );
  test('disposed repository rejects a late response and does not start another read', () async {
    final gate = Completer<Object?>();
    var calls = 0;
    final repo = WorkspaceRepository((_) {
      calls++;
      return gate.future;
    }, workflowUser);
    final reading = repo.workOrderParts(orderId);
    final assertion = expectLater(
      reading,
      throwsA(
        isA<ApiException>().having((e) => e.code, 'code', 'SESSION_CHANGED'),
      ),
    );
    repo.dispose();
    gate.complete([usage()]);
    await assertion;
    await expectLater(
      repo.workOrderParts(orderId),
      throwsA(isA<ApiException>()),
    );
    expect(calls, 1);
  });
}
