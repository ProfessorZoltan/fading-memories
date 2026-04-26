import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

// Standard icon: edge-to-edge mark
const standardSvg = readFileSync(join(publicDir, 'icon.svg'), 'utf8');

// Maskable icon: ~70% safe zone — pad the mark inward so adaptive icon
// shapes (circle, squircle) don't crop the strokes.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1a1814" />
  <g fill="#d4a373" transform="translate(76 76) scale(0.703)">
    <rect x="96" y="156" width="320" height="44" rx="22" opacity="1" />
    <rect x="96" y="234" width="280" height="44" rx="22" opacity="0.65" />
    <rect x="96" y="312" width="200" height="44" rx="22" opacity="0.3" />
  </g>
</svg>`;

function render(svg, size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  return resvg.render().asPng();
}

const targets = [
  { name: 'icon-192.png', svg: standardSvg, size: 192 },
  { name: 'icon-512.png', svg: standardSvg, size: 512 },
  { name: 'icon-maskable-512.png', svg: maskableSvg, size: 512 },
  { name: 'apple-touch-icon.png', svg: standardSvg, size: 180 },
];

for (const { name, svg, size } of targets) {
  const png = render(svg, size);
  const out = join(publicDir, name);
  writeFileSync(out, png);
  console.log(`wrote ${name} (${size}x${size}, ${png.length} bytes)`);
}
