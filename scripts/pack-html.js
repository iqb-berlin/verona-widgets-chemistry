import { inlineSource } from 'inline-source';
import htmlParser from 'node-html-parser';
import cssParser from '@node-projects/css-parser';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const fontsCacheDir = join(import.meta.dirname, '.font-cache');

// Google Fonts splits a font into one file per script (Latin, Cyrillic, Greek, ...).
// Only the files containing one of these characters are embedded, the others are left out.
const EMBEDDED_SCRIPTS = { latin: 'a', maths: '√', symbols: '□' };
await mkdir(fontsCacheDir, { recursive: true });

//#region Main script

const [distDirectory] = process.argv.slice(2);
if (!distDirectory) {
  console.error(`Usage: ${process.argv[1]} [dist-directory]`);
  process.exit(1);
}

const indexHtmlFile = join(distDirectory, 'index.html');
if (!existsSync(indexHtmlFile)) {
  console.error(`Missing index.html file: ${indexHtmlFile}`);
  process.exit(1);
}

console.log(`Reading index.html file: ${indexHtmlFile}`);
const packedHtml = await inlineSource(indexHtmlFile, {
  attribute: false,
  compress: true,
  rootpath: distDirectory,
});

const inlinedHtml = await inlineFontFaces(packedHtml);

const bytesToKb = (bytes) => (bytes / 1000).toFixed(1);
console.log(`Packed HTML size: ${bytesToKb(packedHtml.length)}KB`);
console.log(`Font-Inlined HTML size: ${bytesToKb(inlinedHtml.length)}KB`);

const packedIndexHtmlFile = join(distDirectory, 'index_packed.html');
console.log(`Writing index_packed.html file: ${packedIndexHtmlFile}`);

await writeFile(packedIndexHtmlFile, inlinedHtml);
console.log('Done.');

//#endregion
//#region Helper Functions

async function inlineFontFaces(htmlContent) {
  const html = htmlParser.parse(htmlContent);

  // The fonts are embedded, so nothing has to connect to the font servers any more
  html.querySelectorAll('link[rel="preconnect"]').forEach((link) => link.remove());

  const styleElements = html.querySelectorAll('style');
  for (const styleElement of styleElements) {
    const cssContent = styleElement.rawText;
    const css = cssParser.parse(cssContent);
    css.stylesheet.rules = css.stylesheet.rules.filter((rule) => rule.type !== 'font-face' || isEmbeddedFontFace(rule));

    for (const rule of css.stylesheet.rules) {
      if (rule.type === 'font-face') {
        const srcDecl = rule.declarations.find((decl) => decl.property === 'src');
        if (srcDecl !== undefined) {
          srcDecl.value = await createInlineFontFaceSrc(srcDecl.value);
        }
      }
    }

    const inlinedCssContent = cssParser.stringify(css, {
      compress: true,
      removeEmptyRules: true,
    });

    styleElement.set_content(inlinedCssContent);
  }

  return html.outerHTML;
}

/**
 * Whether a font-face covers one of the embedded scripts. One without a unicode-range covers all characters.
 * @param fontFaceRule {{ declarations: { property: string, value: string }[] }}
 * @returns {boolean}
 */
function isEmbeddedFontFace(fontFaceRule) {
  const unicodeRange = fontFaceRule.declarations.find((decl) => decl.property === 'unicode-range')?.value;
  if (unicodeRange === undefined) return true;

  const ranges = unicodeRange.split(',').map((range) => {
    const [start, end = start] = range.trim().replace(/^U\+/i, '').split('-');
    return [parseInt(start.replaceAll('?', '0'), 16), parseInt(end.replaceAll('?', 'F'), 16)];
  });
  return Object.values(EMBEDDED_SCRIPTS).some((character) => {
    const codePoint = character.codePointAt(0);
    return ranges.some(([start, end]) => start <= codePoint && codePoint <= end);
  });
}

/**
 * @param fontSrc {string}
 * @returns {Promise<string>}
 */
async function createInlineFontFaceSrc(fontSrc) {
  const fontSrcRegex = /^url\((?<url>.+?)\)\s+format\('(?<format>.+?)'\)$/;
  const fontMatch = fontSrc.match(fontSrcRegex);
  if (!fontMatch) throw new Error(`Invalid font source: ${fontSrc}`);

  const { url: fontUrlHref, format: fontFormat } = fontMatch.groups ?? {};
  if (!fontUrlHref) throw new Error(`Missing URL in font source: ${fontSrc}`);
  if (fontFormat !== 'woff2') throw new Error(`Unsupported format in font source: ${fontSrc}`);

  const fontUrl = new URL(fontUrlHref);
  const fontDataBuffer = await loadFontData(fontUrl);
  const fontDataBase64 = fontDataBuffer.toString('base64');
  const fontDataUrl = `data:font/${fontFormat};base64,${fontDataBase64}`;

  return `url(${fontDataUrl}) format('${fontFormat}')`;
}

/**
 * @param fontUrl {URL}
 * @returns {Promise<Buffer>}
 */
async function loadFontData(fontUrl) {
  // Reduced icon fonts all share one path and differ in the query only, so the whole URL names the cached file
  const fontFilename = createHash('sha256').update(fontUrl.href).digest('hex');
  const cachedFontPath = join(fontsCacheDir, fontFilename);
  if (existsSync(cachedFontPath)) {
    return readFile(cachedFontPath);
  }

  const response = await fetch(fontUrl, { method: 'GET' });
  const responseData = await response.arrayBuffer();
  const buffer = Buffer.from(responseData);
  await writeFile(cachedFontPath, buffer);
  return buffer;
}

//#endregion
