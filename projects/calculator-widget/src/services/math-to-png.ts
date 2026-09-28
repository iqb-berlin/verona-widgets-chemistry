// Properties copied from the live element tree onto the clone. The clone is
// rendered in an isolated SVG document, so global stylesheets and Angular's
// (emulated) component styles do not reach it; anything that affects the
// math layout has to be inlined.
const STYLE_PROPS = [
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'color',
  'math-style',
  'math-depth',
  'math-shift',
  'display',
  'direction',
  'padding',
  'margin',
  'border',
  'background-color',
  'text-align',
];

function inlineStyles(source: Element, target: Element, overrideStyles: Record<string, undefined | string>): void {
  const computed = getComputedStyle(source);
  const style = STYLE_PROPS.map((property) => {
    const styleValue = overrideStyles[property] ?? computed.getPropertyValue(property);
    return `${property}:${styleValue}`;
  }).join(';');

  target.setAttribute('style', style);

  // Angular's emulated-encapsulation attributes are useless in the snapshot.
  for (const attr of Array.from(target.attributes)) {
    if (attr.name.startsWith('_ng')) target.removeAttribute(attr.name);
  }

  // Recursively copy source- to target styles in tree
  const s = source.children;
  const t = target.children;
  for (let i = 0; i < s.length; i++) {
    inlineStyles(s[i], t[i], overrideStyles);
  }
}

export interface MathToPngOptions {
  /** Desired image width in pixels; if omitted, width is derived from scale */
  imageWidth?: number;
  /** Output pixel density (2 or 3 gives crisp images). */
  scale?: number;
  /** Extra space around the formula, in CSS px (catches ink overflow). */
  padding?: number;
  /** Fill color; omit for a transparent PNG. */
  background?: string;
  /** Text color; omit for current font color. */
  foreground?: string;
}

export async function mathToPng(el: Element, options: MathToPngOptions = {}): Promise<string> {
  const { imageWidth, scale = window.devicePixelRatio || 1, padding = 4, background } = options;
  const rect = el.getBoundingClientRect();
  const w = Math.ceil(rect.width) + 2 * padding;
  const h = Math.ceil(rect.height) + 2 * padding;

  const s = imageWidth && imageWidth > 0 ? imageWidth / w : scale;
  const pw = imageWidth && imageWidth > 0 ? Math.round(imageWidth) : Math.round(w * s);
  const ph = Math.max(1, Math.round(h * s));

  const clone = el.cloneNode(true) as Element;
  inlineStyles(el, clone, { color: options.foreground });
  clone.setAttribute('style', clone.getAttribute('style') + ';margin:0');
  clone.setAttribute('display', 'inline');

  const xmlSerializer = new XMLSerializer();

  // XMLSerializer emits xmlns="http://www.w3.org/1998/Math/MathML" for us.
  const mathXml = xmlSerializer.serializeToString(clone);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', pw.toString());
  svg.setAttribute('height', ph.toString());
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  foreignObject.setAttribute('x', '0');
  foreignObject.setAttribute('y', '0');
  foreignObject.setAttribute('width', w.toString());
  foreignObject.setAttribute('height', h.toString());
  svg.appendChild(foreignObject);

  const foreignDiv = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  foreignDiv.style.padding = `${padding}px`;
  foreignDiv.style.display = 'inline-block';
  foreignDiv.appendChild(clone);
  foreignObject.appendChild(foreignDiv);

  const img = new Image();
  const svgXml = xmlSerializer.serializeToString(svg);
  //console.log('SVG XML =', svgXml);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgXml)}`;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;

  const ctx = canvas.getContext('2d')!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/png');
}
