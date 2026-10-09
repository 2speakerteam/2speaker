import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
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
await writeFile(
  resolve(outputDirectory, 'config.js'),
  `window.__2SPEAKER_CONFIG__ = Object.freeze({ naverMapClientId: ${JSON.stringify(clientId)}, googleMapsApiKey: ${JSON.stringify(googleMapsApiKey)} });\n`,
  'utf8'
);

console.log(`Static site built in ${outputDirectory}.`);
