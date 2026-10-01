/**
 * Server-side generate-outfit timing. Logs only [PERF] stage=Nms or SKIPPED.
 * No keys, URLs, prompts, measurements, or client-facing fields.
 */

export const PERF_STAGES = [
  'styling_context',
  'channel3_retrieval',
  'candidate_filtering',
  'visual_image_download',
  'visual_analysis',
  'outfit_generation',
  'validation',
  'scoring',
  'critic',
  'revision',
  'revision_validation',
  'response_construction',
] as const;

export type PerfStage = (typeof PERF_STAGES)[number];

const logged = new Set<string>();

export function resetPerfLog(): void {
  logged.clear();
}

export function perfNow(): number {
  return performance.now();
}

export function logPerf(stage: string, value: number | 'SKIPPED'): void {
  logged.add(stage);
  if (value === 'SKIPPED') {
    console.log(`[PERF] ${stage}=SKIPPED`);
    return;
  }
  console.log(`[PERF] ${stage}=${Math.round(value)}ms`);
}

export function logSkippedPerfStages(stages: readonly string[] = PERF_STAGES): void {
  for (const stage of stages) {
    if (!logged.has(stage)) logPerf(stage, 'SKIPPED');
  }
}

export function logPerfTotal(elapsedMs: number): void {
  console.log(`[PERF] total=${Math.round(elapsedMs)}ms`);
}
