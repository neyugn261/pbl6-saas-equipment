import 'package:http/http.dart' as http;

import 'session_fixture.dart';

const equipmentId = '00000000-0000-4000-8000-000000001101';
const orderId = '00000000-0000-4000-8000-000000002101';
Map<String, dynamic> workOrder({
  String id = orderId,
  String status = 'IN_PROGRESS',
  bool current = true,
}) => {
  'id': id,
  'workOrderNo': 'WO-REAL-${id.length < 4 ? id : id.substring(id.length - 4)}',
  'title': 'Công việc từ API',
  'equipmentId': equipmentId,
  'customerId': 'customer-id',
  'type': 'REPAIR',
  'priority': 'HIGH',
  'status': status,
  'description': 'Nội dung từ backend',
  'createdAt': '2026-10-28T00:00:00Z',
  'scheduledStart': '2026-10-28T01:00:00Z',
  'scheduledEnd': '2026-10-28T03:00:00Z',
  'currentAssignment': current
      ? {
          'id': 'assignment',
          'technicianUserId': 'user-a',
          'technicianId': 'tech-a',
          'status': 'ACCEPTED',
          'assignedAt': '2026-10-28T00:00:00Z',
        }
      : null,
  'allowedActions': current ? ['hold', 'complete'] : [],
  'serviceReportId': status == 'COMPLETED' ? 'report-a' : null,
  'completedAt': status == 'COMPLETED' ? '2026-10-28T03:00:00Z' : null,
};
Map<String, dynamic> equipment() => {
  'id': equipmentId,
  'assetCode': 'ASSET-REAL-01',
  'displayName': 'Máy từ backend',
  'modelId': 'model-a',
  'customerId': 'customer-id',
  'customerSiteId': 'site-id',
  'serialNumber': 'SERIAL-REAL-01',
  'status': 'ACTIVE',
  'operationalStatus': 'UNKNOWN',
  'model': {
    'name': 'Model từ API',
    'modelCode': 'MODEL-01',
    'manufacturer': 'Hãng từ API',
  },
  'warranty': {'result': 'IN_WARRANTY'},
};
Map<String, dynamic> technician() => {
  'id': 'tech-a',
  'userId': 'user-a',
  'employeeCode': 'TECH-API',
  'status': 'BUSY',
  'branchId': 'branch-a',
  'skills': [
    {'skillId': 'skill-a', 'code': 'ELEC', 'name': 'Điện', 'level': 4},
  ],
};
Map<String, dynamic> available(Object? data) => {
  'status': 'AVAILABLE',
  'data': data,
  'fetchedAt': '2026-10-28T00:00:00Z',
};
Map<String, dynamic> page(
  List<Object?> items, {
  int? total,
  int number = 1,
  int size = 20,
}) => {
  'items': items,
  'total': total ?? items.length,
  'page': number,
  'pageSize': size,
};
Map<String, dynamic> dossier() => {
  'equipment': equipment(),
  'calendarCoverage': {'result': 'IN_WARRANTY'},
  'warranties': [
    {
      'id': 'warranty-a',
      'warrantyType': 'STANDARD',
      'startDate': '2026-01-01',
      'endDate': '2027-01-01',
    },
  ],
  'customer': available({'id': 'customer-id', 'name': 'Khách hàng từ API'}),
  'site': available({
    'id': 'site-id',
    'name': 'Địa điểm từ API',
    'address': 'Địa chỉ từ API',
  }),
  'location': available(null),
  'contacts': available([
    {'id': 'contact-a', 'name': 'Người liên hệ từ API', 'phone': '0900000000'},
  ]),
  'maintenance': {'status': 'RESTRICTED', 'data': null},
  'asOf': '2026-10-28T01:00:00Z',
};

/// Transport fixtures shaped like public backend DTOs, separate from UI preview.
http.Response workspaceResponse(http.Request r, SessionFixture f) {
  final path = r.url.path;
  if (path == '/api/workorders/technicians/me') {
    return jsonResponse(technician());
  }
  if (path == '/api/workorders/work-orders') {
    return jsonResponse(page([workOrder()], size: 100));
  }
  if (path == '/api/workorders/work-orders/$orderId') {
    return jsonResponse(workOrder());
  }
  if (path.endsWith('/dossier')) return jsonResponse(dossier());
  if (path == '/api/assets/equipment') {
    return jsonResponse(
      page([
        equipment(),
      ], number: int.parse(r.url.queryParameters['page'] ?? '1')),
    );
  }
  if (path == '/api/assets/equipment/$equipmentId' ||
      path.startsWith('/api/assets/qr/')) {
    return jsonResponse(equipment());
  }
  if (path.endsWith('/history')) {
    return jsonResponse([
      {
        'id': 'h1',
        'oldStatus': 'ASSIGNED',
        'newStatus': 'ACCEPTED',
        'changedBy': 'user-a',
        'changedAt': '2026-10-28T01:00:00Z',
      },
    ]);
  }
  if (path.endsWith('/assignments')) {
    return jsonResponse([
      {
        'id': 'a1',
        'technicianUserId': 'user-a',
        'status': 'ACCEPTED',
        'assignedAt': '2026-10-28T00:00:00Z',
      },
    ]);
  }
  if (path.endsWith('/logs')) {
    return jsonResponse([
      {
        'id': 'l1',
        'eventType': 'NOTE',
        'note': 'Nhật ký thật từ API',
        'actorUserId': 'user-a',
        'createdAt': '2026-10-28T01:30:00Z',
      },
    ]);
  }
  if (path.endsWith('/service-report')) {
    return jsonResponse({
      'id': 'r1',
      'workOrderId': orderId,
      'result': 'PARTIALLY_RESOLVED',
      'problemDescription': 'Chẩn đoán từ API',
      'solution': 'Giải pháp từ API',
      'customerSummary': 'Tóm tắt từ API',
      'submittedAt': '2026-10-28T02:00:00Z',
    });
  }
  if (path.endsWith('/timeline')) return jsonResponse(page([]));
  if (path == '/api/organization/branches/branch-a') {
    return jsonResponse({
      'id': 'branch-a',
      'name': 'Chi nhánh từ API',
      'code': 'CN-API',
    });
  }
  return f.standard(r);
}
