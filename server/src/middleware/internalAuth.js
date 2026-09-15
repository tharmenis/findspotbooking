// Validates X-Sync-Secret on /internal/* routes. WordPress calls these —
// there is no browser Origin to check, so the shared secret is the only gate.
import { config } from '../config/index.js';

export function internalAuth(req, res, next) {
  const header = req.get('X-Sync-Secret');
  if (!header || header !== config.syncSecret) {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid sync secret.' } });
  }
  next();
}
