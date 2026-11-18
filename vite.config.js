import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const MORE_BILLS_DIR =
  'C:\\Software Developement\\ChatGPT Codex\\Solar Energy - SunRun\\NYSEG Bill\\Bills\\More Bills';

function liveCsvAndBillsSyncPlugin() {
  return {
    name: 'live-csv-and-bills-sync',
    configureServer(server) {
      const runSyncAndGetJson = () => {
        execFileSync('node', ['scripts/sync-csv-data.mjs'], { stdio: 'inherit' });
        const dataPath = path.resolve('src/data/telemetryData.json');
        return fs.readFileSync(dataPath, 'utf8');
      };

      server.middlewares.use('/heliospulse-portal/api/sync-csv', (req, res) => {
        try {
          const json = runSyncAndGetJson();
          res.setHeader('Content-Type', 'application/json');
          res.end(json);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // Automatically watch the NYSEG "More Bills" folder for newly added PDFs
      if (fs.existsSync(MORE_BILLS_DIR)) {
        let debounceTimer = null;
        try {
          fs.watch(MORE_BILLS_DIR, (eventType, filename) => {
            if (!filename || !filename.toLowerCase().endsWith('.pdf')) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              try {
                console.log(`[live-bills-watch] Detected ${eventType} on ${filename}; resyncing bills...`);
                const json = runSyncAndGetJson();
                server.ws.send({
                  type: 'custom',
                  event: 'nyseg-bills-updated',
                  data: JSON.parse(json),
                });
              } catch (err) {
                console.error('[live-bills-watch] Sync failed:', err.message);
              }
            }, 600);
          });
        } catch (err) {
          console.warn('[live-bills-watch] Could not watch More Bills folder:', err.message);
        }
      }
    },
  };
}

export default defineConfig({
  base: '/heliospulse-portal/',
  plugins: [react(), tailwindcss(), liveCsvAndBillsSyncPlugin()],
});
