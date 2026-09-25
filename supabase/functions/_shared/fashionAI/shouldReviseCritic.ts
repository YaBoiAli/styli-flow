import type { FashionCriticResult } from './types.ts';

const WEAK_DIMENSION = 5;

/** True only when the critic flags a meaningful problem — not minor notes or a 7–8. */
export function shouldReviseCritic(critic: FashionCriticResult | null | undefined): boolean {
  return revisionNeededReason(critic) !== null;
}

export function revisionNeededReason(critic: FashionCriticResult | null | undefined): string | null {
  if (!critic) return null;
  if (critic.overall_assessment === 'weak') return 'weak_assessment';
  if (critic.issues.some((issue) => issue.severity === 'major')) return 'major_issue';
  if (critic.issues.filter((issue) => issue.severity === 'moderate').length >= 2) {
    return 'multiple_moderate_issues';
  }
  if (critic.style_match <= WEAK_DIMENSION) return 'weak_style_match';
  if (critic.color_harmony <= WEAK_DIMENSION) return 'weak_color_harmony';
  if (critic.proportion <= WEAK_DIMENSION) return 'weak_proportion';
  if (critic.occasion_match <= WEAK_DIMENSION) return 'weak_occasion_match';
  if (critic.cohesion <= WEAK_DIMENSION) return 'weak_cohesion';
  return null;
}
