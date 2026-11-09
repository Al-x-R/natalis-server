// Downloads the free Swiss Ephemeris data files (1800–2400 AD) into ./ephe
// (or $EPHE_PATH). Without them the server uses Moshier and omits Chiron.
// Runs on `npm install` (postinstall); files that already exist are skipped,
// pass --force to re-download. A failed download on install only warns.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://raw.githubusercontent.com/aloistr/swisseph/master/ephe';
const FILES = [
  'sepl_18.se1', // planets
  'semo_18.se1', // moon
  'seas_18.se1', // main asteroids + Chiron
];

const target = process.env.EPHE_PATH ?? resolve(dirname(fileURLToPath(import.meta.url)), '../ephe');
await mkdir(target, { recursive: true });

const force = process.argv.includes('--force');
const onInstall = process.env.npm_lifecycle_event === 'postinstall';

for (const file of FILES) {
  if (!force && existsSync(join(target, file))) {
    console.log(`✓ ${file} already present in ${target}`);
    continue;
  }
  try {
    await download(file);
  } catch (e) {
    if (!onInstall) throw e;
    console.warn(`⚠ ${file}: ${e.message}. Run \`npm run ephe:download\` later; until then Chiron is omitted.`);
  }
}

async function download(file) {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(join(target, file), buf);
  console.log(`✓ ${file} (${(buf.length / 1024).toFixed(0)} KB) → ${target}`);
}
