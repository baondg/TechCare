# Schema and configuration migration checklist

Use this before releases or when merging DB-related changes. Goal: avoid silent drift between `database_description.sql`, Sequelize models, and runtime expectations.

## Before deploy

1. **SYSTEM_CONFIGURATION** - Confirm keys used by the app exist in seed/migration docs (`AI_MODEL_REGISTRY`, feature defaults, rate limits if stored in DB).
2. **AI_MODEL** - Active row has `provider` and non-empty `version` (API model id) when the product expects a specific remote model; align with `AI_INTEGRATION.md`.
3. **Prescription / duration** - If the branch touches prescriptions, confirm duration columns and CHECK constraints match `LIMITATIONS.md` (section 5).
4. **New tables** - Run `database_description.sql` fragment or migration on staging first; verify `sequelize.sync` / `AUTO_SYNC_DB` behavior is not relied on in production (`AUTO_SYNC_DB=0` on Cloud Run).

## CI / dev hygiene (optional hardening)

- Add a startup or CI script that compares required `SYSTEM_CONFIGURATION` keys to a checked-in manifest (Phase C follow-up).
- Fail fast in dev when critical tables are missing instead of partial runtime errors.

## Related

- `database_description.sql` - canonical DDL reference.
- `LIMITATIONS.md` - known schema and product limitations.