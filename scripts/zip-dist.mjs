// Zips a build folder for itch.io (index.html at the zip root).
// Dependency-free: writes a standard ZIP with DEFLATE via node:zlib.
// Usage: node scripts/zip-dist.mjs <srcDir> <out.zip>
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const [srcArg, outArg] = process.argv.slice(2);
if (!srcArg || !outArg) {
  console.error('Usage: node scripts/zip-dist.mjs <srcDir> <out.zip>');
  process.exit(1);
}
const src = resolve(srcArg);
const out = resolve(outArg);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(src);
if (!files.some((f) => relative(src, f) === 'index.html')) throw new Error(`No index.html in ${src}`);

const locals = [];
const centrals = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(relative(src, file).split(sep).join('/'), 'utf8');
  const data = readFileSync(file);
  // Already-compressed files are stored as-is.
  const store = /\.(gz|zip|png|jpe?g|webp|ktx2|glb|mp3|ogg|woff2?)$/i.test(file);
  const body = store ? data : deflateRawSync(data, { level: 9 });
  const method = store ? 0 : 8;
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(0, 10); // time/date
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, name, body);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(0, 12);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);
  offset += local.length + name.length + body.length;
}
const centralSize = centrals.reduce((s, b) => s + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));
console.log(`Wrote ${out} (${files.length} files, ${(statSync(out).size / 1e6).toFixed(1)} MB)`);
