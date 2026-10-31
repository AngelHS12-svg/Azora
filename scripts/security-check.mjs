import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { privatePath, secretKinds } from './security-rules.mjs';

const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
const files = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))];
const failures = [];
for (const file of files) {
  if (privatePath(file)) { failures.push(`${file}: archivo privado o de trabajo versionado`); continue; }
  try {
    if ((await stat(file)).size > 2 * 1024 * 1024) continue;
    const content = await readFile(file);
    if (!content.includes(0)) for (const kind of secretKinds(content.toString('utf8'))) failures.push(`${file}: ${kind}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
// Nunca se imprime el contenido de una credencial.
for (const failure of failures) console.error(failure);
console.log(`Revisión actual: ${files.length} archivos; ${failures.length} alertas.`);
if (process.argv.includes('--history')) {
  const seen = new Set(); let blobs = 0, alerts = 0, privateFiles = 0;
  for (const line of git(['rev-list', '--objects', '--all']).trim().split('\n')) {
    const [hash, ...parts] = line.split(' '), file = parts.join(' ');
    if (!file || seen.has(hash) || git(['cat-file', '-t', hash]).trim() !== 'blob') continue;
    seen.add(hash); blobs++;
    if (privatePath(file)) { console.warn(`Historial: ${file} (archivo de trabajo o privado; no se borró del historial)`); privateFiles++; }
    const size = Number(git(['cat-file', '-s', hash]));
    if (size > 2 * 1024 * 1024) continue;
    const content = execFileSync('git', ['cat-file', 'blob', hash], { maxBuffer: 3 * 1024 * 1024, windowsHide: true });
    if (!content.includes(0)) for (const kind of secretKinds(content.toString('utf8'))) { console.error(`Historial: ${file}: ${kind}`); alerts++; }
  }
  console.log(`Historial local: ${blobs} blobs; ${alerts} posibles credenciales; ${privateFiles} archivos privados/de trabajo. No se inspecciona el interior de binarios/ZIP ni refs que no estén en este clon.`);
  if (alerts) process.exitCode = 1;
}
if (failures.length) process.exitCode = 1;
