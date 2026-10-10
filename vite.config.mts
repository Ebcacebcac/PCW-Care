import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/* The packaged app also sends this policy as a header (src/main/main.ts);
   the meta tag keeps it in force however the page is loaded. Dev builds
   skip it because Vite's hot reload needs inline scripts. */
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";

function cspMeta(): Plugin {
  return {
    name: 'pcw-care-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), cspMeta()],
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    target: 'chrome130',
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
});
