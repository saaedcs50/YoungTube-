import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          id: '/',
          name: 'يونج تيوب - مساحة آمنة',
          short_name: 'يونج تيوب',
          description: 'يونج تيوب — تطبيق ويب تقدمي (PWA) آمن للأطفال لمشاهدة قنوات وفيديوهات مختارة وموثوقة بعناية بدون خوارزميات أو تشتيت.',
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
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              // Cache only public, key-independent channel metadata.
              // Authenticated/admin and YouTube-key-dependent endpoints are
              // intentionally excluded to prevent cross-user/cache-variant reuse.
              urlPattern: /^https:\/\/.*\.workers\.dev\/api\/channels-latest(?:\?feedLimit=10)?$/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'worker-public-channels-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 24 * 60 * 60,
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              // Public, key-independent channel archive reads are safe to cache.
              urlPattern: /^https:\/\/.*\.workers\.dev\/api\/channel-archive\?id=[^&]+$/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'worker-public-archive-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 24 * 60 * 60,
                },
                cacheableResponse: {
                  statuses: [200],
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
