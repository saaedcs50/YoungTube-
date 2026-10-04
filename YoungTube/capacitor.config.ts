import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.youngtube.app',
  appName: 'YoungTube',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
