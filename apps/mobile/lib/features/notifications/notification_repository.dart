import '../../core/api/api_exception.dart';
import '../workspace/workspace_repository.dart';

typedef NotificationRequest = Future<Object?> Function(
  String method,
  String path,
);

bool notificationUuid(Object? value) =>
    value is String &&
    RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    ).hasMatch(value);

class InboxNotification {
  InboxNotification.fromJson(Json data)
    : id = data['id'] as String? ?? '',
      title = data['title'] as String? ?? '',
      body = data['body'] as String? ?? '',
      resourceType = data['resourceType'] as String?,
      resourceId = data['resourceId'] as String?,
      createdAt = apiDate(data['createdAt']),
      readAt = apiDate(data['readAt']) {
    if (!notificationUuid(id) ||
        title.isEmpty ||
        title.length > 200 ||
        data['body'] is! String ||
        body.length > 1000 ||
        data['eventType'] is! String ||
        createdAt == null ||
        (data['readAt'] != null && readAt == null) ||
        (resourceId != null && !notificationUuid(resourceId)) ||
        (resourceId == null) != (resourceType == null)) {
      throw const ApiException('INVALID_RESPONSE');
    }
  }
  final String id, title, body;
  final String? resourceType, resourceId;
  final DateTime? createdAt, readAt;
  bool get unread => readAt == null;
  bool get linksToWorkOrder =>
      resourceType == 'WORK_ORDER' && resourceId != null;
}

/// Only the three public, principal-scoped Notification endpoints. No owner filters.
class NotificationRepository {
  NotificationRepository(this.request);
  final NotificationRequest request;
  bool _closed = false;
  void dispose() => _closed = true;
  Future<Object?> _call(String method, String path) async {
    if (_closed) throw const ApiException('SESSION_CHANGED');
    final result = await request(method, path);
    if (_closed) throw const ApiException('SESSION_CHANGED');
    return result;
  }

  Future<int> unreadCount() async {
    final result = object(
      await _call('GET', '/api/notifications/unread-count'),
    );
    final count = result['unreadCount'];
    if (count is! int || count < 0) {
      throw const ApiException('INVALID_RESPONSE');
    }
    return count;
  }

  Future<PageData<InboxNotification>> list({
    int page = 1,
    String readStatus = 'ALL',
  }) async {
    if (page < 1 || !['ALL', 'UNREAD', 'READ'].contains(readStatus)) {
      throw const ApiException('INVALID_COMMAND');
    }
    final path = Uri(
      path: '/api/notifications',
      queryParameters: {
        'page': '$page',
        'pageSize': '20',
        'readStatus': readStatus,
      },
    ).toString();
    try {
      final result = PageData.parse(
        await _call('GET', path),
        InboxNotification.fromJson,
      );
      if (result.page != page ||
          result.pageSize != 20 ||
          result.items.map((n) => n.id).toSet().length != result.items.length ||
          result.items.any(
            (n) => readStatus == 'UNREAD'
                ? !n.unread
                : readStatus == 'READ' && n.unread,
          )) {
        throw const ApiException('INVALID_RESPONSE');
      }
      return result;
    } on ApiException {
      rethrow;
    } catch (_) {
      throw const ApiException('INVALID_RESPONSE');
    }
  }

  Future<InboxNotification> markRead(String id) async {
    if (!notificationUuid(id)) throw const ApiException('INVALID_COMMAND');
    try {
      final result = InboxNotification.fromJson(
        object(await _call('PATCH', '/api/notifications/$id/read')),
      );
      if (result.id != id || result.unread) {
        throw const ApiException('INVALID_RESPONSE');
      }
      return result;
    } on ApiException {
      rethrow;
    } catch (_) {
      throw const ApiException('INVALID_RESPONSE');
    }
  }
}
