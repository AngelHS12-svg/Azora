import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, sampleData, validateData, balanceFor, paidFor } from '../domain.js';

test('pacientes, citas y notas válidos conservan sus relaciones', () => {
  const data = sampleData();
  assert.equal(validateData(data), data);
  assert.equal(data.patients.length, 4);
  assert.equal(paidFor(data, 'sample-a0'), 55000);
  assert.equal(balanceFor(data, data.appointments[0]), 0);
});
test('se rechaza un cruce de horario pero se permite una cita cancelada', () => {
  const data = sampleData();
  data.appointments[1].time = '09:30';
  assert.throws(() => validateData(data), /cruce de horarios/);
  data.appointments[1].status = 'cancelled';
  assert.doesNotThrow(() => validateData(data));
});
test('abono parcial, liquidación y anulación recalculan el saldo', () => {
  const data = sampleData(), a = data.appointments[1];
  data.payments.push({ id: 'partial', appointmentId: a.id, amountCents: 20000, method: 'Efectivo', reference: '', createdAt: new Date().toISOString() });
  assert.equal(balanceFor(data, a), 45000);
  data.payments.push({ id: 'rest', appointmentId: a.id, amountCents: 45000, method: 'Transferencia', reference: '', createdAt: new Date().toISOString() });
  assert.equal(balanceFor(data, a), 0);
  data.payments[1].voidedAt = new Date().toISOString(); data.payments[1].voidReason = 'Error de captura';
  assert.equal(balanceFor(data, a), 20000);
  assert.doesNotThrow(() => validateData(data));
});
test('no se permite cobrar más del costo ni reducirlo por debajo de lo recibido', () => {
  const data = sampleData();
  data.appointments[0].priceCents = 100;
  assert.throws(() => validateData(data), /abonos/);
});
test('respaldo rechaza fechas imposibles, referencias rotas e identificadores con HTML', () => {
  const data = sampleData(); data.appointments[1].date = '2026-02-31';
  assert.throws(() => validateData(data), /fecha/);
  const broken = sampleData(); broken.notes[0].patientId = 'missing';
  assert.throws(() => validateData(broken), /nota/);
  const injection = sampleData(); injection.patients[0].id = '\"><img src=x>';
  assert.throws(() => validateData(injection), /identificadores/);
});
test('una cancelación conserva el pago recibido y elimina el saldo por cobrar', () => {
  const data = sampleData(); data.appointments[0].status = 'cancelled';
  assert.equal(paidFor(data, data.appointments[0].id), 55000);
  assert.equal(balanceFor(data, data.appointments[0]), 0);
  assert.doesNotThrow(() => validateData(data));
  assert.doesNotThrow(() => validateData(emptyData()));
});
