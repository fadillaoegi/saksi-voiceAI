import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/bisik_theme.dart';
import '../providers/session_controller.dart';
import '../providers/session_state.dart';
import '../widgets/obligation_focus.dart';
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
      appBar: AppBar(
        title: const Text('Bisik'),
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
                    >= 80 => BisikColors.good,
                    >= 50 => BisikColors.warn,
                    _ => BisikColors.bad,
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
        const Text('ID Petugas', style: TextStyle(color: BisikColors.muted)),
        const SizedBox(height: 8),
        TextField(
          controller: _officerId,
          style: const TextStyle(color: BisikColors.text),
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
                color: state.connected ? BisikColors.good : BisikColors.muted),
            const SizedBox(width: 8),
            Text(
              '${state.connected ? "Terhubung" : "Menyambung…"} · '
              '${state.recording ? "merekam" : "mic mati"}',
              style: const TextStyle(color: BisikColors.muted, fontSize: 13),
            ),
          ],
        ),
        if (state.error != null) ...[
          const SizedBox(height: 12),
          _Banner(text: state.error!, color: BisikColors.bad),
        ],
        // Bagian yang tidak dihitung sebagai bukti harus terlihat: checklist
        // yang diam tanpa penjelasan membuat petugas mengira sistemnya rusak.
        if (state.warning != null) ...[
          const SizedBox(height: 12),
          _Banner(text: state.warning!, color: BisikColors.warn),
        ],
        if (state.lastNudge != null) ...[
          const SizedBox(height: 12),
          _Banner(
            text: state.lastNudge!,
            color: BisikColors.warn,
            icon: Icons.volume_up,
          ),
        ],
        const SizedBox(height: 16),
        ObligationFocus(obligations: state.obligations),
        const SizedBox(height: 8),
        // Rincian dan transkrip diturunkan ke balik disclosure: saat sesi
        // berjalan keduanya mengganggu, saat meninjau baru berguna.
        Expanded(
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              _Disclosure(
                title: 'Rincian kewajiban',
                child: Column(
                  children: [
                    for (final o in state.obligations)
                      ObligationTile(obligation: o),
                  ],
                ),
              ),
              _Disclosure(
                title: 'Transkrip',
                child: SizedBox(
                  height: 260,
                  child: TranscriptList(
                    utterances: state.utterances,
                    partial: state.partial,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: controller.end,
          style: OutlinedButton.styleFrom(
            foregroundColor: BisikColors.bad,
            side: const BorderSide(color: BisikColors.bad),
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

class _Banner extends StatelessWidget {
  const _Banner({required this.text, required this.color, this.icon});

  final String text;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        border: Border.all(color: color),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: color, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _Disclosure extends StatelessWidget {
  const _Disclosure({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: BisikColors.border),
      child: ExpansionTile(
        title: Text(
          title,
          style: const TextStyle(color: BisikColors.muted, fontSize: 14),
        ),
        iconColor: BisikColors.muted,
        collapsedIconColor: BisikColors.muted,
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(bottom: 12),
        children: [child],
      ),
    );
  }
}
