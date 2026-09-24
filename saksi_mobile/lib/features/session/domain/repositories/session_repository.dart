import '../entities/compliance.dart';
import '../entities/session.dart';
import '../entities/session_event.dart';

abstract interface class SessionRepository {
  Future<Session> start(String officerId, String productId);
  Future<Session> end(String sessionId);
  Future<List<Obligation>> obligations();

  /// Membuka koneksi realtime ke gateway untuk satu sesi.
  Stream<SessionEvent> connect(String sessionId);
  Future<void> disconnect();
}

abstract interface class AudioRepository {
  /// Aliran frame PCM16 mono dari mikrofon.
  Future<Stream<List<int>>> stream();
  Future<void> stop();
}

abstract interface class SpeechRepository {
  /// Membisikkan teks ke earpiece petugas.
  Future<void> whisper(String text);
  Future<void> cancel();
}
