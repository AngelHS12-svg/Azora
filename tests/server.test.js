import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleData } from '../domain.js';

test('API persiste SQLite, rechaza conflictos y protege archivos privados', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ronda-api-test-'));
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const port = 14187;
  let child;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { cwd, env: { ...process.env, PORT: String(port), RONDA_DATA_DIR: dir }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('El servidor de prueba no inició. ' + output)), 10000);
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('Ronda:')) { clearTimeout(timeout); resolve(); } });
      child.on('exit', code => { clearTimeout(timeout); reject(new Error('Servidor terminó: ' + code)); });
      child.on('error', error => { clearTimeout(timeout); reject(error); });
    });
  };
  const stop = async () => { if (child && child.exitCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; } };
  const base = 'http://127.0.0.1:' + port;
  const put = (body, origin = base) => fetch(base + '/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
  try {
    await start();
    assert.equal((await (await fetch(base + '/api/state')).json()).revision, 0);
    const data = sampleData();
    assert.equal((await put({ revision: 0, data })).status, 200);
    assert.equal((await put({ revision: 0, data })).status, 409);
    assert.equal((await put({ revision: 1, data }, 'https://evil.example')).status, 403);
    const bad = structuredClone(data); bad.appointments[0].patientId = 'invalid';
    assert.equal((await put({ revision: 1, data: bad })).status, 400);
    for (const file of ['/data/ronda.sqlite', '/package.json', '/prototipo-original.zip', '/.env']) assert.equal((await fetch(base + file)).status, 404);
    assert.equal((await fetch(base + '/ronda.css?v=10')).status, 200);
    await stop(); await start();
    const saved = await (await fetch(base + '/api/state')).json();
    assert.equal(saved.revision, 1); assert.equal(saved.data.patients.length, 4);
    assert.equal((await put({ revision: 1, data })).status, 200);
  } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
});
