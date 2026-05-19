// ACCOUNT.status: tinyint, string, or legacy text. Shared by login + authMiddleware.

export function isAccountStatusActive(rawStatus: unknown): boolean {
  if (rawStatus === null || rawStatus === undefined) {
    return true;
  }
  if (typeof rawStatus === 'number' && !Number.isNaN(rawStatus)) {
    return rawStatus === 1;
  }
  if (typeof rawStatus === 'boolean') {
    return rawStatus === true;
  }
  const s = String(rawStatus).trim().toLowerCase();
  if (s === '' || s === 'null') {
    return true;
  }
  if (['1', 'true', 'yes', 'on', 'active', 'enabled', 'y'].includes(s)) {
    return true;
  }
  if (['0', 'false', 'no', 'off', 'inactive', 'disabled', 'n'].includes(s)) {
    return false;
  }
  const n = Number(s);
  if (!Number.isNaN(n)) {
    return n === 1;
  }
  return false;
}
