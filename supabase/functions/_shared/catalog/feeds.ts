/** Minimal RFC 4180 CSV/TSV parser (quoted fields, embedded newlines, doubled quotes). */
export function parseDelimited(text: string): Array<Record<string, string>> {
  const body = text.replace(/^\uFEFF/, '');
  const firstLine = body.slice(0, body.indexOf('\n') > 0 ? body.indexOf('\n') : body.length);
  const delimiter = [',', '\t', '|', ';'].reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (quoted) {
      if (char === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && body[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((value) => value !== '')) rows.push(row);
  }

  const [header, ...data] = rows;
  if (!header) return [];
  const keys = header.map((key) => key.trim());
  return data.map((values) =>
    Object.fromEntries(keys.map((key, index) => [key, (values[index] ?? '').trim()])),
  );
}

/** Google Shopping RSS/Atom feed items (`<item>` / `<entry>` with `g:` fields). */
export function parseGoogleXml(text: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = [];
  for (const match of text.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const record: Record<string, string> = {};
    for (const field of match[2].matchAll(/<(?:g:)?([a-z_]+)\b[^>]*>([\s\S]*?)<\/(?:g:)?\1>/gi)) {
      const key = field[1].toLowerCase();
      const value = field[2].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim();
      if (!(key in record)) record[key] = value;
    }
    items.push(record);
  }
  return items;
}

export function parseFeed(text: string): Array<Record<string, string>> {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<')) return parseGoogleXml(trimmed);
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed);
    const list = Array.isArray(data) ? data : data.products ?? data.items ?? data.Items ?? [];
    return (list as Array<Record<string, unknown>>).map((item) =>
      Object.fromEntries(
        Object.entries(item).map(([key, value]) => [key, value == null ? '' : String(value)]),
      ),
    );
  }
  return parseDelimited(text);
}
