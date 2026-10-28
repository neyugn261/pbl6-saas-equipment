import 'package:flutter/foundation.dart';

import '../../core/api/api_exception.dart';
import '../../core/api/gateway_client.dart';
import 'session_models.dart';
import 'session_store.dart';

enum SessionPhase { loading, signedOut, authenticated, unavailable }

class SessionController extends ChangeNotifier {
  SessionController(this._api, this._store, {DateTime Function()? now})
    : _now = now ?? DateTime.now;
  final GatewayClient _api;
  final SessionStore _store;
  final DateTime Function() _now;
  SessionPhase _phase = SessionPhase.loading;
  SessionUser? _user;
  StoredSession? _session;
  Future<SessionTokens>? _refreshFlight;
  Future<void>? _logoutFlight;
  bool _busy = false, _disposed = false;
  int _epoch = 0;
  String? _message;

  SessionPhase get phase => _phase;
  SessionUser? get user => _user;
  bool get busy => _busy;
  String? get message => _message;

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  void _check(int epoch) {
    if (_disposed || epoch != _epoch) {
      throw const ApiException('SESSION_CHANGED');
    }
  }

  Future<void> restore() async {
    if (_busy || _disposed) return;
    final epoch = ++_epoch;
    _busy = true;
    _phase = SessionPhase.loading;
    _message = null;
    _changed();
    try {
      final stored = await _store.read();
      _check(epoch);
      _session = stored;
      if (stored == null) {
        _phase = SessionPhase.signedOut;
        return;
      }
      if (stored.refreshPending) {
        await _erase(const ApiException('REFRESH_INTERRUPTED'));
        return;
      }
      await _loadUser(epoch);
      _check(epoch);
      _phase = SessionPhase.authenticated;
    } on ApiException catch (error) {
      if (epoch == _epoch) {
        _phase = SessionPhase.unavailable;
        _message = error.userMessage;
      }
    } finally {
      if (epoch == _epoch) {
        _busy = false;
        _changed();
      }
    }
  }

  Future<void> login({
    required String tenantCode,
    required String email,
    required String password,
  }) async {
    if (_busy || _disposed || _phase != SessionPhase.signedOut) return;
    final epoch = ++_epoch;
    _busy = true;
    _message = null;
    _changed();
    SessionTokens? tokens;
    try {
      final data = jsonObject(
        await _api.request(
          'POST',
          '/api/identity/auth/login',
          body: {
            'tenantCode': tenantCode.trim(),
            'email': email.trim(),
            'password': password,
          },
        ),
      );
      tokens = SessionTokens.fromResponse(data, _now());
      final profile = SessionUser.fromResponse(data['user']);
      _check(epoch);
      final stored = StoredSession(tokens, profile.id, profile.tenantId);
      await _store.write(stored);
      _check(epoch);
      _session = stored;
      _user = profile;
      _phase = SessionPhase.authenticated;
    } on ApiException catch (error) {
      if (tokens != null) await _revoke(tokens);
      if (epoch == _epoch) await _erase(error);
    } finally {
      if (epoch == _epoch) {
        _busy = false;
        _changed();
      }
    }
  }

  Future<void> revalidate() async {
    if (_busy || _disposed || _phase != SessionPhase.authenticated) return;
    final epoch = _epoch;
    _busy = true;
    _message = null;
    _changed();
    try {
      await _loadUser(epoch);
      _check(epoch);
      _phase = SessionPhase.authenticated;
      _message = 'Phiên đăng nhập đang hoạt động.';
    } on ApiException catch (error) {
      if (epoch == _epoch) {
        _phase = SessionPhase.unavailable;
        _message = error.userMessage;
      }
    } finally {
      if (epoch == _epoch) {
        _busy = false;
        _changed();
      }
    }
  }

  Future<void> _loadUser(int epoch) async {
    try {
      final response = await authorizedRequest('GET', '/api/identity/auth/me');
      final profile = SessionUser.fromResponse(response);
      _check(epoch);
      _matchUser(profile);
      _user = profile;
    } on ApiException catch (error) {
      if (epoch == _epoch &&
          (error.status == 401 ||
              error.status == 403 ||
              error.code == 'TECHNICIAN_REQUIRED')) {
        final rejectedTokens = _session?.tokens;
        await _erase(error);
        if (rejectedTokens != null) await _revoke(rejectedTokens);
      }
      rethrow;
    }
  }

  void _matchUser(SessionUser profile) {
    if (_session?.userId != profile.id ||
        _session?.tenantId != profile.tenantId) {
      throw const ApiException('TECHNICIAN_REQUIRED');
    }
  }

  Future<SessionTokens> _usableTokens(int epoch) async {
    _check(epoch);
    final flight = _refreshFlight;
    if (flight != null) return flight;
    final session = _session;
    if (session == null) throw const ApiException('SESSION_EXPIRED');
    if (!session.tokens.refreshExpiresAt.isAfter(_now())) {
      await _erase(const ApiException('SESSION_EXPIRED'));
      throw const ApiException('SESSION_EXPIRED');
    }
    if (session.tokens.accessExpiresAt.isBefore(
      _now().add(const Duration(seconds: 15)),
    )) {
      return _refresh(epoch);
    }
    return session.tokens;
  }

