# What We Have Built So Far

This project is called `Lineage MCP`.

In very simple words, we have built a tool that tries to answer this question:

`If I change a database table or column, what parts of my codebase will be affected?`

That is the main idea behind the whole project.

Instead of waiting for something to break after deployment, this tool scans a project early, builds a map of relationships, and tells us where a schema change may cause problems.

## The Big Goal

We are building an MCP server for data lineage and schema impact analysis.

That means:

- it can plug into MCP-compatible tools
- it can scan a codebase
- it can find tables, columns, and usage patterns
- it can build a dependency graph
- it can answer lineage questions
- it can warn us before silent data breaks happen

The phrase "silent data break" is important here.

A silent data break is when a table or column changes, but the rest of the system does not immediately throw a clear error. Instead, dashboards, ETL jobs, analytics queries, APIs, or ML features quietly become wrong or incomplete.

This tool is meant to reduce that risk.

## What The Product Does

Right now, the project can do these core things:

1. Scan a project directory.
2. Read SQL, Python, TypeScript, JavaScript, and notebook code.
3. Detect some database tables and usage patterns.
4. Build an in-memory graph of discovered assets and dependencies.
5. Expose that information through MCP tools.
6. Return human-readable reports for impact and lineage.
7. Cache scan results so repeated requests are faster.

## Main User-Facing Tools

The server currently exposes these MCP tools:

### `ping`

This is a simple health check.

It answers the question:

`Is the server alive and responding?`

### `scan`

This forces a fresh scan of a project directory.

It is useful when files have changed and we do not want to rely on old cached results.

It returns summary information like:

- how long the scan took
- how many tables were found
- how many dependencies were found

### `list_tables`

This lists all discovered tables or assets in the scanned project.

It is useful for quickly seeing what the tool thinks exists in the codebase.

### `list_lineage`

This shows dependency relationships for a table or column.

In simple words, it answers:

`Who uses this thing?`

Depending on the data found, it can show:

- consumers
- some upstream context
- a simple lineage tree

### `check_impact`

This is the most important tool right now.

It answers:

`If I rename, delete, add, or change this table or column, what files might break?`

It returns:

- affected files
- line numbers
- confidence levels
- small code snippets
- a suggested fix

## How The System Works Internally

The project is built in layers.

### 1. The MCP server layer

File: [src/index.ts](/Users/chetan/Lineage-MCP/src/index.ts:1)

This is the entry point of the server.

It does a few important jobs:

- starts the MCP server
- defines the available tools
- validates tool input
- loads or rebuilds the dependency graph
- formats tool output into readable text

This is the part that turns our scanning engine into something other tools can call.

### 2. The crawler layer

File: [src/crawler.ts](/Users/chetan/Lineage-MCP/src/crawler.ts:1)

This is the file-system walker.

Its job is to:

- walk through the project directory
- skip ignored folders like `node_modules`, `.git`, and `dist`
- choose supported file types
- read file contents
- send each file to the correct scanner

It processes files in batches, which helps performance and avoids unnecessary memory pressure.

### 3. The scanner layer

Files:

- [src/scanners/sql-scanner.ts](/Users/chetan/Lineage-MCP/src/scanners/sql-scanner.ts:1)
- [src/scanners/python-scanner.ts](/Users/chetan/Lineage-MCP/src/scanners/python-scanner.ts:1)
- [src/scanners/ts-scanner.ts](/Users/chetan/Lineage-MCP/src/scanners/ts-scanner.ts:1)
- [src/scanners/ml-scanner.ts](/Users/chetan/Lineage-MCP/src/scanners/ml-scanner.ts:1)

Each scanner looks for language-specific patterns.

Examples:

