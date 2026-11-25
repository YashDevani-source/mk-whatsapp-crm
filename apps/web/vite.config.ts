import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// WA Decision 5: the browser only ever talks to this origin. The proxy forwards the api routes and
// the Socket.io WebSocket to the api, so no CORS is needed. The api checks the forwarded Origin
// header against ALLOWED_ORIGINS (http://localhost:5173).
const API = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/auth': API,
      '/wa': API,
      '/conversations': API,
      '/health': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
