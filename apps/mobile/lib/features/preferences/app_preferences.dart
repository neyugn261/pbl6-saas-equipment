import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class PreferencesStore {
  Future<String?> read();
  Future<void> write(String value);
}

class MemoryPreferencesStore implements PreferencesStore {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String value) async {
    this.value = value;
  }
}

/// Device-wide appearance only. No account data, credentials or drafts.
class SecurePreferencesStore implements PreferencesStore {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      resetOnError: false,
      storageNamespace: 'pbl6_session_v1',
    ),
  );
  @override
  Future<String?> read() => _storage.read(key: 'pbl6.preferences.v1');
  @override
  Future<void> write(String value) async {
    await _storage.write(key: 'pbl6.preferences.v1', value: value);
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      await const MethodChannel('pbl6/session_storage')
          .invokeMethod<void>('flush');
    }
  }
}

class AppPreferences extends ChangeNotifier {
  AppPreferences(this.store);
  final PreferencesStore store;
  ThemeMode themeMode = ThemeMode.system;
  bool busy = false;
  String? error;
  bool _disposed = false;
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() async {
    if (busy) return;
    busy = true;
    _notify();
    try {
      final raw = await store.read();
      if (raw != null) {
        final data = jsonDecode(raw);
        if (data is! Map ||
            data['version'] != 1 ||
            !ThemeMode.values.any((m) => m.name == data['theme'])) {
          throw const FormatException();
        }
        themeMode = ThemeMode.values.firstWhere((m) => m.name == data['theme']);
      }
      error = null;
    } catch (_) {
      error = 'Chưa đọc được tùy chọn trên máy. Giao diện hiện tại được giữ; bạn có thể thử lại.';
    } finally {
      busy = false;
      _notify();
    }
  }

  Future<void> setTheme(ThemeMode mode) async {
    if (busy) return;
    busy = true;
    error = null;
    _notify();
    try {
      await store.write(jsonEncode({'version': 1, 'theme': mode.name}));
      themeMode = mode;
    } catch (_) {
      error =
          'Chưa lưu được giao diện. Kiểm tra dung lượng thiết bị rồi thử lại.';
    } finally {
      busy = false;
      _notify();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

class ApplicationInfo {
  const ApplicationInfo(this.version, this.build);
  final String version, build;
  static Future<ApplicationInfo> load() async {
    final data = await const MethodChannel('pbl6/app_info')
        .invokeMapMethod<String, dynamic>('version');
    if (data?['version'] is! String ||
        data?['build'] is! String ||
        (data!['version'] as String).isEmpty ||
        (data['build'] as String).isEmpty) {
      throw const FormatException();
    }
    return ApplicationInfo(data['version'] as String, data['build'] as String);
  }
}
