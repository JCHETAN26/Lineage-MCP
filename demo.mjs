#!/usr/bin/env node
// demo.mjs — run with: node demo.mjs

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
  bgRed:   '\x1b[41m',
  bgBlue:  '\x1b[44m',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function typewrite(text, delay = 18) {
  for (const ch of text) {
    process.stdout.write(ch);
    await sleep(delay);
  }
  process.stdout.write('\n');
}

function box(lines, color = C.cyan) {
  const width = Math.max(...lines.map(l => stripAnsi(l).length)) + 4;
  const top    = color + '╭' + '─'.repeat(width - 2) + '╮' + C.reset;
  const bottom = color + '╰' + '─'.repeat(width - 2) + '╯' + C.reset;
  console.log(top);
  for (const line of lines) {
    const pad = width - 2 - stripAnsi(line).length - 2;
    console.log(color + '│ ' + C.reset + line + ' '.repeat(pad) + color + ' │' + C.reset);
  }
  console.log(bottom);
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function bar(count, max, color = C.cyan) {
  const filled = Math.round((count / max) * 20);
  return color + '█'.repeat(filled) + C.gray + '░'.repeat(20 - filled) + C.reset;
}

async function spinner(text, ms) {
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  const end = Date.now() + ms;
  let i = 0;
  while (Date.now() < end) {
    process.stdout.write(`\r${C.cyan}${frames[i % frames.length]}${C.reset} ${text}`);
    await sleep(80);
    i++;
  }
  process.stdout.write(`\r${C.green}✓${C.reset} ${text}\n`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

console.clear();
await sleep(200);

// Header
console.log();
console.log(`  ${C.bold}${C.cyan}▲ lineage-mcp${C.reset}  ${C.gray}Data Contract Sentinel v0.2.0${C.reset}`);
console.log(`  ${C.gray}${'─'.repeat(48)}${C.reset}`);
console.log();

await typewrite(`  ${C.gray}$ ${C.reset}lineage check_impact --table users --column email --change rename --to user_email`, 12);
console.log();

await spinner('Crawling codebase …', 1400);
await spinner('Building dependency graph …', 900);
await spinner('Resolving column references …', 700);
console.log();

// Impact summary box
box([
  `${C.bold}${C.yellow}⚠  Impact Report${C.reset}`,
  ``,
  `  Asset   ${C.cyan}users.email${C.reset}  →  ${C.green}users.user_email${C.reset}`,
  `  Change  ${C.yellow}rename${C.reset}`,
  ``,
  `  ${C.bold}${C.red}9 files will break${C.reset}  across 3 languages`,
], C.yellow);

console.log();

// Language breakdown
console.log(`  ${C.bold}Breakdown by language${C.reset}`);
console.log();
const langs = [
  ['Python',     5, C.blue],
  ['TypeScript', 3, C.cyan],
  ['SQL',        1, C.magenta],
];
for (const [lang, count, color] of langs) {
  const b = bar(count, 9, color);
  console.log(`  ${lang.padEnd(14)} ${b}  ${color}${C.bold}${count}${C.reset} file${count > 1 ? 's' : ''}`);
  await sleep(120);
}
console.log();

// Affected files
console.log(`  ${C.bold}Affected files${C.reset}  ${C.gray}(sorted by confidence)${C.reset}`);
console.log();

const files = [
  { file: 'python/etl_users.py',          line:  7,  conf: 'HIGH',   lang: 'py',  pattern: 'pd.read_sql'      },
  { file: 'python/ml_pipeline.py',         line:  6,  conf: 'HIGH',   lang: 'py',  pattern: 'spark.sql'        },
  { file: 'python/ml_features.py',         line:  9,  conf: 'HIGH',   lang: 'py',  pattern: 'sklearn.features' },
  { file: 'api/users-api.ts',              line:  7,  conf: 'HIGH',   lang: 'ts',  pattern: 'pg.query'         },
  { file: 'api/analytics.ts',              line:  6,  conf: 'HIGH',   lang: 'ts',  pattern: 'prisma'           },
  { file: 'notebooks/churn_model.ipynb',   line: 14,  conf: 'MEDIUM', lang: 'nb',  pattern: 'hf.dataset'       },
  { file: 'python/etl_users.py',           line: 11,  conf: 'MEDIUM', lang: 'py',  pattern: 'pd.read_sql'      },
  { file: 'api/analytics.ts',              line: 13,  conf: 'MEDIUM', lang: 'ts',  pattern: 'prisma'           },
  { file: 'sql/schema.sql',                line: 28,  conf: 'LOW',    lang: 'sql', pattern: 'ALTER TABLE'      },
];

const confColor = { HIGH: C.red, MEDIUM: C.yellow, LOW: C.gray };
const langIcon  = { py: `${C.blue}py${C.reset}`, ts: `${C.cyan}ts${C.reset}`, nb: `${C.magenta}nb${C.reset}`, sql: `${C.green}sql${C.reset}` };

for (const f of files) {
  const cc = confColor[f.conf];
  const li = langIcon[f.lang];
  const loc = `${f.file}:${f.line}`;
  console.log(
    `  ${li}  ${C.white}${loc.padEnd(42)}${C.reset}` +
    `${cc}${f.conf.padEnd(7)}${C.reset}  ${C.gray}${f.pattern}${C.reset}`
  );
  await sleep(80);
}

console.log();

// Suggested fix
box([
  `${C.bold}${C.green}Suggested fix${C.reset}`,
  ``,
  `  Find all occurrences of ${C.red}"email"${C.reset} in the above files`,
  `  and replace with ${C.green}"user_email"${C.reset}`,
  ``,
  `  ${C.gray}Run:  grep -rn "\\bemail\\b" --include="*.py" --include="*.ts"${C.reset}`,
], C.green);

console.log();

// Lineage tree
console.log(`  ${C.bold}Lineage tree${C.reset}  ${C.gray}users.email${C.reset}`);
console.log();
const tree = [
  [`  ${C.cyan}users.email${C.reset}`, ''],
  [`  ${C.gray}├──${C.reset} ${C.blue}etl_users.py${C.reset}:7`,         `${C.gray}← pd.read_sql${C.reset}`],
  [`  ${C.gray}├──${C.reset} ${C.blue}ml_pipeline.py${C.reset}:6`,       `${C.gray}← spark.sql${C.reset}`],
  [`  ${C.gray}├──${C.reset} ${C.magenta}churn_model.ipynb${C.reset}:14`, `${C.gray}← hf.dataset${C.reset}`],
  [`  ${C.gray}├──${C.reset} ${C.cyan}users-api.ts${C.reset}:7`,         `${C.gray}← pg.query${C.reset}`],
  [`  ${C.gray}├──${C.reset} ${C.cyan}analytics.ts${C.reset}:6`,         `${C.gray}← prisma${C.reset}`],
  [`  ${C.gray}└──${C.reset} ${C.green}schema.sql${C.reset}:28`,          `${C.gray}← ALTER TABLE${C.reset}`],
];
for (const [left, right] of tree) {
  const pad = 46 - stripAnsi(left).length;
  console.log(left + ' '.repeat(Math.max(1, pad)) + right);
  await sleep(90);
}

console.log();
console.log(`  ${C.gray}${'─'.repeat(48)}${C.reset}`);
console.log(`  ${C.green}✓${C.reset}  Scan complete  ${C.gray}·${C.reset}  ${C.cyan}1.96s${C.reset}  ${C.gray}·${C.reset}  3,094 files scanned  ${C.gray}·${C.reset}  cached to ${C.gray}.lineage/cache.json${C.reset}`);
console.log();
