import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import '../../config/app_config.dart';
import 'api_exception.dart';

class GatewayClient {
  GatewayClient(
    this.config, {
    http.Client? client,
    this.timeout = const Duration(seconds: 10),
  }) : _client = client ?? http.Client();

  final AppConfig config;
  final http.Client _client;
  final Duration timeout;

  Future<Object?> request(
    String method,
    String path, {
    Object? body,
    String? accessToken,
  }) async {
    final route = Uri.parse(path);
    if (!path.startsWith('/') ||
        path.startsWith('//') ||
        route.hasScheme ||
        route.hasFragment) {
      throw ArgumentError('Only relative Gateway paths are permitted');
    }
    final request =
        http.Request(
            method,
            config.baseUrl.replace(
              path: route.path,
              query: route.hasQuery ? route.query : null,
            ),
          )
          ..followRedirects = false
          ..headers['accept'] = 'application/json'
          ..headers['x-correlation-id'] = List.generate(
            16,
            (_) =>
                Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
          ).join();
    if (accessToken != null) {
      request.headers['authorization'] = 'Bearer $accessToken';
    }
    if (body != null) {
      request.headers['content-type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    try {
      final response = await (() async => http.Response.fromStream(
        await _client.send(request),
      ))().timeout(timeout);
      Object? value;
      try {
        value = response.bodyBytes.isEmpty
            ? null
            : jsonDecode(utf8.decode(response.bodyBytes));
      } on FormatException {
        if (response.statusCode < 400) {
          throw const ApiException('INVALID_RESPONSE');
        }
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final code = value is Map && value['code'] is String
            ? value['code'] as String
            : 'HTTP_ERROR';
        throw ApiException(code, status: response.statusCode);
      }
      return value;
    } on TimeoutException {
      throw const ApiException('TIMEOUT');
    } on http.ClientException {
      throw const ApiException('NETWORK_ERROR');
    }
  }

  void close() => _client.close();
}
