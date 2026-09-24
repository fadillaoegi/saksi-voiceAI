import '../entities/session.dart';
import '../repositories/session_repository.dart';

class StartSessionUseCase {
  const StartSessionUseCase(this._repo);
  final SessionRepository _repo;

  Future<Session> call(String officerId, String productId) {
    if (officerId.trim().isEmpty) {
      throw ArgumentError('ID petugas wajib diisi');
    }
    return _repo.start(officerId, productId);
  }
}
