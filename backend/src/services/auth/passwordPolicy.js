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

module.exports = { SALT_ROUNDS, validatePasswordStrength, hashPassword };
