import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateData } from './domain.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.AZORA_DATA_DIR || process.env.RONDA_DATA_DIR || path.join(root, 'data');
const port = Number(process.env.PORT || 4187);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT debe ser un puerto entre 0 y 65535.');
await mkdir(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'ronda.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history (revision INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)');
const readState = () => { const r = db.prepare('SELECT * FROM workspace WHERE id=1').get(); return r ? { revision: r.revision, data: JSON.parse(r.payload), updatedAt: r.updated_at } : { revision: 0, data: null }; };
const allowed = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ...['app.js', 'db.js', 'domain.js', 'workspace.js'].map(f => [`/${f}`, [f, 'text/javascript']]), ['/styles.css', ['styles.css', 'text/css']], ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']], ['/sw.js', ['sw.js', 'text/javascript']], ...['icon.svg', 'icon-maskable.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'].map(f => [`/icons/${f}`, [`icons/${f}`, f.endsWith('.svg') ? 'image/svg+xml' : 'image/png']])]);
const securityHeaders = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'", 'Cache-Control': 'no-cache' };
allowed.set('/ronda.css', ['ronda.css', 'text/css']);
const server = http.createServer(async (req, res) => {
  const reply = (status, body) => { res.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  try {
    const boundPort = server.address().port;
    const localOrigins = [`http://localhost:${boundPort}`, `http://127.0.0.1:${boundPort}`];
    if (![...localOrigins.map(origin => new URL(origin).host)].includes(req.headers.host)) return reply(403, { error: 'Host no permitido.' });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/api/state') {
      if ((req.headers.origin && !localOrigins.includes(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') return reply(403, { error: 'Origen no permitido.' });
      if (req.method === 'GET') return reply(200, readState());
      if (req.method !== 'PUT') return reply(405, { error: 'Método no permitido.' });
      if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'Se requiere JSON.' });
      const chunks = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 5 * 1024 * 1024) return reply(413, { error: 'El respaldo supera 5 MB.' });
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || !Number.isSafeInteger(body.revision) || body.revision < 0) return reply(400, { error: 'La revisión del respaldo no es válida.' });
      validateData(body.data);
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = readState();
        if (body.revision !== current.revision) { db.exec('ROLLBACK'); return reply(409, { error: 'Otra pestaña o navegador guardó cambios. Conservamos tus datos locales.', revision: current.revision }); }
        const now = new Date().toISOString();
        if (current.data) db.prepare('INSERT OR REPLACE INTO history VALUES (?,?,?)').run(current.revision, JSON.stringify(current.data), current.updatedAt);
        db.prepare('INSERT INTO workspace VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at').run(current.revision + 1, JSON.stringify(body.data), now);
        db.prepare('DELETE FROM history WHERE revision < ?').run(Math.max(0, current.revision - 19));
        db.exec('COMMIT');
        return reply(200, { revision: current.revision + 1, updatedAt: now });
      } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
    }
    if (!['GET', 'HEAD'].includes(req.method)) return reply(405, { error: 'Método no permitido.' });
    const file = allowed.get(url.pathname);
    if (!file) return reply(404, { error: 'Recurso no encontrado.' });
    const buffer = await readFile(path.join(root, file[0]));
    res.writeHead(200, { ...securityHeaders, 'Content-Type': `${file[1]}; charset=utf-8` });
    res.end(req.method === 'HEAD' ? undefined : buffer);
  } catch (error) { reply(error.code === 'ENOENT' ? 404 : 400, { error: error.code === 'ENOENT' ? 'Recurso no encontrado.' : error.message }); }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, '127.0.0.1', () => console.log(`Azora: http://127.0.0.1:${server.address().port}/\nSQLite local disponible.`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
process.on('SIGINT', () => server.close(() => { db.close(); process.exit(0); }));
