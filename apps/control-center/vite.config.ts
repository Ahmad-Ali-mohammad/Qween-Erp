import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/portal/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ERP Qween Control Center',
        short_name: 'ERP Portal',
        theme_color: '#083344',
        background_color: '#f4efe6',
        display: 'standalone',
        start_url: '/portal/',
        lang: 'ar',
        icons: []
      }
    })
  ],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/api/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
