import '../../core/api/api_exception.dart';
import '../session/session_models.dart';

const _invalid = ApiException('INVALID_RESPONSE');
bool _uuid(Object? value) =>
    value is String &&
    RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    ).hasMatch(value);
String _id(Map<String, dynamic> data, String key) {
  final value = data[key];
  if (!_uuid(value)) throw _invalid;
  return value as String;
}

String _date(Map<String, dynamic> data) {
  final value = jsonString(data, 'createdAt');
  if (DateTime.tryParse(value) == null) throw _invalid;
  return value;
}

/// Inventory quantities stay decimal strings; arithmetic checks use exact cents.
class PartQuantity {
  PartQuantity(Object? input) {
    if (input is! String ||
        !RegExp(r'^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$').hasMatch(input)) {
      throw _invalid;
    }
    value = input;
    final pieces = input.split('.');
    hundredths =
        BigInt.parse(pieces[0]) * BigInt.from(100) +
        BigInt.parse(pieces.length == 1 ? '0' : pieces[1].padRight(2, '0'));
  }
  late final String value;
  late final BigInt hundredths;
  bool get positive => hundredths > BigInt.zero;
}

class PartReturn {
  PartReturn(Map<String, dynamic> data, String usageId, String workOrderId)
    : id = _id(data, 'id'),
      quantity = PartQuantity(data['quantity']),
      createdAt = _date(data),
      condition = data['returnCondition'] as String? {
    if (!quantity.positive ||
        data['type'] != 'RETURN' ||
        (data['workOrderPartId'] != null &&
            data['workOrderPartId'] != usageId) ||
        (data['referenceId'] != null && data['referenceId'] != workOrderId) ||
        ![null, 'GOOD', 'DAMAGED', 'PENDING_INSPECTION'].contains(condition)) {
      throw _invalid;
    }
  }
  final String id, createdAt;
  final String? condition;
  final PartQuantity quantity;
}

class PartConfirmation {
  PartConfirmation(
    Map<String, dynamic> data,
    String usageId,
    String workOrderId,
  ) : id = _id(data, 'id'),
      kind = jsonString(data, 'kind'),
      quantity = PartQuantity(data['quantity']),
      createdAt = _date(data),
      reversesId = data['reversesId'] as String? {
    if (!quantity.positive ||
        !['CONFIRM', 'REVERSE'].contains(kind) ||
        data['workOrderPartId'] != usageId ||
        data['workOrderId'] != workOrderId ||
        (kind == 'REVERSE' ? !_uuid(reversesId) : reversesId != null)) {
      throw _invalid;
    }
  }
  final String id, kind, createdAt;
  final String? reversesId;
  final PartQuantity quantity;
}

/// Only the allowlisted read model is retained. Internal cost is not a customer price.
class PartUsage {
  PartUsage._(Map<String, dynamic> data, String orderId)
    : id = _id(data, 'id'),
      partId = _id(data, 'partId'),
      warehouseId = _id(data, 'warehouseId'),
      createdAt = _date(data),
      issued = PartQuantity(data['quantityIssued']),
      returned = PartQuantity(data['quantityReturned']),
      confirmed = PartQuantity(data['quantityConfirmedUsed']),
      outstanding = PartQuantity(data['quantityOutstanding']),
      unreconciled = PartQuantity(data['quantityUnreconciled']) {
    if (data['workOrderId'] != orderId ||
        !issued.positive ||
        issued.hundredths != PartQuantity(data['quantityUsed']).hundredths ||
        confirmed.hundredths !=
            PartQuantity(data['quantityConsumed']).hundredths ||
        issued.hundredths - returned.hundredths != outstanding.hundredths ||
        outstanding.hundredths - confirmed.hundredths !=
            unreconciled.hundredths) {
      throw _invalid;
    }
    final part = data['partSnapshot'] == null
        ? null
        : jsonObject(data['partSnapshot']);
    final warehouse = data['warehouseSnapshot'] == null
        ? null
        : jsonObject(data['warehouseSnapshot']);
    name = part == null ? null : jsonString(part, 'name');
    sku = part == null ? null : jsonString(part, 'sku');
    unit = part == null ? null : jsonString(part, 'unit');
    warehouseName = warehouse == null ? null : jsonString(warehouse, 'name');
    warehouseCode = warehouse == null ? null : jsonString(warehouse, 'code');
    returns = _list(data['returns'])
        .map((row) => PartReturn(row, id, orderId))
        .toList(growable: false);
    confirmations = _list(data['confirmations'])
        .map((row) => PartConfirmation(row, id, orderId))
        .toList(growable: false);
    if (returns.map((r) => r.id).toSet().length != returns.length ||
        confirmations.map((r) => r.id).toSet().length != confirmations.length) {
      throw _invalid;
    }
  }
  final String id, partId, warehouseId, createdAt;
  late final String? name, sku, unit, warehouseName, warehouseCode;
  final PartQuantity issued, returned, confirmed, outstanding, unreconciled;
  late final List<PartReturn> returns;
  late final List<PartConfirmation> confirmations;
  bool get incompleteHistory => name == null || warehouseName == null;
  bool get incompleteReturnHistory =>
      returns.fold(BigInt.zero, (sum, row) => sum + row.quantity.hundredths) !=
      returned.hundredths;
  bool isReversed(PartConfirmation confirmation) => confirmations.any(
    (row) => row.kind == 'REVERSE' && row.reversesId == confirmation.id,
  );
  static List<Map<String, dynamic>> _list(Object? value) {
    if (value is! List) throw _invalid;
    return value.map(jsonObject).toList(growable: false);
  }

  static List<PartUsage> forOrder(Object? value, String orderId) {
    try {
      final result = _list(value)
          .map((row) => PartUsage._(row, orderId))
          .toList(growable: false);
      if (result.map((r) => r.id).toSet().length != result.length) {
        throw _invalid;
      }
      return result;
    } on ApiException {
      rethrow;
    } catch (_) {
      throw _invalid;
    }
  }
}
