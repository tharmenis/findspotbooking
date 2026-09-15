// Static widget assets (04-widget-embedding.md, 06-express-app-structure.md):
//   /embed.js       — tiny loader, short cache TTL (fast rollout of new versions)
//   /widget.v4.js   — Vite-built embed bundle, immutable cache
//   /standalone.js  — Vite-built standalone shell bundle, immutable cache
//   /widget.css     — shared styles, immutable cache
// The folder is BUILD OUTPUT produced by the widget package's Vite build.
import { Router, static as expressStatic } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { config } from '../config/index.js';

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

const publicPath = (name) => join(PUBLIC_DIR, name);

// embed.js is hand-written (not part of the Vite build) and lives directly in
// server/src/public. Read it at request time so deploys/edits don't need a
// process restart; the file is tiny.
const embedJs = readFileSync(publicPath('embed.js'), 'utf8');
const EMBED_CONTENT_TYPE = 'application/javascript; charset=utf-8';

router.get('/embed.js', (req, res) => {
  res.set('Content-Type', EMBED_CONTENT_TYPE);
  res.set('Cache-Control', `public, max-age=${config.embedAssetTtl}`);
  res.send(embedJs);
});

router.use(expressStatic(PUBLIC_DIR, {
  setHeaders(res, filePath) {
    const name = basename(filePath);
    if (name === 'embed.js') {
      res.set('Cache-Control', `public, max-age=${config.embedAssetTtl}`);
    } else {
      res.set('Cache-Control', `public, max-age=${config.bundleAssetTtl}, immutable`);
    }
  },
}));

export default router;
