/**
 * Minimal local proxy so @supabase/supabase-js can talk to PostgREST.
 * Forwards /rest/v1/* → http://127.0.0.1:3001/*
 *
 * Usage: node scripts/local-supabase-proxy.mjs
 */
import http from 'http';

const PROXY_PORT = 54321;
const POSTGREST = 'http://127.0.0.1:3001';

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PROXY_PORT}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (!url.pathname.startsWith('/rest/v1')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Only /rest/v1 is available in local Stage 2 proxy' }));
    return;
  }

  const targetPath = url.pathname.replace(/^\/rest\/v1/, '') || '/';
  const target = new URL(targetPath + url.search, POSTGREST);

  const headers = { ...req.headers, host: '127.0.0.1:3001' };
  delete headers['content-length'];

  const proxyReq = http.request(
    target,
    { method: req.method, headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(err) }));
  });

  req.pipe(proxyReq);
});

server.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log(`Local Supabase REST proxy on http://127.0.0.1:${PROXY_PORT}`);
});
