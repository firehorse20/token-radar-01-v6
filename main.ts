// Token Radar v6 — entrypoint.
//
// Reads the sealed DefiLlama snapshot, ranks the pre-token protocols with
// the radar-7 model (lib/radar7.ts), and writes the graded outputs:
//
//   /output/board.json      the ranked board (rows + meta)
//   /output/data.js         the dashboard's data, as window.RADAR
//   /output/dashboard/     a copy of this repository's dashboard/
//   /output/screenshots/   a copy of this repository's screenshots/
//   /output/dossier.json   buildDossier's dossier of dashboard + screenshots
//
// Run:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
// Defaults: input /input/snapshot.json, output $MAKEFUN_OUTPUT_DIR or /output.
//
// The board is built twice and the program refuses to write anything
// unless both builds are byte-identical, so the two grading runs agree.

import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard } from './lib/radar7.ts';
import { buildDossier, canonicalJson } from './vendor/makefun-board.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '/input/snapshot.json';
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1] !== undefined) input = argv[++i]!;
    else if (argv[i] === '--output' && argv[i + 1] !== undefined) output = argv[++i]!;
    else if (argv[i] === '--help') {
      console.log('usage: node main.ts [--input <snapshot.json>] [--output <dir>]');
      process.exit(0);
    }
  }
  return { input, output };
}

function copyTree(srcDir: string, dstDir: string): void {
  mkdirSync(dstDir, { recursive: true });
  const entries = readdirSync(srcDir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    const src = join(srcDir, entry.name);
    const dst = join(dstDir, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else if (entry.isFile()) copyFileSync(src, dst);
    else throw new Error(`main: ${src} is neither a file nor a directory`);
  }
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const snapshot = JSON.parse(readFileSync(resolve(input), 'utf8'));
  if (!Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist)) {
    throw new Error('main: snapshot has no protocols[] or watchlist[]');
  }

  // Build twice; both builds must agree byte for byte before anything is written.
  const first = buildBoard(snapshot);
  const second = buildBoard(snapshot);
  const firstJson = canonicalJson(first);
  const secondJson = canonicalJson(second);
  if (firstJson !== secondJson) {
    throw new Error('main: the two builds disagree; refusing to write output');
  }

  const board = { meta: first.meta, rows: first.rows };
  const boardJson = canonicalJson(board);
  const dataJs = `window.RADAR = ${firstJson};\n`;

  // Clear only the OUTPUT DIRECTORY'S CONTENTS, never the directory itself:
  // the grader mounts /output as its own filesystem, and removing the mount
  // point itself fails (EBUSY) — v6 round 7 was rejected for exactly this.
  mkdirSync(output, { recursive: true });
  for (const entry of readdirSync(output)) {
    rmSync(join(output, entry), { recursive: true, force: true });
  }
  writeFileSync(join(output, 'board.json'), `${boardJson}\n`, 'utf8');
  writeFileSync(join(output, 'data.js'), dataJs, 'utf8');
  copyTree(join(REPO_ROOT, 'dashboard'), join(output, 'dashboard'));
  copyTree(join(REPO_ROOT, 'screenshots'), join(output, 'screenshots'));
  const dossier = buildDossier(output, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  writeFileSync(join(output, 'dossier.json'), dossier);

  const dashBytes = readdirSync(join(output, 'dashboard')).reduce((n, f) => n + statSync(join(output, 'dashboard', f)).size, 0);
  console.log(
    JSON.stringify({
      model: first.meta.model,
      rows: first.meta.rows,
      watchlist_rows: first.meta.watchlist_rows,
      rank1: `${first.meta.rank1_slug} ($${first.rows[0]?.implied_value_usd.toLocaleString('en-US')})`,
      total_implied_usd: first.meta.total_implied_usd,
      board_bytes: Buffer.byteLength(boardJson, 'utf8'),
      data_js_bytes: Buffer.byteLength(dataJs, 'utf8'),
      dashboard_bytes: dashBytes,
      dossier_bytes: dossier.length,
      output,
    }),
  );
}

main();
