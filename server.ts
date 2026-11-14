import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

interface StoredProject {
  id: string;
  updatedAt: string;
  settings: {
    projectName: string;
    projectCode: string;
  };
  nodes: unknown[];
  connections: unknown[];
}

async function readStore(): Promise<Record<string, StoredProject>> {
  try {
    const raw = await fs.readFile(PROJECTS_FILE, 'utf-8');
    return JSON.parse(raw) as Record<string, StoredProject>;
  } catch {
    return {};
  }
}

async function writeStore(store: Record<string, StoredProject>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PROJECTS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/projects', async (_req, res) => {
    const store = await readStore();
    const list = Object.values(store)
      .map((p) => ({
        id: p.id,
        name: p.settings?.projectName || 'Untitled FTTH Network',
        code: p.settings?.projectCode || 'FTTH',
        updatedAt: p.updatedAt,
        nodeCount: Array.isArray(p.nodes) ? p.nodes.length : 0,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json(list);
  });

  app.get('/api/projects/:id', async (req, res) => {
    const store = await readStore();
    const proj = store[req.params.id];
    if (!proj) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(proj);
  });

  app.post('/api/projects', async (req, res) => {
    const body = req.body as StoredProject;
    if (!body || !body.id) {
      return res.status(400).json({ error: 'Invalid project payload' });
    }
    const store = await readStore();
    store[body.id] = {
      ...body,
      updatedAt: new Date().toISOString(),
    };
    await writeStore(store);
    res.json({ ok: true, id: body.id });
  });

  app.delete('/api/projects/:id', async (req, res) => {
    const store = await readStore();
    delete store[req.params.id];
    await writeStore(store);
    res.json({ ok: true });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FiberCAD Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
