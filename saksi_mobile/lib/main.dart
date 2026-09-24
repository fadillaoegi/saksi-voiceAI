import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/bisik_theme.dart';
import 'features/session/presentation/pages/officer_page.dart';

void main() {
  runApp(const ProviderScope(child: SaksiApp()));
}

class SaksiApp extends StatelessWidget {
  const SaksiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Bisik',
      debugShowCheckedModeBanner: false,
      theme: bisikTheme(),
      home: const OfficerPage(),
    );
  }
}
