import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',      // Aceita conexões de qualquer máquina na rede
    port: 5173,
    proxy: {
      '/run-test':     'http://localhost:3000',
      '/load-config':  'http://localhost:3000',
      '/save-config':  'http://localhost:3000',
      '/reset-driver': 'http://localhost:3000',
      '/stop-test':    'http://localhost:3000',
    }
  }
});