import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function liveCsvSyncPlugin() {
  return {
    name: 'live-csv-sync',
    configureServer(server) {
      server.middlewares.use('/heliospulse-portal/api/sync-csv', (req, res) => {
        try {
          execFileSync('node', ['scripts/sync-csv-data.mjs'], { stdio: 'inherit' });
          const dataPath = path.resolve('src/data/telemetryData.json');
          const json = fs.readFileSync(dataPath, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.end(json);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

export default defineConfig({
  base: '/heliospulse-portal/',
  plugins: [react(), tailwindcss(), liveCsvSyncPlugin()],
});
