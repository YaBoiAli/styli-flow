/**
 * Local Supabase-compatible proxy for Stage 4:
 * - /auth/v1/*  → lightweight GoTrue-compatible auth
 * - /rest/v1/*  → PostgREST :3001
 * - /functions/v1/generate-outfit → Deno :54331
 * - /functions/v1/resolve-brand   → Deno :54332
 * - /functions/v1/sync-catalog    → Deno :54333
 */
import http from 'http';
import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const PROXY_PORT = 54321;
const POSTGREST = 'http://127.0.0.1:3001';
const GENERATE_OUTFIT = 'http://127.0.0.1:54331';
const RESOLVE_BRAND = 'http://127.0.0.1:54332';
const SYNC_CATALOG = 'http://127.0.0.1:54333';
const JWT_SECRET = new TextEncoder().encode(
  'styli-local-dev-jwt-secret-at-least-32-chars!!',
);
const pool = new Pool({
  connectionString: 'postgres://styli:styli@127.0.0.1:5432/styli',
});

const refreshTokens = new Map();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function issueTokens(user) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({
    role: 'authenticated',
    iss: 'supabase',
    aud: 'authenticated',
    email: user.email,
    sub: user.id,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 24 * 7)
    .sign(JWT_SECRET);

  const refreshToken = crypto.randomBytes(24).toString('hex');
  refreshTokens.set(refreshToken, user.id);

  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 7,
    expires_at: now + 60 * 60 * 24 * 7,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: 'authenticated',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: user.created_at,
    },
  };
}

async function getUserFromAuthHeader(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!payload.sub) return null;
    const result = await pool.query(
      'select id, email, created_at from auth.users where id = $1',
      [payload.sub],
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

async function handleAuth(req, res, url) {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
          'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      });
      res.end('ok');
      return;
    }

    if (url.pathname === '/auth/v1/health') {
      sendJson(res, 200, { version: 'local', name: 'GoTrue' });
      return;
    }

    if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!email || password.length < 6) {
        sendJson(res, 400, {
          error: 'invalid_request',
          error_description: 'Email and password (min 6 chars) required',
          msg: 'Email and password (min 6 chars) required',
        });
        return;
      }

      const existing = await pool.query(
        'select id from auth.users where lower(email) = $1',
        [email],
      );
      if (existing.rowCount) {
        sendJson(res, 400, {
          error: 'user_already_exists',
          msg: 'User already registered',
        });
        return;
      }

      const id = crypto.randomUUID();
      const hash = await bcrypt.hash(password, 10);
      const inserted = await pool.query(
        `insert into auth.users (id, email, encrypted_password, created_at, updated_at)
         values ($1, $2, $3, now(), now())
         returning id, email, created_at`,
        [id, email, hash],
      );
      await pool.query(
        `insert into public.profiles (id, email, onboarding_completed)
         values ($1, $2, false)
         on conflict (id) do update set email = excluded.email`,
        [id, email],
      );

      const session = await issueTokens(inserted.rows[0]);
      sendJson(res, 200, session);
      return;
    }

    if (
      url.pathname === '/auth/v1/token' &&
      req.method === 'POST' &&
      url.searchParams.get('grant_type') === 'password'
    ) {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const result = await pool.query(
        `select id, email, encrypted_password, created_at
         from auth.users where lower(email) = $1`,
        [email],
      );
      const user = result.rows[0];
      if (!user || !(await bcrypt.compare(password, user.encrypted_password || ''))) {
        sendJson(res, 400, {
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
          msg: 'Invalid login credentials',
        });
        return;
      }
      const session = await issueTokens(user);
      sendJson(res, 200, session);
      return;
    }

    if (
      url.pathname === '/auth/v1/token' &&
      req.method === 'POST' &&
      url.searchParams.get('grant_type') === 'refresh_token'
    ) {
      const body = await readBody(req);
      const refreshToken = String(body.refresh_token || '');
      const userId = refreshTokens.get(refreshToken);
      if (!userId) {
        sendJson(res, 400, {
          error: 'invalid_grant',
          msg: 'Invalid refresh token',
        });
        return;
      }
      const result = await pool.query(
        'select id, email, created_at from auth.users where id = $1',
        [userId],
      );
      if (!result.rows[0]) {
        sendJson(res, 400, {
          error: 'invalid_grant',
          msg: 'Invalid refresh token',
        });
        return;
      }
      sendJson(res, 200, await issueTokens(result.rows[0]));
      return;
    }

    if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
      const user = await getUserFromAuthHeader(req);
      if (!user) {
        sendJson(res, 401, { error: 'unauthorized', msg: 'Unauthorized' });
        return;
      }
      sendJson(res, 200, {
        id: user.id,
        email: user.email,
        role: 'authenticated',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: user.created_at,
      });
      return;
    }

    if (url.pathname === '/auth/v1/logout' && req.method === 'POST') {
      res.writeHead(204);
      res.end();
      return;
    }

    sendJson(res, 404, { error: 'not_found', msg: `No route ${url.pathname}` });
  } catch (err) {
    sendJson(res, 500, {
      error: 'server_error',
      msg: String(err?.message || err),
    });
  }
}

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
    res.end(JSON.stringify({ error: String(err) }));
  });

  req.pipe(proxyReq);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PROXY_PORT}`);

  if (url.pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname.startsWith('/auth/v1')) {
    await handleAuth(req, res, url);
    return;
  }

  if (url.pathname.startsWith('/functions/v1/generate-outfit')) {
    proxy(req, res, GENERATE_OUTFIT, () => '/');
    return;
  }

  if (url.pathname.startsWith('/functions/v1/resolve-brand')) {
    proxy(req, res, RESOLVE_BRAND, () => '/');
    return;
  }

  if (url.pathname.startsWith('/functions/v1/sync-catalog')) {
    proxy(req, res, SYNC_CATALOG, () => '/');
    return;
  }

  if (url.pathname.startsWith('/rest/v1')) {
    proxy(req, res, POSTGREST, (pathname) => pathname.replace(/^\/rest\/v1/, '') || '/');
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`Local Supabase proxy (auth+rest+fn) on http://0.0.0.0:${PROXY_PORT}`);
});
