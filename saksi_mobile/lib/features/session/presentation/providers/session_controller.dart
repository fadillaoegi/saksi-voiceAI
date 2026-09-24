import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/entities/compliance.dart';
import '../../domain/entities/session_event.dart';
import 'di_providers.dart';
import 'session_state.dart';

class SessionController extends Notifier<SessionState> {
  StreamSubscription<SessionEvent>? _events;
  StreamSubscription<List<int>>? _mic;

  @override
  SessionState build() {
    ref.onDispose(_teardown);
    return const SessionState();
  }

  Future<void> loadObligations() async {
    try {
      final obligations =
          await ref.read(sessionRepositoryProvider).obligations();
      state = state.copyWith(obligations: obligations);
    } catch (e) {
      state = state.copyWith(error: '$e');
    }
  }

  Future<void> start(String officerId, String productId) async {
    try {
      final session =
          await ref.read(startSessionProvider)(officerId, productId);
      state = state.copyWith(session: session, clearError: true);
      await _listen(session.id);
    } catch (e) {
      state = state.copyWith(error: '$e');
    }
  }

  Future<void> end() async {
    final id = state.session?.id;
    if (id == null) return;
    try {
      final session = await ref.read(endSessionProvider)(id);
      await _teardown();
      state = state.copyWith(session: session, recording: false, connected: false);
    } catch (e) {
      state = state.copyWith(error: '$e');
    }
  }

  Future<void> _listen(String sessionId) async {
    final usecase = ref.read(streamSessionProvider);
    final repo = ref.read(sessionRepositoryProvider);

    _events = usecase.events(sessionId).listen(
          _onEvent,
          onError: (Object e) => state = state.copyWith(error: '$e'),
        );
    state = state.copyWith(connected: true);

    try {
      final mic = await usecase.microphone();
      _mic = mic.listen(repo.pushAudio);
      state = state.copyWith(recording: true);
    } catch (e) {
      state = state.copyWith(error: '$e', recording: false);
    }
  }

  void _onEvent(SessionEvent event) {
    switch (event) {
      case PartialReceived(:final text):
        state = state.copyWith(partial: text);

      case UtteranceReceived(:final utterance):
        state = state.copyWith(
          utterances: [...state.utterances, utterance],
          clearPartial: true,
        );

      // Diarization merevisi label sebelumnya — ini fitur, tandai di UI.
      case SpeakerRevised(:final utteranceId, :final speaker):
        state = state.copyWith(
          utterances: [
            for (final u in state.utterances)
              if (u.id == utteranceId)
                u.copyWith(speaker: speaker, revised: true)
              else
                u,
          ],
        );

      case ObligationSatisfied(:final code, :final confidence, :final evidenceId):
        state = state.copyWith(
          obligations: [
            for (final o in state.obligations)
              if (o.code == code)
                o.copyWith(
                  status: ObligationStatus.satisfied,
                  confidence: confidence,
                  evidenceId: evidenceId,
                )
              else
                o,
          ],
        );

      case ViolationDetected(:final phrase, :final severity, :final evidenceId):
        state = state.copyWith(
          violations: [
            ...state.violations,
            Violation(
              phrase: phrase,
              severity: severity,
              evidenceId: evidenceId,
              detectedAt: DateTime.now(),
            ),
          ],
        );

      case NudgeReceived(:final text):
        state = state.copyWith(lastNudge: text);
        unawaited(ref.read(speechRepositoryProvider).whisper(text));

      // Jalur audio mati: hentikan indikator merekam supaya petugas tidak
      // mengira sesi masih disimak.
      case SessionErrorReceived(:final message):
        state = state.copyWith(error: message, recording: false);

      case UnknownEvent():
        break;
    }
  }

  Future<void> _teardown() async {
    await _mic?.cancel();
    await _events?.cancel();
    _mic = null;
    _events = null;
    await ref.read(streamSessionProvider).stop();
    await ref.read(speechRepositoryProvider).cancel();
  }
}

final sessionControllerProvider =
    NotifierProvider<SessionController, SessionState>(SessionController.new);
