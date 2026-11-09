// Regenerates tzdata/pre1970.json: UTC offsets before 1970 for every IANA zone,
// compiled from the IANA source *with* the `backzone` file.
//
// Why: Node's ICU merges zones that agree since 1970 (Europe/Amsterdam becomes
// Europe/Brussels, Atlantic/Reykjavik becomes Africa/Abidjan), which silently
// drops their older history. The generated file keeps it, and also records the
// abbreviation of each period so "LMT" can be told apart from a national mean
// time such as Paris Mean Time.
//
// Needs `zic` and `tar` (present on macOS and most Linux systems) and network
// access. The output is committed, so this only runs when updating tzdata:
//   npm run tzdata:build
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = 'https://data.iana.org/time-zones/tzdata-latest.tar.gz';
const MAIN = ['africa', 'antarctica', 'asia', 'australasia', 'europe', 'northamerica', 'southamerica', 'etcetera', 'backward'];
const CUTOFF = 0; // 1970-01-01T00:00:00Z, seconds

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../tzdata/pre1970.json');
const work = mkdtempSync(join(tmpdir(), 'natalis-tz-'));

try {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`tzdata download: HTTP ${res.status}`);
  writeFileSync(join(work, 'tzdata.tar.gz'), Buffer.from(await res.arrayBuffer()));
  mkdirSync(join(work, 'src'));
  execFileSync('tar', ['-xzf', join(work, 'tzdata.tar.gz'), '-C', join(work, 'src')]);
  const version = readFileSync(join(work, 'src', 'version'), 'utf8').trim();

  // A zone defined in backzone replaces the Link of the same name in the main files.
  const backzone = readFileSync(join(work, 'src', 'backzone'), 'utf8');
  const restored = new Set([...backzone.matchAll(/^Zone\s+(\S+)/gm)].map((m) => m[1]));
  const main = MAIN.map((f) => readFileSync(join(work, 'src', f), 'utf8'))
    .join('\n')
    .split('\n')
    .filter((line) => {
      const m = /^Link\s+\S+\s+(\S+)/.exec(line);
      return !(m && restored.has(m[1]));
    })
    .join('\n');
  writeFileSync(join(work, 'combined'), `${main}\n${backzone}\n`);

  const compiled = join(work, 'zoneinfo');
  execFileSync('zic', ['-d', compiled, join(work, 'combined')], { stdio: ['ignore', 'inherit', 'inherit'] });

  const zones = {};
  const seen = new Map(); // serialized periods → first zone name, to store aliases once
  for (const file of walk(compiled)) {
    const name = relative(compiled, file).split('\\').join('/');
    const periods = parseTzif(readFileSync(file));
    const key = JSON.stringify(periods);
    if (seen.has(key)) zones[name] = seen.get(key);
    else {
      seen.set(key, name);
      zones[name] = periods;
    }
  }

  const sorted = Object.fromEntries(Object.keys(zones).sort().map((k) => [k, zones[k]]));
  const lines = Object.entries(sorted).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `{"version":${JSON.stringify(version)},"zones":{\n${lines.join(',\n')}\n}}\n`);
  console.log(`✓ tzdata ${version}: ${lines.length} zones (${restored.size} restored from backzone) → ${out}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/**
 * TZif (RFC 9636) → periods that start before 1970, oldest first:
 * [startUtcSeconds | null, utcOffsetSeconds, abbreviation]. `null` = since forever.
 */
function parseTzif(buf) {
  if (buf.toString('latin1', 0, 4) !== 'TZif') throw new Error('not a TZif file');
  if (buf[4] < 0x32) throw new Error('TZif version 1 has no 64-bit data');
  const counts = (o) => ({
    isut: buf.readUInt32BE(o + 20),
    isstd: buf.readUInt32BE(o + 24),
    leap: buf.readUInt32BE(o + 28),
    time: buf.readUInt32BE(o + 32),
    type: buf.readUInt32BE(o + 36),
    char: buf.readUInt32BE(o + 40),
  });
  const v1 = counts(0);
  const h = 44 + v1.time * 5 + v1.type * 6 + v1.char + v1.leap * 8 + v1.isstd + v1.isut;
  const c = counts(h);
  const times = h + 44;
  const idx = times + c.time * 8;
  const types = idx + c.time;
  const chars = types + c.type * 6;
  const type = (i) => {
    const at = chars + buf[types + i * 6 + 5];
    return [buf.readInt32BE(types + i * 6), buf.toString('latin1', at, buf.indexOf(0, at))];
  };

  const periods = [[null, ...type(0)]];
  for (let i = 0; i < c.time; i++) {
    const start = Number(buf.readBigInt64BE(times + i * 8));
    if (start >= CUTOFF) break;
    const [offset, abbr] = type(buf[idx + i]);
    // zic may emit a "big bang" placeholder transition; it just restates the first period.
    if (start < -1e11) {
      periods[0] = [null, offset, abbr];
      continue;
    }
    const last = periods[periods.length - 1];
    if (last[1] === offset && last[2] === abbr) continue;
    periods.push([start, offset, abbr]);
  }
  return periods;
}
