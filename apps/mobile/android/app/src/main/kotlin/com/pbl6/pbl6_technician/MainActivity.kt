package com.pbl6.pbl6_technician

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.StandardMethodCodec

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        MethodChannel(messenger, "pbl6/app_info").setMethodCallHandler { call, result ->
            if (call.method != "version") result.notImplemented()
            else {
                try {
                    @Suppress("DEPRECATION")
                    val info = packageManager.getPackageInfo(packageName, 0)
                    @Suppress("DEPRECATION")
                    val build = if (android.os.Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
                    result.success(mapOf("version" to info.versionName, "build" to build.toString()))
                } catch (_: Exception) {
                    result.error("APP_INFO_UNAVAILABLE", "App information unavailable", null)
                }
            }
        }
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
