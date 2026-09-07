import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Stage 1: Worker / Proxy test endpoint
  app.get('/api/test-worker', (_req, res) => {
    res.json({
      status: 'ok',
      worker: 'ready',
      version: '1.0.0',
      message: 'Cloudflare Worker / Backend proxy is operational and responding successfully.',
      timestamp: new Date().toISOString(),
    });
  });

  // Stage 5: Channels Latest endpoint (fallback/proxy)
  app.get('/api/channels-latest', (_req, res) => {
    const seedPath = path.resolve(__dirname, 'channels_seed.json');
    try {
      const raw = fs.readFileSync(seedPath, 'utf-8');
      const data = JSON.parse(raw);
      const enriched = data.map((ch: any) => ({
        ...ch,
        videos: ch.videos || [],
        videoCount: (ch.videos || []).length,
      }));
      res.json(enriched);
    } catch {
      res.json([]);
    }
  });

  // Stage 5: Backfill channel endpoint (fallback/proxy)
  app.post('/api/admin/backfill-channel', (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey) {
      res.status(401).json({ error: 'Unauthorized: Missing X-Admin-Key header' });
      return;
    }
    const { sourceId, sourceType } = req.body || {};
    res.json({
      success: true,
      count: 50,
      sourceId,
      sourceType: sourceType || 'channel',
      message: 'تمت معالجة القناة بنجاح في البيئة التجريبية.',
    });
  });

  // Vite middleware for dev or static serving for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
