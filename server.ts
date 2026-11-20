import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { seedDatabaseIfEmpty } from './server/seed.ts';
import { createApiRouter } from './server/routes.ts';

function getCliArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  const prefixed = process.argv.find((a) => a.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : undefined;
}

function listenServer(httpServer: http.Server, port: number, hostArg?: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      // If dual-stack IPv6 listen fails on an IPv4-only environment, fall back to 0.0.0.0
      if (!hostArg && (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL')) {
        httpServer.removeListener('error', onError);
        httpServer.once('error', reject);
        httpServer.listen(port, '0.0.0.0', () => resolve());
        return;
      }
      reject(err);
    };

    httpServer.once('error', onError);

    // When host is omitted or 0.0.0.0, bind without explicit IPv4-only host so Node uses
    // dual-stack (:: / 0.0.0.0), serving both 127.0.0.1 and [::1] localhost probes cleanly.
    if (!hostArg || hostArg === '0.0.0.0') {
      httpServer.listen(port, () => {
        httpServer.removeListener('error', onError);
        resolve();
      });
    } else {
      httpServer.listen(port, hostArg, () => {
        httpServer.removeListener('error', onError);
        resolve();
      });
    }
  });
}

async function startServer() {
  seedDatabaseIfEmpty();

  const isProd = process.env.NODE_ENV === 'production';
  const cliPort = Number(getCliArg('--port'));
  const envPort = isProd ? Number(process.env.PORT) : Number(process.env.DEFAULT_APP_PORT);
  const PORT =
    Number.isFinite(cliPort) && cliPort > 0
      ? cliPort
      : Number.isFinite(envPort) && envPort > 0
        ? envPort
        : 3000;
  const hostArg = getCliArg('--host');

  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Quietly satisfy browser favicon requests without 404 noise
  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  // Mount Folkform API routes
  app.use('/api', createApiRouter());

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'folkform-platform' });
  });

  const httpServer = http.createServer(app);
  let vite: ViteDevServer | null = null;

  if (!isProd) {
    // Attach Vite's WebSocket to the existing Express HTTP server so Vite never binds
    // a separate port (24678) that can conflict across rapid restarts, while keeping
    // file watching disabled via vite.config.ts when DISABLE_HMR=true.
    vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  // Fallback Express error handler so malformed requests never crash the server
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled request error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  await listenServer(httpServer, PORT, hostArg);
  console.log(`Folkform server listening on http://localhost:${PORT}`);
  console.log(`  ➜  Local:   http://localhost:${PORT}/`);
  console.log(`  ➜  Network: http://0.0.0.0:${PORT}/`);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const forceExit = setTimeout(() => process.exit(0), 1000);
    forceExit.unref();
    try {
      if (vite) await vite.close();
    } catch {
      // ignore close errors
    }
    httpServer.close(() => {
      process.exit(0);
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

startServer().catch((err) => {
  console.error('Failed to start Folkform server:', err);
  process.exit(1);
});
