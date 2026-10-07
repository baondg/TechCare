const crypto = require('crypto');
const { config } = require('../config/env');

const ENC_PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey() {
  const raw = config.auth.imageEncryptionKey;
  if (!raw) {
    throw new Error('IMAGE_ENCRYPTION_KEY is not configured');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error('IMAGE_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
  }
  return key;
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

function encryptField(plaintext) {
  if (plaintext == null || plaintext === '') {
    return plaintext;
  }
  if (isEncrypted(plaintext)) {
    return plaintext;
  }
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]);
  return `${ENC_PREFIX}${payload.toString('base64')}`;
}

function decryptField(stored) {
  if (stored == null || stored === '') {
    return stored == null ? null : stored;
  }
  const value = String(stored);
  if (!isEncrypted(value)) {
    return value;
  }
  const key = getEncryptionKey();
  const payload = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
  if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted field payload');
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = {
  ENC_PREFIX,
  encryptField,
  decryptField,
  isEncrypted,
};
