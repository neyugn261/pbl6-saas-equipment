import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'config/app_config.dart';
import 'features/preferences/app_preferences.dart';
import 'core/api/gateway_client.dart';
import 'features/session/session_app.dart';
import 'features/session/session_controller.dart';
import 'features/session/session_store.dart';
import 'features/workspace/workspace_store.dart';
import 'features/workspace/upload_picker.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    final config = AppConfig.environment(release: !kDebugMode);
    final preferences = AppPreferences(SecurePreferencesStore());
    await preferences.load();
    final uploads = UploadRuntime(config.baseUrl.origin);
    await uploads.recover();
    final session = SessionController(
      GatewayClient(config),
      SecureSessionStore(scope: config.baseUrl.origin),
    );
    runApp(
      TechnicianApp(
        session: session,
        disposeSession: true,
        preferences: preferences,
        uploads: uploads,
        workspaceStore: (user) => SecureWorkspaceStore(
          origin: config.baseUrl.origin,
          tenantId: user.tenantId,
          userId: user.id,
        ),
      ),
    );
  } on FormatException {
    runApp(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'Địa chỉ máy chủ chưa hợp lệ. Cấu hình API_BASE_URL theo README mobile trước khi chạy ứng dụng.',
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
