import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.RWP_BASE_PATH || '/',
  build: { sourcemap: true },
});
