// Hashing and tokens that run the same on Node and on Cloudflare Workers (no node:crypto).
// SHA-256 / HMAC are plain JS so they stay synchronous; password hashing uses WebCrypto PBKDF2.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

const enc = new TextEncoder(), dec = new TextDecoder();
const bytes = v => (v instanceof Uint8Array ? v : enc.encode(String(v)));

function sha256Bytes(input) {
  const msg = bytes(input), len = msg.length, total = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(msg); buf[len] = 0x80;
  const bits = len * 8, view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bits / 0x100000000)); view.setUint32(total - 4, bits >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer);
  H.forEach((x, i) => ov.setUint32(i * 4, x));
  return out;
}

function hmacBytes(key, message) {
  let k = bytes(key);
  if (k.length > 64) k = sha256Bytes(k);
  const ipad = new Uint8Array(64 + 0), opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { ipad[i] = (k[i] || 0) ^ 0x36; opad[i] = (k[i] || 0) ^ 0x5c; }
  const m = bytes(message), inner = new Uint8Array(64 + m.length);
  inner.set(ipad); inner.set(m, 64);
  const ih = sha256Bytes(inner), outer = new Uint8Array(96);
  outer.set(opad); outer.set(ih, 64);
  return sha256Bytes(outer);
}

const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const fromHex = s => Uint8Array.from(String(s).match(/../g) || [], x => parseInt(x, 16));
const b64 = b => btoa(Array.from(b, x => String.fromCharCode(x)).join(''));
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = b => b64(bytes(b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => { const t = String(s).replace(/-/g, '+').replace(/_/g, '/'); return fromB64(t + '='.repeat((4 - (t.length % 4)) % 4)); };
const sha256 = s => hex(sha256Bytes(s));
const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
const randomToken = (n = 32) => hex(randomBytes(n));
const randomUUID = () => crypto.randomUUID();

const equal = (a, b) => {
  const x = bytes(a), y = bytes(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
};

// PBKDF2-SHA256, 100 000 rounds (the most Cloudflare Workers allow).
async function pbkdf2Hex(secret, salt, iterations = 100000, length = 32) {
  const key = await crypto.subtle.importKey('raw', bytes(secret), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations }, key, length * 8)));
}

async function hashPassword(password) {
  const salt = randomToken(16);
  return 'pbkdf2$' + salt + '$' + await pbkdf2Hex(String(password), fromHex(salt));
}

async function verifyPassword(password, stored) {
  const [kind, salt, key] = String(stored || '').split('$');
  if (kind !== 'pbkdf2' || !salt || !/^[a-f0-9]{64}$/.test(key || '')) return false;
  return equal(await pbkdf2Hex(String(password), fromHex(salt)), key);
}

function createSigner(secret) {
  const hmac = s => b64url(hmacBytes(secret, s));
  return {
    lookup: value => hex(hmacBytes(secret, 'lookup:' + value)),
    // body.signature — the extension reads exp (ms) from the base64url JSON body.
    sign(claims) {
      const body = b64url(JSON.stringify(claims));
      return body + '.' + hmac(body);
    },
    verify(token) {
      const [body, sig] = String(token || '').split('.');
      if (!body || !sig || !equal(hmac(body), sig)) return null;
      try { return JSON.parse(dec.decode(fromB64url(body))); } catch { return null; }
    },
  };
}

// Fixed-window attempt limiter kept in memory (per server instance).
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

export { sha256, sha256Bytes, hmacBytes, hex, fromHex, b64, fromB64, b64url, fromB64url, bytes, randomBytes, randomToken, randomUUID,
  pbkdf2Hex, hashPassword, verifyPassword, equal, createSigner, createLimiter };
