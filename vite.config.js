import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './extension.manifest.json';

/** Strip crossorigin — breaks chrome-extension:// module script loading */
function stripCrossorigin() {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(="[^"]*")?/g, '');
    },
  };
}

export default defineConfig({
  plugins: [react(), crx({ manifest }), stripCrossorigin()],
  base: './',
  build: {
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      external: [/\.pem$/],
    },
  },
});