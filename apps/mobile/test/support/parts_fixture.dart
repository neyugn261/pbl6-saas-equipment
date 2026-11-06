import 'package:pbl6_technician/features/workspace/workspace_repository.dart';

import 'workspace_fixture.dart' as work;

String partId(int value) =>
    '00000000-0000-4000-8000-${value.toString().padLeft(12, '0')}';
Json usage([int index = 1, String orderId = work.orderId]) => {
  'id': partId(4000 + index),
  'workOrderId': orderId,
  'partId': partId(5000 + index),
  'warehouseId': partId(6000),
  'stockTransactionId': partId(7000),
  'createdAt': '2026-11-07T00:00:00Z',
  'quantityUsed': '5.50',
  'quantityIssued': '5.50',
  'quantityReturned': '1.75',
  'quantityOutstanding': '3.75',
  'quantityConsumed': '0.00',
  'quantityConfirmedUsed': '0.00',
  'quantityUnreconciled': '3.75',
  'unitCost': '123.45',
  'unitCostCurrency': 'USD',
  'partSnapshot': {
    'name': 'Dầu bảo trì $index',
    'sku': 'OIL-$index',
    'unit': 'l',
    'allowFractional': true,
  },
  'warehouseSnapshot': {'name': 'Kho lúc cấp', 'code': 'WH-OLD'},
  'returns': [
    for (final i in [1, 2])
      {
        'id': partId(8000 + i),
        'type': 'RETURN',
        'workOrderPartId': partId(4000 + index),
        'referenceId': orderId,
        'quantity': i == 1 ? '1.25' : '0.50',
        'returnCondition': i == 1 ? 'GOOD' : 'DAMAGED',
        'createdAt': '2026-11-07T01:00:00Z',
      },
  ],
  'confirmations': <Json>[],
};
Json confirmation(int index, {String kind = 'CONFIRM', String? reversesId}) => {
  'id': partId(9000 + index),
  'workOrderPartId': partId(4001),
  'workOrderId': work.orderId,
  'kind': kind,
  'reversesId': reversesId,
  'quantity': '0.25',
  'createdAt': '2026-11-07T02:00:00Z',
};
