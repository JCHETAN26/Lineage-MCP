This folder is a tiny SQL workspace for testing the VS Code extension.

Suggested flow:

1. Open this `demo/` folder in the Extension Development Host.
2. Open `schema.sql` first to see `CREATE TABLE` CodeLens entries.
3. Open `analytics.sql` and `migration.sql` to create dependents and schema changes.
4. If the lenses look stale, run the extension's rescan command and reopen `schema.sql`.

Files:

- `schema.sql`: base tables that should show CodeLens and inline decorations
- `analytics.sql`: downstream queries that reference those tables
- `migration.sql`: example `ALTER TABLE` and `DROP TABLE` changes
- `consumer_report.sql`: another dependent SQL file so counts are more obvious
