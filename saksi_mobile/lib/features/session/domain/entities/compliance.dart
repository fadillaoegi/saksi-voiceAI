enum ObligationStatus { pending, satisfied, violated }

class Obligation {
  const Obligation({
    required this.code,
    required this.label,
    this.status = ObligationStatus.pending,
    this.confidence = 0,
    this.evidenceId,
  });

  final String code;
  final String label;
  final ObligationStatus status;
  final double confidence;
  final String? evidenceId;

  Obligation copyWith({
    ObligationStatus? status,
    double? confidence,
    String? evidenceId,
  }) =>
      Obligation(
        code: code,
        label: label,
        status: status ?? this.status,
        confidence: confidence ?? this.confidence,
        evidenceId: evidenceId ?? this.evidenceId,
      );
}

class Violation {
  const Violation({
    required this.phrase,
    required this.severity,
    required this.evidenceId,
    required this.detectedAt,
  });

  final String phrase;
  final String severity;
  final String evidenceId;
  final DateTime detectedAt;
}
