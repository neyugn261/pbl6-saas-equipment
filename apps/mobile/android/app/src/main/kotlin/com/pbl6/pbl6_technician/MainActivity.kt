package com.pbl6.pbl6_technician

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.StandardMethodCodec

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        // Keep disk IO off the UI thread. No credentials cross this channel.
        MethodChannel(
            messenger,
            "pbl6/session_storage",
            StandardMethodCodec.INSTANCE,
            messenger.makeBackgroundTaskQueue(),
        ).setMethodCallHandler { call, result ->
            if (call.method != "flush") {
                result.notImplemented()
            } else {
                try {
                    // flutter_secure_storage 11.2.0 uses storageNamespace as the
                    // data SharedPreferences name. Keep this in sync with Dart.
                    // commit waits for pending apply writes and reports failure.
                    val saved = getSharedPreferences("pbl6_session_v1", MODE_PRIVATE)
                        .edit().commit()
                    if (saved) result.success(null)
                    else result.error("STORAGE_FAILED", "Secure storage flush failed", null)
                } catch (_: Exception) {
                    result.error("STORAGE_FAILED", "Secure storage flush failed", null)
                }
            }
        }
    }
}
