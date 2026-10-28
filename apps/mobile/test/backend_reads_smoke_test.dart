import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/config/app_config.dart';
import 'package:pbl6_technician/core/api/gateway_client.dart';
import 'package:pbl6_technician/features/session/session_controller.dart';
import 'package:pbl6_technician/features/workspace/workspace_repository.dart';

import 'support/session_fixture.dart' show MemoryStore;

void main() {
  final gateway = Platform.environment['PBL6_MOBILE_SMOKE_GATEWAY'];
  test(
    'real Gateway login and every M2 mobile read contract',
    () async {
      final client = GatewayClient(AppConfig(gateway!));
      final session = SessionController(client, MemoryStore());
      addTearDown(session.dispose);
      await session.restore();
      await session.login(
        tenantCode: 'DEMO',
        email: 'technician@demo.local',
        password: Platform.environment['PBL6_MOBILE_SMOKE_PASSWORD']!,
      );
      expect(session.phase, SessionPhase.authenticated);
      final repo = WorkspaceRepository(
        (path) => session.authorizedRequest('GET', path),
        session.user!,
      );
      final work = await repo.personalWork();
      expect(work.current.length, 2);
      expect(work.history.any((w) => w.status == 'COMPLETED'), true);
      expect(
        work.orders.any(
          (w) => w.id == Platform.environment['PBL6_MOBILE_SMOKE_HIDDEN_ORDER'],
        ),
        false,
      );
      expect(work.current.any((w) => w.start == null), true);
      final equipmentId = Platform.environment['PBL6_MOBILE_SMOKE_EQUIPMENT']!;
      final equipmentPage = await repo.equipmentPage({
        'page': '1',
        'pageSize': '20',
        'warranty': 'IN_WARRANTY',
      });
      expect(equipmentPage.items.any((e) => e.id == equipmentId), true);
      final d = await repo.dossier(equipmentId);
      expect(Equipment(object(d['equipment'])).id, equipmentId);
      for (final section in ['customer', 'site', 'contacts', 'location']) {
        expect(nested(d, section)['status'], 'AVAILABLE', reason: section);
      }
      expect(nested(d, 'maintenance')['status'], 'RESTRICTED');
      expect(rows(d['warranties']), isNotEmpty);
      expect(nested(d, 'calendarCoverage')['result'], 'IN_WARRANTY');
      final timeline = PageData.parse(
        await repo.read(
          '${WorkspaceRepository.asset}/equipment/$equipmentId/timeline?page=1&pageSize=20',
        ),
        (j) => j,
      );
      expect(timeline.total, greaterThan(0));
      final linked = await repo.get(
        '${WorkspaceRepository.asset}/equipment/$equipmentId/work-orders?page=1&pageSize=10',
      );
      expect(linked['status'], 'AVAILABLE');
      PageData.parse(linked['data'], WorkOrder.new);
      final relatedRequests = await repo.get(
        '${WorkspaceRepository.asset}/equipment/$equipmentId/service-requests?page=1&pageSize=10',
      );
      expect(relatedRequests['status'], 'AVAILABLE');
      final requestPage = PageData.parse(relatedRequests['data'], (j) => j);
      final source = await repo.get(
        '${WorkspaceRepository.asset}/equipment/$equipmentId/service-requests/${requestPage.items.first['id']}',
      );
      expect(source['status'], 'AVAILABLE');
      final detail = object(source['data']);
      for (final section in ['history', 'comments', 'estimates']) {
        expect(nested(detail, section)['status'], 'AVAILABLE');
        rows(nested(detail, section)['data']);
      }
      for (final w in work.orders) {
        expect((await repo.order(w.id)).id, w.id);
        for (final part in ['history', 'assignments', 'logs']) {
          await repo.list(
            '${WorkspaceRepository.wo}/work-orders/${w.id}/$part',
          );
        }
        if (w.data['serviceReportId'] != null) {
          final report = await repo.get(
            '${WorkspaceRepository.wo}/work-orders/${w.id}/service-report',
          );
          expect(report['workOrderId'], w.id);
          expect(report['customerSummary'], isA<String>());
        }
      }
      final branch = await repo.get(
        '/api/organization/branches/${work.technician['branchId']}',
      );
      expect(branch['name'], isA<String>());
      expect(
        (await repo.resolveQr(Platform.environment['PBL6_MOBILE_SMOKE_QR']!))
            .id,
        equipmentId,
      );
      await session.logout();
      expect(session.phase, SessionPhase.signedOut);
    },
    skip: gateway == null
        ? 'Opt-in: requires isolated seeded backend; see mobile-backend-reads.md.'
        : false,
  );
}
