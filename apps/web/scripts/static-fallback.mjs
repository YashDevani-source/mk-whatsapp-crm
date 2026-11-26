// DEMO-34: after `build:demo`, make deep links like /leads/<id> work on static hosts. GitHub
// Pages serves 404.html for unknown paths; Netlify reads _redirects. Both hand the path to the
// app's router. `vite preview` already does this by itself.
import { copyFileSync, writeFileSync } from 'node:fs';

copyFileSync('dist/index.html', 'dist/404.html');
writeFileSync('dist/_redirects', '/*  /index.html  200\n');
console.log('static fallback: dist/404.html and dist/_redirects written');
