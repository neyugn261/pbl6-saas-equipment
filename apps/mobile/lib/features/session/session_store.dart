import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/api/api_exception.dart';
import 'session_models.dart';

abstract interface class SessionStore {
  Future<StoredSession?> read();
  Future<void> write(StoredSession session);
  Future<void> clear();
}

class SecureSessionStore implements SessionStore {
  SecureSessionStore({required String scope, FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(
              resetOnError: false,
              storageNamespace: 'pbl6_session_v1',
            ),
          ),
      _key =
          'pbl6.technician.session.v1.${base64Url.encode(utf8.encode(scope))}';
  final String _key;
  final FlutterSecureStorage _storage;
  Future<void> _tail = Future.value();

  Future<void> _flush() async {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      // The pinned plugin uses SharedPreferences.apply(). Wait for disk before
      // sending a rotating token, and after saving its successor or deleting it.
      await const MethodChannel('pbl6/session_storage')
          .invokeMethod<void>('flush');
    }
  }

  // One JSON write stores both rotating tokens and the crash-recovery marker.
  // Serialize deletes/writes so a late refresh cannot restore a logged-out session.
  Future<T> _ordered<T>(Future<T> Function() operation) {
    final next = _tail.then((_) => operation());
    _tail = next.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return next;
  }

  @override
  Future<StoredSession?> read() => _ordered(() async {
    String? value;
    try {
      value = await _storage.read(key: _key);
    } catch (_) {
      throw const ApiException('STORAGE_FAILED');
    }
    if (value == null) return null;
    try {
      return StoredSession.fromJson(jsonDecode(value));
    } catch (_) {
      try {
        await _storage.delete(key: _key);
        await _flush();
      } catch (_) {
        throw const ApiException('STORAGE_FAILED');
      }
      return null;
    }
  });

  @override
  Future<void> write(StoredSession session) => _ordered(() async {
    try {
      await _storage.write(key: _key, value: jsonEncode(session.toJson()));
      await _flush();
    } catch (_) {
      throw const ApiException('STORAGE_FAILED');
    }
  });

  @override
  Future<void> clear() => _ordered(() async {
    try {
      await _storage.delete(key: _key);
      await _flush();
    } catch (_) {
      throw const ApiException('STORAGE_FAILED');
    }
  });
}
