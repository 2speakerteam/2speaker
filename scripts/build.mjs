import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(projectRoot, 'dist');
const clientId = process.env.NAVER_MAP_CLIENT_ID?.trim() ?? '';
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() ?? '';

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(resolve(projectRoot, 'index.html'), resolve(outputDirectory, 'index.html'));
await cp(resolve(projectRoot, 'src'), resolve(outputDirectory, 'src'), { recursive: true });
await cp(resolve(projectRoot, 'public'), resolve(outputDirectory, 'public'), { recursive: true });

// Give each client build a unique script URL so browsers cannot keep an old route matcher.
const mainSource = await readFile(resolve(projectRoot, 'src/main.js'));
const mainHash = createHash('sha256').update(mainSource).digest('hex').slice(0, 12);
await writeFile(resolve(outputDirectory, 'src', `main-${mainHash}.js`), mainSource);
const indexSource = await readFile(resolve(projectRoot, 'index.html'), 'utf8');
const updatedIndex = indexSource.replace(
  /(<script type="module" src=")\/src\/main\.js(?:\?[^"]*)?("><\/script>)/,
  `$1/src/main-${mainHash}.js$2`
);
if (updatedIndex === indexSource) throw new Error('Main script tag was not found in index.html.');
await writeFile(resolve(outputDirectory, 'index.html'), updatedIndex, 'utf8');
await writeFile(
  resolve(outputDirectory, 'config.js'),
  `window.__2SPEAKER_CONFIG__ = Object.freeze({ naverMapClientId: ${JSON.stringify(clientId)}, googleMapsApiKey: ${JSON.stringify(googleMapsApiKey)} });\n`,
  'utf8'
);

console.log(`Static site built in ${outputDirectory}.`);
