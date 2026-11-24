import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import 'dotenv/config';
import {
  streamAnalysis,
  validateInput,
  toPublicError,
  isConfigured,
  releaseFiles,
  MISSING_KEY_MESSAGE,
} from './api/analyze';
import {
  storeFile,
  readRawBytes,
  toPublicError as toUploadError,
  MISSING_KEY_MESSAGE as UPLOAD_MISSING_KEY_MESSAGE,
} from './api/upload';

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
          await releaseFiles(input);
        }
      });

      server.middlewares.use('/api/upload', async (req: any, res: any) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Allow', 'POST');
          res.end(JSON.stringify({ error: 'Método não permitido.' }));
          return;
        }

        if (!isConfigured()) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: UPLOAD_MISSING_KEY_MESSAGE }));
          return;
        }

        const header = (name: string) => String(req.headers[name] ?? '').split(';')[0].trim().toLowerCase();
        const rawName = String(req.headers['x-file-name'] ?? '');
        let bytes: Uint8Array;
        try {
          bytes = await readRawBytes(req);
        } catch {
          res.statusCode = 413;
          res.end(JSON.stringify({ error: 'Arquivo grande demais para envio.' }));
          return;
        }

        try {
          const stored = await storeFile(bytes, header('content-type'), decodeURIComponent(rawName) || undefined);
          res.statusCode = 200;
          res.end(JSON.stringify(stored));
        } catch (error) {
          console.error('[api/upload]', error);
          const { status, message } = toUploadError(error);
          res.statusCode = status;
          res.end(JSON.stringify({ error: message }));
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
