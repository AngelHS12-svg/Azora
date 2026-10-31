export const STATUSES = { scheduled: 'Programada', arrived: 'En sala', completed: 'Atendida', cancelled: 'Cancelada' };
export const METHODS = ['Efectivo', 'Transferencia', 'Tarjeta externa'];
export const uid = () => crypto.randomUUID();
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const cents = value => Math.round(Number(value) * 100);
export function emptyData() {
  return { version: 1, patients: [], appointments: [], notes: [], payments: [], settings: { practice: 'Mi consulta', professional: '', start: '08:30', end: '18:00', reminderMinutes: 15 } };
}
export const paidFor = (data, id) => data.payments.filter(p => p.appointmentId === id && !p.voidedAt).reduce((sum, p) => sum + p.amountCents, 0);
export const balanceFor = (data, appt) => appt.status === 'cancelled' ? 0 : Math.max(0, appt.priceCents - paidFor(data, appt.id));
export const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const fail = message => { throw new Error(message); };
const text = (value, max = 2000) => typeof value === 'string' && value.length <= max;
const isoDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
const time = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const amount = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000000;

export const appointmentHasHistory = (data, id) => data.payments.some(p => p.appointmentId === id) || data.notes.some(n => n.appointmentId === id);
export function validateAppointmentChange(data, next) {
  const previous = data.appointments.find(a => a.id === next.id);
  if (previous && previous.patientId !== next.patientId && appointmentHasHistory(data, next.id)) {
    fail('Esta cita tiene notas o pagos. No se puede cambiar de paciente; cancela la cita y crea otra si hace falta.');
  }
  if (data.patients.find(p => p.id === next.patientId)?.archived && ['scheduled', 'arrived'].includes(next.status)) fail('Reactiva al paciente antes de programar una nueva consulta.');
  const rescheduled = !previous || previous.date !== next.date || previous.time !== next.time || previous.duration !== next.duration || previous.status === 'cancelled';
  if (next.status !== 'cancelled' && rescheduled && (next.time < data.settings.start || minutes(next.time) + next.duration > minutes(data.settings.end))) {
    fail('La consulta debe quedar dentro del horario de tu jornada.');
  }
  return next;
}

export function csvCell(value) {
  let cell = String(value ?? '');
  if (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(cell)) cell = "'" + cell;
  return '"' + cell.replaceAll('"', '""') + '"';
}

export function validateData(data) {
  if (!data || data.version !== 1) fail('Formato de datos no compatible.');
  for (const key of ['patients', 'appointments', 'notes', 'payments']) {
    if (!Array.isArray(data[key]) || data[key].length > 20000) fail(`La colección ${key} no es válida.`);
    const ids = new Set();
    for (const entry of data[key]) {
      if (!entry || !text(entry.id, 100) || !/^[a-zA-Z0-9_-]+$/.test(entry.id) || ids.has(entry.id)) fail('Hay identificadores inválidos o duplicados.');
      ids.add(entry.id);
    }
  }
  const patients = new Set(data.patients.map(p => p.id));
  const appointments = new Map(data.appointments.map(a => [a.id, a]));
  for (const p of data.patients) {
    if (!text(p.name, 120) || !p.name.trim() || !text(p.phone, 40) || !text(p.email, 150) || !text(p.background, 10000) || !text(p.allergies, 2000) || !text(p.birthDate, 10) || (p.birthDate && (!isoDate(p.birthDate) || p.birthDate > localDate())) || typeof p.archived !== 'boolean') fail('Revisa los datos del paciente.');
  }
  for (const a of data.appointments) {
    if (!patients.has(a.patientId) || !isoDate(a.date) || !time(a.time) || !Number.isInteger(a.duration) || a.duration < 5 || a.duration > 480 || minutes(a.time) + a.duration > 1440 || !text(a.service, 160) || !a.service.trim() || !amount(a.priceCents) || !Object.hasOwn(STATUSES, a.status)) fail('Revisa la fecha, horario, duración y costo de la cita.');
  }
  for (const n of data.notes) {
    if (!patients.has(n.patientId) || !text(n.content, 10000) || !n.content.trim() || !text(n.plan, 5000) || !text(n.createdAt, 40) || !Number.isFinite(Date.parse(n.createdAt)) || (n.appointmentId && appointments.get(n.appointmentId)?.patientId !== n.patientId)) fail('La nota de expediente no es válida.');
  }
  for (const p of data.payments) {
    if (!appointments.has(p.appointmentId) || !amount(p.amountCents) || p.amountCents === 0 || !METHODS.includes(p.method) || !text(p.createdAt, 40) || !Number.isFinite(Date.parse(p.createdAt)) || !text(p.reference, 200) || (p.voidedAt && (!Number.isFinite(Date.parse(p.voidedAt)) || !text(p.voidReason, 300) || !p.voidReason.trim()))) fail('El registro de pago no es válido.');
  }
  for (const a of data.appointments) if (paidFor(data, a.id) > a.priceCents) fail('Los abonos no pueden superar el costo de la cita.');
  const active = data.appointments.filter(a => a.status !== 'cancelled').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  for (let i = 1; i < active.length; i++) {
    const a = active[i - 1], b = active[i];
    if (a.date === b.date && minutes(b.time) < minutes(a.time) + a.duration) fail(`Hay un cruce de horarios el ${b.date} a las ${b.time}.`);
  }
  const s = data.settings;
  if (!s || !text(s.practice, 100) || !s.practice.trim() || !text(s.professional, 120) || !time(s.start) || !time(s.end) || s.start >= s.end || ![5, 10, 15, 30, 60].includes(s.reminderMinutes)) fail('Revisa la configuración de tu consulta.');
  return data;
}

export function sampleData() {
  const data = emptyData();
  data.settings = { ...data.settings, practice: 'Consulta de Valeria', professional: 'Valeria Martínez' };
  const names = ['Nicolás Ruiz', 'Laura Mendoza', 'Abril Soto', 'Mateo Torres'];
  data.patients = names.map((name, i) => ({ id: `sample-p${i}`, name, phone: '', email: '', birthDate: '', background: i === 1 ? 'Seguimiento de movilidad de rodilla. Datos ficticios de demostración.' : '', allergies: '', archived: false }));
  data.appointments = ['09:00', '10:30', '12:00', '16:00'].map((time, i) => ({ id: `sample-a${i}`, patientId: data.patients[i].id, date: localDate(), time, duration: 45, service: ['Sesión de descarga', 'Seguimiento de rodilla', 'Valoración inicial', 'Movilidad de hombro'][i], priceCents: [55000, 65000, 80000, 40000][i], status: i === 0 ? 'completed' : 'scheduled' }));
  data.notes = [{ id: uid(), patientId: 'sample-p1', appointmentId: '', content: 'Mejor flexión y menor inflamación reportada. Ejemplo de nota de seguimiento.', plan: 'Revisar rango de movimiento en la próxima sesión.', createdAt: new Date().toISOString() }];
  data.payments = [{ id: uid(), appointmentId: 'sample-a0', amountCents: 55000, method: 'Efectivo', reference: 'Ejemplo', createdAt: new Date().toISOString() }];
  return data;
}
