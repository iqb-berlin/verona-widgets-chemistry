import { inlineSource } from 'inline-source';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const [distDirectory] = process.argv.slice(2);
if (!distDirectory) {
  console.error(`Usage: ${ process.argv[1] } [dist-directory]`);
  process.exit(1);
}

const indexHtmlFile = join(distDirectory, 'index.html');
if (!existsSync(indexHtmlFile)) {
  console.error(`Missing index.html file: ${ indexHtmlFile }`);
  process.exit(1);
}

console.log(`Reading index.html file: ${ indexHtmlFile }`);
const packedHtml = await inlineSource(indexHtmlFile, {
  attribute: false,
  compress: true,
  rootpath: distDirectory,
});

const packedHtmlKbSize = Math.round(packedHtml.length / 100) / 10;
console.log(`Packed HTML size: ${ packedHtmlKbSize }KB`);

const packedIndexHtmlFile = join(distDirectory, 'index_packed.html');
console.log(`Writing index_packed.html file: ${ packedIndexHtmlFile }`);

await writeFile(packedIndexHtmlFile, packedHtml);
console.log('Done.');
