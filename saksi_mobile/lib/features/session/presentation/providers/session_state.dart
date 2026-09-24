import '../../domain/entities/compliance.dart';
import '../../domain/entities/session.dart';

class SessionState {
  const SessionState({
    this.session,
    this.obligations = const [],
    this.utterances = const [],
    this.violations = const [],
    this.partial,
    this.lastNudge,
    this.connected = false,
    this.recording = false,
    this.error,
    this.warning,
  });

  final Session? session;
  final List<Obligation> obligations;
  final List<Utterance> utterances;
  final List<Violation> violations;
  final String? partial;
  final String? lastNudge;
  final bool connected;
  final bool recording;
  final String? error;

  /// Peringatan non-fatal: bagian percakapan yang tidak dihitung sebagai bukti.
  final String? warning;

  /// Skor sementara: % butir terpenuhi dikurangi 10 per pelanggaran.
  int get liveScore {
    if (obligations.isEmpty) return 0;
    final done = obligations
        .where((o) => o.status == ObligationStatus.satisfied)
        .length;
    final raw = (done / obligations.length * 100).round() - violations.length * 10;
    return raw < 0 ? 0 : raw;
  }

  SessionState copyWith({
    Session? session,
    List<Obligation>? obligations,
    List<Utterance>? utterances,
    List<Violation>? violations,
    String? partial,
    String? lastNudge,
    bool? connected,
    bool? recording,
    String? error,
    String? warning,
    bool clearPartial = false,
    bool clearError = false,
    bool clearWarning = false,
  }) =>
      SessionState(
        session: session ?? this.session,
        obligations: obligations ?? this.obligations,
        utterances: utterances ?? this.utterances,
        violations: violations ?? this.violations,
        partial: clearPartial ? null : (partial ?? this.partial),
        lastNudge: lastNudge ?? this.lastNudge,
        connected: connected ?? this.connected,
        recording: recording ?? this.recording,
        error: clearError ? null : (error ?? this.error),
        warning: clearWarning ? null : (warning ?? this.warning),
      );
}
