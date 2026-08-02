// Post-build: write the hashed asset paths into dist/sw.js so the service
// worker precaches them and the app is fully functional offline immediately.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const assets = readdirSync(join(dist, 'assets')).map((f) => `/assets/${f}`);
const swPath = join(dist, 'sw.js');
const sw = readFileSync(swPath, 'utf8');
const marker = 'const BUILD_ASSETS = [];';
if (!sw.includes(marker)) throw new Error('BUILD_ASSETS marker missing in sw.js');
writeFileSync(swPath, sw.replace(marker, `const BUILD_ASSETS = ${JSON.stringify(assets)};`));
console.log('sw.js precache list:', assets.join(', '));
