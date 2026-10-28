import 'package:flutter/foundation.dart';

import '../../core/api/api_exception.dart';
import '../session/session_models.dart' show jsonString;
import 'workspace_repository.dart';

const technicianTransitions = <String, String>{
  'accept': 'ACCEPTED',
  'reject': 'CREATED',
  'start-travel': 'TRAVELLING',
  'start': 'IN_PROGRESS',
  'hold': 'ON_HOLD',
  'resume': 'IN_PROGRESS',
  'complete': 'COMPLETED',
};
const commandLabels = <String, String>{
  'accept': 'Nhận việc',
  'reject': 'Từ chối công việc',
  'start-travel': 'Bắt đầu di chuyển',
  'start': 'Bắt đầu công việc',
  'hold': 'Tạm dừng công việc',
  'resume': 'Tiếp tục công việc',
  'complete': 'Gửi báo cáo và hoàn thành',
  'logs': 'Gửi ghi chú',
};

/// One command at a time per WO, including across routes sharing the repository.
/// The backend owns authorization and row locking. No mutation is auto-replayed.
class WorkOrderWorkflow extends ChangeNotifier {
  WorkOrderWorkflow(this.repo, this.id);
  final WorkspaceRepository repo;
  final String id;
  WorkOrder? order;
  ApiException? loadError;
  String? notice;
  bool loading = true, busy = false;
  bool _disposed = false;
  int revision = 0;
  Json? confirmedReport;
  PendingWorkOrderCommand? get pending => repo.pendingCommands[id];
  bool get uncertain => pending != null;
  bool can(String action) =>
      !loading &&
      !busy &&
      !uncertain &&
      repo.write != null &&
      (order?.allows(action, repo.user.id) ?? false);
  bool get canNote =>
      !loading &&
      !busy &&
      !uncertain &&
      repo.write != null &&
      (order?.currentFor(repo.user.id) ?? false);
  void dismissNotice() {
    notice = null;
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  Future<void> load() async {
    if (_disposed || busy) return;
    if (pending != null && !pending!.inFlight) {
      await checkOutcome();
      return;
    }
    notice = null;
    loading = true;
    loadError = null;
    _notify();
    try {
      order = await repo.order(id);
      revision++;
    } on ApiException catch (e) {
      order = null;
      loadError = e;
    } finally {
      loading = false;
      _notify();
    }
  }

  bool _sameVersion(WorkOrder a, WorkOrder b) =>
      a.status == b.status &&
      nested(a.data, 'currentAssignment')['id'] ==
          nested(b.data, 'currentAssignment')['id'] &&
      a.data['updatedAt'] == b.data['updatedAt'];

  Future<bool> execute(String action, {Json body = const {}}) async {
    if (_disposed || busy || uncertain || loading || order == null) {
      return false;
    }
    final before = order!;
    if (action == 'logs' ? !canNote : !can(action)) {
      notice =
          'Thao tác không còn phù hợp với trạng thái hoặc phân công của bạn.';
      _notify();
      return false;
    }
    final attempt = PendingWorkOrderCommand(
      action,
      Map.unmodifiable(body),
      before,
    );
    repo.pendingCommands[id] = attempt;
    busy = true;
    notice = null;
    confirmedReport = null;
    _notify();
    try {
      final fresh = await repo.order(id);
      order = fresh;
      if (!_sameVersion(before, fresh) ||
          (action == 'logs'
              ? !fresh.currentFor(repo.user.id)
              : !fresh.allows(action, repo.user.id))) {
        throw const ApiException('WORK_ORDER_CHANGED', status: 409);
      }
      if (action == 'logs') {
        attempt.beforeLogIds.addAll(
          (await repo.list('${WorkspaceRepository.wo}/work-orders/$id/logs'))
              .map((j) => jsonString(j, 'id')),
        );
      } else if (action != 'complete') {
        attempt.beforeHistoryIds.addAll(
          (await repo.list('${WorkspaceRepository.wo}/work-orders/$id/history'))
              .map((j) => jsonString(j, 'id')),
        );
      }
      if (_disposed) throw const ApiException('SESSION_CHANGED');
      attempt.attempted = true;
      final response = object(await repo.post(id, action, attempt.body));
      if (action == 'logs') {
        if (response['note'] != body['note'] ||
            response['actorUserId'] != repo.user.id ||
            response['id'] is! String) {
          throw const ApiException('INVALID_RESPONSE');
        }
      } else {
        final updated = WorkOrder(response);
        if (updated.id != id ||
            updated.status != technicianTransitions[action] ||
            (action == 'complete' && updated.data['serviceReportId'] == null)) {
          throw const ApiException('INVALID_RESPONSE');
        }
        order = updated;
      }
      repo.pendingCommands.remove(id);
      revision++;
      notice = '${commandLabels[action]} thành công.';
      repo.changed();
      return true;
    } catch (error) {
      final e = error is ApiException
          ? error
          : const ApiException('INVALID_RESPONSE');
      final definiteFailure =
          !attempt.attempted ||
          (e.status != null && e.status! >= 400 && e.status! < 500) ||
          [
            'CHECK_BEFORE_RETRY',
            'SESSION_CHANGED',
            'SESSION_EXPIRED',
            'READ_ONLY',
            'INVALID_COMMAND',
          ].contains(e.code);
      if (definiteFailure) {
        repo.pendingCommands.remove(id);
        notice = e.status == 409
            ? 'Công việc đã thay đổi. Đã tải lại; kiểm tra trạng thái và phân công trước khi thao tác.'
            : e.userMessage;
        if (!_disposed) await _readAfterFailure();
      } else {
        attempt.inFlight = false;
        notice = 'Chưa xác định máy chủ đã nhận thao tác hay chưa. Đang kiểm tra; không gửi lại.';
        return await _reconcile(attempt);
      }
      return false;
    } finally {
      attempt.inFlight = false;
      busy = false;
      loading = false;
      _notify();
    }
  }

  Future<void> _readAfterFailure() async {
    try {
      order = await repo.order(id);
      revision++;
      repo.changed();
    } on ApiException catch (e) {
      order = null;
      loadError = e;
    }
  }

  Future<bool> checkOutcome() async {
    final attempt = pending;
    if (_disposed || busy || attempt == null || attempt.inFlight) return false;
    busy = true;
    loadError = null;
    _notify();
    try {
      return await _reconcile(attempt);
    } finally {
      busy = false;
      loading = false;
      _notify();
    }
  }

  Future<bool> _reconcile(PendingWorkOrderCommand attempt) async {
    try {
      final fresh = await repo.order(id);
      order = fresh;
      revision++;
      var found = false;
      if (attempt.action == 'complete' && fresh.status == 'COMPLETED') {
        final report = await repo.get(
          '${WorkspaceRepository.wo}/work-orders/$id/service-report',
        );
        if (report['workOrderId'] != id ||
            report['id'] != fresh.data['serviceReportId']) {
          throw const ApiException('INVALID_RESPONSE');
        }
        confirmedReport = report;
        found =
            report['technicianId'] ==
                nested(
                  attempt.before.data,
                  'currentAssignment',
                )['technicianId'] &&
            [
              'problemDescription',
              'solution',
              'result',
              'customerSummary',
            ].every((k) => report[k] == attempt.body[k]) &&
            (report['rootCause'] ?? '') == (attempt.body['rootCause'] ?? '');
        if (!found) {
          repo.pendingCommands.remove(id);
          notice = 'Công việc đã hoàn thành trên máy chủ với báo cáo khác nội dung đang nhập. Hãy xem lại báo cáo; không gửi lại.';
          repo.changed();
          return false;
        }
      } else if (attempt.action == 'logs') {
        final logs = await repo.list(
          '${WorkspaceRepository.wo}/work-orders/$id/logs',
        );
        found = logs.any(
          (j) =>
              !attempt.beforeLogIds.contains(j['id']) &&
              j['actorUserId'] == repo.user.id &&
              j['technicianId'] ==
                  nested(
                    attempt.before.data,
                    'currentAssignment',
                  )['technicianId'] &&
              j['note'] == attempt.body['note'],
        );
      } else if (attempt.action != 'complete') {
        final history = await repo.list(
          '${WorkspaceRepository.wo}/work-orders/$id/history',
        );
        found = history.any(
          (j) =>
              !attempt.beforeHistoryIds.contains(j['id']) &&
              j['changedBy'] == repo.user.id &&
              j['oldStatus'] == attempt.before.status &&
              j['newStatus'] == technicianTransitions[attempt.action] &&
              (attempt.body['reason'] == null ||
                  j['reason'] == attempt.body['reason']),
        );
      }
      if (found) {
        repo.pendingCommands.remove(id);
        notice = attempt.action == 'logs'
            ? 'Đã tìm thấy ghi chú trên máy chủ. Không gửi lại.'
            : 'Đã xác nhận kết quả trên máy chủ. Không gửi lại thao tác.';
        repo.changed();
        return true;
      }
      if (fresh.terminal ||
          !fresh.currentFor(repo.user.id) ||
          nested(fresh.data, 'currentAssignment')['id'] !=
              nested(attempt.before.data, 'currentAssignment')['id']) {
        repo.pendingCommands.remove(id);
        notice = 'Trạng thái hoặc phân công đã thay đổi. Chưa xác nhận thao tác trước đó; xem lịch sử và không gửi lại nội dung cũ.';
        repo.changed();
        return false;
      }
      notice = 'Chưa tìm thấy bằng chứng thao tác đã hoàn tất. Gửi lại đang bị khóa; chọn Kiểm tra kết quả để đọc lại máy chủ.';
      return false;
    } on ApiException catch (e) {
      if (e.status == 403 || e.status == 404) {
        order = null;
        loadError = e;
      }
      notice =
          'Chưa kiểm tra được kết quả. ${e.userMessage} Không gửi lại thao tác.';
      return false;
    }
  }
}
