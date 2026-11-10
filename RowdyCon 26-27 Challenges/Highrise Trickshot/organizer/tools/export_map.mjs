// Exports the map's collision boxes for the server (used for throwing-knife physics).
// Run at Docker build time: node tools/export_map.mjs <map.mjs> <out.json>
import { writeFileSync } from 'fs';
import { pathToFileURL } from 'url';
const [, , mapPath, out] = process.argv;
const { buildMap } = await import(pathToFileURL(mapPath).href);
writeFileSync(out, JSON.stringify(buildMap().colliders));
console.log(`exported ${buildMap().colliders.length} colliders`);
