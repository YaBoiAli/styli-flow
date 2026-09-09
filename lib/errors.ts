/**
 * Map technical failures to calm, fashion-app copy.
 * Never surface raw API / stack messages to users.
 */
export function friendlyError(
  err: unknown,
  fallback = 'Something went sideways. Try again in a moment.',
): string {
  if (!err) return fallback;

  if (typeof err === 'string') {
    return sanitize(err, fallback);
  }

  if (err instanceof Error) {
    return sanitize(err.message, fallback);
  }

  return fallback;
}

function sanitize(message: string, fallback: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('timeout') ||
    lower.includes('failed to fetch')
  ) {
    return 'Connection hiccup. Check your network and try again.';
  }

  if (lower.includes('unauthorized') || lower.includes('jwt') || lower.includes('auth')) {
    return 'Please sign in again to continue.';
  }

  if (lower.includes('budget') || lower.includes('no_products')) {
    return "Couldn't lock a fit in that budget. Try raising it a little.";
  }

  // Likely technical / raw payload
  if (
    lower.includes('stack') ||
    lower.includes('exception') ||
    lower.includes('supabase') ||
    lower.includes('postgrest') ||
    lower.includes('status code') ||
    lower.includes('typeerror') ||
    /[{}\[\]]/.test(message) ||
    message.length > 160
  ) {
    return fallback;
  }

  // Already friendly product copy from Edge Function / app
  return message;
}
