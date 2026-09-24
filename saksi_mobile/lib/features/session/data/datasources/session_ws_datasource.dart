import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../../../../core/config/app_config.dart';
import '../../domain/entities/session.dart';
import '../../domain/entities/session_event.dart';
import '../models/session_model.dart';

/// Satu koneksi WebSocket ke gateway Go.
/// Keluar: frame PCM16 biner. Masuk: event JSON.
class SessionWsDataSource {
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;

  Stream<SessionEvent> connect(String sessionId) {
    final uri = Uri.parse(
      '${AppConfig.wsUrl}/ws?session_id=$sessionId&role=officer',
    );
    final channel = WebSocketChannel.connect(uri);
    _channel = channel;

    final controller = StreamController<SessionEvent>.broadcast(
      onCancel: disconnect,
    );

    _sub = channel.stream.listen(
      (raw) {
        if (raw is! String) return;
        controller.add(_parse(raw));
      },
      onError: controller.addError,
      onDone: controller.close,
    );

    return controller.stream;
  }

  void sendAudio(List<int> pcm) {
    _channel?.sink.add(Uint8List.fromList(pcm));
  }

  Future<void> disconnect() async {
    await _sub?.cancel();
    await _channel?.sink.close();
    _sub = null;
    _channel = null;
  }

  SessionEvent _parse(String raw) {
    final Map<String, dynamic> json;
    try {
      json = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return const UnknownEvent();
    }

    return switch (json['type'] as String?) {
      'partial' => PartialReceived(
          speakerFromString(json['speaker'] as String?),
          json['text'] as String? ?? '',
        ),
      'utterance' => UtteranceReceived(
          Utterance(
            id: json['id'] as String? ?? '',
            speaker: speakerFromString(json['speaker'] as String?),
            text: json['text'] as String? ?? '',
          ),
        ),
      'speaker_revised' => SpeakerRevised(
          json['utterance_id'] as String? ?? '',
          speakerFromString(json['speaker'] as String?),
        ),
      'obligation_satisfied' => ObligationSatisfied(
          json['code'] as String? ?? '',
          (json['confidence'] as num?)?.toDouble() ?? 0,
          json['evidence_id'] as String? ?? '',
        ),
      'violation' => ViolationDetected(
          json['phrase'] as String? ?? '',
          json['severity'] as String? ?? '',
          json['evidence_id'] as String? ?? '',
        ),
      'nudge' => NudgeReceived(json['text'] as String? ?? ''),
      'speaker_unknown' => const SessionWarningReceived(
          'Ada ucapan dari suara yang tidak dikenali — tidak dihitung sebagai bukti',
        ),
      'evidence_skipped' => SessionWarningReceived(
          'Ucapan dilewati: ${json['reason'] as String? ?? 'audio tidak layak'}',
        ),
      'audio_quality' => (json['degraded'] as bool? ?? false)
          ? SessionWarningReceived(
              '${json['reason'] as String? ?? 'Audio tidak layak'} — penilaian ditahan',
            )
          : const SessionWarningReceived(''),
      'session_error' => SessionErrorReceived(
          json['message'] as String? ?? 'Jalur audio terputus',
        ),
      _ => const UnknownEvent(),
    };
  }
}
