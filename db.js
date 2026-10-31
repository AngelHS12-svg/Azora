import { emptyData, validateData, uid, localDate } from './domain.js';

const openDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('ronda-functional-v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('workspace');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const db = await openDB();
function operation(mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workspace', mode);
    const req = callback(tx.objectStore('workspace'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo guardar la información.'));
  });
}
export const readWorkspace = () => operation('readonly', store => store.get('current'));
export const saveWorkspace = state => operation('readwrite', store => store.put(state, 'current'));
export const saveRecovery = state => operation('readwrite', store => store.put(state, 'recovery'));
export const readRecovery = () => operation('readonly', store => store.get('recovery'));
export const withWorkspaceLock = task => navigator.locks ? navigator.locks.request('ronda-data-write', task) : task();
export function migratePrototype() {
  const data = emptyData();
  const raw = localStorage.getItem('ronda-appointments-v1');
  if (!raw) return data;
  try {
    const old = JSON.parse(raw);
    if (!Array.isArray(old)) return data;
    for (const a of old) {
      if (!a || typeof a.client !== 'string' || !a.client.trim() || typeof a.time !== 'string') continue;
      let p = data.patients.find(p => p.name === a.client.trim());
      if (!p) { p = { id: uid(), name: a.client.trim(), phone: '', email: '', birthDate: '', background: '', allergies: '', archived: false }; data.patients.push(p); }
      const priceCents = Math.round(Number(a.price) * 100);
      const appt = { id: uid(), patientId: p.id, date: localDate(), time: a.time, duration: 30, service: a.service || 'Consulta', priceCents, status: a.completed ? 'completed' : 'scheduled' };
      data.appointments.push(appt);
      if (a.status === 'Pagado' && priceCents > 0) data.payments.push({ id: uid(), appointmentId: appt.id, amountCents: priceCents, method: 'Efectivo', reference: 'Migrado del prototipo', createdAt: new Date().toISOString() });
    }
    return validateData(data);
  } catch { return emptyData(); }
}
