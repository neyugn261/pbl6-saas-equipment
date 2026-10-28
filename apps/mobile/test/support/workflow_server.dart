import 'dart:convert';

import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/session/session_models.dart';
import 'package:pbl6_technician/features/workspace/workspace_repository.dart';

import 'workspace_fixture.dart' as fixture;

const workflowUser = SessionUser(
  id: 'user-a',
  tenantId: 'tenant-a',
  email: 'tech@test.local',
  fullName: 'Technician',
);
const validReport = <String, dynamic>{
  'problemDescription': 'Chẩn đoán nội bộ',
  'rootCause': 'Nguyên nhân nội bộ',
  'solution': 'Đã sửa kết nối',
  'result': 'RESOLVED',
  'customerSummary': 'Thiết bị đã được xử lý',
};

class WorkflowServer {
  WorkflowServer([String status = 'ASSIGNED']) {
    setStatus(status);
  }
  late Json current;
  final history = <Json>[], logs = <Json>[], requests = <String>[];
  Json? report, lastBody;
  int writes = 0, version = 0;
  bool timeoutAfterApply = false, timeoutBeforeApply = false;
  Future<void> Function(String)? beforeRead;
  Future<void> Function(String)? beforeWrite;
  Object? clone(Object? value) => jsonDecode(jsonEncode(value));
  void setStatus(
    String status, {
    String owner = 'user-a',
    String assignmentId = 'assignment',
  }) {
    version++;
    current = fixture.workOrder(
      status: status,
      current: !['CREATED', 'CANCELLED', 'COMPLETED'].contains(status),
    );
    current['updatedAt'] = 'version-$version';
    if (current['currentAssignment'] != null) {
      current['currentAssignment'] = {
        ...object(current['currentAssignment']),
        'id': assignmentId,
        'technicianUserId': owner,
        'status': status == 'ASSIGNED' ? 'ASSIGNED' : 'ACCEPTED',
      };
    }
    current['allowedActions'] = owner != 'user-a'
        ? <String>[]
        : switch (status) {
            'ASSIGNED' => ['accept', 'reject'],
            'ACCEPTED' => ['start-travel', 'start'],
            'TRAVELLING' => ['start'],
            'IN_PROGRESS' => ['hold', 'complete'],
            'ON_HOLD' => ['resume'],
            _ => <String>[],
          };
  }

  Future<Object?> read(String path) async {
    requests.add('GET $path');
    await beforeRead?.call(path);
    if (path.endsWith('/history')) return clone(history);
    if (path.endsWith('/logs')) return clone(logs);
    if (path.endsWith('/service-report')) {
      if (report == null) {
        throw const ApiException('SERVICE_REPORT_NOT_FOUND', status: 404);
      }
      return clone(report);
    }
    if (path.endsWith('/assignments')) {
      return clone([
        if (current['currentAssignment'] != null) current['currentAssignment'],
      ]);
    }
    if (path.endsWith('/dossier')) return fixture.dossier();
    if (path.contains('/work-orders/')) return clone(current);
    throw const ApiException('NOT_FOUND', status: 404);
  }

  void apply(String action, Json body) {
    if (action == 'logs') {
      logs.add({
        'id': 'log-${logs.length}',
        'note': body['note'],
        'actorUserId': 'user-a',
        'technicianId': 'tech-a',
        'createdAt': '2026-10-29T01:00:00Z',
      });
      return;
    }
    final old = current['status'];
    final next = {
      'accept': 'ACCEPTED',
      'reject': 'CREATED',
      'start-travel': 'TRAVELLING',
      'start': 'IN_PROGRESS',
      'hold': 'ON_HOLD',
      'resume': 'IN_PROGRESS',
      'complete': 'COMPLETED',
    }[action]!;
    setStatus(next);
    history.add({
      'id': 'h-${history.length}',
      'oldStatus': old,
      'newStatus': next,
      'changedBy': 'user-a',
      'reason': body['reason'],
      'changedAt': '2026-10-29T01:00:00Z',
    });
    if (action == 'complete') {
      report = {
        'id': 'report-a',
        'workOrderId': fixture.orderId,
        'technicianId': 'tech-a',
        ...body,
        'submittedAt': '2026-10-29T01:00:00Z',
      };
      current['serviceReportId'] = 'report-a';
    }
  }

  Future<Object?> write(String path, Json body) async {
    writes++;
    requests.add('POST $path');
    lastBody = object(clone(body));
    final action = path.split('/').last;
    await beforeWrite?.call(action);
    if (timeoutBeforeApply) throw const ApiException('TIMEOUT');
    apply(action, body);
    if (timeoutAfterApply) throw const ApiException('TIMEOUT');
    return clone(action == 'logs' ? logs.last : current);
  }

  WorkspaceRepository repository() =>
      WorkspaceRepository(read, workflowUser, write: write);
}
