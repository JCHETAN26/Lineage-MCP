# Lineage MCP: Build Prompt & Token Optimization Guide

## How to Use This Prompt with Claude Code

**Step 1**: Copy the prompt below and paste it into Claude Code.  
**Step 2**: Claude will begin autonomous scaffolding and implementation.  
**Step 3**: Follow the token optimization strategies (at the end) to maximize output quality.

---

## Lineage MCP: Data Contract Sentinel—Build Specification

You are building **Lineage**, a TypeScript-based Model Context Protocol (MCP) server that acts as an automated "Data Contract Sentinel" within development IDEs. The core mission is **preventing Silent Data Breaks**—silent failures that occur when database schema changes (e.g., column renames) break downstream ML models or analytics pipelines without developer awareness.

### Core Value Proposition
Lineage bridges SDEs, DEs, and ML Engineers by mapping dependencies between data schemas and code logic, enabling automated impact analysis before code changes are deployed.

### Technical Stack
- **Language**: TypeScript (Node.js, ESM)
- **Protocol**: Model Context Protocol over stdio
- **Parser Engine**: Hybrid (Tree-sitter for AST precision, Regex for broad-stroke scanning)
- **Persistence**: In-memory graph + optional SQLite-based cache in `.lineage/` directory
- **Distribution**: npm package via `npx`

### Implementation Roadmap (5 Phases)

#### **PHASE 1: SDK & Environment Setup**
Initialize the project structure:
- Create an npm TypeScript project with ESM support.
- Install `@modelcontextprotocol/sdk` and `zod` for schema validation.
- Build a "Hello World" MCP tool to verify IDE connectivity.
- Set up a basic server that listens on stdio and responds to MCP messages.

#### **PHASE 2: Multi-Language Crawler**
Build the "senses" of the lineage engine:
- **SQL Scanner**: Parse SQL files to identify `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, and column definitions. Store table names and column names.
- **Python Scanner**: Detect data-access patterns:
  - `pd.read_sql(...)` / `pd.read_table(...)`
  - `SQLAlchemy` session patterns (`session.query(...)`)
  - PySpark DataFrame operations (`spark.sql(...)`)
  - File path + line number for each reference.
- **TypeScript/JavaScript Scanner**: Identify API endpoints and database queries embedded in TypeScript (e.g., raw SQL strings, ORM calls).
- **Dependency Graph Generator**: Create a JSON-based in-memory graph:
  - **Nodes**: Tables (from SQL) + Data-access locations (files with line numbers)
  - **Edges**: Which files/lines depend on which tables/columns.

#### **PHASE 3: Impact Engine (MCP Tools)**
Expose two primary MCP tools:

**Tool 1: `check_impact`**
- **Input**: A data asset change (e.g., "table `users` column `email` renamed to `user_email`")
- **Output**: A structured report listing:
  - All files that reference the changed asset
  - Specific line numbers where the impact occurs
  - Confidence level (high/medium/low) based on parsing precision
  - Suggested remediation (if applicable)

**Tool 2: `list_lineage`**
- **Input**: A table name or column name
- **Output**: The complete dependency chain:
  - Which files/functions consume this asset
  - Which upstream assets feed into it
  - A visual or textual representation of the lineage tree

#### **PHASE 4: Verification & Perfection**
Achieve "Senior SDE" quality:
- **Zero-Noise Filter**: Distinguish between database columns and locally-scoped variables with identical names using scope analysis.
- **Performance Tuning**: Ensure the crawler can scan 10,000+ files in under 3 seconds using worker threads.
- **Robust Error Handling**: The server must never crash on malformed SQL, Python, or JavaScript syntax. Instead, log warnings and continue scanning.
- **Deduplication**: Avoid reporting the same dependency twice.
- **Caching**: Optionally persist the dependency graph to `.lineage/cache.db` (SQLite) for faster subsequent runs.

#### **PHASE 5: NPM Packaging & Launch**
Enable frictionless user adoption:
- Configure `package.json` with a `"bin"` field to support `npx @your-scope/lineage`.
- Create a polished README with clear installation/usage instructions.
- Document the MCP server configuration for Cursor, Claude Desktop, and VS Code.
- Publish to the npm registry.

### Quality Control Checklist
Before considering the project complete, verify:
- ✓ Does it detect SQL column renames and alert dependent code?
- ✓ Does it track Python data-loading logic across multiple files?
- ✓ Does it run fully locally without external cloud dependencies?
- ✓ Does it handle 10k+ files in <3 seconds?
- ✓ Does it gracefully handle syntax errors without crashing?
- ✓ Can it be installed and run via `npx`?

### Installation & Usage Configuration
Once built, users configure it by adding to their MCP client (e.g., Cursor, Claude Desktop):
```json
{
  "mcpServers": {
    "lineage": {
      "command": "npx",
      "args": ["-y", "@your-scope/lineage"]
    }
  }
}
```

### Implementation Notes
1. **Start modular**: Build Phase 1 completely before moving to Phase 2.
2. **Test incrementally**: Each phase should have basic test coverage.
3. **Prioritize clarity**: Code should be self-documenting; prefer readability over premature optimization.
4. **Use Tree-sitter** for structured parsing (SQL, Python) but fall back to Regex for rapid scanning of large codebases.
5. **Assume mixed codebases**: The scanner will encounter both well-formed and malformed SQL/Python; design defensively.

---

## Token Optimization Strategy for Claude Code

To maximize output quality and token efficiency, follow this approach:

### 1. **Phase-by-Phase Approach** (Preserves Context)
- Complete one full phase before asking for the next.
- Example: "Build Phase 1 fully. I'll confirm completion, then ask for Phase 2."
- This prevents token waste on redundant phase descriptions and keeps Claude focused.

### 2. **Explicit Confirmation Checkpoints**
After each major phase, ask Claude to confirm:
```
Have you completed Phase [N] including:
- [ ] All files created
- [ ] Basic test coverage added
- [ ] No TypeScript errors
- [ ] Capable of running locally

