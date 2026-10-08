const crypto = require('node:crypto');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

/** The rule every user-chosen password follows (sign-up, change password). */
function validatePasswordStrength(password) {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  return { valid: true };
}

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// No 0/O, 1/l/I: the admin reads the password out or copies it by hand.
const TEMPORARY_ALPHABETS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789'];
const TEMPORARY_LENGTH = 14;

/**
 * Random one-time password for an admin-issued account (crypto RNG), passing
 * validatePasswordStrength: at least one of each alphabet, the rest from all of them, shuffled.
 */
function generateTemporaryPassword() {
  const all = TEMPORARY_ALPHABETS.join('');
  const chars = TEMPORARY_ALPHABETS.map((alphabet) => alphabet[crypto.randomInt(alphabet.length)]);
  while (chars.length < TEMPORARY_LENGTH) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { SALT_ROUNDS, validatePasswordStrength, hashPassword, generateTemporaryPassword };
