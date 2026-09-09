/**
 * Tiny PostHog-compatible capture sink for local Stage 6 verification.
 * Accepts /batch and related POST bodies (including gzip) and logs event names.
 */
import http from 'node:http';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const port = Number(process.env.POSTHOG_DEV_PORT || 8439);
const received = [];

async function decodeBody(req, rawBuf) {
  const encoding = String(req.headers['content-encoding'] || '').toLowerCase();
  let buf = rawBuf;
  try {
    if (encoding.includes('gzip') || rawBuf[0] === 0x1f) {
      buf = await gunzip(rawBuf);
    } else if (encoding.includes('deflate')) {
      buf = await inflate(rawBuf);
    }
  } catch {
    buf = rawBuf;
  }
  const text = buf.toString('utf8');
  try {
    return JSON.parse(text || '{}');
  } catch {
    return { _raw: text.slice(0, 500) };
  }
}

function collectEvents(body) {
  const events = [];
  if (!body || typeof body !== 'object') return events;
  if (Array.isArray(body.batch)) {
    for (const item of body.batch) {
      if (item?.event) {
        events.push({ event: item.event, properties: item.properties ?? {} });
      }
    }
  } else if (body.event) {
    events.push({ event: body.event, properties: body.properties ?? {} });
  }
  return events;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' || req.method === 'GET') {
    console.log('[posthog-dev] request', req.method, req.url);
  }

  if (req.method === 'GET' && req.url?.startsWith('/_events')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: received.length, events: received }));
    return;
  }

  if (req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBuf = Buffer.concat(chunks);
    const body = await decodeBody(req, rawBuf);
    const events = collectEvents(body);
    for (const event of events) {
      received.push({ ...event, at: Date.now() });
      console.log(
        '[posthog-dev]',
        event.event,
        JSON.stringify(event.properties ?? {}),
      );
    }
    if (!events.length) {
      console.log('[posthog-dev] no events parsed; keys=', Object.keys(body));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 1 }));
    return;
  }

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`PostHog dev capture listening on http://127.0.0.1:${port}`);
});
