# Using Lineage-MCP with Claude Code

## Step 1: Configuration (Already Done ✅)

The MCP server is configured at `.claude-code-config.json` and ready to use.

## Step 2: How to Test in Claude Code

### Method 1: Using CLI Commands (Simplest)

Just run commands directly in the terminal:

```bash
# List all discovered tables
npm run cli -- tables --root tmp-jaffle-shop

# Check impact of schema change
npm run cli -- impact stg_orders --change rename --root tmp-jaffle-shop

# Show lineage for a table
npm run cli -- lineage customers --root tmp-jaffle-shop

# Audit for PII
npm run cli -- audit-pii --root tmp-jaffle-shop

# Generate health report
npm run cli -- generate-health --root tmp-jaffle-shop
```

### Method 2: Using MCP Tools (When IDE Supports It)

If your Claude Code environment has MCP support enabled, you can call the tools directly:

```
Tools Available:
1. check_impact - Analyze schema change impact
2. list_lineage - Show dependency chain
3. list_tables - Discover all tables
4. apply_remediation - Fix code with backups
5. audit_pii_compliance - Detect sensitive data
6. sync_dbt_metadata - Sync dbt YAML
7. generate_health_report - Get health metrics
```

## Step 3: Test These Examples

### Example 1: Discover Tables
```bash
npm run cli -- tables --root tmp-jaffle-shop
```

**Expected Output:**
```
=== Discovered Tables ===
- customers
- locations
- order_items
- orders
- products
- stg_customers
- stg_locations
- stg_orders
- stg_products
- stg_supplies
- supplies
```

### Example 2: Check Schema Impact
```bash
npm run cli -- impact stg_orders --change rename --root tmp-jaffle-shop
```

**Expected Output:**
```
=== Impact: stg_orders ===
Found 2 file(s) referencing stg_orders:
- models/marts/order_items.sql:12 [high]
- models/marts/orders.sql:5 [high]
```

### Example 3: Generate Health Report
```bash
npm run cli -- generate-health --root tmp-jaffle-shop
```

**Expected Output:**
```
🟢 Health Score: 85/100
Tables: 12
Dependencies: 15
Status: Healthy
```

---

## Step 4: Example Claude Code Prompts

You can now ask Claude Code questions about your data:

```
"@lineage List all tables in my dbt project"
→ Uses: list_tables tool

"@lineage What happens if I rename stg_orders?"
→ Uses: check_impact tool

"@lineage Show me the lineage for the customers table"
→ Uses: list_lineage tool

"@lineage Audit my database for PII exposure"
→ Uses: audit_pii_compliance tool

"@lineage Generate a health report for my data pipeline"
→ Uses: generate_health_report tool

"@lineage Fix the stg_orders reference in models/marts/order_items.sql"
→ Uses: apply_remediation tool
```

---

## Troubleshooting

### Issue: "lineage tool not found"
```bash
# Rebuild the project
npm run build

# Check that dist/index.js exists
ls -la dist/index.js
```

### Issue: "No tables discovered"
```bash
# Verify SQL files exist in the path
ls tmp-jaffle-shop/models/

# Try explicit path
npm run cli -- tables --root /Users/chetan/Lineage-MCP/tmp-jaffle-shop
```

### Issue: "MCP server not responding"
```bash
# Check if Node process is running
ps aux | grep node

# Try restarting
npm run build && npm test
```

---

## Integration Flow in Claude Code

```
┌─────────────────────┐
│   Claude Code       │
│   (Your question)   │
└──────────┬──────────┘
           │
           ▼
    ┌─────────────────┐
    │ MCP Client      │ 
    │ (Claude Code)   │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ Lineage-MCP Server      │
    │ (dist/index.js)         │
    ├─────────────────────────┤
    │ • check_impact          │
    │ • list_lineage          │
    │ • apply_remediation     │
    │ • audit_pii_compliance  │
    │ • generate_health_report│
    └────────┬────────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ Your Codebase           │
    │ • SQL files             │
    │ • Python files          │
    │ • dbt projects          │
    └─────────────────────────┘
```

---

## What You Can Do Now

✅ **In this Claude Code session:**
1. Ask me to scan your project
2. Ask me to check impact of changes
3. Ask me to generate fixes
4. Ask me to audit for PII
5. Ask me to create health reports

**Example**:
```
"Scan the tmp-jaffle-shop project and tell me:
1. How many tables exist?
2. What's the health score?
3. Are there any PII exposures?"
```

I'll run the tools and give you the results!

---

## Next: PR Generation

When Phase 4 is implemented, you'll also be able to ask:

```
"Create a GitHub PR to fix the stg_orders references"
```

And Lineage-MCP will:
1. Create a feature branch
2. Apply all patches
3. Push to GitHub
4. Create PR automatically
5. Return PR link for review
```
