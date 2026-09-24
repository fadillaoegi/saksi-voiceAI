import 'package:dio/dio.dart';

import '../../../../core/error/failure.dart';

class SessionRemoteDataSource {
  const SessionRemoteDataSource(this._dio);
  final Dio _dio;

  Future<Map<String, dynamic>> startSession(
      String officerId, String productId) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/sessions',
        data: {'officer_id': officerId, 'product_id': productId},
      );
      return res.data!;
    } on DioException catch (e) {
      throw NetworkFailure('Gagal memulai sesi: ${e.message}');
    }
  }

  Future<Map<String, dynamic>> endSession(String sessionId) async {
    try {
      final res =
          await _dio.post<Map<String, dynamic>>('/api/sessions/$sessionId/end');
      return res.data!;
    } on DioException catch (e) {
      throw NetworkFailure('Gagal mengakhiri sesi: ${e.message}');
    }
  }

  Future<List<dynamic>> obligations() async {
    try {
      final res = await _dio.get<List<dynamic>>('/api/obligations');
      return res.data ?? const [];
    } on DioException catch (e) {
      throw NetworkFailure('Gagal memuat kewajiban: ${e.message}');
    }
  }
}
