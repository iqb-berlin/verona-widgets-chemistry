// List of attributes copied from SVG-Icon root to <symbol> element
const copyAttributes = [
  'viewBox',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'fill',
  'fill-opacity',
] as const;

export function copySvgIconToSymbol(svgIcon: SVGElement, symbol: SVGSymbolElement) {
  // Copy attributes from icon to symbol
  for (const attributeName of copyAttributes) {
    const attributeValue = svgIcon.getAttribute(attributeName);
    if (attributeValue) {
      symbol.setAttribute(attributeName, attributeValue);
    }
  }

  // Clone icon contents into symbol
  symbol.replaceChildren(); // Clear content
  for (const child of svgIcon.childNodes) {
    symbol.appendChild(child.cloneNode(true));
  }
}
