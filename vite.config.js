import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const MORE_BILLS_DIR =
  'C:\\Software Developement\\ChatGPT Codex\\Solar Energy - SunRun\\NYSEG Bill\\Bills\\More Bills';
const SUNRUN_DATA_DIR =
  'C:\\Software Developement\\ChatGPT Codex\\Solar Energy - SunRun\\SunRun Data';

function reportServerIssueEmail(title, message, source = 'vite.config.js', details = '') {
  try {
    const out = execFileSync('python', ['scripts/notify_email.py', '--report-app-error', '-'], {
      input: JSON.stringify({ title, message, source, details }),
      encoding: 'utf8',
    });
    return JSON.parse(out.trim() || '{}');
  } catch (err) {
    console.warn('[notify-email] Could not dispatch issue email:', err.message);
    return { status: 'error', error: err.message };
  }
}

function liveCsvAndBillsSyncPlugin() {
  const runSyncAndGetJson = () => {
    execFileSync('node', ['scripts/sync-csv-data.mjs'], {
      stdio: 'inherit',
      env: { ...process.env, NOTIFY_EMAIL: '1' },
    });
    const dataPath = path.resolve('src/data/telemetryData.json');
    return fs.readFileSync(dataPath, 'utf8');
  };

  const runTaskSchedulerPs = (action = 'status', target = 'both') => {
    const safeAction = action === 'run' ? 'run' : 'status';
    const safeTarget = ['sunrun', 'nyseg', 'both'].includes(target) ? target : 'both';
    const psOut = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.resolve('scripts/task-scheduler.ps1'),
        '-Action',
        safeAction,
        '-Target',
        safeTarget,
      ],
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }
    );
    return JSON.parse(psOut.trim() || '{}');
  };

  const sendJson = (res, statusCode, data) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(typeof data === 'string' ? data : JSON.stringify(data));
  };

  const attachApiMiddlewares = (middlewares) => {
    middlewares.use('/heliospulse-portal/api', (req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
      next();
    });

    middlewares.use('/heliospulse-portal/api/sync-csv', (req, res) => {
      try {
        const json = runSyncAndGetJson();
        sendJson(res, 200, json);
      } catch (err) {
        reportServerIssueEmail('Sync CSV Pipeline Failed', err.message, 'vite/api/sync-csv', err.stack || '');
        sendJson(res, 500, { error: err.message });
      }
    });

    middlewares.use('/heliospulse-portal/api/task-scheduler', (req, res) => {
      try {
        const data = runTaskSchedulerPs('status', 'both');
        sendJson(res, 200, { ok: true, ...data });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
    });

    middlewares.use('/heliospulse-portal/api/run-task', (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
        return;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const target = ['sunrun', 'nyseg', 'both'].includes(parsed.target) ? parsed.target : 'both';
          const data = runTaskSchedulerPs('run', target);
          const runErrors = (data.runResults || []).filter((r) => r.error).map((r) => `${r.taskName}: ${r.error}`);
          sendJson(res, 200, { ok: runErrors.length === 0, errors: runErrors, ...data });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message });
        }
      });
    });

    middlewares.use('/heliospulse-portal/api/report-issue', (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method Not Allowed' });
        return;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const result = reportServerIssueEmail(
            parsed.title || 'App Runtime Issue',
            parsed.message || 'Unspecified issue',
            parsed.source || 'HeliosPulse Client',
            parsed.details || ''
          );
          sendJson(res, 200, result);
        } catch (err) {
          sendJson(res, 500, { status: 'error', error: err.message });
        }
      });
    });
  };

  return {
    name: 'live-csv-and-bills-sync',
    configurePreviewServer(server) {
      attachApiMiddlewares(server.middlewares);
    },
    configureServer(server) {
      attachApiMiddlewares(server.middlewares);

      const watchFolder = (dirPath, matchFn, eventName, label) => {
        if (!fs.existsSync(dirPath)) return;
        let debounceTimer = null;
        try {
          fs.watch(dirPath, (eventType, filename) => {
            if (!filename || !matchFn(filename)) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              try {
                console.log(`[${label}] Detected ${eventType} on ${filename}; resyncing...`);
                const json = runSyncAndGetJson();
                server.ws.send({
                  type: 'custom',
                  event: eventName,
                  data: JSON.parse(json),
                });
              } catch (err) {
                console.error(`[${label}] Sync failed:`, err.message);
                reportServerIssueEmail(`${label} failed`, err.message, label, err.stack || '');
              }
            }, 800);
          });
        } catch (err) {
          console.warn(`[${label}] Could not watch folder:`, err.message);
        }
      };

      // Automatically watch NYSEG "More Bills" folder for newly added PDFs
      watchFolder(MORE_BILLS_DIR, (f) => f.toLowerCase().endsWith('.pdf'), 'nyseg-bills-updated', 'live-bills-watch');
      // Automatically watch SunRun / NYSEG CSV files for newly added telemetry records
      watchFolder(
        SUNRUN_DATA_DIR,
        (f) => f === 'Sunrun_Daily_Production_Data.csv' || f === 'NYSEG_Daily_Usage_Data.csv',
        'telemetry-updated',
        'live-csv-watch'
      );
    },
  };
}

export default defineConfig({
  base: '/heliospulse-portal/',
  plugins: [react(), tailwindcss(), liveCsvAndBillsSyncPlugin()],
});