Proceed to next phase only after confirmation.
```

### 3. **Iterative Refinement Over Full Rebuilds**
Instead of saying "rebuild everything", use targeted requests:
- ❌ "Rewrite the entire crawler" (wasteful)
- ✅ "The SQL scanner isn't catching ALTER TABLE. Fix the regex in src/scanners/sql-scanner.ts" (surgical)

### 4. **Request Code Summaries at Phase Boundaries**
Between phases, request a brief summary:
```
Summarize the current codebase structure:
- All files created
- Key exports from each module
- Any external dependencies added
```
This ensures continuity without repeating context.

### 5. **Parallel File Creation**
When Claude creates multiple independent files, request them all at once:
```
In Phase 1, create:
- src/index.ts
- src/types.ts
- src/mcp-tools.ts
- package.json
- tsconfig.json

Create all files in one pass.
```

### 6. **Use File References in Follow-up Requests**
Once a file exists, reference it directly instead of re-pasting:
```
✅ Good: "Update the error handler in src/server.ts to catch JSON parse errors"
❌ Wasteful: *pastes entire file* "please add error handling..."
```

### 7. **Test-Driven Validation**
Ask Claude to write tests that confirm phase completion:
```
Write unit tests for Phase 2 scanners. Tests should verify:
- SQL scanner finds 5 CREATE TABLE statements in test.sql
- Python scanner detects pd.read_sql calls with file/line numbers
- Graph generator creates proper node/edge structure
```
Tests serve as both validation and documentation.

### 8. **Conditional Dependencies**
If a phase blocks on an external decision, ask once and commit:
```
Should the cache use SQLite or JSON files? Choose one, I'll confirm direction.
```
Don't revisit this mid-phase.

### 9. **Request Implementation over Explanation**
- ❌ "Explain how to implement the SQL scanner" (metadata)
- ✅ "Implement the SQL scanner in src/scanners/sql-scanner.ts" (actual code)

### 10. **Final Code Review Loop**
After all phases:
```
Review the entire codebase for:
1. Unused imports
2. Inconsistent error handling
3. Missing type annotations
4. Performance bottlenecks (relative to 10k file target)

Fix any issues found.
```

---

## Expected Deliverables

After following this prompt and optimization strategy, you will have:

✓ A fully-functional MCP server  
✓ Multi-language crawler (SQL, Python, TypeScript)  
✓ Two MCP tools (`check_impact`, `list_lineage`)  
✓ Production-ready npm package  
✓ Comprehensive error handling  
✓ Unit test coverage  
✓ README with usage instructions  
✓ Ready for `npx` distribution  

---

## Quick Start

1. Copy the **Build Specification** (lines 6–139) into Claude Code
2. Add: "Use the Phase-by-Phase approach. Start with Phase 1 only."
3. After Phase 1 completion, follow the **Token Optimization Strategy** for subsequent phases
4. Reference this document for follow-up requests to stay efficient

Good luck! 🚀
