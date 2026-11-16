// Amber Line — a threejs-fps-01 entry (Node 22, standard library only).
//
// The game lives in game/ as plain static files: index.html plus ES modules, with
// three.js 0.187.0 vendored under game/vendor/three/ and reached through one import map.
// This program hands the entry in: it copies game/ and screenshots/ from beside this
// file into /output and writes /output/dossier.json, the summary the judge reads, using
// the vendored make.fun library. Outside the grader's container, MAKEFUN_OUTPUT_DIR
// stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// The program refuses to hand in an entry the scorer would refuse (too many files,
// too many bytes, a screenshot over the cap), so a failure here is a failure to fix,
// not a failure to submit.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

function countEntries(dir) {
  let count = 1; // the directory itself
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countEntries(path);
      count += sub.count;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      count += 1;
      bytes += statSync(path).size;
    } else {
      throw new Error(`refused: ${path} is not a plain file or directory`);
    }
  }
  return { count, bytes };
}

function checkScreenshots() {
  if (!existsSync(shotsDir)) throw new Error('refused: screenshots/ is missing');
  const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`refused: screenshots/ holds ${shots.length} images, need 3 or 4`);
  }
  for (const name of shots) {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(name) || name.startsWith('-')) {
      throw new Error(`refused: bad screenshot name ${name}`);
    }
    const size = statSync(join(shotsDir, name)).size;
    if (size > 262144) throw new Error(`refused: ${name} is ${size} bytes, over the 256 KiB cap`);
  }
  return shots;
}

const game = countEntries(gameDir);
if (game.count > 993) throw new Error(`refused: game/ holds ${game.count} entries, over the 993 cap`);
if (game.bytes > 50331648) throw new Error(`refused: game/ is ${game.bytes} bytes, over the 48 MiB cap`);
const shots = checkScreenshots();

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes;
// the others refuse an entry the scorer would refuse.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);

console.log(`amber-line: game/ ${game.count} entries, ${game.bytes} bytes; screenshots: ${shots.join(', ')}`);
console.log(`dossier written to ${join(out, 'dossier.json')}`);