  /// Preflight renewal, at most one safe-read retry. Mutations are never replayed.
  Future<Object?> authorizedRequest(
    String method,
    String path, {
    Object? body,
  }) async {
    final epoch = _epoch;
    final tokens = await _usableTokens(epoch);
    _check(epoch);
    try {
      final response = await _api.request(
        method,
        path,
        body: body,
        accessToken: tokens.accessToken,
      );
      _check(epoch);
      return response;
    } on ApiException catch (error) {
      _check(epoch);
      if (error.status != 401) rethrow;
      final latest = _session?.tokens;
      if (_refreshFlight != null) {
        await _refreshFlight;
      } else if (latest?.accessToken == tokens.accessToken) {
        await _refresh(epoch);
      }
      _check(epoch);
      final renewed = _session?.tokens;
      if (renewed == null) throw const ApiException('SESSION_EXPIRED');
      if (!['GET', 'HEAD'].contains(method.toUpperCase())) {
        throw const ApiException('CHECK_BEFORE_RETRY');
      }
      try {
        final response = await _api.request(
          method,
          path,
          body: body,
          accessToken: renewed.accessToken,
        );
        _check(epoch);
        return response;
      } on ApiException catch (retryError) {
        if (epoch == _epoch && retryError.status == 401) {
          await _erase(const ApiException('SESSION_EXPIRED'));
        }
        rethrow;
      }
    }
  }

  Future<SessionTokens> _refresh(int epoch) {
    if (_refreshFlight != null) return _refreshFlight!;
    late final Future<SessionTokens> flight;
    flight = _performRefresh(epoch).whenComplete(() {
      if (identical(_refreshFlight, flight)) _refreshFlight = null;
    });
    _refreshFlight = flight;
    return flight;
  }

  Future<SessionTokens> _performRefresh(int epoch) async {
    final previous = _session;
    if (previous == null || previous.refreshPending) {
      throw const ApiException('SESSION_EXPIRED');
    }
    SessionTokens? rotated;
    var savedRotation = false;
    try {
      // Persist intent BEFORE the POST: a crash or lost response must not reuse the old token.
      await _store.write(
        StoredSession(
          previous.tokens,
          previous.userId,
          previous.tenantId,
          refreshPending: true,
        ),
      );
      _check(epoch);
      final response = await _api.request(
        'POST',
        '/api/identity/auth/refresh',
        body: {'refreshToken': previous.tokens.refreshToken},
      );
      rotated = SessionTokens.fromResponse(response, _now());
      _check(epoch);
      final replacement = StoredSession(
        rotated,
        previous.userId,
        previous.tenantId,
      );
      await _store.write(replacement);
      _check(epoch);
      _session = replacement;
      savedRotation = true;
      final profile = SessionUser.fromResponse(
        await _api.request(
          'GET',
          '/api/identity/auth/me',
          accessToken: rotated.accessToken,
        ),
      );
      _check(epoch);
      _matchUser(profile);
      _user = profile;
      return rotated;
    } on ApiException catch (error) {
      if (epoch != _epoch || _disposed) {
        if (rotated != null) await _revoke(rotated);
        throw const ApiException('SESSION_CHANGED');
      }
      // A known, saved token pair survives a transient profile lookup failure.
      if (savedRotation &&
          error.status != 401 &&
          error.status != 403 &&
          error.code != 'TECHNICIAN_REQUIRED') {
        _phase = SessionPhase.unavailable;
        _message = error.userMessage;
        _changed();
      } else {
        if (rotated != null) await _revoke(rotated);
        await _erase(
          error.status == 401 ||
                  error.status == 403 ||
                  error.code == 'STORAGE_FAILED' ||
                  error.code == 'TECHNICIAN_REQUIRED'
              ? error
              : const ApiException('REFRESH_INTERRUPTED'),
        );
      }
      rethrow;
    }
  }

  Future<void> logout() {
    if (_logoutFlight != null) return _logoutFlight!;
    late final Future<void> flight;
    flight = _performLogout().whenComplete(() {
      if (identical(_logoutFlight, flight)) _logoutFlight = null;
    });
    _logoutFlight = flight;
    return flight;
  }

  Future<void> _performLogout() async {
    if (_disposed) return;
    final tokens = _session?.tokens;
    final flight = _refreshFlight;
    await _erase(null);
    final epoch = _epoch;
    if (flight != null) {
      // The in-flight refresh revokes any newly returned pair after the epoch changes.
      try {
        await flight;
      } on ApiException {
        /* Already cleared locally. */
      }
    } else if (tokens != null) {
      final revoked = await _revoke(tokens);
      if (!revoked && epoch == _epoch && _phase == SessionPhase.signedOut) {
        _message = 'Đã xóa phiên trên máy. Máy chủ chưa xác nhận đăng xuất.';
        _changed();
      }
    }
  }

  Future<bool> _revoke(SessionTokens tokens) async {
    try {
      await _api.request(
        'POST',
        '/api/identity/auth/logout',
        body: {'refreshToken': tokens.refreshToken},
      );
      return true;
    } on ApiException {
      return false;
    }
  }

  Future<void> _erase(ApiException? reason) async {
    final epoch = ++_epoch;
    _session = null;
    _user = null;
    _phase = SessionPhase.loading;
    _busy = true;
    _changed();
    try {
      await _store.clear();
      if (epoch != _epoch || _disposed) return;
      _phase = SessionPhase.signedOut;
      _message = reason?.userMessage;
    } on ApiException catch (error) {
      if (epoch != _epoch || _disposed) return;
      _phase = SessionPhase.unavailable;
      _message = error.userMessage;
    }
    _busy = false;
    _changed();
  }

  @override
  void dispose() {
    _disposed = true;
    ++_epoch;
    _api.close();
    super.dispose();
  }
}
