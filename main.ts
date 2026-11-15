// main.ts — MERIDIAN entry program (make.fun threejs-fps-02 v3; basis for
// threejs-fps-01). Copies game/ and screenshots/ from this repository to
// /output and writes /output/dossier.json with buildDossier from
// vendor/makefun-threejs.ts. Node 22 standard library only, no network.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
//
// THE FIX vs round 2: the old program called rmSync(out, {recursive: true})
// on the output directory itself. In the grader /output is a mount point,
// and its parent (/) is not writable by the entry's user, so rmdir('/output')
// threw EACCES and the run exited 1 in ~114 ms before copying anything.
// This program never removes the output directory itself: it only clears
// the directory's CONTENTS, then copies into it.
// Usage: MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// Fail fast with a plain message when the entry is incomplete, before
// touching /output: the grader's gate would refuse it anyway.
if (!existsSync(join(repo, 'game', 'index.html'))) throw new Error('main.ts: game/index.html is missing');
if (!existsSync(join(repo, 'screenshots'))) throw new Error('main.ts: screenshots/ is missing');

mkdirSync(out, { recursive: true });
// Clear the CONTENTS of the output directory only — never the directory
// itself, which in the grader is a mount point we cannot remove. A single
// undeletable stray entry must not kill the run (the grader's /output
// starts empty, so this is belt-and-braces only): skip it and carry on.
for (const child of readdirSync(out)) {
  try {
    rmSync(join(out, child), { recursive: true, force: true });
  } catch (e) {
    console.warn(`MERIDIAN: could not clear /output/${child}: ${(e as Error).message}`);
  }
}
cpSync(join(repo, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(repo, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
const shots = readdirSync(join(out, 'screenshots'));
console.log(`MERIDIAN dossier written: ${dossier.length} bytes -> ${join(out, 'dossier.json')}`);
console.log(`MERIDIAN output: game/ + ${shots.length} screenshot(s) (${shots.join(', ')})`);
