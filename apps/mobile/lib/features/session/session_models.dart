import '../../core/api/api_exception.dart';

Map<String, dynamic> jsonObject(Object? value) {
  if (value is! Map<String, dynamic>) {
    throw const ApiException('INVALID_RESPONSE');
  }
  return value;
}

String jsonString(Map<String, dynamic> value, String key) {
  final result = value[key];
  if (result is! String || result.isEmpty) {
    throw const ApiException('INVALID_RESPONSE');
  }
  return result;
}

class SessionTokens {
  const SessionTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.accessExpiresAt,
    required this.refreshExpiresAt,
  });
  final String accessToken;
  final String refreshToken;
  final DateTime accessExpiresAt;
  final DateTime refreshExpiresAt;

  factory SessionTokens.fromResponse(Object? response, DateTime now) {
    final data = jsonObject(response);
    final ttl = data['expiresIn'];
    final refreshExpiry = DateTime.tryParse(
      data['refreshTokenExpiresAt']?.toString() ?? '',
    );
    if (data['tokenType'] != 'Bearer' ||
        ttl is! int ||
        ttl <= 0 ||
        refreshExpiry == null ||
        !refreshExpiry.isAfter(now)) {
      throw const ApiException('INVALID_RESPONSE');
    }
    return SessionTokens(
      accessToken: jsonString(data, 'accessToken'),
      refreshToken: jsonString(data, 'refreshToken'),
      accessExpiresAt: now.add(Duration(seconds: ttl)),
      refreshExpiresAt: refreshExpiry.toUtc(),
    );
  }

  factory SessionTokens.fromStored(Map<String, dynamic> data) => SessionTokens(
    accessToken: jsonString(data, 'accessToken'),
    refreshToken: jsonString(data, 'refreshToken'),
    accessExpiresAt: DateTime.parse(jsonString(data, 'accessExpiresAt')),
    refreshExpiresAt: DateTime.parse(jsonString(data, 'refreshExpiresAt')),
  );

  Map<String, dynamic> toJson() => {
    'accessToken': accessToken,
    'refreshToken': refreshToken,
    'accessExpiresAt': accessExpiresAt.toUtc().toIso8601String(),
    'refreshExpiresAt': refreshExpiresAt.toUtc().toIso8601String(),
  };
}

class SessionUser {
  const SessionUser({
    required this.id,
    required this.tenantId,
    required this.email,
    required this.fullName,
    this.roles = const ['TECHNICIAN'],
  });
  final String id, tenantId, email, fullName;
  final List<String> roles;

  factory SessionUser.fromResponse(Object? response) {
    final data = jsonObject(response);
    final roles = data['roles'];
    if (data['userType'] != 'TENANT_STAFF' ||
        data['status'] != 'ACTIVE' ||
        roles is! List ||
        roles.any((r) => r is! String) ||
        !roles.contains('TECHNICIAN')) {
      throw const ApiException('TECHNICIAN_REQUIRED');
    }
    return SessionUser(
      id: jsonString(data, 'id'),
      tenantId: jsonString(data, 'tenantId'),
      email: jsonString(data, 'email'),
      fullName: jsonString(data, 'fullName'),
      roles: List<String>.unmodifiable(roles.whereType<String>()),
    );
  }
}

class StoredSession {
  const StoredSession(
    this.tokens,
    this.userId,
    this.tenantId, {
    this.refreshPending = false,
  });
  final SessionTokens tokens;
  final String userId, tenantId;
  final bool refreshPending;

  factory StoredSession.fromJson(Object? response) {
    final data = jsonObject(response);
    if (data['version'] != 1 || data['refreshPending'] is! bool) {
      throw const ApiException('INVALID_RESPONSE');
    }
    return StoredSession(
      SessionTokens.fromStored(jsonObject(data['tokens'])),
      jsonString(data, 'userId'),
      jsonString(data, 'tenantId'),
      refreshPending: data['refreshPending'] as bool,
    );
  }

  Map<String, dynamic> toJson() => {
    'version': 1,
    'tokens': tokens.toJson(),
    'userId': userId,
    'tenantId': tenantId,
    'refreshPending': refreshPending,
  };
}
