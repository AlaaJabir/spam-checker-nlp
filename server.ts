import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import path from 'path';
import { apiApp } from './src/apiApp';

const app = express();
const PORT = 3000;

// Mount Deliverability and Tracking API
app.use(apiApp);

// Export app for external runners / serverless
export default app;
export { app };

// Start Server with Vite (in dev) or static serving (in production)
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn('Vite dev middleware not loaded, continuing in static mode:', err);
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Emailin-OPS Server running on http://0.0.0.0:${PORT}`);
  });
}

// Start standalone HTTP listener if not on Vercel
if (!process.env.VERCEL) {
  startServer();
}
