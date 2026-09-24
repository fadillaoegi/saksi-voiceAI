import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/session_controller.dart';
import '../providers/session_state.dart';
import '../widgets/obligation_tile.dart';
import '../widgets/transcript_list.dart';

class OfficerPage extends ConsumerStatefulWidget {
  const OfficerPage({super.key});

  @override
  ConsumerState<OfficerPage> createState() => _OfficerPageState();
}

class _OfficerPageState extends ConsumerState<OfficerPage> {
  final _officerId = TextEditingController(text: 'PTG-001');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(sessionControllerProvider.notifier).loadObligations();
    });
  }

  @override
  void dispose() {
    _officerId.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(sessionControllerProvider);
    final controller = ref.read(sessionControllerProvider.notifier);
    final running = state.session?.isRunning ?? false;

    return Scaffold(
      backgroundColor: const Color(0xFF0D1117),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D1117),
        title: const Text('Saksi'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Text(
                '${state.liveScore}/100',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: switch (state.liveScore) {
                    >= 80 => const Color(0xFF3FB950),
                    >= 50 => const Color(0xFFD29922),
                    _ => const Color(0xFFF85149),
                  },
                ),
              ),
            ),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: running ? _buildActive(state, controller) : _buildIdle(controller),
      ),
    );
  }

  Widget _buildIdle(SessionController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 32),
        const Text('ID Petugas', style: TextStyle(color: Color(0xFF8B949E))),
        const SizedBox(height: 8),
        TextField(
          controller: _officerId,
          style: const TextStyle(color: Color(0xFFE6EDF3)),
          decoration: const InputDecoration(
            filled: true,
            fillColor: Color(0xFF161B22),
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () =>
              controller.start(_officerId.text, 'KREDIT-MULTIGUNA'),
          child: const Padding(
            padding: EdgeInsets.all(12),
            child: Text('Mulai sesi'),
          ),
        ),
      ],
    );
  }

  Widget _buildActive(SessionState state, SessionController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(Icons.circle,
                size: 8,
                color: state.connected
                    ? const Color(0xFF3FB950)
                    : const Color(0xFF8B949E)),
            const SizedBox(width: 8),
            Text(
              '${state.connected ? "Terhubung" : "Menyambung…"} · '
              '${state.recording ? "merekam" : "mic mati"}',
              style: const TextStyle(color: Color(0xFF8B949E), fontSize: 12),
            ),
          ],
        ),
        if (state.lastNudge != null) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0x1FD29922),
              border: Border.all(color: const Color(0xFFD29922)),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(Icons.volume_up,
                    size: 18, color: Color(0xFFD29922)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    state.lastNudge!,
                    style: const TextStyle(
                      color: Color(0xFFD29922),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        for (final o in state.obligations) ObligationTile(obligation: o),
        const SizedBox(height: 12),
        Expanded(
          child: TranscriptList(
            utterances: state.utterances,
            partial: state.partial,
          ),
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: controller.end,
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFFF85149),
            side: const BorderSide(color: Color(0xFFF85149)),
          ),
          child: const Padding(
            padding: EdgeInsets.all(12),
            child: Text('Akhiri sesi'),
          ),
        ),
      ],
    );
  }
}
