const bcrypt = require('bcrypt');
const accountRepository = require('../../repositories/accountRepository');

/** The demo / former default password, published in the docs. */
const KNOWN_SHARED_PASSWORDS = ['Test@1234'];

/**
 * Accounts (not already flagged) whose password is one of `candidates` — the shared initial
 * passwords admins used to hand out. Compares every hash: slow by design (bcrypt), run offline.
 * @returns {Promise<Array<{ userId, username, type }>>}
 */
async function findAccountsUsingSharedPasswords(candidates) {
  const passwords = [...new Set(candidates.filter(Boolean))];
  const matches = [];
  for (const account of await accountRepository.listAccountsWithoutPendingPasswordChange()) {
    for (const password of passwords) {
      if (account.password && (await bcrypt.compare(password, account.password))) {
        matches.push({ userId: account.userId, username: account.username, type: account.type });
        break;
      }
    }
  }
  return matches;
}

/**
 * Finds the accounts using a shared password and, with `apply`, flags them: they must choose
 * their own password at next sign-in (current sessions get 403 PASSWORD_CHANGE_REQUIRED).
 */
async function flagAccountsUsingSharedPasswords(candidates, { apply = false } = {}) {
  const matches = await findAccountsUsingSharedPasswords(candidates);
  if (apply) await accountRepository.flagPasswordChange(matches.map((m) => m.userId));
  return { matches, applied: apply };
}

module.exports = { KNOWN_SHARED_PASSWORDS, findAccountsUsingSharedPasswords, flagAccountsUsingSharedPasswords };
