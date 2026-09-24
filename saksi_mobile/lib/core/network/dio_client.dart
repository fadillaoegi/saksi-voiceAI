import 'package:dio/dio.dart';

import '../config/app_config.dart';

Dio createDio() {
  return Dio(
    BaseOptions(
      baseUrl: AppConfig.apiUrl,
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 8),
      headers: {'Content-Type': 'application/json'},
    ),
  );
}
