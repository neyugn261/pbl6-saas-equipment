import 'package:flutter/foundation.dart';

import '../../core/api/api_exception.dart';
import '../session/session_models.dart';

typedef Json = Map<String, dynamic>;
typedef GatewayRead = Future<Object?> Function(String path);
typedef GatewayWrite = Future<Object?> Function(String path, Json body);

Json object(Object? value) => jsonObject(value);
List<Json> rows(Object? value) {
  if (value is! List) throw const ApiException('INVALID_RESPONSE');
  return value.map(object).toList(growable: false);
}

String text(Json row, String key, [String fallback = 'Chưa ghi nhận']) =>
    row[key] is String && (row[key] as String).isNotEmpty
    ? row[key] as String
    : fallback;
Json nested(Json row, String key) =>
    row[key] is Map<String, dynamic> ? object(row[key]) : const {};

// The business calendar uses Asia/Ho_Chi_Minh, independent of device timezone.
// UTC containers hold wall-clock components; convert to UTC before API queries.
DateTime vietnamTime(DateTime instant) =>
    instant.toUtc().add(const Duration(hours: 7));
DateTime businessToday([DateTime? now]) {
  final d = vietnamTime(now ?? DateTime.now());
  return DateTime.utc(d.year, d.month, d.day);
}

DateTime? apiDate(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;
DateTime? wallTime(Object? value) {
  final d = apiDate(value);
  return d == null ? null : vietnamTime(d);
}

String dateText(Object? value, {bool time = false}) {
  if (value == null) return 'Chưa ghi nhận';
  // SQL DATE values represent calendar dates, not instants.
  final d = value is DateTime
      ? value
      : value is String && value.length == 10
      ? apiDate(value)
      : wallTime(value);
  if (d == null) return 'Chưa ghi nhận';
  final day =
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
  return time
      ? '$day · ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}'
      : day;
}

bool sameDate(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

String label(String code) =>
    const {
      'CREATED': 'Chờ phân công',
      'ASSIGNED': 'Chờ tiếp nhận',
      'ACCEPTED': 'Đã tiếp nhận',
      'TRAVELLING': 'Đang di chuyển',
      'IN_PROGRESS': 'Đang thực hiện',
      'IN_PROGRESS,TRAVELLING': 'Thực hiện / Di chuyển',
      'ON_HOLD': 'Tạm dừng',
      'COMPLETED': 'Đã hoàn thành',
      'CANCELLED': 'Đã hủy',
      'REJECTED': 'Đã từ chối',
      'UNASSIGNED': 'Đã gỡ phân công',
      'LOW': 'Thấp',
      'NORMAL': 'Bình thường',
      'HIGH': 'Cao',
      'URGENT': 'Khẩn cấp',
      'REPAIR': 'Sửa chữa',
      'WARRANTY': 'Bảo hành',
      'MAINTENANCE': 'Bảo trì',
      'INSPECTION': 'Kiểm tra',
      'RESOLVED': 'Đã xử lý',
      'PARTIALLY_RESOLVED': 'Xử lý một phần',
      'UNRESOLVED': 'Chưa xử lý được',
      'UNKNOWN': 'Chưa xác nhận',
      'OPERATIONAL': 'Hoạt động',
      'DEGRADED': 'Suy giảm',
      'NOT_OPERATIONAL': 'Không hoạt động',
      'IN_WARRANTY': 'Còn bảo hành',
      'OUT_OF_WARRANTY': 'Ngoài bảo hành',
      'NO_WARRANTY': 'Chưa có bảo hành',
      'AVAILABLE': 'Sẵn sàng',
      'BUSY': 'Đang bận',
      'OFF_DUTY': 'Ngoài ca',
      'INACTIVE': 'Không hoạt động',
      'ACTIVE': 'Đang sử dụng',
      'RETIRED': 'Ngừng sử dụng',
      'IN_SERVICE': 'Đang được bảo dưỡng',
      'OUT_OF_SERVICE': 'Dừng sử dụng',
      'NEW': 'Mới',
      'PROCESSING': 'Đang xử lý',
      'CLOSED': 'Đã đóng',
      'REVIEWING': 'Đang xem xét',
      'TENANT_STAFF': 'Nhân viên',
      'TECHNICIAN': 'Kỹ thuật viên',
      'ACCEPT': 'Tiếp nhận',
      'REJECT': 'Từ chối',
      'START_TRAVEL': 'Bắt đầu di chuyển',
      'START': 'Bắt đầu thực hiện',
      'HOLD': 'Tạm dừng',
      'RESUME': 'Tiếp tục thực hiện',
      'COMPLETE': 'Hoàn thành',
      'CANCEL': 'Hủy',
      'ASSIGN': 'Phân công',
      'NOTE': 'Ghi chú',
      'COMMENT_ADDED': 'Trao đổi',
      'REGISTERED': 'Đăng ký thiết bị',
      'UPDATED': 'Cập nhật hồ sơ',
      'RELOCATED': 'Di chuyển thiết bị',
      'WORK_ORDER_COMPLETED': 'Hoàn thành công việc',
      'SERVICE_REQUEST_CREATED': 'Tạo yêu cầu dịch vụ',
      'SERVICE_REQUEST_STATUS_CHANGED': 'Thay đổi trạng thái yêu cầu',
      'WARRANTY_CREATED': 'Thêm bảo hành',
      'WARRANTY_UPDATED': 'Cập nhật bảo hành',
      'QR_ISSUED': 'Cấp mã QR',
      'QR_REVOKED': 'Thu hồi mã QR',
      'STANDARD': 'Tiêu chuẩn',
      'EXTENDED': 'Mở rộng',
      'DRAFT': 'Bản nháp',
      'SENT': 'Đã gửi',
      'APPROVED': 'Đã chấp thuận',
      'EXPIRED': 'Hết hiệu lực',
      'BASIC': 'Cơ bản',
      'INTERMEDIATE': 'Trung cấp',
      'ADVANCED': 'Nâng cao',
      'EXPERT': 'Chuyên gia',
    }[code] ??
    code;

class PageData<T> {
  const PageData(this.items, this.total, this.page, this.pageSize);
  final List<T> items;
  final int total, page, pageSize;
  bool get hasNext => page * pageSize < total;
  static PageData<T> parse<T>(Object? value, T Function(Json) parse) {
    final data = object(value);
    final total = data['total'], page = data['page'], size = data['pageSize'];
    if (total is! int ||
        total < 0 ||
        page is! int ||
        page < 1 ||
        size is! int ||
        size < 1) {
      throw const ApiException('INVALID_RESPONSE');
    }
    final items = rows(data['items']).map(parse).toList(growable: false);
    if (items.length > size || items.length > total) {
      throw const ApiException('INVALID_RESPONSE');
    }
    return PageData(items, total, page, size);
  }
}

class WorkOrder {
  WorkOrder(this.data)
    : id = jsonString(data, 'id'),
      number = jsonString(data, 'workOrderNo'),
      title = jsonString(data, 'title'),
      equipmentId = jsonString(data, 'equipmentId'),
      status = jsonString(data, 'status');
  final Json data;
  final String id, number, title, equipmentId, status;
  bool get terminal => ['COMPLETED', 'CANCELLED'].contains(status);
  DateTime? get start => wallTime(data['scheduledStart']);
  DateTime? get end => wallTime(data['scheduledEnd']);
  bool allows(String action, String userId) =>
      currentFor(userId) &&
      (data['allowedActions'] is List &&
          (data['allowedActions'] as List).contains(action)) &&
      (const {
            'accept': ['ASSIGNED'],
            'reject': ['ASSIGNED'],
            'start-travel': ['ACCEPTED'],
            'start': ['ACCEPTED', 'TRAVELLING'],
            'hold': ['IN_PROGRESS'],
            'resume': ['ON_HOLD'],
            'complete': ['IN_PROGRESS'],
          }[action]?.contains(status) ??
          false);
  bool currentFor(String userId) {
    final a = nested(data, 'currentAssignment');
    return !terminal &&
        a['technicianUserId'] == userId &&
        ['ASSIGNED', 'ACCEPTED'].contains(a['status']);
  }
}

class Equipment {
  Equipment(this.data)
    : id = jsonString(data, 'id'),
      code = jsonString(data, 'assetCode');
  final Json data;
  final String id, code;
  String get name =>
      text(data, 'displayName', text(nested(data, 'model'), 'name', code));
}

/// Session-local uncertainty marker. Never an offline queue and never replayed.
class PendingWorkOrderCommand {
  PendingWorkOrderCommand(this.action, this.body, this.before);
  final String action;
  final Json body;
  final WorkOrder before;
  final beforeLogIds = <String>{};
  final beforeHistoryIds = <String>{};
  bool attempted = false;
  bool inFlight = true;
}

class PersonalWork {
  const PersonalWork(this.technician, this.orders, this.userId);
  final Json technician;
  final List<WorkOrder> orders;
  final String userId;
  List<WorkOrder> get current =>
      orders.where((w) => w.currentFor(userId)).toList();
  List<WorkOrder> get history =>
      orders.where((w) => !w.currentFor(userId)).toList();
}

/// Public Gateway reads and Technician commands. No credentials or DB access.
/// No durable business cache: a workspace and its data die with the session.
class WorkspaceRepository extends ChangeNotifier {
  WorkspaceRepository(this.read, this.user, {this.write});
  final GatewayRead read;
  final GatewayWrite? write;
  final SessionUser user;
  final pendingCommands = <String, PendingWorkOrderCommand>{};
  bool _closed = false;
  void changed() {
    if (!_closed) notifyListeners();
  }

  @override
  void dispose() {
    _closed = true;
    super.dispose();
  }

  Future<Object?> post(String id, String action, Json body) async {
    if (_closed) throw const ApiException('SESSION_CHANGED');
    if (![
      'accept',
      'reject',
      'start-travel',
      'start',
      'hold',
      'resume',
      'complete',
      'logs',
    ].contains(action)) {
      throw const ApiException('INVALID_COMMAND');
    }
    if (write == null) throw const ApiException('READ_ONLY');
    return write!('$wo/work-orders/$id/$action', body);
  }

  static const wo = '/api/workorders';
  static const asset = '/api/assets';
  String path(String base, [Map<String, String> query = const {}]) =>
      Uri(path: base, queryParameters: query.isEmpty ? null : query).toString();
  Future<Json> get(String path) async => object(await read(path));
  Future<List<Json>> list(String path) async => rows(await read(path));

  Future<Json> technician() async {
    final t = await get('$wo/technicians/me');
    jsonString(t, 'id');
    if (t['userId'] != user.id) throw const ApiException('INVALID_RESPONSE');
    rows(t['skills']);
    return t;
  }

  Future<PersonalWork> personalWork() async {
    final t = await technician();
    final all = <WorkOrder>[];
    final seen = <String>{};
    var page = 1;
    int? expectedTotal, expectedPageSize;
    // The current API has no historical "assigned to me" filter. Technician-only
    // reads are already scoped to ever-assigned by the backend. For mixed roles,
    // verify each candidate's assignments before adding it to the personal view.
    // Fetch every page before showing counts/history; never present a truncated
    // page as the full personal workload. A future contract can optimize this.
    while (true) {
      final result = PageData.parse(
        await read(
          path('$wo/work-orders', {
            'page': '$page',
            'pageSize': '100',
            'sort': 'createdAt',
          }),
        ),
        WorkOrder.new,
      );
      expectedTotal ??= result.total;
      expectedPageSize ??= result.pageSize;
      if (result.total != expectedTotal ||
          result.pageSize != expectedPageSize) {
        throw const ApiException('READ_CHANGED');
      }
      if (result.page != page || (result.items.isEmpty && result.hasNext)) {
        throw const ApiException('INVALID_RESPONSE');
      }
      for (var i = 0; i < result.items.length; i += 4) {
        final batch = result.items.skip(i).take(4);
        final checked = await Future.wait(
          batch.map((w) async {
            if (!seen.add(w.id)) throw const ApiException('READ_CHANGED');
            if (user.roles.every((r) => r == 'TECHNICIAN')) return w;
            final assignments = await list(
              '$wo/work-orders/${w.id}/assignments',
            );
            return assignments.any((a) => a['technicianUserId'] == user.id)
                ? w
                : null;
          }),
        );
        all.addAll(checked.whereType<WorkOrder>());
      }
      if (!result.hasNext) {
        if (seen.length != result.total) {
          throw const ApiException('READ_CHANGED');
        }
        break;
      }
      page++;
    }
    return PersonalWork(t, List.unmodifiable(all), user.id);
  }

  Future<WorkOrder> order(String id) async =>
      WorkOrder(await get('$wo/work-orders/$id'));
  Future<Equipment> equipment(String id) async =>
      Equipment(await get('$asset/equipment/$id'));
  Future<Json> dossier(String id) async {
    final d = await get('$asset/equipment/$id/dossier');
    if (Equipment(object(d['equipment'])).id != id) {
      throw const ApiException('INVALID_RESPONSE');
    }
    rows(d['warranties']);
    for (final key in [
      'customer',
      'site',
      'contacts',
      'location',
      'maintenance',
    ]) {
      final section = object(d[key]);
      if (![
        'AVAILABLE',
        'RESTRICTED',
        'UNAVAILABLE',
        'NOT_CONFIGURED',
        'NOT_FOUND',
      ].contains(section['status'])) {
        throw const ApiException('INVALID_RESPONSE');
      }
      if (section['status'] == 'AVAILABLE' && section['data'] != null) {
        key == 'contacts' ? rows(section['data']) : object(section['data']);
      }
    }
    return d;
  }

  Future<PageData<Equipment>> equipmentPage(Map<String, String> query) async =>
      PageData.parse(
        await read(path('$asset/equipment', query)),
        Equipment.new,
      );
  Future<Equipment> resolveQr(String token) async =>
      Equipment(await get('$asset/qr/${Uri.encodeComponent(token)}'));
}
