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
    | 'openai'
    | 'no_products'
    | 'invalid_ai'
    | 'budget'
    | 'unknown',
  status = 400,
): Response {
  const messages: Record<typeof code, string> = {
    network: "Your stylist couldn't find the right fit. Try again.",
    openai: "Your stylist couldn't find the right fit. Try again.",
    no_products: "Your stylist couldn't find the right fit. Try a different vibe or budget.",
    invalid_ai: "Your stylist couldn't find the right fit. Try again.",
    budget: "Your stylist couldn't find the right fit within that budget. Try again.",
    unknown: "Your stylist couldn't find the right fit. Try again.",
  };

  return jsonResponse({ error: messages[code], code }, status);
}
