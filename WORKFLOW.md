# Lineage-MCP: Complete Workflow Diagram

## Current State (v0.2.0)

```
┌─────────────────────────────────────────────────────────────────┐
│                    LINEAGE-MCP WORKFLOW                         │
└─────────────────────────────────────────────────────────────────┘

USER ACTION
    │
    ▼
┌─────────────────────┐
│  DETECTION PHASE    │  ← What we HAVE ✅
├─────────────────────┤
│ 1. Scan codebase    │
│ 2. Build graph      │
│ 3. Detect break     │
│    (check_impact)   │
└──────────┬──────────┘
           │
           ▼
    ┌─────────────────────┐
    │ Impact Report:      │ ✅ WORKING
    │ • 2 files affected  │
    │ • 5 lines to fix    │
    │ • High confidence   │
    └──────────┬──────────┘
               │
               ▼
        ┌──────────────────────┐
        │ REMEDIATION PHASE    │ ← What we HAVE ✅
        ├──────────────────────┤
        │ 1. Validate snippet  │
        │ 2. Create backup     │
        │ 3. Apply patch       │
        │    (apply_remediation)
        │ 4. Verify fix        │
        └──────────┬───────────┘
                   │
                   ▼
           ┌────────────────────┐
           │ Local Changes:     │ ✅ WORKING
           │ • Files patched    │
           │ • Backups created  │
           │ • Ready to commit  │
           └──────────┬─────────┘
                      │
                      ▼
             ┌──────────────────────┐
             │ GOVERNANCE PHASE     │ ← What we HAVE ✅
             ├──────────────────────┤
             │ 1. Audit PII         │
             │ 2. Check dbt sync    │
             │ 3. Generate health   │
             │    report            │
             └──────────┬───────────┘
                        │
                        ▼
                ┌─────────────────────┐
                │ Compliance Report:  │ ✅ WORKING
                │ • PII violations    │
                │ • dbt mismatches    │
                │ • Health score      │
                └──────────┬──────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │ PR GENERATION PHASE      │ ⏳ PLANNED
              ├──────────────────────────┤
              │ 1. Create branch         │
              │ 2. Commit changes        │
              │ 3. Push to GitHub        │
              │ 4. Create PR via API     │
              │ 5. Tag reviewers         │
              └──────────┬───────────────┘
                         │
                         ▼
                  ┌────────────────────┐
                  │ GitHub PR Created: │ ⏳ NOT YET
                  │ https://github...  │
                  │                    │
                  │ [Ready for Review] │
                  └────────┬───────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │ Human Review     │ ⏳ MANUAL
                    ├──────────────────┤
                    │ • Approve        │
                    │ • Request changes│
                    └────────┬─────────┘
                             │
                             ▼
                      ┌─────────────────┐
                      │ Merge to Main   │ ⏳ MANUAL
                      ├─────────────────┤
                      │ Fixed! ✅       │
                      └─────────────────┘
```

---

## Quick Start Path (30 seconds)

```
1. Clone & Install
   └─> npm install && npm run build

2. Run CLI Test
   └─> npm run cli -- tables --root tmp-jaffle-shop
   
3. Check Impact
   └─> npm run cli -- impact stg_orders --change rename --root tmp-jaffle-shop

4. View Report
   └─> See affected files in terminal

5. Next Steps
   └─> Configure IDE (Cursor/Claude Desktop)
```

---

## Full End-to-End Example

### Step 1: Data Engineer Renames Table
```bash
# In database:
ALTER TABLE stg_orders RENAME TO orders;
```

### Step 2: Run Lineage Scanner
```bash
npm run cli -- scan --root ./project
```

### Step 3: Detect Impact
```bash
npm run cli -- impact stg_orders --change rename --root ./project
```

**Output:**
```
=== Impact: stg_orders ===
Found 2 file(s):
✗ models/marts/order_items.sql:12 [high]
✗ models/marts/orders.sql:5 [high]
```

### Step 4: Audit Compliance
```typescript
// Call via IDE (Cursor/Claude):
audit_pii_compliance()
```

**Output:**
```
⚠️ 4 PII exposures found
- users.email [HIGH]
- users.phone [HIGH]
- users.ssn [HIGH]
- users.dob [MEDIUM]
```

### Step 5: Generate Health Report
```typescript
// Call via IDE:
generate_health_report()
```

