# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-06-04

First public release of **Lineage** — a TypeScript MCP server that acts as a
"Data Contract Sentinel," preventing silent data breaks by mapping dependencies
between data schemas and the code that consumes them.

### Added

- **MCP server** over stdio, distributed as `@cjitendr/lineage-mcp` and runnable
  via `npx`.
- **Multi-language crawler** with regex-based scanners:
  - SQL (`CREATE`/`ALTER`/`DROP TABLE`, column definitions)
  - Python (`pd.read_sql`/`read_table`, PySpark `spark.sql`, dbt `source`/`ref`)
  - SQLAlchemy session/query patterns
  - TypeScript/JavaScript (raw SQL strings, ORM calls)
  - Prisma schema
  - ML feature references
- **In-memory dependency graph** (tables/columns as nodes, file+line references
  as edges) with optional JSON cache in `.lineage/`.
- **Impact tools:**
  - `check_impact` — report files/lines affected by a schema change, with
    confidence levels and suggested remediation.
  - `list_lineage` — full upstream/downstream dependency chain for a table or
    column.
- **Agentic Data Janitor** layer:
  - `apply_remediation` — apply suggested fixes to dependent code.
  - `audit_pii_compliance` — scan lineage for PII exposure.
  - `sync_dbt_metadata` — reconcile lineage against a dbt manifest.
  - `generate_health_report` — summarize lineage/data-contract health.
- **Performance:** scans 10,000+ dependencies in under 3 seconds; observational
  50k-scale test included.
- **Robustness:** scanners degrade gracefully on malformed SQL/Python/JS rather
  than crashing; deduplicated dependency reporting.
- **Test suite:** 144 tests across 16 suites (unit, integration, adversarial,
  scale, real-world dbt, MCP subprocess).

[Unreleased]: https://github.com/JCHETAN26/Lineage-MCP/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/JCHETAN26/Lineage-MCP/releases/tag/v1.0.0
