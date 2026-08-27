
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import configRoutes from './routes/config.js';
import movieRoutes from './routes/movies.js';
import trailerRoutes from './routes/trailer.js';
import posterRoutes from './routes/poster.js';
import exportRoutes from './routes/export.js';
import cacheRoutes from './routes/cache.js';
import { preGeneratePosters } from './lib/pregen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT ?? 3000;


app.use('/api', configRoutes);
app.use('/api', movieRoutes);
app.use('/api', trailerRoutes);
app.use('/api', posterRoutes);
app.use('/api', exportRoutes);
app.use('/api', cacheRoutes);


const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Movie Store running at http://localhost:${PORT}`);
  
  preGeneratePosters().catch(() => {});
});
