import type {
  FashionCriticAssessment,
  FashionCriticIssue,
  FashionCriticResult,
  FashionCriticSeverity,
} from './types.ts';

const ASSESSMENTS = new Set<FashionCriticAssessment>(['strong', 'acceptable', 'weak']);
const SEVERITIES = new Set<FashionCriticSeverity>(['minor', 'moderate', 'major']);
const ISSUE_TYPES = new Set(['color', 'style', 'proportion', 'occasion', 'cohesion', 'other']);

function asScore(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 10) return null;
  return rounded;
}

function asStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 200))
    .slice(0, 8);
}

function parseIssue(value: unknown, allowedIds: Set<string>): FashionCriticIssue | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const typeRaw = typeof row.type === 'string' ? row.type.trim().toLowerCase() : '';
  const type = ISSUE_TYPES.has(typeRaw) ? typeRaw : typeRaw ? 'other' : null;
  const severity = typeof row.severity === 'string' ? row.severity.trim().toLowerCase() : '';
  if (!type || !SEVERITIES.has(severity as FashionCriticSeverity)) return null;
  const issue: FashionCriticIssue = {
    type,
    severity: severity as FashionCriticSeverity,
  };
  const productId = typeof row.product_id === 'string' ? row.product_id.trim() : '';
  if (productId && allowedIds.has(productId)) {
    issue.product_id = productId;
  }
  return issue;
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed);
}

/** Returns null on any invalid critic payload. Never throws. */
export function parseFashionCriticResult(
  content: string,
  selectedProductIds: string[],
): FashionCriticResult | null {
  let parsed: unknown;
  try {
    parsed = extractJson(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const row = parsed as Record<string, unknown>;
  const assessment =
    typeof row.overall_assessment === 'string'
      ? row.overall_assessment.trim().toLowerCase()
      : '';
  if (!ASSESSMENTS.has(assessment as FashionCriticAssessment)) return null;

  const styleMatch = asScore(row.style_match);
  const colorHarmony = asScore(row.color_harmony);
  const proportion = asScore(row.proportion);
  const occasionMatch = asScore(row.occasion_match);
  const cohesion = asScore(row.cohesion);
  if (
    styleMatch == null ||
    colorHarmony == null ||
    proportion == null ||
    occasionMatch == null ||
    cohesion == null
  ) {
    return null;
  }

  const strengths = asStringList(row.strengths);
  const recommendations = asStringList(row.recommendations);
  if (!strengths || !recommendations || !Array.isArray(row.issues)) return null;

  const allowedIds = new Set(selectedProductIds);
  const issues = row.issues
    .map((item) => parseIssue(item, allowedIds))
    .filter((item): item is FashionCriticIssue => item !== null)
    .slice(0, 8);

  return {
    overall_assessment: assessment as FashionCriticAssessment,
    style_match: styleMatch,
    color_harmony: colorHarmony,
    proportion,
    occasion_match: occasionMatch,
    cohesion,
    strengths,
    issues,
    recommendations,
  };
}
