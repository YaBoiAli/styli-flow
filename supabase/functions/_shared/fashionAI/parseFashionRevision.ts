import type { FashionRevisionResult } from './types.ts';

function readId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readItems(value: unknown): FashionRevisionResult['items'] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const items: FashionRevisionResult['items'] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const productId = readId((item as { product_id?: unknown }).product_id);
    if (!productId) return null;
    const reason = (item as { reason?: unknown }).reason;
    items.push({
      product_id: productId,
      ...(typeof reason === 'string' && reason.trim() ? { reason: reason.trim() } : {}),
    });
  }
  return items;
}

function fromSlots(row: Record<string, unknown>): FashionRevisionResult['items'] | null {
  const top = readId(row.top_id);
  const bottom = readId(row.bottom_id);
  const shoes = readId(row.shoes_id);
  if (!top || !bottom || !shoes) return null;
  const items = [
    { product_id: top },
    { product_id: bottom },
    { product_id: shoes },
  ];
  const outerwear = readId(row.outerwear_id);
  const accessory = readId(row.accessory_id);
  if (outerwear) items.push({ product_id: outerwear });
  if (accessory) items.push({ product_id: accessory });
  return items;
}

/** Returns null on malformed JSON, missing core pieces, or any ID outside the candidate pool. */
export function parseFashionRevisionResult(
  content: string,
  allowedProductIds: Set<string>,
): FashionRevisionResult | null {
  try {
    const trimmed = content.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    const parsed = JSON.parse(fenced ? fenced[1].trim() : trimmed);
    if (!parsed || typeof parsed !== 'object') return null;
    const row = parsed as Record<string, unknown>;
    const items = readItems(row.items) ?? fromSlots(row);
    if (!items) return null;
    if (items.some((item) => !allowedProductIds.has(item.product_id))) return null;
    const ids = new Set(items.map((item) => item.product_id));
    if (ids.size !== items.length) return null;
    return {
      items,
      ...(typeof row.outfit_name === 'string' && row.outfit_name.trim()
        ? { outfit_name: row.outfit_name.trim() }
        : {}),
      ...(typeof row.styling_tip === 'string' && row.styling_tip.trim()
        ? { styling_tip: row.styling_tip.trim() }
        : {}),
    };
  } catch {
    return null;
  }
}
