import '../../domain/entities/compliance.dart';

class ObligationModel {
  const ObligationModel._();

  static Obligation fromJson(Map<String, dynamic> json) => Obligation(
        code: json['code'] as String,
        label: json['label'] as String? ?? '',
        status: switch (json['status'] as String?) {
          'satisfied' => ObligationStatus.satisfied,
          'violated' => ObligationStatus.violated,
          _ => ObligationStatus.pending,
        },
        confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
        evidenceId: json['evidence_id'] as String?,
      );
}
