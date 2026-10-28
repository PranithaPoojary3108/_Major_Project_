import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Polling Booth Level Client Station (Port 3000)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true
  }
});
