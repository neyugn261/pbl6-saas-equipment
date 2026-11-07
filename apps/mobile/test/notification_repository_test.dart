import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/notifications/notification_controller.dart';
import 'package:pbl6_technician/features/notifications/notification_repository.dart';

import 'support/notification_fixture.dart';
import 'support/workspace_fixture.dart' show page;

void main() {
  test(
    'uses only public principal-scoped routes and server page totals',
    () async {
      final backend = NotificationBackend(42);
      final real = NotificationRepository(backend.call);
      final next = await real.list(page: 2, readStatus: 'UNREAD');
      expect(next.items.length, 20);
      expect(next.total, 42);
      expect(
        backend.calls.single,
        'GET /api/notifications?page=2&pageSize=20&readStatus=UNREAD',
      );
      expect(await real.unreadCount(), 42);
      await real.markRead(next.items.first.id);
      expect(await real.unreadCount(), 41);
      expect(
        backend.calls.any(
          (c) =>
              c.contains('tenantId') ||
              c.contains('userId') ||
              c.contains('/internal/'),
        ),
        false,
      );
    },
  );
  test('invalid unread counts do not become zero', () async {
    for (final value in [-1, 1.5, '2', null]) {
      final repo = NotificationRepository(
        (_, _) async => {'unreadCount': value},
      );
      await expectLater(repo.unreadCount(), throwsA(isA<ApiException>()));
    }
  });
  test('malformed or mismatched list responses fail closed', () async {
    for (final data in [
      page([
        {...notification(1), 'resourceId': '../../work-orders'},
      ]),
      page([
        {...notification(1), 'createdAt': 'invalid'},
      ]),
      page([notification(1), notification(1)]),
      page([notification(1)], number: 2),
      page([notification(1, read: true)]),
    ]) {
      await expectLater(
        NotificationRepository((_, _) async => data).list(readStatus: 'UNREAD'),
        throwsA(isA<ApiException>()),
      );
    }
  });
  test('resource allowlist never treats other resource IDs as work orders', () {
    for (final type in [
      'SERVICE_REQUEST',
      'EQUIPMENT',
      'STOCK',
      'FUTURE_RESOURCE',
      null,
    ]) {
      expect(
        InboxNotification.fromJson(notification(1, type: type))
            .linksToWorkOrder,
        false,
      );
    }
  });
  test('mark read validates the exact row and acknowledgement', () async {
    final id = notification(1)['id'] as String;
    for (final response in [notification(2, read: true), notification(1)]) {
      await expectLater(
        NotificationRepository((_, _) async => response).markRead(id),
        throwsA(isA<ApiException>()),
      );
    }
    var sent = false;
    await expectLater(
      NotificationRepository((_, _) async {
        sent = true;
        return {};
      }).markRead('../other'),
      throwsA(isA<ApiException>()),
    );
    expect(sent, false);
  });
  test(
    'mark read is single-flight and uses the server count afterwards',
    () async {
      final gate = Completer<Object?>();
      final backend = NotificationBackend(42);
      final center = NotificationController(
        NotificationRepository(
          (method, path) =>
              method == 'PATCH' ? gate.future : backend.call(method, path),
        ),
      );
      addTearDown(center.dispose);
      final id = notification(1)['id'] as String;
      final a = center.markRead(id), b = center.markRead(id);
      expect(identical(a, b), true);
      backend.items[0]['readAt'] = '2026-11-07T02:00:00Z';
      gate.complete(backend.items[0]);
      await Future.wait([a, b]);
      expect(center.unreadCount, 41);
    },
  );
  test(
    'a late count cannot overwrite the newer refresh or hide an outage',
    () async {
      final old = Completer<Object?>(), fresh = Completer<Object?>();
      var n = 0;
      final center = NotificationController(
        NotificationRepository((_, _) => ++n == 1 ? old.future : fresh.future),
      );
      addTearDown(center.dispose);
      final a = center.refreshCount(), b = center.refreshCount();
      fresh.complete({'unreadCount': 9});
      await b;
      old.complete({'unreadCount': 100});
      await a;
      expect(center.unreadCount, 9);
      final broken = NotificationController(
        NotificationRepository(
          (_, _) async => throw const ApiException('UNAVAILABLE', status: 503),
        ),
      );
      addTearDown(broken.dispose);
      broken.unreadCount = 9;
      await broken.refreshCount();
      expect(broken.unreadCount, isNull);
      expect(broken.countError?.status, 503);
    },
  );
  test('disposal rejects late list and read responses and never notifies old session', () async {
    for (final mark in [false, true]) {
      final gate = Completer<Object?>();
      final repo = NotificationRepository((_, _) => gate.future);
      final future = mark ? repo.markRead(notification(1)['id']) : repo.list();
      final assertion = expectLater(
        future,
        throwsA(
          isA<ApiException>().having((e) => e.code, 'code', 'SESSION_CHANGED'),
        ),
      );
      repo.dispose();
      gate.complete(
        mark ? notification(1, read: true) : page([notification(1)]),
      );
      await assertion;
    }
    final gate = Completer<Object?>();
    final center = NotificationController(
      NotificationRepository((_, _) => gate.future),
    );
    var calls = 0;
    center.addListener(() => calls++);
    final refresh = center.refreshCount();
    center.dispose();
    final before = calls;
    gate.complete({'unreadCount': 99});
    await refresh;
    expect(calls, before);
    expect(center.unreadCount, isNull);
  });
}
