export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export function friendlyError(
  code:
    | 'network'
    | 'ai'
    | 'no_products'
    | 'invalid_ai'
    | 'budget'
    | 'brands_unavailable'
    | 'brands_no_fit'
    | 'catalog_empty'
    | 'unknown',
  status = 400,
  extra: Record<string, unknown> = {},
): Response {
  const messages: Record<typeof code, string> = {
    network: "Your stylist couldn't find the right fit. Try again.",
    ai: "Your stylist couldn't find the right fit. Try again.",
    no_products: "Your stylist couldn't find the right fit. Try a different vibe or budget.",
    invalid_ai: "Your stylist couldn't find the right fit. Try again.",
    budget: "Your stylist couldn't find the right fit within that budget. Try again.",
    brands_unavailable:
      "The brands you picked aren't available to shop yet. Add another brand or switch to No Preference.",
    brands_no_fit:
      "Your picked brands don't have enough in stock for a full fit at this budget. Try a higher budget or add another brand.",
    catalog_empty: 'Our store catalog is still syncing. Try again in a little while.',
    unknown: "Your stylist couldn't find the right fit. Try again.",
  };

  return jsonResponse({ ...extra, error: messages[code], code }, status);
}
