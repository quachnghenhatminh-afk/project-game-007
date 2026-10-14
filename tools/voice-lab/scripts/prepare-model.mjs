// Downloads the official Vosk Vietnamese small model (zip) and repacks it as
// the .tar.gz that vosk-browser expects. Output goes to the voice-lab public dir.
import { existsSync, mkdirSync, createWriteStream, statSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MODEL = 'vosk-model-small-vn-0.4';
const URL_ZIP = `https://alphacephei.com/vosk/models/${MODEL}.zip`;

const labDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(labDir, '.model-cache');
const zipPath = join(cacheDir, `${MODEL}.zip`);
const outDir = join(labDir, 'public', 'voice');
const outPath = join(outDir, `${MODEL}.tar.gz`);

const vocabPath = join(labDir, 'model-vocab.txt');

if (existsSync(outPath) && existsSync(vocabPath)) {
  console.log(`Model already prepared: ${outPath}`);
  process.exit(0);
}
mkdirSync(cacheDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

if (!existsSync(zipPath)) {
  console.log(`Downloading ${URL_ZIP} ...`);
  const res = await fetch(URL_ZIP);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));
  console.log(`Downloaded ${(statSync(zipPath).size / 1e6).toFixed(1)} MB`);
}

// bsdtar (bundled with Windows 10+ and macOS) can read zip files directly.
console.log('Extracting ...');
execFileSync('tar', ['-xf', zipPath, '-C', cacheDir], { stdio: 'inherit' });
if (!existsSync(join(cacheDir, MODEL))) throw new Error(`Expected folder ${MODEL} inside the zip`);

console.log('Repacking as .tar.gz ...');
execFileSync('tar', ['-czf', outPath, '-C', cacheDir, MODEL], { stdio: 'inherit' });
console.log(`Done: ${outPath} (${(statSync(outPath).size / 1e6).toFixed(1)} MB)`);

// The model has no words.txt; its word list is embedded as an OpenFst symbol
// table inside Gr.fst. Dump it so tests can verify every command word is known.
writeFileSync(vocabPath, readSymbolTable(join(cacheDir, MODEL, 'graph', 'Gr.fst')).join('\n') + '\n');
console.log(`Vocabulary written: ${vocabPath}`);

function readSymbolTable(fstPath) {
  const buf = readFileSync(fstPath);
  const marker = 'words.txt';
  let p = buf.indexOf(marker, 0, 'latin1');
  if (p < 0) throw new Error('No embedded symbol table found in Gr.fst');
  p += marker.length + 8; // skip available-key (int64)
  const size = Number(buf.readBigInt64LE(p));
  p += 8;
  const words = [];
  for (let i = 0; i < size; i++) {
    const len = buf.readInt32LE(p);
    p += 4;
    words.push(buf.toString('utf8', p, p + len));
    p += len + 8; // string + key (int64)
  }
  return words;
}
