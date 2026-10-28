import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Election Admin & Pre-Election Enrollment Portal (Port 3001)
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'admin-html-rewrite',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            req.url = '/admin.html';
          }
          next();
        });
      }
    }
  ],
  server: {
    port: 3001,
    strictPort: true
  },
  build: {
    rollupOptions: {
      input: {
        admin: resolve(__dirname, 'admin.html')
      }
    }
  }
});