- SQL scanner looks for `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `FROM`, `JOIN`, `INTO`, and `UPDATE`
- Python scanner looks for things like `pd.read_sql`, `spark.sql`, SQLAlchemy-style usage, and raw query execution
- TypeScript scanner looks for things like Prisma, Knex, TypeORM, Sequelize, and raw SQL strings
- ML scanner helps capture data usage in ML-related code paths

This layer is pattern-based.

That means it does not fully understand code the way a compiler would.

Instead, it uses practical matching rules to find likely dependencies.

### 4. The graph layer

Files:

- [src/graph.ts](/Users/chetan/Lineage-MCP/src/graph.ts:1)
- [src/types.ts](/Users/chetan/Lineage-MCP/src/types.ts:1)

This is where the discovered information is stored in a structured form.

The graph mainly contains:

- tables
- dependencies

This graph is the shared data structure used by the rest of the tool.

### 5. The report layer

Files:

- [src/tools/check-impact.ts](/Users/chetan/Lineage-MCP/src/tools/check-impact.ts:1)
- [src/tools/list-lineage.ts](/Users/chetan/Lineage-MCP/src/tools/list-lineage.ts:1)

This layer turns raw graph data into something useful for people.

For example:

- `check-impact.ts` builds an impact report
- `list-lineage.ts` builds a lineage view

## Languages And Patterns We Support Right Now

At this stage, the scanner supports several common patterns.

### SQL

We can currently detect a good amount of plain SQL structure, including:

- `CREATE TABLE`
- `ALTER TABLE`
- `DROP TABLE`
- table references in `FROM`
- table references in `JOIN`
- table references in `INTO`
- table references in `UPDATE`

### Python

We support common data access patterns such as:

- pandas SQL reads
- Spark SQL
- Spark table reads
- some SQLAlchemy usage
- some direct SQL execution patterns

### TypeScript and JavaScript

We support several common ORM and query styles, including:

- Prisma
- Knex
- TypeORM
- Sequelize
- raw SQL strings
- `pg.query`

## What We Improved During This Work

While testing the project, we found and fixed a real issue in the SQL scanner.

### The problem we found

When we tested against the bundled `demo/` project, the scanner found table definitions, but it was not properly capturing real downstream SQL usage like:

- `FROM users`
- `JOIN orders`
- `FROM page_views`

Because of that:

- lineage results were incomplete
- impact analysis was underreporting affected files

### The fix we made

We updated the SQL scanner so it now captures query-style table references more reliably.

In practice, this improved:

- dependency detection in the demo project
- lineage output
- impact detection for renamed columns

### The next improvement we implemented after that

After testing on a real public dbt project, we implemented the next high-value accuracy layer inside the SQL scanner.

That work included:

- dbt-aware detection for `ref()` calls
- dbt-aware detection for `source()` calls
- SQL comment stripping before dependency extraction
- dbt comment stripping like `{# ... #}`
- CTE alias tracking so local names like `source`, `orders`, and `final` are not mistaken for real upstream tables
- inferred dbt model names from file names when a model file has dbt syntax but no `CREATE TABLE`

This was a major step because it moved the scanner closer to understanding real modern analytics projects instead of only plain SQL files.

### The next major improvement after that

We then implemented dbt `manifest.json` support.

This changed the design in an important way.

Before this step, the tool mainly learned dbt lineage by reading SQL files and recognizing patterns.

After this step, the tool can also use dbt's compiled artifact as a higher-trust source of truth when that artifact exists.

That means the system now supports a hybrid mode:

- if `target/manifest.json` or `manifest.json` exists, we ingest it first
- if it does not exist, we fall back to SQL scanning
- non-dbt code like Python and TypeScript is still scanned normally

This is important because it gives us better accuracy without breaking support for projects that have not run dbt compile recently.

### What manifest support adds

Manifest support now lets us:

- discover dbt models and sources directly from the artifact
- recover model-to-model dependencies from dbt's own graph
- recover source-to-model dependencies from dbt's own graph
- avoid rebuilding dbt lineage purely from text guesses
- skip double-scanning manifest-backed dbt model files

### Cache behavior for manifest support

We also improved cache behavior for this.

The graph cache now records manifest information, and if the manifest file appears, disappears, or changes timestamp, the cache is invalidated early.

That means we do not have to wait for the normal cache TTL when dbt lineage changes.

### The tests we added

We added SQL regression tests to lock in this behavior.

File: [src/__tests__/sql-scanner.test.ts](/Users/chetan/Lineage-MCP/src/__tests__/sql-scanner.test.ts:1)

These tests now verify that:

- query statements create dependencies
- `users` and `orders` are recognized from SQL usage
- table-definition lines are not mistaken for downstream usage

## Test Infrastructure Improvements

We also improved the test setup itself.

File: [jest.config.js](/Users/chetan/Lineage-MCP/jest.config.js:1)

### The issue

The root Jest run was accidentally scanning files inside the VS Code extension's downloaded test fixtures under `vscode-extension/.vscode-test/`.

That caused noisy module collisions and unrelated failures.

### The fix

We updated Jest ignore rules so the main package tests only run the main package test suite.

This made the root test run stable again.

## What We Tested So Far

We tested the project in two main ways.

### 1. Internal demo project

We used the repo's built-in `demo/` folder.

That gave us a controlled sample project with:

- base SQL tables
- downstream SQL consumers
- migration examples

This helped us verify that:

- scanning works
- dependencies are found
- impact reports are generated
- lineage trees are generated

This test directly led to the SQL scanner improvement.

### 2. Real public GitHub project

We also tested against a real project from GitHub:

`dbt-labs/jaffle-shop-classic`

This was very helpful because it showed where the current system is still weak.

#### What happened in the first run

The first scan showed important weaknesses:

- it did not understand dbt `ref()` relationships
- it confused local CTE aliases with real tables
- it picked up false positives from comments
- it reported no dependents for models like `stg_orders` even though other dbt models clearly used them

That real-world result directly shaped our next implementation step.

#### What happened after the improvement

After the dbt-aware SQL improvements, the same real GitHub project behaved much better.

The scanner now:

- discovers dbt model files like `stg_orders`, `stg_customers`, and `stg_payments` as tables/assets
- captures `ref(stg_orders)` and similar links as real dependencies
- stops reporting fake dependencies from CTE names like `source` and `final`
- stops reporting comment-based false positives like `FROM the`
- returns useful `check_impact` results for dbt models

For example, renaming `stg_orders` now correctly identifies dependent files in the real repo instead of saying it is safe.

#### What manifest support means in practice

The public GitHub sample we tested did not include a prebuilt manifest artifact, so the tool still used the improved SQL/dbt scanner path there.

To verify manifest support directly, we added a dedicated fixture and test that simulates a dbt project with `target/manifest.json`.

That test proves that:

- tables can be loaded directly from the manifest
- dependencies can be loaded directly from the manifest
- manifest-backed model files are not double-counted by the fallback scanner

### 3. Phase 1 stress testing

We also started a more rigorous stress-testing phase.

This is important because a lineage tool has to do more than work on happy paths.

It also has to behave well when projects are messy, misleading, or large.

The first stress-test suite now covers:

- corrupted dbt manifest fallback
- adversarial SQL with nested scopes and reused aliases
- basic column-specific impact filtering
- scale-smoke crawling on a generated mini mega-repo

These tests live in:

- [src/__tests__/phase1-stress.test.ts](/Users/chetan/Lineage-MCP/src/__tests__/phase1-stress.test.ts:1)

#### What these stress tests prove

- if `manifest.json` is broken, the system does not crash and falls back to SQL/dbt scanning
- nested CTE scopes do not leak local aliases into fake external lineage
- a column rename like `users.first_name` is narrowed to files that actually mention that column
- the crawler can handle hundreds of generated SQL files in one run without failing

## What The VS Code Extension Adds

This repo also contains a VS Code extension under `vscode-extension/`.

That extension is meant to make the lineage information easier to see directly inside the editor.

The extension can provide things like:

- CodeLens above SQL definitions
- inline decorations
- commands for lineage and impact

So the larger vision is not just a backend scanning engine.

It is an ecosystem:

- an MCP server
- a scanning engine
- a reporting layer
- an editor experience

## What Is Working Well Right Now

Here is what we have already built successfully:

- an MCP server that starts and responds to tool calls
- a crawler that scans real project directories
- multiple language scanners
- a graph model for storing discovered lineage
- caching for faster repeated scans
- impact reporting
- lineage reporting
- tests for the main package
- a demo project for validation
- a VS Code extension scaffold with integration points

## Current Limitations

This part is just as important as the working parts.

Right now, the project still has some known limitations:

- scanning is pattern-based, not full semantic analysis
- unusual abstractions or custom wrappers may be missed
- dbt-style SQL lineage is not handled deeply enough yet
- comments can still create false positives in some SQL cases
- CTEs and temporary aliases can be confused with real upstream assets
- confidence scoring is still fairly heuristic

Some of these limitations are now partially improved.

For example:

- basic dbt `ref()` support is now implemented
- basic dbt `source()` support is now implemented
- comment stripping is now implemented in the SQL scanner
- CTE alias isolation is now implemented in the SQL scanner
- basic dbt manifest ingestion is now implemented
- hybrid manifest-first plus fallback scanning is now implemented

But there is still more to do for deeper warehouse-aware lineage.

So the project is already real and functional, but it is not finished.

## What We Have Proven

Up to this point, we have proven a few important things:

1. The core idea works.
2. The system can scan code and return useful dependency information.
3. The MCP interface is in place.
4. The test setup is healthy.
5. Real-world testing quickly exposes the next best improvements.

That last point matters a lot.

We are no longer guessing in the dark.

We now know exactly what the next major quality jump should be.

## Best Short Summary

If I had to explain everything in one paragraph, I would say this:

We have built the first working version of a data-lineage MCP server that scans SQL, Python, and TypeScript-style projects, builds a dependency graph, and answers questions like "what uses this table?" and "what breaks if this column changes?" We also tested it on both an internal demo and a real GitHub dbt project, fixed a real SQL dependency bug, improved the test setup, and identified the next big milestone: smarter SQL parsing for dbt refs, CTE handling, and false-positive reduction.

## What Should Come Next

The best next improvements are:

1. Use dbt artifacts like `manifest.json` when available as the warehouse source of truth.
2. Expand manifest usage to capture more dbt metadata like tags, materializations, and richer node properties.
3. Improve model-to-model and source-to-model lineage beyond simple text matching.
4. Improve column-level lineage accuracy.
5. Expand targeted extractors for Python and TypeScript ORM usage.
6. Keep testing against real projects after every scanner improvement.

### Phase 1 still to do

Even after these new stress tests, there is still more to build in Phase 1:

- deeper column-level lineage instead of only column-name filtering
- dbt macro and Jinja stress cases
- stale-manifest behavior checks in addition to broken-manifest checks
- larger performance runs with much bigger generated repositories

## Phase 2 Beta Plan

Once Phase 1 testing is strong enough, the next step is a structured beta with real users.

The goal of Phase 2 is not just "ship it."

The real goal is to learn:

- where the tool misses real dependencies
- where users do not trust the output yet
- where setup or debugging is too hard

### 1. Sandbox deploy

Before asking users to scan private company code, we should give them a safe sample project first.

That sample project should:

- be realistic enough to demonstrate value
- include SQL, Python, and TypeScript examples
- include a few known schema changes
- have expected lineage answers so users can compare results

This lowers adoption friction because users can test the product without taking a privacy risk immediately.

### 2. Hit-rate evaluations

The most important beta question is:

`Did the tool miss anything important?`

So a good beta flow is to ask users to run `check_impact` on a table or column they already know is widely used and compare the result against their own understanding of the codebase.

That helps us measure:

- false negatives
- false positives
- confidence-score usefulness
- trustworthiness of the output

### 3. Opt-in telemetry and debug logs

When scans fail in the wild, users need an easy way to show us what happened.

So the extension should provide an opt-in debug workflow that can export useful logs.

Those logs should ideally include:

- root directory
- command invoked
- bridge status
- cache or manifest context
- error message and stack
- basic result counts

This makes beta debugging much faster and much less frustrating for users.

### What we started for Phase 2

We have now started the first implementation step for this phase by adding a debug-log export path to the VS Code extension so users can more easily share failure context during beta.

## Our Implementation Strategy

We are not trying to build a full compiler for every language all at once.

Instead, the plan is to improve the highest-value parts first.

### 1. High-value parsing

We focus first on the data-code interface.

That means:

- SQL
- dbt
- common ORM and query libraries in Python
- common ORM and query libraries in TypeScript

This is the best return on effort because most silent data breaks happen in these layers.

### 2. Reduce noise early

A tool like this only becomes trustworthy if the output is clean.

So part of the strategy is not just "find more things."

It is also:

- remove false positives
- understand local scope
- avoid noisy alerts

That is why comment stripping and CTE isolation were such important improvements.

### 3. Use existing sources of truth

If a project already has dbt artifacts like `manifest.json`, we should use them.

That is powerful because it lets us rely on a known lineage source for warehouse models and then focus our own scanning engine on connecting application code back to those models.

This is likely the next major accuracy upgrade.

This step is now started.

The current version already ingests manifest lineage when the artifact exists.

The next evolution is to use even more of the manifest metadata, not just the dependency graph.

## Final Thought

So far, we have not just built an idea.

We have built a functioning foundation:

- the server exists
- the scan engine exists
- the reports exist
- the tests exist
- the first real bugs have been found and fixed

That is a strong place to continue from.