**Output:**
```
🟢 Health Score: 85/100
✅ 12 tables discovered
✅ 45 dependencies mapped
⚠️ 2 unsynced dbt columns
```

### Step 6: Apply Patch (Local)
```typescript
// Call via IDE:
apply_remediation({
  filePath: "models/marts/order_items.sql",
  original: "{{ ref('stg_orders') }}",
  replacement: "{{ ref('orders') }}",
  dryRun: false
})
```

**Output:**
```
✅ Successfully patched models/marts/order_items.sql
📦 Backup: .lineage/backups/2026-04-23T12-34-56-123Z_order_items.sql.bak
```

### Step 7: Create PR (When Implemented)
```typescript
// Call via IDE:
create_pr({
  title: "fix: Update stg_orders → orders",
  description: "Automated by Lineage-MCP",
  changes: [/* 2 files */],
  githubToken: process.env.GITHUB_TOKEN
})
```

**Output:**
```
✅ PR Created: https://github.com/user/repo/pull/42
   [Ready for review]
```

---

## Architecture: What Runs Where

```
┌─────────────────────────────────────┐
│      USER'S MACHINE                 │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────────────────────────┐  │
│  │   IDE (Cursor/Claude)        │  │
│  │   └─> @lineage tools         │  │
│  │       └─> MCP Protocol       │  │
│  └────────────┬─────────────────┘  │
│               │                     │
│               ▼                     │
│  ┌──────────────────────────────┐  │
│  │  Lineage-MCP Server          │  │
│  │  (runs via node)             │  │
│  ├──────────────────────────────┤  │
│  │ Janitor Layer:               │  │
│  │ • Scanner (SQL/Py/TS)        │  │
│  │ • Graph Builder              │  │
│  │ • Patcher                    │  │
│  │ • Compliance Checker         │  │
│  │ • dbt Sync                   │  │
│  │ • Health Reporter            │  │
│  └────────────┬─────────────────┘  │
│               │                     │
│               ▼                     │
│  ┌──────────────────────────────┐  │
│  │  User's Codebase             │  │
│  │  • SQL files                 │  │
│  │  • Python files              │  │
│  │  • TypeScript files          │  │
│  │  • dbt manifests             │  │
│  └──────────────────────────────┘  │
│                                     │
│  Local: No cloud calls, No        │
│  external dependencies             │
│                                     │
└─────────────────────────────────────┘
                  │
                  │ (When PR generation ready)
                  ▼
       ┌──────────────────────┐
       │  GitHub API          │
       │  (optional, with     │
       │   user's PAT token)  │
       └──────────────────────┘
```

---

## Feature Matrix

| Feature | Status | How to Use | Output |
|---------|--------|-----------|--------|
| **Scan** | ✅ | `npm run cli -- scan` | Tables + Dependencies |
| **Impact** | ✅ | `npm run cli -- impact TABLE` | Affected Files |
| **Lineage** | ✅ | `npm run cli -- lineage TABLE` | Dependency Tree |
| **PII Audit** | ✅ | `audit_pii_compliance()` | Risk Report |
| **dbt Sync** | ✅ | `sync_dbt_metadata()` | YAML Diffs |
| **Health** | ✅ | `generate_health_report()` | Score + Diagram |
| **Patch** | ✅ | `apply_remediation()` | Patched File + Backup |
| **PR Create** | ⏳ | `create_pr()` | GitHub PR URL |
| **Auto-Merge** | ⏳ | `auto_merge_pr()` | Merged Status |

---

## Deployment Options

### 1. Local Only (Current)
```bash
npm install
npm run build
npm run cli -- ...
```

### 2. IDE Integration (Ready)
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

### 3. npm Package (Ready)
```bash
npm install @cjitendr/lineage-mcp
npx lineage-mcp
```

### 4. Docker (TODO)
```bash
docker run -v $(pwd):/workspace lineage-mcp:latest
```

---

## Next Phase: PR Generation (May 2026)

When implemented, the full loop becomes:
```
Schema Change Detected
    ↓
Impact Analyzed
    ↓
Fix Generated & Tested Locally
    ↓
PR Created Automatically
    ↓
Human Reviews (5 seconds)
    ↓
Auto-Merged to Main
    ↓
CI/CD Deploys Fix
```

**Complete time**: ~1 minute vs ~30 minutes manual
