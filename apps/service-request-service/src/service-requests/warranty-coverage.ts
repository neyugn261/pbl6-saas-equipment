/** Temporal validity is deliberately independent of incident coverage. */
export interface CoverageRequest {
  warrantyCheckResult: string | null;
  assessmentRequired?: boolean;
  coverageAssessment?: unknown;
}
export function coveredIncident(request: CoverageRequest): boolean {
  const assessment = request.coverageAssessment as
    { decision?: string } | null | undefined;
  return (
    request.warrantyCheckResult === 'IN_WARRANTY' &&
    (request.assessmentRequired || assessment
      ? assessment?.decision === 'COVERED'
      : true)
  );
}
export function estimateAllowed(request: CoverageRequest): boolean {
  const assessment = request.coverageAssessment as
    { decision?: string } | null | undefined;
  return (
    !!request.warrantyCheckResult &&
    !coveredIncident(request) &&
    (!(request.assessmentRequired || assessment) ||
      assessment?.decision === 'NOT_COVERED')
  );
}
