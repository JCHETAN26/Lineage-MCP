# Lineage MCP — Data Contract Sentinel

An MCP server that prevents **silent data breaks** by mapping dependencies between database schemas and code. When a column gets renamed or dropped, Lineage tells you exactly which files and lines will break — before you deploy.

## Quick Start

### With Cursor / Claude Desktop / VS Code

Add to your MCP config:

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

### Run locally

```bash
git clone https://github.com/JCHETAN26/Lineage-MCP
cd Lineage-MCP
npm install && npm run build
node dist/index.js
```

## Tools

### `check_impact`
Analyze the blast radius of a schema change.

```json
{
  "table": "users",
  "column": "email",
  "changeType": "rename",
  "newName": "user_email",
  "rootDir": "/path/to/your/project"
}
```

Returns all files + line numbers that reference `users.email`, with confidence levels and suggested fixes.

### `list_lineage`
Show the full dependency tree for a table or column.

```json
{
  "table": "orders",
  "rootDir": "/path/to/your/project"
}
```

### `list_tables`
List all tables discovered in the scanned codebase.

### `ping`
Health check — verify the server is running.

## Supported Languages

| Language | Patterns Detected |
|----------|------------------|
| SQL | `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, column definitions |
| Python | `pd.read_sql`, `spark.sql`, `spark.read.table`, SQLAlchemy sessions, psycopg2/pymysql |
| TypeScript/JS | Prisma, Knex, TypeORM, Sequelize, raw SQL strings, `pg.query` |

## Architecture

```
src/
  index.ts          # MCP server + tool handlers
  crawler.ts        # File system walker (batched, async)
  graph.ts          # In-memory dependency graph
  types.ts          # Shared TypeScript types
  scanners/
    sql-scanner.ts  # SQL DDL + DML parser
    python-scanner.ts
    ts-scanner.ts
  tools/
    check-impact.ts
    list-lineage.ts
```

## Performance

- Scans 10,000+ files using async batched I/O (200 files/batch)
- 30-second in-memory cache per root directory
- Graceful degradation on malformed syntax — never crashes

## Development

```bash
npm run dev    # tsx watch mode
npm test       # Jest test suite
npm run build  # TypeScript compile
```
# Lineage-MCP
