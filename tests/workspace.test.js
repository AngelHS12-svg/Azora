import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleData, validateAppointmentChange, csvCell } from '../domain.js';
import { prepareChange, acknowledgeBackup } from '../workspace.js';
import { privatePath, secretKinds } from '../scripts/security-rules.mjs';

test('una cita con pagos o notas no cambia de paciente, incluso si el pago se anuló', () => {
  const data = sampleData(), a = data.appointments[0];
  assert.throws(() => validateAppointmentChange(data, { ...a, patientId: 'sample-p1' }), /cambiar de paciente/);
  data.payments[0].voidedAt = new Date().toISOString();
  assert.throws(() => validateAppointmentChange(data, { ...a, patientId: 'sample-p1' }), /cambiar de paciente/);
  data.payments = []; data.notes[0].appointmentId = a.id;
  assert.throws(() => validateAppointmentChange(data, { ...a, patientId: 'sample-p1' }), /cambiar de paciente/);
});
test('una cita sin historia puede corregir paciente y una cancelación no exige el horario actual', () => {
  const data = sampleData(), a = data.appointments[1];
  assert.doesNotThrow(() => validateAppointmentChange(data, { ...a, patientId: 'sample-p2' }));
  data.settings.end = '10:00';
  assert.doesNotThrow(() => validateAppointmentChange(data, { ...a, status: 'cancelled' }));
  assert.doesNotThrow(() => validateAppointmentChange(data, { ...a, service: 'Corrección del servicio' }));
  assert.throws(() => validateAppointmentChange(data, { ...a, time: '11:00' }), /jornada/);
});
test('el guardado usa la revisión actual y rechaza formularios de generaciones anteriores', () => {
  const current = { data: sampleData(), revision: 7, generation: 'actual', dirty: false };
  const next = prepareChange(current, 'actual', d => { d.settings.practice = 'Consulta actualizada'; });
  assert.equal(next.revision, 7); assert.equal(next.dirty, true);
  assert.equal(current.data.settings.practice, 'Consulta de Valeria');
  assert.throws(() => prepareChange(current, 'antigua', () => {}), /otra pestaña/);
});
test('la confirmación de un respaldo no borra modificaciones que llegaron durante la petición', () => {
  const current = { data: sampleData(), revision: 1, generation: 'nueva', dirty: true };
  const ack = acknowledgeBackup(current, 'enviada', { revision: 2, updatedAt: '2026-10-30T18:00:00Z' });
  assert.equal(ack.dirty, true); assert.equal(ack.revision, 2); assert.equal(ack.data, current.data);
  assert.equal(acknowledgeBackup(current, 'nueva', { revision: 2 }).dirty, false);
});
test('el tamaño del espacio se comprueba antes de confirmar un guardado local', () => {
  const data = sampleData();
  const note = data.notes[0];
  data.notes = Array.from({ length: 600 }, (_, i) => ({ ...note, id: 'large-' + i, content: 'a'.repeat(10000) }));
  assert.throws(() => prepareChange({ data, revision: 0, generation: 'actual' }, 'actual', () => {}), /límite de respaldo/);
});
test('un error de IndexedDB puede capturarse durante el arranque, no al importar el módulo', async () => {
  const storage = await import('../db.js');
  await assert.rejects(storage.readWorkspace(), /indexedDB/);
  assert.equal(storage.migratePrototype().patients.length, 0);
});
test('CSV neutraliza fórmulas, espacios y controles iniciales sin perder comillas', () => {
  for (const input of ['=1+1', '  =1+1', '\t=1+1', '\r@SUM(A1)', '-5', '+42']) assert.ok(csvCell(input).startsWith('"\''));
  assert.equal(csvCell('Laura "L"'), '"Laura ""L"""');
  assert.equal(csvCell('Consulta de seguimiento'), '"Consulta de seguimiento"');
});
test('el control de Git detecta archivos privados y patrones de tokens sin imprimir su contenido', () => {
  for (const file of ['data/ronda.sqlite-wal', '.env.local', 'backup.zip', 'private.key', 'azora-respaldo-2026.json']) assert.equal(privatePath(file), true);
  for (const file of ['.env.example', 'app.js', 'icons/icon-192.png']) assert.equal(privatePath(file), false);
  assert.equal(secretKinds('ghp_' + 'a'.repeat(36))[0], 'Token de GitHub');
  assert.deepEqual(secretKinds('process.env.AZORA_DATA_DIR'), []);
});
