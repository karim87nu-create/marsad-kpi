// Verifies passwords stored by the old Marsad server, so everyone keeps their password.
//   employees.pin_hash      'pbkdf2:100000:<salt>:<hex>'  PBKDF2-SHA256(pin, utf8(salt), 100000, 32)
//                            or older '<hex>' = SHA-256(DEVICE_TOKEN + ':' + pin)
//   admin_accounts.password '<salt>:<hex>'                PBKDF2-SHA256(password, utf8(salt), 100000, 32)
// On the first successful login the caller re-stores the password in this server's format.
import { pbkdf2Hex, sha256, equal } from './security.js';

const pbkdf2 = (secret, salt) => pbkdf2Hex(String(secret), String(salt));

function createLegacy({ deviceTokens = [] } = {}) {
  return {
    async verify(pin, stored) {
      const s = String(stored || '');
      if (s.startsWith('pbkdf2:')) {
        const [, iterations, salt, digest] = s.split(':');
        return iterations === '100000' && !!salt && !!digest && equal(await pbkdf2(pin, salt), digest);
      }
      if (/^[a-f0-9]{64}$/.test(s)) return deviceTokens.some(t => equal(sha256(t + ':' + pin), s));
      return false;
    },
    async verifyAdmin(password, stored) {
      const s = String(stored || ''), i = s.lastIndexOf(':');
      if (i <= 0 || s.startsWith('pbkdf2$')) return false;
      const salt = s.slice(0, i), digest = s.slice(i + 1);
      return /^[a-f0-9]{64}$/.test(digest) && equal(await pbkdf2(password, salt), digest);
    },
  };
}

export { createLegacy, pbkdf2 };
