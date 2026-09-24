import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/session/presentation/pages/officer_page.dart';

void main() {
  runApp(const ProviderScope(child: SaksiApp()));
}

class SaksiApp extends StatelessWidget {
  const SaksiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Saksi',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0D1117),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF2F81F7),
          brightness: Brightness.dark,
        ),
      ),
      home: const OfficerPage(),
    );
  }
}
