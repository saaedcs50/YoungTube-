import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function workerProxyPlugin(): Plugin {
  return {
    name: 'worker-proxy-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/test-worker' || req.url === '/api/health') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              status: 'ok',
              worker: 'ready',
              version: '1.0.0',
              message: 'Cloudflare Worker / Backend proxy is operational and responding successfully.',
              timestamp: new Date().toISOString(),
            })
          );
          return;
        }

        if (req.url?.startsWith('/api/channels-latest')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Access-Control-Allow-Origin', '*');
          const seedPath = path.resolve(process.cwd(), 'channels_seed.json');
          try {
            const raw = fs.readFileSync(seedPath, 'utf-8');
            const data = JSON.parse(raw);
            const enriched = data.map((ch: any) => ({
              ...ch,
              videos: ch.videos || [],
              videoCount: (ch.videos || []).length,
            }));
            res.end(JSON.stringify(enriched));
          } catch {
            res.end(JSON.stringify([]));
          }
          return;
        }

        if (req.url === '/api/admin/backfill-channel' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            try {
              const parsed = JSON.parse(body || '{}');
              const adminKey = req.headers['x-admin-key'];
              if (!adminKey) {
                res.statusCode = 401;
                res.end(JSON.stringify({ error: 'Unauthorized: Missing X-Admin-Key header' }));
                return;
              }
              res.end(
                JSON.stringify({
                  success: true,
                  count: 50,
                  sourceId: parsed.sourceId,
                  sourceType: parsed.sourceType || 'channel',
                  message: 'تمت المعالجة بنجاح عبر البروكسي المحلي (تأكد من نشر Worker لربط KV).',
                })
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      workerProxyPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          id: '/',
          name: 'يوتيوب الأطفال - مساحة آمنة',
          short_name: 'أطفال فيديو',
          description: 'تطبيق ويب تقدمي (PWA) آمن للأطفال لمشاهدة قنوات وفيديوهات مختارة وموثوقة بدون خوارزميات أو تشتيت.',
          theme_color: '#0284c7',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          lang: 'ar',
          dir: 'rtl',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              // دومين الـ Worker (workers.dev)
              urlPattern: /^https:\/\/.*\.workers\.dev\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'worker-api-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 24 * 60 * 60, // أقصى عمر للكاش يوم واحد (24 ساعة)
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
