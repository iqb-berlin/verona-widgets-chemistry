import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Bundles a packed widget (dist/<project>/browser/index_packed.html) into a minimal standalone host page
// at dist/widget-host/<project>/index.html, and regenerates dist/widget-host/index.html listing all bundled widgets.

const rootDir = join(import.meta.dirname, '..');
const templateFile = join(import.meta.dirname, 'widget-host-template.html');
const outputDir = join(rootDir, 'dist', 'widget-host');

const [project] = process.argv.slice(2);
if (!project) {
  console.error(`Usage: ${process.argv[1]} [project-name]`);
  process.exit(1);
}

const packedHtmlFile = join(rootDir, 'dist', project, 'browser', 'index_packed.html');
if (!existsSync(packedHtmlFile)) {
  console.error(`Missing packed widget file: ${packedHtmlFile}`);
  console.error(`Run "npm run build:project:${project}" and "npm run inline:project:${project}" first.`);
  process.exit(1);
}

const escapeHtml = (text) => {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

// Escape "<" so the embedded JSON can never close its surrounding <script> element
const widgetHtml = await readFile(packedHtmlFile, 'utf8');
const widgetHtmlJson = JSON.stringify(widgetHtml).replace(/</g, '\\u003c');

const template = await readFile(templateFile, 'utf8');
const hostHtml = template
  .replaceAll('{{WIDGET_NAME}}', () => escapeHtml(project))
  .replace('{{WIDGET_HTML_JSON}}', () => widgetHtmlJson);

const projectOutputDir = join(outputDir, project);
await mkdir(projectOutputDir, { recursive: true });

const hostHtmlFile = join(projectOutputDir, 'index.html');
await writeFile(hostHtmlFile, hostHtml);
console.log(`Wrote widget host (${(hostHtml.length / 1000).toFixed(1)}KB): ${hostHtmlFile}`);

// Regenerate overview page listing all bundled widgets
const entries = await readdir(outputDir, { withFileTypes: true });
const widgets = entries
  .filter((entry) => entry.isDirectory() && existsSync(join(outputDir, entry.name, 'index.html')))
  .map((entry) => entry.name)
  .sort();

const links = widgets.map((name) => `<li><a href="./${escapeHtml(name)}/">${escapeHtml(name)}</a></li>`);
const overviewIndexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Widget Hosts</title>
    <style>body { margin: 16px; font: 16px/1.6 system-ui, sans-serif; }</style>
  </head>
  <body>
    <h1>Widget Hosts</h1>
    <ul>
    ${links.join('\n')}
    </ul>
  </body>
</html>`;

await writeFile(join(outputDir, 'index.html'), overviewIndexHtml);
console.log(`Updated overview: ${join(outputDir, 'index.html')}`);
