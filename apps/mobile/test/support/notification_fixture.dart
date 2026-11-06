import 'dart:convert';

import 'package:pbl6_technician/features/workspace/workspace_repository.dart';

import 'workspace_fixture.dart' as work;

Json notification(
  int index, {
  bool read = false,
  String? type = 'WORK_ORDER',
}) => {
  'id': '00000000-0000-4000-8000-${(3000 + index).toString().padLeft(12, '0')}',
  'eventType': 'WorkOrderAssigned.v1',
  'title': 'Thông báo thật $index',
  'body': 'Công việc được phân công $index',
  'resourceType': type,
  'resourceId': type == null ? null : work.orderId,
  'createdAt': '2026-11-07T01:00:00Z',
  'readAt': read ? '2026-11-07T02:00:00Z' : null,
};

class NotificationBackend {
  NotificationBackend([int count = 3])
    : items = List.generate(count, (i) => notification(i + 1));
  final List<Json> items;
  final calls = <String>[];
  int writes = 0;
  Future<Object?> call(String method, String path) async {
    calls.add('$method $path');
    final uri = Uri.parse(path);
    if (uri.path.endsWith('/unread-count')) {
      return {'unreadCount': items.where((n) => n['readAt'] == null).length};
    }
    if (method == 'PATCH') {
      writes++;
      final id = uri.path.split('/')[3];
      final item = items.singleWhere((n) => n['id'] == id);
      item['readAt'] ??= '2026-11-07T02:00:00Z';
      return jsonDecode(jsonEncode(item));
    }
    final page = int.parse(uri.queryParameters['page'] ?? '1');
    final filter = uri.queryParameters['readStatus'];
    final filtered = items
        .where(
          (n) => filter == 'UNREAD'
              ? n['readAt'] == null
              : filter == 'READ'
              ? n['readAt'] != null
              : true,
        )
        .toList();
    return work.page(
      jsonDecode(jsonEncode(filtered.skip((page - 1) * 20).take(20).toList()))
          as List,
      total: filtered.length,
      number: page,
    );
  }
}
