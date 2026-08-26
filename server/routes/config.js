
import { Router } from 'express';
import { loadLocales, describeLocales } from '../lib/locales.js';
import { randomSeed } from '../../shared/seed.js';

const router = Router();

router.get('/config', async (_req, res) => {
  try {
    const locales = await loadLocales();
    res.json({
      locales: describeLocales(locales),
      defaultSeed: randomSeed(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
