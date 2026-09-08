/**
 * Local Stage 3 proxy:
 * - /rest/v1/* → PostgREST :3001
 * - /functions/v1/generate-outfit → Deno edge function :54331
 */
import http from 'http';

const PROXY_PORT = 54321;
const POSTGREST = 'http://127.0.0.1:3001';
const FUNCTION = 'http://127.0.0.1:54331';

function proxy(req, res, targetBase, rewritePath) {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PROXY_PORT}`);
  const target = new URL(rewritePath(url.pathname) + url.search, targetBase);
  const headers = { ...req.headers, host: target.host };
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
    res.end(
      JSON.stringify({
        error: "Your stylist couldn't find the right fit. Try again.",
        detail: String(err),
      }),
    );
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PROXY_PORT}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname.startsWith('/functions/v1/generate-outfit')) {
    proxy(req, res, FUNCTION, () => '/');
    return;
  }

  if (url.pathname.startsWith('/rest/v1')) {
    proxy(req, res, POSTGREST, (pathname) => pathname.replace(/^\/rest\/v1/, '') || '/');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log(`Local Supabase proxy on http://127.0.0.1:${PROXY_PORT}`);
});
