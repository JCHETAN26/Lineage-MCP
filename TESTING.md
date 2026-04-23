# Lineage-MCP: Local Testing & Setup Guide

## Prerequisites
```bash
- Node.js 18+
- npm 8+
- Git
```

## Step 1: Clone & Install

```bash
git clone https://github.com/JCHETAN26/Lineage-MCP.git
cd Lineage-MCP
npm install
npm run build
```

## Step 2: Test with Bundled Sample Project

```bash
# View discovered tables
npm run cli -- tables --root tmp-jaffle-shop

# Check impact of renaming a table
npm run cli -- impact stg_orders --change rename --root tmp-jaffle-shop

# Show lineage for a table
npm run cli -- lineage customers --root tmp-jaffle-shop
```

## Step 3: Test on Your Own Project

```bash
npm run cli -- tables --root /path/to/your/project
npm run cli -- impact users --change rename --root /path/to/your/project
```

---

## End-to-End Testing Workflow

### Scenario: A Databus Renames `stg_orders` → `orders`

#### Step 1: Discover Impact
```bash
npm run cli -- impact stg_orders --change rename --new-name orders --root .
```

**Output:**
```
=== Impact: stg_orders ===
Found 2 file(s) referencing stg_orders:
- models/marts/order_items.sql:12 | high | Verified
- models/marts/orders.sql:5 | high | Verified
```

#### Step 2: Review Affected Code
Look at the output to see which files break.

#### Step 3: Use Remediation Tool (Dry Run)
**In your IDE (Cursor/Claude Desktop), call:**
```json
{
  "tool": "apply_remediation",
  "params": {
    "filePath": "models/marts/order_items.sql",
    "originalSnippet": "select * from {{ ref('stg_orders') }}",
    "replacementSnippet": "select * from {{ ref('orders') }}",
    "description": "Update stg_orders reference to orders table",
    "dryRun": true
  }
}
```

**Output:**
```
✅ Success (DRY RUN)
[DRY RUN] Would replace snippet in models/marts/order_items.sql
(No files were modified)
```

#### Step 4: Apply the Fix
Change `dryRun: false` and apply the same remediation.

**Output:**
```
✅ Success
Successfully patched models/marts/order_items.sql
Backup: .lineage/backups/2026-04-23T12-34-56-123Z_order_items.sql.bak
```

#### Step 5: Audit for PII Exposure
```json
{
  "tool": "audit_pii_compliance",
  "params": {}
}
```

**Output:**
```
⚠️ 4 potential PII exposure(s) found.
HIGH_RISK:
  - users.email
  - users.phone
  - users.ssn
MEDIUM_RISK:
  - users.date_of_birth

Flows to:
  - etl/transform.py:15
  - models/ml_features.sql:8
```

#### Step 6: Sync dbt Metadata
```json
{
  "tool": "sync_dbt_metadata",
  "params": {
    "dbtManifestPath": "target/manifest.json",
    "sqlFilePath": "models/orders.sql",
    "columns": [
      {"name": "order_id", "dataType": "int64"},
      {"name": "user_id", "dataType": "int64"},
      {"name": "amount", "dataType": "float64"}
    ],
    "dryRun": true
  }
}
```

**Output:**
```
✅ Success (DRY RUN)
New columns found: amount (missing from dbt YAML)
Would generate YAML block...
```

#### Step 7: Generate Health Report
```json
{
  "tool": "generate_health_report",
  "params": {
    "rootDir": ".",
    "includeDiagram": true,
    "outputPath": ".lineage/report.md"
  }
}
```

**Output:**
```
🟢 Health Score: 85/100
Tables: 12
Dependencies: 45
Files Scanned: 23

Recommendations:
- ✅ Column metadata is in sync
- 💡 Consider improving Python scanner patterns
```

---

## Integration with Your IDE

### For Cursor
Add to `.cursor/lineage-config.json`:
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

Then use `@lineage` in Cursor chat:
```
@lineage Check impact of renaming users table
@lineage What PII is exposed?
@lineage Generate health report
```

### For Claude Desktop
Add to `~/.claude/claude_desktop_config.json`:
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

Then chat with Claude and ask it to use the lineage tools.

---

## CLI Command Reference

```bash
# List all tables
npm run cli -- tables [--root PATH]

# Check impact of change
npm run cli -- impact TABLE --change rename|delete|type_change|add [--root PATH]

# Show lineage
npm run cli -- lineage TABLE [--column COL] [--root PATH]

# Full rescan (bypass cache)
npm run cli -- scan [--root PATH]

# Help
npm run cli -- help
```

---

## Running Tests

```bash
# Full test suite
npm test

# Watch mode
npm test -- --watch

# Single test file
npm test -- sql-scanner.test.ts
```

---

## Troubleshooting

### Issue: "No tables found"
```bash
# Check that your SQL files are in expected paths:
ls -R . | grep -E "\.(sql|py|ts|js)$"

# Try explicit root:
npm run cli -- tables --root ./models
```

### Issue: "Command not found"
```bash
# Rebuild:
npm run build

# Check dist/ has files:
ls dist/*.js
```

### Issue: "MCP Server not starting"
```bash
# Test direct:
npm run start

# Should see message on stdin ready
```

---

## Next: PR Generation (Not Yet Implemented)

The vision is for Lineage-MCP to eventually:
1. ✅ Detect breaks (Done)
2. ✅ Map impact (Done)
3. ✅ Apply fixes (Done with `apply_remediation`)
4. ⏳ **Create PR** (Next Phase)

See "Phase 4: PR Generation" below.
