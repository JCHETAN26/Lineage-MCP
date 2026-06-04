# Lineage MCP — Data Contract Sentinel

An MCP server that prevents **silent data breaks** by mapping dependencies across SQL, Python, Jupyter notebooks, PySpark, TypeScript, Prisma, and dbt. When you rename or drop a column, Lineage tells you every file and line that will break — before you ship.

```
You renamed users.email → users.user_email.
Lineage replies:

  /your-repo/etl_pipeline.py:8        pd.read_sql      [high]
  /your-repo/ml_training.py:7         spark.sql        [high]
  /your-repo/feature_engineering.ipynb  (cell 2)       [high]
  /your-repo/api/users.ts:14          pg.query         [high]
  /your-repo/api/users.ts:8           prisma.user      [high]
```

That `.ipynb` is the one that's been sitting unopened for days, the one nothing else would have caught.

---

## Install

```json
{
  "mcpServers": {
    "lineage": {
      "command": "npx",
      "args": ["-y", "@cjitendr/lineage-mcp"]
    }
  }
}
```

Add this to your MCP client's config — Cursor, Claude Desktop, or any other MCP-aware tool — then restart the client.

For local development:

```bash
git clone https://github.com/JCHETAN26/Lineage-MCP
cd Lineage-MCP
npm install && npm run build
node dist/index.js     # MCP server over stdio
node dist/cli.js help  # CLI alternative
```

## Tools

### Core (4)

| Tool | What it does |
|------|--------------|
| `scan` | Crawl a directory; report tables and dependency counts |
| `list_tables` | List every discovered table / model / ML feature |
| `list_lineage` | Show all consumers + upstream tables for one asset, with file/line numbers |
| `check_impact` | The headline tool. Given a schema change (rename/delete/type_change/add), return every file that breaks, with confidence + suggested fix |

### Janitor (4 — write to user files)

| Tool | What it does |
|------|--------------|
| `apply_remediation` | Apply a code patch with `.bak` backup and dry-run support. Replaces every occurrence atomically |
| `audit_pii_compliance` | Scan tables/columns for PII patterns (SSN, email, IBAN, etc.) and trace downstream flows |
| `sync_dbt_metadata` | Compare discovered SQL columns against `dbt manifest.json` and update the model's `schema.yml` |
| `generate_health_report` | Mermaid diagram + metrics + 0–100 health score. Optionally writes to a file |

### Diagnostics (2)

| Tool | What it does |
|------|--------------|
| `ping` | Health check — returns `pong — Lineage MCP v1.0.0 ✓` |
| `get_sample_project` | Path to the bundled jaffle-shop-lite sample for first-time exploration |

## Supported languages and patterns

| Language | What's detected |
|----------|-----------------|
| SQL | `CREATE/ALTER/DROP TABLE`, column defs, dbt `{{ ref() }}` and `{{ source() }}`, CTE scoping |
| Python | `pd.read_sql`, `pd.read_table`, SQLAlchemy `session.query`, `spark.sql`, `spark.read.*`, psycopg2/pymysql `.execute` |
| Jupyter (`.ipynb`) | Code cells extracted with line-aligned offsets — references point into the actual cell source, not JSON metadata |
| TypeScript / JS | Prisma client (`prisma.x.findMany` etc.), raw SQL template literals, `knex(...)`, TypeORM `@Entity`/`getRepository`, Sequelize `.define`/`findAll`, `pg.query` |
| Prisma schema (`.prisma`) | `model` blocks and their fields |
| dbt | `manifest.json` loader + heuristic scan when manifest is missing or stale |

The scanners are regex-based with a Python comment/docstring stripper, SQL statement-level recovery for malformed migrations, and a zero-noise filter so a Python local variable named `email` doesn't get reported as a `users.email` reference.

## CLI

The CLI exposes the same functionality without an MCP client:

```bash
lineage scan    --root ./your-project
lineage tables  --root ./your-project
lineage lineage users --root ./your-project
lineage impact  users --change rename --column email --new-name user_email --root ./your-project
lineage health  --root ./your-project
```

`lineage --help` for full reference.

## Performance

| Files | Wall-clock |
|-------|-----------|
| 250   | <100ms |
| 10,000 | ~1.4s (spec: <3s ✓) |
| 50,000 | ~13s (post-1.0 optimization target) |

In-memory graph with a 5-minute disk cache at `.lineage/cache.json` per scanned root. Cache invalidates automatically when the rootDir moves (cross-machine safe).

## Architecture

```
src/
  index.ts                  # MCP server + tool registration
  cli.ts                    # Direct CLI (scan, tables, lineage, impact, health)
  crawler.ts                # Async batched file walker (200/batch)
  graph.ts                  # In-memory dependency graph
  cache.ts                  # JSON cache with rootDir invalidation
  dbt-manifest.ts           # dbt manifest.json loader
  scanners/
    sql-scanner.ts          # CREATE/ALTER/DROP, dbt ref/source, CTE scope
    python-scanner.ts       # pd / SQLAlchemy / spark + comment/docstring stripper
    ts-scanner.ts           # raw SQL, Prisma, Knex, TypeORM, Sequelize, pg
    prisma-scanner.ts       # .prisma model definitions
    ml-scanner.ts           # ML-specific patterns
  tools/                    # MCP tool wrappers
  janitor/
    patcher.ts              # File mutation + backups
    compliance.ts           # PII audit
    dbt-sync.ts             # YAML sync against dbt manifest
    report-generator.ts     # Health report + Mermaid
```

## Testing

136 tests across 14 suites covering:

- Founding-story regression (cross-language rename detection)
- Adversarial inputs (malformed SQL, Python comment traps, empty/binary files)
- Janitor file mutation (backups, dry-run, multi-occurrence)
- PII compliance audit
- dbt YAML writing
- Real MCP wire format (subprocess client/server)
- CLI subcommands (exit codes, error messages)
- Real-world dbt project (`tmp-jaffle-shop`)
- 10k + 50k file scale benchmarks
- Cross-platform (macOS + Linux Docker verified)

```bash
npm test
```

## Status

v1.0.0 — first public release. See CHANGELOG.md for ongoing changes.

Known post-1.0 optimization targets:

- Tree-sitter integration for higher-precision Python/SQL AST analysis (currently regex-based)
- 50k-file scan under 10s (currently ~13s)
- Multi-file atomic patches with real rollback (currently stop-on-first-failure)
- Mutation testing via Stryker once Node version conflicts settle

## License

MIT
