import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './server/app.ts';

const PORT = Number(process.env.PORT ?? 3000);
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = createApiApp(PORT);

  if (!isProd && fs.existsSync(path.resolve(process.cwd(), 'vite.config.ts'))) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Clip Maker running at http://localhost:${PORT}`);
  });
}

void startServer();
