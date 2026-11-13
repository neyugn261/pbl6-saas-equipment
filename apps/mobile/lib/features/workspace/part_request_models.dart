import 'dart:math';

/// Utility to generate cryptographically random UUID v4 for idempotency keys.
String newUuid() {
  final bytes = List<int>.generate(16, (_) => Random.secure().nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// Catalog part item returned from search API /api/inventory/parts
class CatalogPart {
  const CatalogPart({
    required this.id,
    required this.name,
    required this.sku,
    required this.unit,
    this.allowFractional = false,
    this.status = 'ACTIVE',
  });

  final String id;
  final String name;
  final String sku;
  final String unit;
  final bool allowFractional;
  final String status;

  factory CatalogPart.fromJson(Map<String, dynamic> json) => CatalogPart(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? '',
    sku: json['sku'] as String? ?? '',
    unit: json['unit'] as String? ?? 'Cái',
    allowFractional: json['allowFractional'] == true,
    status: json['status'] as String? ?? 'ACTIVE',
  );
}

/// A line in a Part Request
class PartRequestLine {
  const PartRequestLine({
    required this.id,
    required this.partId,
    this.name,
    this.sku,
    this.unit,
    required this.quantityRequested,
    required this.quantityIssued,
    required this.quantityRemainingToIssue,
  });

  final String id;
  final String partId;
  final String? name;
  final String? sku;
  final String? unit;
  final String quantityRequested;
  final String quantityIssued;
  final String quantityRemainingToIssue;

  factory PartRequestLine.fromJson(Map<String, dynamic> json) {
    final snapshot = json['partSnapshot'] as Map<String, dynamic>?;
    return PartRequestLine(
      id: json['id'] as String? ?? '',
      partId: json['partId'] as String? ?? '',
      name: snapshot?['name'] as String?,
      sku: snapshot?['sku'] as String?,
      unit: snapshot?['unit'] as String?,
      quantityRequested: json['quantityRequested']?.toString() ?? '0',
      quantityIssued: json['quantityIssued']?.toString() ?? '0',
      quantityRemainingToIssue:
          json['quantityRemainingToIssue']?.toString() ?? '0',
    );
  }
}

/// A Part Request record from /api/inventory/part-requests
class PartRequest {
  const PartRequest({
    required this.id,
    required this.requestNo,
    required this.workOrderId,
    this.workOrderNo,
    required this.status,
    required this.fulfillmentStatus,
    required this.reason,
    required this.version,
    required this.createdAt,
    this.closedAt,
    this.closingReason,
    required this.lines,
    this.allowedActions = const [],
  });

  final String id;
  final String requestNo;
  final String workOrderId;
  final String? workOrderNo;
  final String status; // OPEN, CLOSED, CANCELLED, REJECTED
  final String fulfillmentStatus; // NOT_ISSUED, PARTIALLY_ISSUED, FULLY_ISSUED
  final String reason;
  final int version;
  final String createdAt;
  final String? closedAt;
  final String? closingReason;
  final List<PartRequestLine> lines;
  final List<String> allowedActions;

  bool get canCancel => status == 'OPEN' && allowedActions.contains('cancel');

  factory PartRequest.fromJson(Map<String, dynamic> json) {
    final rawLines = json['lines'] as List? ?? [];
    return PartRequest(
      id: json['id'] as String? ?? '',
      requestNo: json['requestNo'] as String? ?? '',
      workOrderId: json['workOrderId'] as String? ?? '',
      workOrderNo: json['workOrderNo'] as String?,
      status: json['status'] as String? ?? 'OPEN',
      fulfillmentStatus: json['fulfillmentStatus'] as String? ?? 'NOT_ISSUED',
      reason: json['reason'] as String? ?? '',
      version: json['version'] as int? ?? 1,
      createdAt: json['createdAt'] as String? ?? '',
      closedAt: json['closedAt'] as String?,
      closingReason: json['closingReason'] as String?,
      lines: rawLines
          .whereType<Map<String, dynamic>>()
          .map(PartRequestLine.fromJson)
          .toList(),
      allowedActions: (json['allowedActions'] as List? ?? [])
          .map((e) => e.toString())
          .toList(),
    );
  }
}

/// A Return Request record from /api/inventory/return-requests
class PartReturnRequest {
  const PartReturnRequest({
    required this.id,
    required this.requestNo,
    required this.workOrderId,
    required this.workOrderPartId,
    required this.status,
    required this.receiptStatus,
    required this.reason,
    required this.version,
    required this.quantityRequested,
    required this.quantityReceived,
    required this.quantityPendingReceipt,
    required this.createdAt,
    this.partName,
    this.partSku,
    this.partUnit,
    this.allowedActions = const [],
  });

  final String id;
  final String requestNo;
  final String workOrderId;
  final String workOrderPartId;
  final String status; // OPEN, CLOSED, CANCELLED
  final String receiptStatus; // NOT_RECEIVED, PARTIALLY_RECEIVED, RECEIVED
  final String reason;
  final int version;
  final String quantityRequested;
  final String quantityReceived;
  final String quantityPendingReceipt;
  final String createdAt;
  final String? partName;
  final String? partSku;
  final String? partUnit;
  final List<String> allowedActions;

  bool get canCancel => status == 'OPEN' && allowedActions.contains('cancel');

  factory PartReturnRequest.fromJson(Map<String, dynamic> json) {
    final usage = json['usage'] as Map<String, dynamic>?;
    final snapshot = usage?['partSnapshot'] as Map<String, dynamic>?;
    return PartReturnRequest(
      id: json['id'] as String? ?? '',
      requestNo: json['requestNo'] as String? ?? '',
      workOrderId: json['workOrderId'] as String? ?? '',
      workOrderPartId: json['workOrderPartId'] as String? ?? '',
      status: json['status'] as String? ?? 'OPEN',
      receiptStatus: json['receiptStatus'] as String? ?? 'NOT_RECEIVED',
      reason: json['reason'] as String? ?? '',
      version: json['version'] as int? ?? 1,
      quantityRequested: json['quantityRequested']?.toString() ?? '0',
      quantityReceived: json['quantityReceived']?.toString() ?? '0',
      quantityPendingReceipt: json['quantityPendingReceipt']?.toString() ?? '0',
      createdAt: json['createdAt'] as String? ?? '',
      partName: snapshot?['name'] as String?,
      partSku: snapshot?['sku'] as String?,
      partUnit: snapshot?['unit'] as String?,
      allowedActions: (json['allowedActions'] as List? ?? [])
          .map((e) => e.toString())
          .toList(),
    );
  }
}
