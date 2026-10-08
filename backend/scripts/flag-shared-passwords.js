/**
 * Flags accounts still using a shared initial password (Test@1234, plus DEFAULT_ACCOUNT_PASSWORD /
 * DEMO_ACCOUNT_PASSWORD when set, plus any --password values): they must choose their own
 * password at next sign-in. Dry run unless --apply.
 *
 * Run from backend/ after `npm run build`:
 *   npm run db:flag-shared-passwords                     # list only
 *   npm run db:flag-shared-passwords -- --apply          # flag them
 *   npm run db:flag-shared-passwords -- --password 'Old#Pass1' --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { fromDist } = require('./lib/fromDist');
const sequelize = fromDist('common/database');
const { KNOWN_SHARED_PASSWORDS, flagAccountsUsingSharedPasswords } = fromDist('services/admin/sharedPasswordAudit');

function parseArgs(argv) {
  const extra = [];
  let apply = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') apply = true;
    else if (argv[i] === '--password' && argv[i + 1]) extra.push(argv[(i += 1)]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return { apply, extra };
}

(async () => {
  const { apply, extra } = parseArgs(process.argv.slice(2));
  const candidates = [
    ...KNOWN_SHARED_PASSWORDS,
    process.env.DEFAULT_ACCOUNT_PASSWORD,
    process.env.DEMO_ACCOUNT_PASSWORD,
    ...extra,
  ];
  await sequelize.authenticate();
  const { matches } = await flagAccountsUsingSharedPasswords(candidates, { apply });
  await sequelize.close();

  for (const m of matches) console.log(`${m.type}\t${m.userId}\t${m.username}`);
  console.log(
    `${matches.length} account(s) use a shared password${apply ? ': flagged.' : '. Dry run: re-run with --apply to flag them.'}`
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
