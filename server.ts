import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './src/server/routes';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3050;

  // Middleware
  app.use(express.json());

  // API Routes
  app.use('/api', apiRouter);

  // Healthcheck
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Vite middleware in dev / Static files in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/data/**', '**/data/library.json', '**/.git/**'],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CineLocal] Servidor rodando em http://localhost:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[ERRO FATAL] A porta ${PORT} ja esta ocupada por outro programa no seu computador!`);
      console.error(`Para usar outra porta, altere 'set PORT=3050' no arquivo start.bat para outra porta (ex: 3060, 8080).\n`);
    } else {
      console.error('[ERRO FATAL] Erro ao iniciar o servidor:', err);
    }
    process.exit(1);
  });
}

startServer();
