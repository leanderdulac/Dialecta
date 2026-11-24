import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import 'dotenv/config';
import { streamAnalysis, validateInput, toPublicError, isConfigured, MISSING_KEY_MESSAGE } from './api/analyze';

function readJsonBody(req: any): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: any) => {
      raw += chunk.toString();
      if (raw.length > 6 * 1024 * 1024) {
        reject(new Error('Corpo da requisição muito grande.'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

// Em produção quem serve /api/analyze é a função serverless de api/analyze.ts;
// este middleware repete o comportamento no `npm run dev`.
function analysisApi(): Plugin {
  return {
    name: 'dialecta-analysis-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/analyze', async (req: any, res: any) => {
        res.setHeader('Cache-Control', 'no-store');

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Allow', 'POST');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Método não permitido.' }));
          return;
        }

        if (!isConfigured()) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: MISSING_KEY_MESSAGE }));
          return;
        }

        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'JSON inválido.' }));
          return;
        }

        let input;
        try {
          input = validateInput(body);
        } catch (error) {
          const { status, message } = toPublicError(error);
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: message }));
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('X-Accel-Buffering', 'no');

        const send = (event: unknown) => {
          if (!res.writableEnded) {
            res.write(`${JSON.stringify(event)}\n`);
          }
        };

        try {
          await streamAnalysis(input, (text) => send({ type: 'chunk', text }));
        } catch (error) {
          console.error('[api/analyze]', error);
          send({ type: 'error', message: toPublicError(error).message });
        } finally {
          if (!res.writableEnded) {
            res.end();
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), analysisApi()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify — file watching is disabled to prevent flickering during agent edits.
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
