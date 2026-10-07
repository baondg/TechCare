const { z } = require('zod');

const ROLE_CODES = ['ADM', 'PAT', 'DOC', 'NUR', 'TEC'];
const ACCOUNT_SORT_KEYS = [
  'role',
  'userId',
  'name',
  'username',
  'sex',
  'dob',
  'phone',
  'email',
  'createdBy',
  'enabled',
  'createdTime',
];

const positiveId = (message) =>
  z.coerce.number({ error: message }).int({ error: message }).positive({ error: message });

/** Query text: trimmed string, '' when absent. Never fails (the account list is forgiving). */
const text = z.preprocess((v) => (v == null ? '' : String(v).trim()), z.string());

/** parseInt-style positive integer with a fallback for missing / junk values. */
const lenientPositiveInt = (fallback) =>
  z.preprocess((v) => {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }, z.number().int().positive());

/** PATCH /accounts/:id, PATCH /accounts/:id/status */
const accountIdParams = z.object({ id: positiveId('Invalid account id') });

/** PATCH /feedbacks/:id */
const feedbackIdParams = z.object({ id: positiveId('Invalid feedback id') });

/**
 * GET /accounts — paging, sorting and filters. Unknown or malformed values fall back to defaults
 * instead of failing, as the admin table has always done.
 */
const listAccountsQuery = z.object({
  page: lenientPositiveInt(1),
  limit: lenientPositiveInt(10).transform((n) => Math.min(n, 100)),
  sortBy: z.preprocess((v) => String(v ?? ''), z.enum(ACCOUNT_SORT_KEYS)).catch('createdTime'),
  sortDirection: z.preprocess((v) => (String(v ?? '').toLowerCase() === 'asc' ? 'ASC' : 'DESC'), z.enum(['ASC', 'DESC'])),
  userId: text,
  name: text,
  username: text,
  roleCode: text.transform((v) => (ROLE_CODES.includes(v.toUpperCase()) ? v.toUpperCase() : '')),
  sex: text.transform((v) => (v === 'Male' ? 'M' : v === 'Female' ? 'F' : '')),
  dob: text,
  phone: text,
  email: text,
  enabled: text.transform((v) => (v === 'active' || v === 'inactive' ? v : '')),
});

/** PATCH /feedbacks/:id — `response` and/or `status`; values are normalised by the service. */
const updateFeedbackBody = z
  .looseObject({})
  .refine((body) => 'response' in body || 'status' in body, { error: 'Nothing to update' });

module.exports = {
  ROLE_CODES,
  ACCOUNT_SORT_KEYS,
  accountIdParams,
  feedbackIdParams,
  listAccountsQuery,
  updateFeedbackBody,
};
