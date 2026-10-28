import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/session/session_models.dart';
import 'package:pbl6_technician/features/workspace/workspace_repository.dart';

import 'support/workspace_fixture.dart' as f;

const user = SessionUser(
  id: 'user-a',
  tenantId: 'tenant-a',
  email: 'tech@example.test',
  fullName: 'Kỹ thuật viên',
);
void main() {
  test('loads every page, counts current and preserves completed/reassigned history', () async {
    final paths = <String>[];
    final repo = WorkspaceRepository((path) async {
      paths.add(path);
      final uri = Uri.parse(path);
      if (uri.path.endsWith('/me')) return f.technician();
      if (uri.queryParameters['page'] == '1') {
        return f.page(
          [
            f.workOrder(),
            f.workOrder(id: 'completed', status: 'COMPLETED', current: false),
          ],
          total: 3,
          size: 2,
        );
      }
      return f.page(
        [f.workOrder(id: 'reassigned', status: 'CREATED', current: false)],
        number: 2,
        total: 3,
        size: 2,
      );
    }, user);
    final work = await repo.personalWork();
    expect(work.orders.length, 3);
    expect(work.current.single.id, f.orderId);
    expect(work.history.map((w) => w.id), ['completed', 'reassigned']);
    expect(paths.any((p) => p.contains('mine=')), false);
    expect(paths.length, 3);
  });
  test('mixed roles verify own historical assignment before showing wider staff reads', () async {
    final repo = WorkspaceRepository(
      (path) async {
        if (path.endsWith('/me')) return f.technician();
        if (path.contains('/assignments')) {
          return path.contains('other')
              ? [
                  {'technicianUserId': 'user-b'},
                ]
              : [
                  {'technicianUserId': 'user-a'},
                ];
        }
        return f.page([
          f.workOrder(id: 'own', status: 'COMPLETED', current: false),
          f.workOrder(id: 'other'),
        ], size: 100);
      },
      const SessionUser(
        id: 'user-a',
        tenantId: 'tenant-a',
        email: 'a@test.local',
        fullName: 'A',
        roles: ['TECHNICIAN', 'DISPATCHER'],
      ),
    );
    expect((await repo.personalWork()).orders.map((w) => w.id), ['own']);
  });
  test(
    'profile missing never falls back to tenant-wide work or demo fixtures',
    () async {
      var calls = 0;
      final repo = WorkspaceRepository((path) async {
        calls++;
        throw const ApiException('TECHNICIAN_PROFILE_MISSING', status: 404);
      }, user);
      await expectLater(
        repo.personalWork(),
        throwsA(
          isA<ApiException>().having(
            (e) => e.code,
            'code',
            'TECHNICIAN_PROFILE_MISSING',
          ),
        ),
      );
      expect(calls, 1);
    },
  );
  test(
    'a failed page fails the complete snapshot rather than partial totals',
    () async {
      final repo = WorkspaceRepository((path) async {
        if (path.endsWith('/me')) return f.technician();
        if (Uri.parse(path).queryParameters['page'] == '1') {
          return f.page([f.workOrder()], total: 2, size: 1);
        }
        throw const ApiException('NETWORK_ERROR');
      }, user);
      await expectLater(repo.personalWork(), throwsA(isA<ApiException>()));
    },
  );
  test(
    'duplicate page is rejected instead of looping/showing inaccurate counts',
    () async {
      final repo = WorkspaceRepository((path) async {
        if (path.endsWith('/me')) return f.technician();
        return f.page(
          [f.workOrder()],
          total: 2,
          size: 1,
          number: int.parse(Uri.parse(path).queryParameters['page']!),
        );
      }, user);
      await expectLater(
        repo.personalWork(),
        throwsA(
          isA<ApiException>().having((e) => e.code, 'code', 'READ_CHANGED'),
        ),
      );
    },
  );
  test(
    'equipment query is encoded and separates resource UUID from display code',
    () async {
      late String requested;
      final repo = WorkspaceRepository((path) async {
        requested = path;
        return f.page([f.equipment()]);
      }, user);
      final result = await repo.equipmentPage({
        'q': 'AC & 42/serial',
        'page': '1',
        'pageSize': '20',
        'warranty': 'NO_WARRANTY',
      });
      expect(Uri.parse(requested).queryParameters['q'], 'AC & 42/serial');
      expect(result.items.single.id, f.equipmentId);
      expect(result.items.single.code, 'ASSET-REAL-01');
      expect(result.items.single.data['operationalStatus'], 'UNKNOWN');
    },
  );
  test(
    'Vietnam calendar handles UTC date boundary and ignores device timezone',
    () {
      expect(
        businessToday(DateTime.parse('2026-10-27T18:00:00Z')),
        DateTime.utc(2026, 10, 28),
      );
      expect(
        wallTime('2026-10-28T23:30:00-04:00'),
        DateTime.utc(2026, 10, 29, 10, 30),
      );
      expect(dateText('2026-01-01'), '01/01/2026');
    },
  );
  test(
    'malformed pagination and mismatched technician identity fail closed',
    () async {
      expect(
        () => PageData.parse({
          'items': [],
          'total': '0',
          'page': 1,
          'pageSize': 20,
        }, (j) => j),
        throwsA(isA<ApiException>()),
      );
      final repo = WorkspaceRepository(
        (_) async => {...f.technician(), 'userId': 'other-user'},
        user,
      );
      await expectLater(repo.personalWork(), throwsA(isA<ApiException>()));
    },
  );
}
