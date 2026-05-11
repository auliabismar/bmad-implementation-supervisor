import { generateHealthResponse, resetUptime } from './health';

export interface ServerConfig {
  port: number;
}

let server: ReturnType<typeof Bun.serve> | null = null;
let lastError: string | null = null;

export function setLastError(error: string | null): void {
  lastError = error;
}

export function getLastError(): string | null {
  return lastError;
}

export function startServer(config?: Partial<ServerConfig>): ReturnType<typeof Bun.serve> {
  if (server) {
    throw new Error('Health server is already running');
  }

  const port = config?.port ?? 3000;
  const hostname = 'localhost';

  resetUptime();

  server = Bun.serve({
    port,
    hostname,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === '/health' && req.method === 'GET') {
        const healthResponse = generateHealthResponse(lastError);
        return new Response(JSON.stringify(healthResponse), {
          status: healthResponse.status === 'unhealthy' ? 503 : 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  return server;
}

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.stop();
      server = null;
    }
    resolve();
  });
}

export function isServerRunning(): boolean {
  return server !== null;
}

export function getServerInfo(): { port: number; hostname: string } | null {
  if (!server) return null;
  const port = server.port;
  const hostname = server.hostname;
  if (port === undefined || hostname === undefined) return null;
  return {
    port,
    hostname,
  };
}

export function startServerWithGracefulShutdown(config?: Partial<ServerConfig>): ReturnType<typeof Bun.serve> {
  const runningServer = startServer(config);

  const serverInfo = getServerInfo();
  console.log(`Health endpoint running at http://${serverInfo?.hostname}:${serverInfo?.port}/health`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    await stopServer();
    console.log('Server stopped');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return runningServer;
}
