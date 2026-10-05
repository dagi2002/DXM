import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderTokensCss } from '../src/render-css';

const out = fileURLToPath(new URL('../src/tokens.css', import.meta.url));
writeFileSync(out, renderTokensCss());
console.log(`wrote ${out}`);
