import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/api/api_exception.dart';

typedef LocalRecord = Map<String, dynamic>;
String localOperationId() => base64Url.encode(
  List<int>.generate(16, (_) => Random.secure().nextInt(256)),
);

abstract interface class WorkspaceStore {
  Future<LocalRecord?> read(String orderId);
  Future<void> write(String orderId, LocalRecord value);
}

/// Explicit in-memory adapter for tests/preview; production injects SecureWorkspaceStore.
class MemoryWorkspaceStore implements WorkspaceStore {
  final _records = <String, String>{};
  @override
  Future<LocalRecord?> read(String orderId) async {
    final value = _records[orderId];
    return value == null ? null : jsonDecode(value) as LocalRecord;
  }

  @override
  Future<void> write(String orderId, LocalRecord value) async {
    _records[orderId] = jsonEncode(value);
  }
}

/// Uses the existing encrypted Android namespace and its native disk-flush adapter.
/// No JWT, password, upload URL or automatic command queue is persisted here.
class SecureWorkspaceStore implements WorkspaceStore {
  SecureWorkspaceStore({
    required String origin,
    required String tenantId,
    required String userId,
    FlutterSecureStorage? storage,
  }) : _prefix =
           'pbl6.workspace.v1.${base64Url.encode(utf8.encode(jsonEncode([origin, tenantId, userId])))}.',
       _storage =
           storage ??
           const FlutterSecureStorage(
             aOptions: AndroidOptions(
               resetOnError: false,
               storageNamespace: 'pbl6_session_v1',
             ),
           );
  final String _prefix;
  final FlutterSecureStorage _storage;
  @override
  Future<LocalRecord?> read(String orderId) async {
    try {
      final raw = await _storage.read(key: '$_prefix$orderId');
      if (raw == null) return null;
      final value = jsonDecode(raw);
      if (value is! LocalRecord || value['schemaVersion'] != 1) {
        throw const FormatException('Unknown workspace record');
      }
      return value;
    } catch (_) {
      // Never silently drop a corrupt/unreadable uncertainty marker.
      throw const ApiException('WORKSPACE_STORAGE_FAILED');
    }
  }

  @override
  Future<void> write(String orderId, LocalRecord value) async {
    try {
      await _storage.write(key: '$_prefix$orderId', value: jsonEncode(value));
      if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
        await const MethodChannel('pbl6/session_storage')
            .invokeMethod<void>('flush');
      }
    } catch (_) {
      throw const ApiException('WORKSPACE_STORAGE_FAILED');
    }
  }
}

/// Serialize read/modify/write across old/new workspaces in this process.
/// Separate sections prevent an autosaved draft from overwriting a pending command.
class WorkspaceRecords {
  factory WorkspaceRecords(WorkspaceStore store) =>
      store is SecureWorkspaceStore
      ? _secure.putIfAbsent(store._prefix, () => WorkspaceRecords._(store))
      : (_instances[store] ??= WorkspaceRecords._(store));
  WorkspaceRecords._(this.store);
  static final _secure = <String, WorkspaceRecords>{};
  static final _instances = Expando<WorkspaceRecords>();
  final WorkspaceStore store;
  Future<void> _tail = Future.value();
  Future<T> _ordered<T>(Future<T> Function() operation) {
    final next = _tail.then((_) => operation());
    _tail = next.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return next;
  }

  Future<LocalRecord?> get(String orderId, String section) =>
      _ordered(() async {
        try {
          final record = await store.read(orderId);
          final value = record?[section];
          if (value == null) return null;
          if (value is! LocalRecord) {
            throw const FormatException('Invalid local section');
          }
          return jsonDecode(jsonEncode(value)) as LocalRecord;
        } catch (_) {
          throw const ApiException('WORKSPACE_STORAGE_FAILED');
        }
      });

  Future<void> put(String orderId, String section, LocalRecord? value) =>
      _ordered(() async {
        try {
          final record =
              await store.read(orderId) ??
              <String, dynamic>{'schemaVersion': 1};
          if (value == null) {
            record.remove(section);
          } else {
            record[section] = value;
          }
          await store.write(orderId, record);
        } catch (_) {
          throw const ApiException('WORKSPACE_STORAGE_FAILED');
        }
      });

  Future<bool> removeIf(
    String orderId,
    String section,
    String field,
    Object? expected,
  ) => _ordered(() async {
    try {
      final record = await store.read(orderId);
      if (record == null ||
          record[section] is! LocalRecord ||
          (record[section] as LocalRecord)[field] != expected) {
        return false;
      }
      record.remove(section);
      await store.write(orderId, record);
      return true;
    } catch (_) {
      throw const ApiException('WORKSPACE_STORAGE_FAILED');
    }
  });
}
