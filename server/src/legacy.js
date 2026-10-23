'use strict';
// Verifies passwords stored by the old Marsad server, so everyone keeps their password.
//   employees.pin_hash      'pbkdf2:100000:<salt>:<hex>'  PBKDF2-SHA256(pin, utf8(salt), 100000, 32)
//                            or older '<hex>' = SHA-256(DEVICE_TOKEN + ':' + pin)
//   admin_accounts.password '<salt>:<hex>'                PBKDF2-SHA256(password, utf8(salt), 100000, 32)
// On the first successful login the caller re-stores the password in this server's format.
const crypto = require('node:crypto');

const pbkdf2 = (secret, salt) => crypto.pbkdf2Sync(Buffer.from(String(secret), 'utf8'), Buffer.from(String(salt), 'utf8'), 100000, 32, 'sha256').toString('hex');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function createLegacy({ deviceTokens = [] } = {}) {
  return {
    verify(pin, stored) {
      const s = String(stored || '');
      if (s.startsWith('pbkdf2:')) {
        const [, iterations, salt, digest] = s.split(':');
        return iterations === '100000' && !!salt && !!digest && same(pbkdf2(pin, salt), digest);
      }
      if (/^[a-f0-9]{64}$/.test(s))
        return deviceTokens.some(t => same(crypto.createHash('sha256').update(t + ':' + pin, 'utf8').digest('hex'), s));
      return false;
    },
    verifyAdmin(password, stored) {
      const s = String(stored || ''), i = s.lastIndexOf(':');
      if (i <= 0 || s.startsWith('scrypt$')) return false;
      const salt = s.slice(0, i), digest = s.slice(i + 1);
      return /^[a-f0-9]{64}$/.test(digest) && same(pbkdf2(password, salt), digest);
    },
  };
}

module.exports = { createLegacy, pbkdf2 };
