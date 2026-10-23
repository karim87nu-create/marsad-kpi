'use strict';
const crypto = require('node:crypto');

const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, 32, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('hex') + '$' + key.toString('hex');
}

function verifyPassword(password, stored) {
  const [kind, salt, key] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

const equal = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function createSigner(secret) {
  const hmac = s => b64url(crypto.createHmac('sha256', secret).update(s).digest());
  return {
    lookup: value => crypto.createHmac('sha256', secret).update('lookup:' + value).digest('hex'),
    // body.signature — the extension reads exp (ms) from the base64url JSON body.
    sign(claims) {
      const body = b64url(JSON.stringify(claims));
      return body + '.' + hmac(body);
    },
    verify(token) {
      const [body, sig] = String(token || '').split('.');
      if (!body || !sig || !equal(hmac(body), sig)) return null;
      try { return JSON.parse(fromB64url(body).toString('utf8')); } catch { return null; }
    },
  };
}

// Fixed-window attempt limiter kept in memory (resets on restart, which is acceptable here).
function createLimiter({ limit, windowMs }) {
  const hits = new Map();
  return {
    blocked(key, now = Date.now()) {
      const h = hits.get(key);
      return !!h && now - h.start < windowMs && h.count >= limit;
    },
    fail(key, now = Date.now()) {
      const h = hits.get(key);
      if (!h || now - h.start >= windowMs) hits.set(key, { start: now, count: 1 });
      else h.count++;
      if (hits.size > 5000) hits.delete(hits.keys().next().value);
    },
    reset(key) { hits.delete(key); },
  };
}

module.exports = { b64url, fromB64url, sha256, randomToken, hashPassword, verifyPassword, equal, createSigner, createLimiter };
