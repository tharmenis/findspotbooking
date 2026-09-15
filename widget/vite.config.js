// Two entry points (04-widget-embedding.md):
//   widget.v4.js  — embed bundle, mounted into a shadow root on client sites
//   standalone.js — standalone shell bundle, mounts into book.findspot.net's page
// Build output lands in server/src/public/ (06-express-app-structure.md) —
// that folder is a pre-deploy artifact, served statically by Express.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// embed.js is hand-written (the tiny loader from 04-widget-embedding.md), not
// part of the Vite build. Vite's emptyOutDir wipes it, so copy it back into
// the output after every build.
function copyEmbedLoader() {
  return {
    name: 'copy-embed-loader',
    closeBundle() {
      const src = join(__dirname, 'src', 'embed.js');
      const outDir = join(__dirname, '..', 'server', 'src', 'public');
      mkdirSync(outDir, { recursive: true });
      cpSync(src, join(outDir, 'embed.js'));
    },
  };
}

export default defineConfig({
  plugins: [react(), copyEmbedLoader()],
  server: {
        port: 5173,
        proxy: {
          '/api': { target: 'http://localhost:3001', changeOrigin: true },
        },
      },
  build: {
    outDir: join(__dirname, '..', 'server', 'src', 'public'),
    emptyOutDir: true,
    manifest: false,
    copyPublicDir: false,
    rollupOptions: {
      input: {
        widget: join(__dirname, 'src', 'entry-embed.jsx'),
        standalone: join(__dirname, 'src', 'entry-standalone.jsx'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'widget' ? 'widget.v4.js' : '[name].js'),
        // All CSS — the entry stylesheet and any chunks (e.g. the intl-tel-input
        // import) — must land in widget.css: the standalone shell and embed
        // loader both link a single known stylesheet path.
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'widget.css';
          }
          // Everything else (flags sprite, fonts, images) keeps a hashed name
          // under assets/ so it never collides with the stylesheet.
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
