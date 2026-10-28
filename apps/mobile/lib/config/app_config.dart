class AppConfig {
  AppConfig(String value, {bool release = false}) {
    final parsed = Uri.tryParse(value.trim());
    if (parsed == null ||
        !['http', 'https'].contains(parsed.scheme) ||
        parsed.host.isEmpty ||
        parsed.userInfo.isNotEmpty ||
        parsed.hasQuery ||
        parsed.hasFragment ||
        (parsed.path.isNotEmpty && parsed.path != '/') ||
        (release && parsed.scheme != 'https')) {
      throw const FormatException(
        'API_BASE_URL must be a Gateway origin; release requires HTTPS',
      );
    }
    baseUrl = parsed.replace(path: '');
  }

  factory AppConfig.environment({required bool release}) {
    const value = String.fromEnvironment('API_BASE_URL');
    return AppConfig(
      value.isEmpty && !release ? 'http://10.0.2.2:3000' : value,
      release: release,
    );
  }

  late final Uri baseUrl;
}
