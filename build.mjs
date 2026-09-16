// Bundle src/main.js (+three) into a single self-contained HTML that opens by double-click.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { buildBrainGraph } from './graph-build.mjs';
await buildBrainGraph(); // V3.6: bake the vault's wiki-link graph into src/braingraph.js

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: 'es2020',
});
const js = res.outputFiles[0].text;
const shell = readFileSync('src/shell.html', 'utf8');
// photo textures inlined as data URIs — file:// pages can't load file:// images,
// so the double-click copy carries its own pixels
const textures = Object.fromEntries(
  ['textures', 'characters'].flatMap(dir => readdirSync('public/' + dir).filter(f => f.endsWith('.png') && f.startsWith('char-') || dir === 'textures')
    .map(f => [f, 'data:image/png;base64,' + readFileSync('public/' + dir + '/' + f).toString('base64')])));
const html = shell.replace('<!--APP-->', () => `<script>window.OFFICE_TEXTURES=${JSON.stringify(textures)}</script><script>${js}</script>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/command-centre-v2.html', html);

// dev variant with external script for faster iteration
mkdirSync('dist', { recursive: true });
writeFileSync('dist/app.js', js);
writeFileSync('dist/dev.html', shell.replace('<!--APP-->', '<script src="app.js"></script>'));
console.log(`built dist/command-centre-v2.html (${(html.length / 1024).toFixed(0)} KB)`);
