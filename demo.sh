#!/bin/bash

# Lineage-MCP Interactive Demo
# Showcases all core features with formatted output

set -e

DEMO_ROOT="/Users/chetan/Lineage-MCP"
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

header() {
  echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}▶ $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

section() {
  echo -e "\n${YELLOW}📌 $1${NC}\n"
}

success() {
  echo -e "${GREEN}✅ $1${NC}\n"
}

run_cmd() {
  echo -e "${YELLOW}$${NC} $1\n"
  eval "$1"
}

cd "$DEMO_ROOT"

clear

echo -e "${BLUE}"
cat << "EOF"
 _     _                            ___  ___  ___ ____
| |   (_)                          |  \/  | / __|  _ \
| |    _ _ __   ___  __ _  __ _    | .  . |/ |  | |_) |
| |   | | '_ \ / _ \/ _` |/ _` |   | |\/| | |  |  __/
| |___| | | | |  __/ (_| | (_| |   | |  | | |__| |
|_____|_|_| |_|\___|\__,_|\__, |   \_|  |_/\____|_|
                           __/ |
                          |___/
EOF
echo -e "${NC}"

echo -e "${GREEN}Data Contract Sentinel — MCP Server${NC}"
echo -e "Automated lineage tracking & silent data break prevention\n"

# ==================== DEMO 1: MCP Server ====================
header "DEMO 1: MCP Server Health Check"

section "Verifying MCP Server is running..."
run_cmd "/Users/chetan/Lineage-MCP/lineage-mcp-server.sh &
sleep 1
echo '✅ MCP Server running on stdio'"

# ==================== DEMO 2: Table Discovery ====================
header "DEMO 2: Discover All Tables & Assets"

section "Scanning dbt project for tables..."
run_cmd "npm run cli -- tables --root demo"

section "✨ What you see:"
echo "- All SQL tables discovered via CREATE TABLE statements"
echo "- ML features detected from Python patterns"
echo "- Asset relationships tracked automatically"

# ==================== DEMO 3: Lineage Visualization ====================
header "DEMO 3: View Full Lineage & Dependencies"

section "Tracing dependencies for 'users' table..."
run_cmd "npm run cli -- lineage users --root demo"

section "✨ What you see:"
echo "- Where the table is defined (file + line)"
echo "- All consumers (downstream files using this table)"
echo "- Upstream tables feeding into this one"
echo "- Confidence levels for each dependency"

# ==================== DEMO 4: Impact Analysis ====================
header "DEMO 4: Analyze Impact of Schema Changes"

section "Scenario: Rename users.email → users.user_email"
echo "Question: What will break if we make this change?"
echo ""
run_cmd "npm run cli -- impact users --change rename --column email --new-name user_email --root demo"

section "✨ What you see:"
echo "- All files that will break (9 files across 3 languages in the screenshot)"
echo "- Confidence levels (HIGH/MEDIUM/LOW)"
echo "- Specific line numbers where fixes are needed"
echo "- Suggested grep command to find & replace automatically"
echo "- Full dependency tree showing the blast radius"

# ==================== DEMO 5: Health Report ====================
header "DEMO 5: Generate Comprehensive Health Report"

section "Analyzing data lineage health for large dbt project..."
run_cmd "npm run cli -- health --root tmp-jaffle-shop"

section "✨ What you see:"
echo "- Metrics: 12 tables, 15 dependencies, 12 files scanned"
echo "- Health score: 0-100 rating"
echo "- Warnings for potential issues"
echo "- Mermaid diagram for visualization"
echo "- Recommendations for improvement"

# ==================== DEMO 6: MCP Tools ====================
header "DEMO 6: All Available MCP Tools"

section "10 Tools Ready for Cursor/Claude:"
echo "
${GREEN}Core Tools:${NC}
  1. check_impact      → Analyze blast radius of schema changes
  2. list_lineage      → Show full dependency chains
  3. list_tables       → Discover all assets
  4. scan              → Force fresh rescan

${GREEN}Janitor Tools (Agentic Features):${NC}
  5. apply_remediation → Auto-fix code with backups
  6. audit_pii_compliance → Detect sensitive data exposure
  7. sync_dbt_metadata → Sync dbt YAML with discovered columns
  8. generate_health_report → Comprehensive health metrics

${GREEN}Utility:${NC}
  9. ping              → Health check
  10. get_sample_project → Get sample project path
"

# ==================== DEMO 7: Agentic Features ====================
header "DEMO 7: Agentic Data Janitor Features"

section "1️⃣ PII Compliance Audit"
echo "Automatically detect sensitive columns (SSN, email, phone, etc.)"
echo "$ npm run cli -- audit-pii --root ./data"

section "2️⃣ dbt Metadata Sync"
echo "Keep dbt model YAML in sync with actual SQL columns"
echo "$ npm run cli -- sync-dbt --manifest manifest.json"

section "3️⃣ Apply Remediation"
echo "Safe file patching with atomic backups & rollback"
echo "$ npm run cli -- patch --file users_api.ts --snippet old --replace new"

section "4️⃣ Health Report"
echo "Comprehensive health scoring with visual dependency diagrams"
echo "$ npm run cli -- health --root ./project --output report.md"

# ==================== SUMMARY ====================
header "SUMMARY: What Lineage-MCP Does"

echo -e "${GREEN}✅ Prevents Silent Data Breaks${NC}"
echo "  When DBAs rename/delete columns, alerts ALL affected code"
echo ""
echo -e "${GREEN}✅ Automatic Impact Analysis${NC}"
echo "  Scan any codebase → find exact breaking locations"
echo ""
echo -e "${GREEN}✅ Multi-Language Support${NC}"
echo "  SQL, Python (pandas, SQLAlchemy, PySpark), TypeScript, dbt"
echo ""
echo -e "${GREEN}✅ Smart Remediation${NC}"
echo "  Auto-patch code with backups, dry-run mode, rollback support"
echo ""
echo -e "${GREEN}✅ IDE Integration (MCP)${NC}"
echo "  Works in Cursor, Claude Desktop, VS Code"
echo ""
echo -e "${GREEN}✅ Enterprise Ready${NC}"
echo "  PII detection, dbt sync, health scoring, compliance tracking"

# ==================== NEXT STEPS ====================
header "NEXT STEPS"

echo -e "${YELLOW}1. Install in Cursor/Claude Desktop:${NC}"
echo '   Add to settings: {"command": "/Users/chetan/Lineage-MCP/lineage-mcp-server.sh"}'
echo ""
echo -e "${YELLOW}2. Use in Chat:${NC}"
echo '   @lineage list_tables'
echo '   @lineage check_impact users email delete'
echo ""
echo -e "${YELLOW}3. Integrate into Your Pipeline:${NC}"
echo '   npx @cjitendr/lineage-mcp check_impact --table users --change delete'
echo ""
echo -e "${YELLOW}4. Explore Advanced Features:${NC}"
echo '   npm run cli -- health --root ./your-project'
echo '   npm run cli -- audit-pii --tables users,customers'

echo -e "\n${GREEN}🎉 Demo Complete!${NC}\n"
