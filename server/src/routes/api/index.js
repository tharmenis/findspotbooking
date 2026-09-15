// /api router — mounts the three sub-routers. Registered before the
// /:publicId catch-all so these paths are never treated as listing lookups.
import { Router } from 'express';
import listings from './listings.js';
import availability from './availability.js';
import reservations from './reservations.js';

const router = Router();

router.use('/listings', listings);
router.use('/availability', availability);
router.use('/reservations', reservations);

export default router;
