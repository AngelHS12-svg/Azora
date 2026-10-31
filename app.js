import { readWorkspace, saveWorkspace, saveRecovery, readRecovery, migratePrototype, withWorkspaceLock } from './db.js';
import { uid, localDate, emptyData, sampleData, validateData, paidFor, balanceFor, cents, minutes, STATUSES, METHODS, appointmentHasHistory, validateAppointmentChange, csvCell } from './domain.js';
import { prepareChange, acknowledgeBackup } from './workspace.js';

const $ = selector => document.querySelector(selector);
const main = $('#main'), editor = $('#editor');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value / 100);
const dateLabel = date => new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
const datetime = date => new Date(date).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
const initials = name => name.split(/\s+/).slice(0, 2).map(s => s[0] || '').join('');
const svg = name => '<svg class="icon" aria-hidden="true" focusable="false"><use href="#az-' + name + '"></use></svg>';
const countLabel = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const recordDate = date => new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDate = date => new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
const timeEnd = a => String(Math.floor((minutes(a.time) + a.duration) / 60)).padStart(2, '0') + ':' + String((minutes(a.time) + a.duration) % 60).padStart(2, '0');
const moneyMarkup = value => {
  const parts = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(value / 100);
  return '<span class="money" aria-label="' + esc(money(value) + ' pesos mexicanos') + '"><span class="money-symbol">$</span><span class="money-whole">' + parts.filter(p => ['integer', 'group'].includes(p.type)).map(p => p.value).join('') + '</span><span class="money-fraction">.' + parts.find(p => p.type === 'fraction').value + '</span></span>';
};
const sampleNotice = () => data().patients.some(p => p.id.startsWith('sample-')) ? '<div class="sample-notice">' + svg('info') + '<span>Vista con registros de ejemplo. Los pacientes y los pagos de muestra son ficticios.</span></div>' : '';
const statusPill = a => '<span class="status-pill ' + a.status + '"><i></i>' + STATUSES[a.status] + '</span>';
let appointmentDraft = null, returnFocus = null;

let state, section = 'hoy', selectedDate = localDate(), selectedAppointment = '', recordPatient = '', query = '', statusFilter = '', showArchived = false, ledgerFilter = 'pending';
let syncBusy = false, conflict = false, syncError = '', toastTimer, installPrompt, uiSaving = false;
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ronda-workspace') : null;
const withServerLock = task => navigator.locks ? navigator.locks.request('ronda-server-sync', task) : task();

const data = () => state.data;
const patient = id => data().patients.find(p => p.id === id);
const appointment = id => data().appointments.find(a => a.id === id);
const patientName = id => patient(id)?.name || 'Paciente';
const sorted = list => [...list].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
const todayAppointments = () => sorted(data().appointments.filter(a => a.date === selectedDate));
const btn = (label, action, id = '', type = '') => {
  const icons = { 'new-appointment':'plus', 'patient-appointment':'plus', 'new-patient':'plus', 'new-note':'file', 'patient-note':'plus', record:'arrow', patients:'back', 'edit-appointment':'edit', 'edit-patient':'edit', 'export-payments':'download', 'export-backup':'download', sync:'backup', 'share-receipt':'share', 'download-receipt':'download', 'previous-day':'back', 'next-day':'arrow', arrive:'check', complete:'check' };
  const clean = label.replace(/^[＋←]\s*/, '').replace(/\s*[↗↓→✓]$/, '');
  return '<button type="button" class="btn ' + type + '" data-action="' + action + '" data-id="' + esc(id) + '">' + (icons[action] ? svg(icons[action]) : '') + '<span>' + clean + '</span></button>';
};
const empty = (title, copy, actions = '') => '<div class="empty"><div class="empty-symbol" aria-hidden="true">' + svg(section === 'personas' ? 'patients' : section === 'cobros' ? 'wallet' : 'calendar') + '</div><strong>' + title + '</strong><p>' + copy + '</p>' + (actions ? '<div class="button-group">' + actions + '</div>' : '') + '</div>';

const badge = a => '<span class="badge ' + (a.status === 'cancelled' ? 'cancelled' : balanceFor(data(), a) ? 'pending' : 'paid') + '">' + (a.status === 'cancelled' ? 'Cancelada' : a.priceCents === 0 ? 'Sin cargo' : balanceFor(data(), a) === 0 ? 'Pagada' : paidFor(data(), a.id) ? 'Abono registrado' : 'Por cobrar') + '</span>';

function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500);
}
function syncStatus() {
  const copy = conflict ? 'Revisar cambios entre equipos' : !navigator.onLine ? (state?.dirty ? 'Sin conexión · cambios locales' : 'Sin conexión · datos locales') : syncBusy ? 'Actualizando copia local…' : syncError ? 'Guardado aquí · copia pendiente' : state?.dirty ? 'Cambios por respaldar' : state?.syncedAt ? 'Copia local al día' : 'Guardado local disponible';
  $('#sync-copy').textContent = copy;
  if ($('#settings-sync-copy')) $('#settings-sync-copy').textContent = copy;
  if ($('#settings-sync-time')) $('#settings-sync-time').textContent = state?.syncedAt ? 'Último respaldo: ' + datetime(state.syncedAt) : 'Todavía no hay un respaldo confirmado.';
  $('#sync-light').className = 'sync-light' + (conflict ? ' error' : state?.dirty || syncError || !navigator.onLine ? ' pending' : '');
}
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, cache: 'no-store', signal: AbortSignal.timeout(6000) });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || 'No se pudo conectar con el servidor.'); error.status = response.status; throw error; }
  return result;
}
async function sync() {
  if (syncBusy || conflict || !state || !navigator.onLine) { syncStatus(); return; }
  syncBusy = true; syncError = ''; syncStatus();
  try {
    await withServerLock(async () => {
    const saved = await readWorkspace();
    if (saved) state = saved;
    if (!state.dirty) {
      const generation = state.generation;
      const remote = await request('/api/state');
      await withWorkspaceLock(async () => {
      const latest = await readWorkspace();
      if (latest && latest.generation !== state.generation) state = latest;
      if (!remote.data && !state.dirty && generation === state.generation && (state.syncedAt || state.data.patients.length || state.data.appointments.length)) {
        state = { ...state, revision: 0, syncedAt: null, dirty: true };
        await saveWorkspace(state);
      }
      if (remote.data && !state.dirty && generation === state.generation && remote.revision !== state.revision) {
        validateData(remote.data);
        state = { ...state, data: remote.data, generation: uid(), revision: remote.revision, syncedAt: remote.updatedAt };
        await saveWorkspace(state); channel?.postMessage('changed'); if (!hasUnsavedChanges() && !editor.open) render();
      }
      });
    } else {
      const generation = state.generation;
      const result = await request('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: state.revision, data: state.data }) });
      await withWorkspaceLock(async () => {
        const latest = await readWorkspace();
        if (latest) state = latest;
        state = acknowledgeBackup(state, generation, result);
        await saveWorkspace(state); channel?.postMessage('changed');
      });
    }
    });
  } catch (error) {
    if (error.status === 409) { conflict = true; if (section === 'ajustes') render(); toast('Hay cambios en otro navegador. Revisa el respaldo en Configuración.'); }
    else syncError = error.message;
  } finally { syncBusy = false; syncStatus(); }
  if (state.dirty && !syncError && !conflict) queueMicrotask(sync);
}
async function commit(mutator, message, expectedGeneration = state.generation, recovery = false) {
  if (uiSaving) throw new Error('Espera a que termine el guardado anterior.');
  uiSaving = true;
  try {
    await withWorkspaceLock(async () => {
    const current = await readWorkspace() || state;
    const nextState = prepareChange(current, expectedGeneration, mutator);
    if (recovery) await saveRecovery(current);
    await saveWorkspace(nextState); state = nextState;
    channel?.postMessage('changed'); syncStatus(); render(); if (message) toast(message);
    });
    void sync();
  } finally { uiSaving = false; }
}
function heading(title, copy, action = '', eyebrow = '') {
  return '<div class="page-heading"><div>' + (eyebrow ? '<p class="overline">' + eyebrow + '</p>' : '') + '<h1>' + title + '</h1>' + (copy ? '<p class="heading-copy">' + copy + '</p>' : '') + '</div>' + action + '</div>';
}
function stats(items) {
  return '<div class="stats">' + items.map(([label, value, unit]) => '<div class="stat"><span class="stat-label">' + label + '</span><strong>' + value + '</strong><small>' + unit + '</small></div>').join('') + '</div>';
}
function week() {
  const current = new Date(selectedDate + 'T12:00:00');
  current.setDate(current.getDate() - (current.getDay() + 6) % 7);
  const end = new Date(current); end.setDate(end.getDate() + 6);
  return '<div class="week-header"><span>' + shortDate(localDate(current)) + ' — ' + shortDate(localDate(end)) + '</span><span>Agenda semanal</span></div><div class="week-ruler" aria-label="Seleccionar día de la semana">' + Array.from({ length: 7 }, (_, i) => {
    const d = new Date(current); d.setDate(d.getDate() + i); const key = localDate(d);
    const count = data().appointments.filter(a => a.date === key && a.status !== 'cancelled').length;
    return '<button data-action="date" data-id="' + key + '" class="' + (key === selectedDate ? 'selected ' : '') + (key === localDate() ? 'today' : '') + '" aria-label="' + esc(dateLabel(key)) + ', ' + countLabel(count, 'cita', 'citas') + '" aria-pressed="' + (key === selectedDate) + '"><span>' + d.toLocaleDateString('es-MX', { weekday: 'short' }) + '</span><strong>' + d.getDate() + '</strong><small>' + (count ? countLabel(count, 'cita', 'citas') : '—') + '</small></button>';
  }).join('') + '</div>';
}
function appointmentRows(list) {
  return list.map(a => '<article class="visit-row ' + a.status + (a.id === selectedAppointment ? ' active' : '') + '"><div class="visit-time"><time>' + a.time + '</time><span>' + timeEnd(a) + '</span></div><span class="visit-track"></span><button class="visit-main" data-action="select" data-id="' + a.id + '" aria-label="Ver consulta de ' + esc(patientName(a.patientId)) + ' a las ' + a.time + '"><strong>' + esc(patientName(a.patientId)) + '</strong><small>' + esc(a.service) + '</small><span class="visit-duration">' + a.duration + ' min</span></button><div class="visit-meta">' + statusPill(a) + '<span class="visit-price">' + money(a.priceCents) + '</span></div><button class="visit-open" data-action="select" data-id="' + a.id + '" aria-label="Ver detalles de ' + esc(patientName(a.patientId)) + '">' + svg('arrow') + '</button></article>').join('');
}
function contextPanel() {
  const a = appointment(selectedAppointment);
  if (!a) return '<aside class="case-space"><div class="case-topline"><span>DETALLE DE CONSULTA</span>' + svg('file') + '</div>' + empty('Selecciona una cita', 'Aquí verás el expediente del paciente, el estado de atención y el saldo de esa consulta.') + '<div class="context-footnote">' + svg('info') + '<span>Los cambios se guardan primero en este navegador.</span></div></aside>';
  const p = patient(a.patientId);
  const note = data().notes.filter(n => n.patientId === p.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
  const paid = paidFor(data(), a.id), due = balanceFor(data(), a);
  return '<aside class="case-space" aria-label="Detalle de la consulta seleccionada"><div class="case-topline"><span>CONSULTA SELECCIONADA</span>' + statusPill(a) + '</div><div class="case-identity"><div class="avatar">' + esc(initials(p.name)) + '</div><div><h2>' + esc(p.name) + '</h2><small>' + esc(p.phone || 'Teléfono sin registrar') + '</small></div></div><div class="context-appointment"><span>' + svg('calendar') + shortDate(a.date) + '</span><span>' + svg('clock') + a.time + ' — ' + timeEnd(a) + '</span><strong>' + esc(a.service) + '</strong></div><div class="context-primary-actions">' +
    (a.status === 'scheduled' ? btn('Registrar llegada', 'arrive', a.id, 'primary wide') : '') +
    (a.status === 'arrived' ? btn('Finalizar consulta', 'complete', a.id, 'primary wide') : '') +
    (a.status !== 'cancelled' ? btn('Añadir nota de consulta', 'new-note', a.id, 'wide') : '') + '</div><section class="context-section"><div class="context-section-heading"><h3>Última nota</h3>' + btn('Expediente', 'record', p.id, 'link small') + '</div>' +
    (note ? '<blockquote>' + esc(note.content.slice(0, 220)) + (note.content.length > 220 ? '…' : '') + '</blockquote><time class="context-note-date">' + datetime(note.createdAt) + '</time>' : '<p>No hay notas registradas para este paciente.</p>') +
    (p.allergies ? '<div class="clinical-alert">' + svg('alert') + '<div><strong>Alergias registradas</strong><p>' + esc(p.allergies) + '</p></div></div>' : '') + '</section><section class="context-section billing-context"><div class="context-section-heading"><h3>Cuenta de la consulta</h3>' + badge(a) + '</div><dl><div><dt>Total</dt><dd>' + money(a.priceCents) + '</dd></div><div><dt>Recibido</dt><dd>' + money(paid) + '</dd></div><div class="balance-line"><dt>Pendiente</dt><dd>' + moneyMarkup(due) + '</dd></div></dl>' + (due ? btn('Registrar pago', 'payment', a.id, 'primary wide') : '') + '</section><div class="context-footer">' + btn('Editar cita', 'edit-appointment', a.id, 'link small') + '<small>Importes en MXN</small></div></aside>';
}
function renderToday() {
  const list = todayAppointments();
  const active = list.filter(a => a.status !== 'cancelled');
  if (!list.some(a => a.id === selectedAppointment)) selectedAppointment = (active.find(a => a.status === 'arrived') || active.find(a => a.status === 'scheduled' && new Date(a.date + 'T' + a.time).getTime() >= Date.now()) || active.find(a => a.status === 'scheduled') || active[0])?.id || '';
  const due = active.reduce((sum, a) => sum + balanceFor(data(), a), 0);
  const received = data().payments.filter(p => !p.voidedAt && localDate(new Date(p.createdAt)) === selectedDate).reduce((sum,p) => sum + p.amountCents,0);
  const remaining = active.filter(a => ['scheduled','arrived'].includes(a.status)).length;
  const title = dateLabel(selectedDate); const done = active.filter(a => a.status === 'completed').length;
  return '<div class="workbench"><section class="day-space">' + heading(title.charAt(0).toUpperCase() + title.slice(1), countLabel(active.length,'cita en agenda','citas en agenda') + ' · ' + countLabel(remaining,'por atender','por atender'), btn('Nueva cita', 'new-appointment', '', 'primary'), 'JORNADA') + sampleNotice() +
    (!data().patients.length ? '<section class="onboarding"><div class="onboarding-icon">' + svg('patients') + '</div><div><span class="overline">PRIMER REGISTRO</span><h2>Agrega a tu primer paciente</h2><p>Su ficha reunirá los datos de contacto, las consultas y las notas de seguimiento.</p><div class="button-group">' + btn('Agregar paciente', 'new-patient', '', 'primary') + btn('Ver con datos de ejemplo', 'load-sample', '', 'link') + '</div></div></section>' : '') +
    stats([['Consultas atendidas',done,active.length ? 'de ' + countLabel(active.length,'cita de este día','citas de este día') : 'Sin citas programadas'],['Cobrado en el día',moneyMarkup(received),shortDate(selectedDate) + ' · pagos recibidos'],['Pendiente de estas citas',moneyMarkup(due),countLabel(active.filter(a => balanceFor(data(),a)>0).length,'consulta con saldo','consultas con saldo')]]) +
    '<section class="schedule-area"><div class="toolbar day-toolbar"><h2>Agenda del día</h2><div class="day-controls">' + btn('Día anterior','previous-day','','icon-only') + '<input id="agenda-date" type="date" value="' + selectedDate + '" aria-label="Fecha de la agenda">' + btn('Día siguiente','next-day','','icon-only') + btn('Hoy','today','','small') + '</div></div>' + week() +
    '<section class="panel timeline-panel">' + (list.length ? '<div class="timeline-caption"><span>HORARIO</span><span>PACIENTE Y SERVICIO</span><span>ATENCIÓN</span></div>' + appointmentRows(list) : empty('No hay citas para este día', 'Elige otro día o programa una consulta en tu horario de ' + data().settings.start + ' a ' + data().settings.end + '.', btn('Programar una cita', 'new-appointment'))) + '</section></section><div class="workspace-footnote">' + svg('clock') + '<span>Horario de atención: ' + data().settings.start + ' — ' + data().settings.end + '</span><span>Todos los importes en MXN</span></div></section>' + contextPanel() + '</div>';
}
function renderAgenda() {
  const list = todayAppointments().filter(a => !statusFilter || a.status === statusFilter);
  return '<div class="page">' + heading('Agenda', 'Consulta los horarios, registra la atención o reprograma una cita.', btn('Nueva cita', 'new-appointment', '', 'primary')) + sampleNotice() +
    '<div class="toolbar"><div class="filters"><label>Fecha<input id="agenda-date" type="date" value="' + selectedDate + '"></label><label>Estado de atención<select id="agenda-status"><option value="">Todos los estados</option>' + Object.entries(STATUSES).map(([value, label]) => '<option value="' + value + '"' + (value === statusFilter ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label></div><div class="button-group">' + btn('Anterior', 'previous-day') + btn('Hoy', 'today') + btn('Siguiente', 'next-day') + '</div></div>' + week() +
    '<section class="panel"><div class="section-heading"><h2>' + esc(dateLabel(selectedDate)) + '</h2><span class="table-meta">' + countLabel(list.length,'cita','citas') + '</span></div>' +
    (list.length ? '<div class="table-wrap"><table class="agenda-table"><thead><tr><th scope="col">Horario</th><th scope="col">Paciente y servicio</th><th scope="col">Atención</th><th scope="col" class="numeric">Pendiente · MXN</th><th scope="col">Acciones</th></tr></thead><tbody>' + list.map(a => '<tr><td><strong class="numeric-time">' + a.time + ' — ' + timeEnd(a) + '</strong><small>' + a.duration + ' minutos</small></td><td><button class="visit-main" data-action="record" data-id="' + a.patientId + '"><strong>' + esc(patientName(a.patientId)) + '</strong><small>' + esc(a.service) + '</small></button></td><td>' + statusPill(a) + '</td><td class="numeric"><strong>' + money(a.status === 'cancelled' ? 0 : balanceFor(data(),a)) + '</strong>' + badge(a) + '</td><td><div class="button-group">' + btn('Editar cita', 'edit-appointment', a.id, 'small') + (a.status !== 'cancelled' ? btn('Añadir nota', 'new-note', a.id, 'small link') : '') + (balanceFor(data(), a) ? btn('Registrar pago', 'payment', a.id, 'small link') : '') + '</div></td></tr>').join('') + '</tbody></table></div>' : empty('No hay citas con estos filtros', 'Cambia el día o selecciona otro estado de atención.')) + '</section></div>';
}
function renderPatients() {
  const search = query.trim().toLocaleLowerCase();
  const list = data().patients.filter(p => p.archived === showArchived && (p.name + ' ' + p.phone + ' ' + p.email).toLocaleLowerCase().includes(search)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return '<div class="page">' + heading('Pacientes', 'Directorio y acceso a los expedientes de tu consulta.', btn('Agregar paciente', 'new-patient', '', 'primary')) + sampleNotice() +
    '<div class="toolbar directory-toolbar"><div class="search-field">' + svg('search') + '<input type="search" id="patient-search" aria-label="Buscar paciente" placeholder="Nombre, teléfono o correo" value="' + esc(query) + '"></div><label class="checkbox-label"><input id="archived-filter" type="checkbox"' + (showArchived ? ' checked' : '') + '> Pacientes archivados</label></div>' +
    '<section class="panel patient-directory"><div class="section-heading"><h2>' + (showArchived ? 'Pacientes archivados' : 'Directorio') + '</h2><span class="table-meta">' + countLabel(list.length,'paciente','pacientes') + '</span></div><div class="directory-columns" aria-hidden="true"><span>Paciente</span><span>Última consulta atendida</span><span>Notas</span><span></span></div>' +
    (list.length ? list.map(p => {
      const completed = sorted(data().appointments.filter(a => a.patientId === p.id && a.status === 'completed')).at(-1);
      const notes = data().notes.filter(n => n.patientId === p.id).length;
      return '<article class="patient-row"><div class="patient-top"><div class="avatar">' + esc(initials(p.name)) + '</div><div><strong>' + esc(p.name) + '</strong><small>' + esc(p.phone || p.email || 'Contacto sin registrar') + '</small></div></div><span class="patient-last-visit">' + (completed ? shortDate(completed.date) + '<small>' + esc(completed.service) + '</small>' : '<span class="muted">Sin consultas atendidas</span>') + '</span><span class="patient-note-count">' + notes + '<small>' + (notes === 1 ? 'nota' : 'notas') + '</small></span><div class="button-group">' + btn('Ver expediente', 'record', p.id, 'small') + btn('Editar ficha', 'edit-patient', p.id, 'small link') + '</div></article>';
    }).join('') : empty(query ? 'No encontramos ese paciente' : 'No hay pacientes en esta lista', query ? 'Prueba con otro nombre, teléfono o correo.' : 'Agrega una ficha para empezar a registrar consultas y seguimiento.', !query && !showArchived ? btn('Agregar paciente','new-patient','','primary') : '')) + '</section></div>';
}
function renderRecord() {
  const p = patient(recordPatient); if (!p) { recordPatient = ''; return renderPatients(); }
  const notes = data().notes.filter(n => n.patientId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visits = sorted(data().appointments.filter(a => a.patientId === p.id)).reverse();
  return '<div class="page">' + heading(esc(p.name), 'Expediente del paciente', btn('Todos los pacientes', 'patients')) +
    '<div class="record-layout"><aside class="panel record-sidebar"><div class="avatar">' + esc(initials(p.name)) + '</div><h2>Ficha del paciente</h2>' + (p.archived ? '<span class="badge cancelled">Archivado</span>' : '') + '<dl><dt>Teléfono</dt><dd>' + esc(p.phone || 'Sin registrar') + '</dd><dt>Correo</dt><dd>' + esc(p.email || 'Sin registrar') + '</dd><dt>Fecha de nacimiento</dt><dd>' + esc(p.birthDate ? recordDate(p.birthDate) : 'Sin registrar') + '</dd><dt>Alergias</dt><dd>' + esc(p.allergies || 'Sin registrar') + '</dd><dt>Antecedentes</dt><dd>' + esc(p.background || 'Sin registrar') + '</dd></dl><div class="button-group">' + btn('Editar ficha', 'edit-patient', p.id) + btn(p.archived ? 'Reactivar' : 'Archivar', 'archive-patient', p.id, 'link') + '</div></aside><div class="record-content"><section class="panel"><div class="section-heading"><h2>Notas de evolución</h2>' + btn('Añadir nota', 'patient-note', p.id, 'small primary') + '</div>' + (notes.length ? notes.map(n => '<article class="note"><time>' + datetime(n.createdAt) + '</time><p>' + esc(n.content) + '</p>' + (n.plan ? '<small>PLAN DE SEGUIMIENTO</small><p>' + esc(n.plan) + '</p>' : '') + (n.appointmentId ? '<small>Consulta: ' + esc(appointment(n.appointmentId)?.service) + '</small>' : '') + '</article>').join('') : empty('Sin notas de seguimiento', 'Agrega una nota después de cada consulta.')) + '</section><section class="panel"><div class="section-heading"><h2>Historial de consultas</h2>' + (!p.archived ? btn('Agendar', 'patient-appointment', p.id, 'small') : '') + '</div>' + (visits.length ? visits.map(a => '<article class="note"><div class="toolbar"><span><strong>' + esc(a.service) + '</strong><small class="muted"> · ' + recordDate(a.date) + ' · ' + a.time + '</small></span>' + badge(a) + '</div><div class="button-group">' + btn('Ver cita', 'edit-appointment', a.id, 'small') + (balanceFor(data(), a) ? btn('Registrar pago · ' + money(balanceFor(data(), a)), 'payment', a.id, 'small') : '') + '</div></article>').join('') : empty('Sin consultas registradas', 'Su historial aparecerá al programar una cita.')) + '</section></div></div></div>';
}
function renderPayments() {
  const pending = sorted(data().appointments.filter(a => balanceFor(data(), a) > 0));
  const ledger = [...data().payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const received = ledger.filter(p => !p.voidedAt).reduce((sum, p) => sum + p.amountCents, 0);
  const month = ledger.filter(p => !p.voidedAt && localDate(new Date(p.createdAt)).slice(0, 7) === localDate().slice(0, 7)).reduce((sum, p) => sum + p.amountCents, 0);
  return '<div class="page">' + heading('Cobros', 'Consulta saldos pendientes y registra los pagos que ya recibiste.', btn('Exportar movimientos ↓', 'export-payments'), '') +
    sampleNotice() + stats([['Pendiente de cobro', moneyMarkup(pending.reduce((sum, a) => sum + balanceFor(data(), a), 0)), countLabel(pending.length,'consulta con saldo','consultas con saldo')], ['Recibido este mes', moneyMarkup(month), new Date().toLocaleDateString('es-MX',{month:'long',year:'numeric'})], ['Recibido acumulado', moneyMarkup(received), 'Pagos válidos · no incluye anulaciones']]) +
    '<div class="toolbar"><div class="button-group">' + btn('Saldos pendientes (' + pending.length + ')', 'ledger-pending', '', ledgerFilter === 'pending' ? 'primary' : '') + btn('Movimientos (' + ledger.length + ')', 'ledger-history', '', ledgerFilter === 'history' ? 'primary' : '') + '</div><small class="muted">Registro manual · no procesa tarjetas</small></div><section class="panel">' +
    (ledgerFilter === 'pending' ? (pending.length ? '<div class="table-wrap"><table><thead><tr><th>Paciente</th><th>Consulta</th><th>Costo</th><th>Recibido</th><th>Saldo</th><th></th></tr></thead><tbody>' + pending.map(a => '<tr><td><strong>' + esc(patientName(a.patientId)) + '</strong></td><td>' + esc(a.service) + '<small>' + recordDate(a.date) + ' · ' + a.time + '</small></td><td>' + money(a.priceCents) + '</td><td>' + money(paidFor(data(), a.id)) + '</td><td><strong>' + money(balanceFor(data(), a)) + '</strong></td><td>' + btn('Registrar pago', 'payment', a.id, 'small primary') + '</td></tr>').join('') + '</tbody></table></div>' : empty('Tus cuentas están al día', 'No hay saldos pendientes de las consultas activas.')) :
      (ledger.length ? '<div class="table-wrap"><table><thead><tr><th>Fecha y folio</th><th>Paciente</th><th>Importe</th><th>Método</th><th>Acciones</th></tr></thead><tbody>' + ledger.map(p => '<tr><td>' + datetime(p.createdAt) + '<small>' + 'AZ-' + esc(p.id.slice(0, 8).toUpperCase()) + '</small></td><td>' + esc(patientName(appointment(p.appointmentId).patientId)) + (p.voidedAt ? '<small>Anulado: ' + esc(p.voidReason) + '</small>' : '') + '</td><td><strong>' + money(p.amountCents) + '</strong>' + (p.voidedAt ? '<span class="badge cancelled">Anulado</span>' : '') + '</td><td>' + esc(p.method) + '</td><td><div class="button-group">' + btn('Ver comprobante', 'receipt', p.id, 'small') + (!p.voidedAt ? btn('Anular', 'void-payment', p.id, 'small link') : '') + '</div></td></tr>').join('') + '</tbody></table></div>' : empty('Sin movimientos todavía', 'Los pagos y anticipos recibidos aparecerán aquí.'))) + '</section></div>';
}
function renderSettings() {
  const s = data().settings;
  return '<div class="page">' + heading('Configuración', 'Datos de tu consulta, avisos y copias de respaldo.') +
    (conflict ? '<div class="notice"><strong>Hay cambios guardados desde otro navegador.</strong> Tu versión local sigue protegida. Descárgala antes de cargar la versión del servidor.<div class="button-group">' + btn('Descargar mis datos locales', 'export-backup') + btn('Cargar versión del servidor', 'resolve-conflict') + '</div></div>' : '') +
    '<div class="settings-grid"><section class="panel settings-card"><h2>Datos de la consulta</h2><form id="settings-form"><label>Nombre del espacio<input name="practice" value="' + esc(s.practice) + '" required maxlength="100"></label><label>Profesional<input name="professional" value="' + esc(s.professional) + '" maxlength="120"></label><div class="form-row"><label>Inicio de jornada<input name="start" type="time" value="' + s.start + '" required></label><label>Fin de jornada<input name="end" type="time" value="' + s.end + '" required></label></div><label>Avisar antes de la cita<select name="reminderMinutes">' + [5, 10, 15, 30, 60].map(n => '<option value="' + n + '"' + (n === s.reminderMinutes ? ' selected' : '') + '>' + n + ' minutos</option>').join('') + '</select></label><div class="form-error" role="alert" hidden></div><button class="btn primary" type="submit">Guardar configuración</button></form></section>' +
    '<section class="panel settings-card"><h2>Datos y respaldo</h2><p>Tus registros se guardan en este navegador. Cuando el servidor local está disponible, también se crea una copia en esta computadora. Puedes descargar un respaldo para guardarlo por separado.</p><div class="info-line"><strong>Estado actual</strong><br><span id="settings-sync-copy">' + esc($('#sync-copy').textContent) + '</span><br><small id="settings-sync-time">' + (state.syncedAt ? 'Último respaldo: ' + datetime(state.syncedAt) : 'Todavía no hay un respaldo confirmado.') + '</small></div><div class="button-group">' + btn('Respaldar ahora', 'sync') + btn('Descargar respaldo JSON', 'export-backup') + '</div><label>Restaurar respaldo<input id="import-backup" type="file" accept=".json,application/json"></label><p>Antes de restaurar se conserva una copia de recuperación de tu información actual.</p><div class="button-group">' + btn('Recuperar copia anterior', 'recover') + '</div></section>' +
    '<section class="panel settings-card"><h2>Recordatorios de citas</h2><p>Recibe avisos locales mientras Azora está abierta. El navegador solicita permiso solo cuando activas esta opción.</p><div class="button-group">' + btn('Permitir avisos de citas', 'enable-notifications') + '</div><p>Permiso: ' + ('Notification' in window ? esc(Notification.permission) : 'No disponible en este navegador') + '. Los avisos con la aplicación cerrada y los mensajes al paciente requieren un servicio Push externo.</p></section><section class="panel settings-card"><h2>Acerca de esta versión</h2><p>Azora 1.2 · primera versión funcional local para una práctica independiente. Agenda, pacientes, notas de seguimiento, pagos manuales y exportación de comprobantes.</p><div class="info-line">El servidor acepta conexiones únicamente desde esta computadora. El respaldo no es una cuenta en la nube.</div><div class="info-line">Los pagos se registran manualmente. Los cargos y las devoluciones se realizan por fuera de Azora.</div><p>La información de este espacio se utiliza desde esta computadora. No hay una cuenta en la nube.</p></section></div></div>';
}
function render() {
  if (!state) return;
  $('#practice-label').textContent = data().settings.practice;
  document.title = 'Azora · ' + ({ hoy: 'Jornada', agenda: 'Agenda', personas: recordPatient ? 'Expediente' : 'Pacientes', cobros: 'Cobros', ajustes: 'Configuración' }[section]);
  document.querySelectorAll('[data-section]').forEach(el => { el.classList.toggle('is-active', el.dataset.section === section); if(el.dataset.section === section) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
  main.innerHTML = section === 'hoy' ? renderToday() : section === 'agenda' ? renderAgenda() : section === 'personas' ? (recordPatient ? renderRecord() : renderPatients()) : section === 'cobros' ? renderPayments() : renderSettings();
  main.querySelectorAll('form').forEach(form => { form.dataset.generation = state.generation; prepareForm(form); });
  $('#practice-label').title = data().settings.practice;
  main.querySelectorAll('table').forEach(table => table.querySelectorAll('th').forEach((th, index) => { table.querySelectorAll('tbody tr').forEach(row=>{if(row.children[index])row.children[index].dataset.label=th.textContent;}); if (/MXN|Importe|Costo|Recibido|Saldo/.test(th.textContent)) { th.classList.add('numeric'); table.querySelectorAll('tbody tr').forEach(row => row.children[index]?.classList.add('numeric')); } }));
  syncStatus();
}
function navigate(target, replace = false) {
  section = ['hoy', 'agenda', 'personas', 'cobros', 'ajustes'].includes(target) ? target : 'hoy';
  if (section !== 'personas') recordPatient = '';
  if (location.hash !== '#' + section) history[replace ? 'replaceState' : 'pushState'](null, '', '#' + section);
  render(); window.scrollTo({ top: 0 });
}
const formChanged = form => !!form && JSON.stringify([...new FormData(form)]) !== form.dataset.initial;
function hasUnsavedChanges() { return (editor.open && formChanged(editor.querySelector('form'))) || formChanged($('#settings-form')); }
async function mayLeave() {
  if (editor.open && !(await closeEditor())) return false;
  if (formChanged($('#settings-form')) && !(await askConfirmation('¿Salir sin guardar?', 'Los cambios de configuración todavía no se guardaron. Puedes seguir editando o descartarlos.', 'Salir sin guardar', true))) return false;
  return true;
}
async function navigateSafely(target) { if (await mayLeave()) { recordPatient = ''; navigate(target); } }
function dialog(title, content, eyebrow = '') {
  if (!editor.open) returnFocus = document.activeElement;
  editor.dataset.generation = state.generation;
  const isVoid = content.includes('id="void-form"');
  const isPatient = content.includes('id="patient-form"'), isAppointment = content.includes('id="appointment-form"'), isNote = content.includes('id="note-form"'), isPayment = content.includes('id="payment-form"'), isReceipt = content.includes('class="receipt-document"');
  editor.className = isPatient || isAppointment || isNote ? 'editor-drawer' : isPayment ? 'payment-editor' : isReceipt ? 'receipt-editor' : isVoid ? 'void-editor compact-editor' : 'compact-editor';
  editor.dataset.kind = isPatient ? 'patient' : isAppointment ? 'appointment' : isNote ? 'note' : isPayment ? 'payment' : 'other';
  const label = eyebrow || (isPatient ? 'FICHA DEL PACIENTE' : isAppointment ? 'AGENDA' : isNote ? 'EXPEDIENTE' : isPayment ? 'REGISTRO DE COBRO' : isReceipt ? 'COMPROBANTE' : isVoid ? 'ANULACIÓN DE PAGO' : 'AZORA');
  $('#dialog-content').innerHTML = '<div class="dialog-heading"><div><p>' + label + '</p><h2 id="dialog-title">' + title + '</h2></div><button class="dialog-close" data-action="close" aria-label="Cerrar editor">' + svg('close') + '</button></div><div class="dialog-body">' + content + '</div>';
  const form = editor.querySelector('form');
  if (form) prepareForm(form);
  if (!editor.open) editor.showModal();
  const input = editor.querySelector('input:not([type=hidden]),select,textarea');
  if (input) input.focus({preventScroll:true});
}
const formEnd = label => '<div class="form-error" role="alert" tabindex="-1" hidden></div><div class="form-actions"><span class="form-save-note">' + svg('backup') + 'Se guardará en este navegador</span><div>' + btn('Volver', 'close') + '<button class="btn primary" type="submit">' + label + '</button></div></div></form>';
function formSection(title, description = '') { return '<div class="form-section-title"><h3>' + title + '</h3>' + (description ? '<p>' + description + '</p>' : '') + '</div>'; }

function patientDialog(id = '', after = '') {
  const p = patient(id) || { name: '', phone: '', email: '', birthDate: '', background: '', allergies: '' };
  dialog(id ? 'Editar ficha' : 'Agregar paciente', (after === 'appointment' ? '<p class="form-flow-context">Primero crea la ficha del paciente. Después volverás al horario de su cita.</p>' : '') + '<form id="patient-form" data-id="' + id + '" data-after="' + after + '">' + formSection('Identificación', 'El nombre es obligatorio. Puedes completar los demás datos después.') + '<label>Nombre completo<input name="name" required maxlength="120" value="' + esc(p.name) + '" autocomplete="name"></label><div class="form-row"><label>Teléfono <span class="optional">Opcional</span><input name="phone" type="tel" autocomplete="tel" maxlength="40" value="' + esc(p.phone) + '"></label><label>Fecha de nacimiento <span class="optional">Opcional</span><input name="birthDate" type="date" max="' + localDate() + '" value="' + p.birthDate + '"></label></div><label>Correo electrónico <span class="optional">Opcional</span><input name="email" type="email" autocomplete="email" maxlength="150" value="' + esc(p.email) + '"></label>' + formSection('Información para la atención', 'Registra solo lo que necesites para dar seguimiento a sus consultas.') + '<label>Alergias o alertas <span class="optional">Opcional</span><textarea name="allergies" maxlength="2000" rows="2">' + esc(p.allergies) + '</textarea></label><label>Antecedentes relevantes <span class="optional">Opcional</span><textarea name="background" maxlength="10000" rows="3">' + esc(p.background) + '</textarea></label>' + formEnd(id ? 'Guardar cambios de la ficha' : 'Crear ficha de paciente'));
}
function appointmentDialog(id = '', patientId = '') {
  if (!data().patients.some(p => !p.archived) && !id) { patientDialog('', 'appointment'); return; }
  const draft = appointmentDraft; appointmentDraft = null;
  const a = appointment(id) || { patientId, date: draft?.date || selectedDate, time: draft?.time || '13:30', duration: draft?.duration || 45, service: draft?.service || '', priceCents: draft ? cents(draft.price) : 0, status: 'scheduled' };
  const patientLocked = !!id && appointmentHasHistory(data(), id);
  const patients = data().patients.filter(p => !p.archived || p.id === a.patientId).sort((a,b)=>a.name.localeCompare(b.name));
  dialog(id ? 'Editar cita' : 'Programar cita', '<form id="appointment-form" data-id="' + id + '">' + formSection('Paciente', patientLocked ? 'El paciente no puede cambiar porque esta cita ya tiene notas o pagos.' : '') + (patientLocked ? '<input id="appointment-locked-patient" type="hidden" name="patientId" value="' + a.patientId + '">' : '') + '<label>Paciente<select name="patientId" required' + (patientLocked ? ' disabled' : '') + '><option value="">Busca un paciente en la lista</option>' + patients.map(p => '<option value="' + p.id + '"' + (p.id === a.patientId ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></label>' + (!id ? btn('Agregar paciente a la lista', 'patient-for-appointment', '', 'link small') : '') + formSection('Horario de la consulta', 'Jornada de ' + data().settings.start + ' a ' + data().settings.end + '. Azora comprueba los cruces de horario al guardar.') + '<div class="form-row"><label>Fecha<input name="date" type="date" value="' + a.date + '" required></label><label>Hora de inicio<input name="time" type="time" value="' + a.time + '" required></label></div><label>Duración <span class="field-hint">En minutos</span><input name="duration" type="number" min="5" max="480" step="5" value="' + a.duration + '" required inputmode="numeric"></label>' + formSection('Servicio y costo') + '<label>Servicio o motivo<input name="service" maxlength="160" value="' + esc(a.service) + '" placeholder="Por ejemplo, consulta de seguimiento" required></label><label>Costo de la consulta <span class="field-hint">Pesos mexicanos · MXN</span><input name="price" type="number" min="0" max="1000000" step=".01" value="' + a.priceCents/100 + '" required inputmode="decimal"></label>' + (id ? '<label>Estado de atención<select name="status">' + Object.entries(STATUSES).map(([value,label])=>'<option value="' + value + '"' + (value===a.status?' selected':'') + '>' + label + '</option>').join('') + '</select></label>' : '') + formEnd(id ? 'Guardar cambios de la cita' : 'Crear cita'));
}
function noteDialog(patientId, appointmentId = '') {
  const p = patient(patientId); const a = appointment(appointmentId);
  dialog('Nota de consulta', '<div class="form-patient-context"><div class="avatar">' + esc(initials(p.name)) + '</div><div><strong>' + esc(p.name) + '</strong><small>' + (a ? shortDate(a.date) + ' · ' + a.time + ' · ' + esc(a.service) : 'Nota general del expediente') + '</small></div></div><form id="note-form" data-patient="' + patientId + '" data-appointment="' + appointmentId + '">' + formSection('Evolución', 'Describe lo observado en la consulta. La nota quedará fechada en el expediente.') + '<label>Hallazgos y evolución<textarea name="content" rows="8" maxlength="10000" required placeholder="Escribe la evolución de esta consulta"></textarea></label><label>Plan de seguimiento <span class="optional">Opcional</span><textarea name="plan" rows="4" maxlength="5000" placeholder="Indicaciones o puntos a revisar en la próxima consulta"></textarea></label>' + formEnd('Añadir nota al expediente'));
}
function paymentDialog(id) {
  const a=appointment(id), balance=balanceFor(data(),a);
  if (balance<=0) return toast('Esta consulta no tiene saldo pendiente.');
  dialog('Registrar pago recibido', '<div class="payment-patient"><div class="avatar">' + esc(initials(patientName(a.patientId))) + '</div><div><strong>' + esc(patientName(a.patientId)) + '</strong><small>' + esc(a.service) + ' · ' + shortDate(a.date) + '</small></div></div><div class="payment-breakdown"><div><span>Costo</span><strong>' + money(a.priceCents) + '</strong></div><div><span>Recibido antes de este pago</span><strong>' + money(paidFor(data(),a.id)) + '</strong></div></div><div class="payment-summary"><span>Saldo pendiente</span><strong>' + moneyMarkup(balance) + '</strong><small>MXN</small></div><form id="payment-form" data-id="' + id + '"><label>Importe recibido <span class="field-hint">Puedes registrar un abono menor al saldo</span><input class="payment-amount" name="amount" type="number" step=".01" min=".01" max="' + balance/100 + '" value="' + balance/100 + '" required inputmode="decimal"></label><label>Método de pago<select name="method">' + METHODS.map(m=>'<option>' + m + '</option>').join('') + '</select></label><label>Referencia del pago <span class="optional">Opcional</span><input name="reference" maxlength="200" placeholder="Folio de transferencia o referencia"></label><p class="payment-disclosure">' + svg('info') + '<span>Este registro actualiza la cuenta de la consulta. No realiza un cargo ni una transferencia.</span></p>' + formEnd('Registrar pago de ' + money(balance)));
}
function receiptText(p) {
  const a = appointment(p.appointmentId);
  return data().settings.practice + '\nCOMPROBANTE DE PAGO' + (p.voidedAt ? ' · ANULADO' : '') + '\nFolio: AZ-' + p.id.slice(0, 8).toUpperCase() + '\nFecha: ' + datetime(p.createdAt) + '\nPaciente: ' + patientName(a.patientId) + '\nServicio: ' + a.service + '\nConsulta: ' + a.date + ' ' + a.time + '\nRecibido: ' + money(p.amountCents) + '\nMétodo: ' + p.method + (p.reference ? '\nReferencia: ' + p.reference : '') + '\nSaldo actual: ' + money(balanceFor(data(), a)) + (p.voidedAt ? '\nMotivo de anulación: ' + p.voidReason : '') + '\n\nComprobante de registro. No es una factura fiscal.';
}
function receiptDialog(id) {
  const p=data().payments.find(p=>p.id===id), a=appointment(p.appointmentId);
  dialog('Comprobante de pago', '<article class="receipt-document"><div class="receipt-header"><strong>azora.</strong><span>' + esc(data().settings.practice) + '</span></div><div class="receipt-state">' + svg(p.voidedAt?'alert':'check') + '<span>' + (p.voidedAt?'Registro anulado':'Pago registrado') + '</span></div><div class="receipt-total">' + moneyMarkup(p.amountCents) + '<small>MXN · importe recibido</small></div><dl class="receipt-details"><div><dt>Paciente</dt><dd>' + esc(patientName(a.patientId)) + '</dd></div><div><dt>Servicio</dt><dd>' + esc(a.service) + '</dd></div><div><dt>Consulta</dt><dd>' + shortDate(a.date) + ' · ' + a.time + '</dd></div><div><dt>Fecha de registro</dt><dd>' + datetime(p.createdAt) + '</dd></div><div><dt>Método</dt><dd>' + esc(p.method) + '</dd></div><div><dt>Folio</dt><dd class="receipt-folio">' + 'AZ-' + esc(p.id.slice(0,8).toUpperCase()) + '</dd></div>' + (p.reference?'<div><dt>Referencia</dt><dd>' + esc(p.reference) + '</dd></div>':'') + '</dl><div class="receipt-balance"><span>Saldo actual de la consulta</span><strong>' + money(balanceFor(data(),a)) + '</strong></div>' + (p.voidedAt?'<p class="clinical-alert">Motivo de anulación: ' + esc(p.voidReason) + '</p>':'') + '<p class="receipt-legal">Comprobante de registro de pago. No es una factura fiscal.</p></article><div class="receipt-actions">' + btn('Compartir comprobante', 'share-receipt',id,'primary') + btn('Descargar TXT','download-receipt',id) + '</div>');
}
function askConfirmation(title, copy, actionLabel, danger = false) {
  const element=$('#confirmation');
  const cancelLabel = title.includes('Salir sin guardar') ? 'Seguir editando' : title.startsWith('Cancelar la cita') ? 'Mantener cita' : title.startsWith('Archivar') ? 'Mantener paciente activo' : 'Conservar versión actual';
  return new Promise(resolve=>{
    element.innerHTML='<div class="confirmation-symbol ' + (danger?'danger':'') + '">' + svg(danger?'alert':'info') + '</div><h2 id="confirmation-title">' + title + '</h2><p id="confirmation-copy">' + copy + '</p><div class="confirmation-actions"><button type="button" class="btn" data-confirm="cancel">' + cancelLabel + '</button><button type="button" class="btn ' + (danger?'danger-solid':'primary') + '" data-confirm="accept">' + actionLabel + '</button></div>';
    const controller=new AbortController();
    const finish=value=>{controller.abort();element.close();resolve(value);};
    element.addEventListener('click',event=>{const button=event.target.closest('[data-confirm]');if(button){event.stopPropagation();finish(button.dataset.confirm==='accept');}},{signal:controller.signal});
    element.addEventListener('cancel',event=>{event.preventDefault();finish(false);},{signal:controller.signal});
    element.showModal(); element.querySelector('[data-confirm=cancel]').focus();
  });
}
async function closeEditor() {
  const form=editor.querySelector('form');
  const changed=formChanged(form);
  if(changed && !(await askConfirmation('¿Salir sin guardar?', 'Los cambios de este formulario todavía no se han guardado. Puedes volver para terminarlos o salir y descartarlos.', 'Salir sin guardar',true))) return false;
  editor.close(); appointmentDraft = null;
  if(returnFocus?.isConnected) returnFocus.focus({preventScroll:true}); else main.focus({preventScroll:true});
  return true;
}
function prepareForm(form) {
  form.noValidate=true;
  form.querySelectorAll('input,select,textarea').forEach(field=>{if(field.name&&!field.id)field.id=form.id+'-'+field.name;});
  if(!form.querySelector('.form-error')){const error=document.createElement('div');error.className='form-error';error.hidden=true;error.tabIndex=-1;error.setAttribute('role','alert');form.prepend(error);}
  else form.prepend(form.querySelector('.form-error'));
  form.dataset.initial = JSON.stringify([...new FormData(form)]);
}
function clearFormErrors(form) {
  form.querySelectorAll('.field-error').forEach(el=>el.remove());
  form.querySelectorAll('[aria-invalid]').forEach(el=>{el.removeAttribute('aria-invalid');el.removeAttribute('aria-describedby');});
  const box=form.querySelector('.form-error');if(box){box.hidden=true;box.textContent='';}
}
function showFormErrors(form, errors) {
  const box=form.querySelector('.form-error');
  if(!box){toast(errors[0].message);return;}
  box.innerHTML='<strong>' + (errors.length>1?'Revisa estos campos':'Revisa este dato') + '</strong><ul>' + errors.map(error=>'<li>'+(error.field?'<a href="#'+error.field.id+'" data-action="focus-field" data-id="'+error.field.id+'">'+esc(error.message)+'</a>':esc(error.message))+'</li>').join('')+'</ul>';
  box.hidden=false;box.tabIndex=-1;
  for(const error of errors)if(error.field){const span=document.createElement('span');span.className='field-error';span.id=error.field.id+'-error';span.textContent=error.message;error.field.setAttribute('aria-invalid','true');error.field.setAttribute('aria-describedby',span.id);error.field.after(span);}
  box.focus(); box.scrollIntoView({block:'center'});
}
function validateForm(form) {
  clearFormErrors(form);
  const requiredMessages={name:'Escribe el nombre completo del paciente.',patientId:'Selecciona un paciente para la cita.',date:'Selecciona la fecha de la consulta.',time:'Elige la hora de inicio.',duration:'Indica cuántos minutos durará la consulta.',price:'Indica el costo de la consulta.',service:'Escribe el servicio o motivo de la consulta.',content:'Escribe los hallazgos de esta consulta.',amount:'Escribe el importe que recibiste.',reason:'Explica por qué anulas este pago.',practice:'Escribe el nombre de tu consulta.',start:'Define el inicio de tu jornada.',end:'Define el final de tu jornada.'};
  const errors=[];
  form.querySelectorAll('input,select,textarea').forEach(field=>{
    if(!field.willValidate||field.validity.valid)return;
    let message=field.validity.valueMissing?(requiredMessages[field.name]||'Completa el dato indicado.'):field.validity.typeMismatch?'Escribe un correo electrónico válido.':field.validity.rangeUnderflow?'El valor mínimo es '+field.min+'.':field.validity.rangeOverflow?'El valor máximo es '+field.max+'.':field.validity.stepMismatch?(field.name==='duration'?'Indica una duración en intervalos de 5 minutos.':'Escribe el importe con un máximo de dos decimales.'):'Revisa el formato de este dato.';
    if(field.name==='amount' && field.validity.rangeOverflow)message='El pago no puede superar el saldo de '+money(cents(field.max))+'.';
    errors.push({field,message});
  });
  if(errors.length)showFormErrors(form,errors);
  return errors.length===0;
}

function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportBackup() {
  download('azora-respaldo-' + localDate() + '.json', JSON.stringify({ format: 'ronda-backup', exportedAt: new Date().toISOString(), data: data() }, null, 2));
}
async function restore(next, expectedGeneration = state.generation) {
  validateData(next);
  await commit(d => { for (const key of Object.keys(d)) delete d[key]; Object.assign(d, next); }, 'Respaldo restaurado. Conservamos una copia de recuperación.', expectedGeneration, true);
}
function shiftDay(delta) { const date = new Date(selectedDate + 'T12:00:00'); date.setDate(date.getDate() + delta); selectedDate = localDate(date); selectedAppointment = ''; render(); }

document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-section]');
  if (nav) {
    if (nav.tagName === 'A' && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
    event.preventDefault();
    await navigateSafely(nav.dataset.section); return;
  }
  const target = event.target.closest('[data-action]');
  if (!target || !state) return;
  const { action, id } = target.dataset;
  const actionGeneration = state.generation;
  try {
    if (action === 'close') { await closeEditor(); return; }
    if (action === 'focus-field') { event.preventDefault(); document.getElementById(id)?.focus(); return; }
    if (action === 'patient-for-appointment') { appointmentDraft=Object.fromEntries(new FormData($('#appointment-form'))); return patientDialog('', 'appointment'); }
    if (action === 'new-patient') return patientDialog();
    if (action === 'edit-patient') return patientDialog(id);
    if (action === 'new-appointment') return appointmentDialog();
    if (action === 'patient-appointment') return appointmentDialog('', id);
    if (action === 'edit-appointment') return appointmentDialog(id);
    if (action === 'select') { selectedAppointment = id; render(); if(window.innerWidth<=850) $('.case-space')?.scrollIntoView({behavior:'smooth',block:'start'}); return; }
    if (action === 'date') { selectedDate = id; selectedAppointment = ''; render(); return; }
    if (action === 'previous-day' || action === 'next-day') return shiftDay(action === 'previous-day' ? -1 : 1);
    if (action === 'today') { selectedDate = localDate(); selectedAppointment = ''; render(); return; }
    if (action === 'record') { recordPatient = id; navigate('personas'); return; }
    if (action === 'patients') { recordPatient = ''; navigate('personas'); return; }
    if (action === 'new-note') return noteDialog(appointment(id).patientId, id);
    if (action === 'patient-note') return noteDialog(id);
    if (action === 'payment') return paymentDialog(id);
    if (action === 'receipt') return receiptDialog(id);
    if (action === 'arrive' || action === 'complete') return await commit(d => { d.appointments.find(a => a.id === id).status = action === 'arrive' ? 'arrived' : 'completed'; }, action === 'arrive' ? 'Llegada registrada.' : 'Consulta marcada como atendida.');
    if (action === 'archive-patient') {
      const p = patient(id);
      if (!p.archived && data().appointments.some(a => a.patientId === id && ['scheduled', 'arrived'].includes(a.status))) throw new Error('Atiende o cancela las citas pendientes antes de archivar al paciente.');
      if (!p.archived && !(await askConfirmation('Archivar a ' + esc(p.name), 'Su ficha dejará de aparecer en el directorio activo. El expediente, las consultas y los pagos se conservarán. Puedes reactivarla desde Pacientes archivados.', 'Archivar paciente'))) return;
      return await commit(d => { const entry = d.patients.find(p => p.id === id); entry.archived = !entry.archived; }, p.archived ? 'Paciente reactivado.' : 'Paciente archivado.', actionGeneration);
    }
    if (action === 'ledger-pending' || action === 'ledger-history') { ledgerFilter = action === 'ledger-pending' ? 'pending' : 'history'; render(); return; }
    if (action === 'void-payment') {
      const movement=data().payments.find(p=>p.id===id), visit=appointment(movement.appointmentId);
      dialog('Anular pago de '+money(movement.amountCents), '<div class="form-patient-context"><div class="avatar">'+esc(initials(patientName(visit.patientId)))+'</div><div><strong>'+esc(patientName(visit.patientId))+'</strong><small>'+datetime(movement.createdAt)+' · '+esc(movement.method)+' · AZ-'+esc(movement.id.slice(0,8).toUpperCase())+'</small></div></div><p class="dialog-summary">El movimiento se conservará como anulado y el importe volverá al saldo pendiente de esta consulta. La anulación no devuelve dinero al paciente.</p><form id="void-form" data-id="'+id+'"><label>Motivo de anulación<textarea name="reason" required maxlength="300" placeholder="Explica la corrección que necesitas registrar"></textarea></label>'+formEnd('Anular este registro de pago')); return;
    }
    if (action === 'share-receipt' || action === 'download-receipt') {
      const text = receiptText(data().payments.find(p => p.id === id));
      if (action === 'download-receipt') download('azora-comprobante-' + id.slice(0, 8) + '.txt', text, 'text/plain;charset=utf-8');
      else if (navigator.share) { try { await navigator.share({ title: 'Comprobante Azora', text }); } catch (error) { if (error.name !== 'AbortError') throw error; } }
      else { try { await navigator.clipboard.writeText(text); toast('Comprobante copiado. Puedes pegarlo en WhatsApp.'); } catch { download('comprobante-azora.txt', text, 'text/plain'); toast('Descargamos el comprobante para compartirlo.'); } }
      return;
    }
    if (action === 'load-sample') {
      if (data().patients.length || data().appointments.length) throw new Error('Los ejemplos solo se cargan en un espacio vacío.');
      await commit(d => Object.assign(d, sampleData()), 'Datos ficticios cargados.'); return;
    }
    if (action === 'export-backup') return exportBackup();
    if (action === 'open-settings') { editor.close(); navigate('ajustes'); return; }
    if (action === 'sync') { await sync(); toast(conflict ? 'Revisa los cambios pendientes en Configuración.' : syncError ? 'Datos locales guardados. El servidor todavía no está disponible.' : state.dirty ? 'Hay cambios pendientes de respaldo.' : 'Respaldo confirmado en el servidor local.'); return; }
    if (action === 'enable-notifications') {
      if (!('Notification' in window)) throw new Error('Este navegador no admite notificaciones.');
      const permission = await Notification.requestPermission(); render(); toast(permission === 'granted' ? 'Recordatorios activados mientras la app esté abierta.' : 'Los avisos siguen desactivados.'); return;
    }
    if (action === 'resolve-conflict') {
      if (!(await mayLeave())) return;
      const remote = await request('/api/state'); if (!remote.data) throw new Error('No hay información en el servidor.');
      validateData(remote.data);
      if (!(await askConfirmation('Cargar la copia de esta computadora', 'Se usará la versión respaldada en el servidor local. La versión actual del navegador quedará como copia de recuperación.', 'Cargar copia del servidor'))) return;
      await withWorkspaceLock(async () => {
        const latest = await readWorkspace() || state;
        if (latest.generation !== actionGeneration) throw new Error('Los datos cambiaron mientras confirmabas. Revisa la versión actual antes de reemplazarla.');
        await saveRecovery(latest);
        const next = { ...latest, data: remote.data, revision: remote.revision, syncedAt: remote.updatedAt, dirty: false, generation: uid() };
        await saveWorkspace(next); state = next;
      });
      conflict = false; syncError = ''; channel?.postMessage('changed'); render(); toast('Versión del servidor cargada.'); return;
    }
    if (action === 'recover') {
      const recovery = await readRecovery(); if (!recovery) throw new Error('No hay una copia anterior para recuperar.');
      if (await askConfirmation('Recuperar la copia anterior', 'Se restaurarán los pacientes, citas, notas y pagos de la copia anterior. Antes se conservará una copia del estado actual.', 'Recuperar copia')) await restore(recovery.data, actionGeneration); return;
    }
    if (action === 'export-payments') {
      // csvCell también neutraliza fórmulas precedidas por espacios o tabuladores.
      const rows = [['Folio', 'Fecha', 'Paciente', 'Servicio', 'Importe MXN', 'Método', 'Estado', 'Referencia']];
      data().payments.forEach(p => { const a = appointment(p.appointmentId); rows.push([p.id, p.createdAt, patientName(a.patientId), a.service, (p.amountCents / 100).toFixed(2), p.method, p.voidedAt ? 'Anulado' : 'Recibido', p.reference]); });
      download('azora-movimientos-' + localDate() + '.csv', '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8'); return;
    }
  } catch (error) { toast(error.message); }
});
document.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target; if (!(form instanceof HTMLFormElement) || !validateForm(form)) return;
  const submit = form.querySelector('[type=submit]'); if (submit.disabled) return;
  submit.disabled = true;
  const values = Object.fromEntries(new FormData(form));
  Object.keys(values).forEach(k => { if (typeof values[k] === 'string') values[k] = values[k].trim(); });
  const errorBox = form.querySelector('.form-error'); if (errorBox) errorBox.hidden = true;
  try {
    const expected = editor.contains(form) ? editor.dataset.generation : form.dataset.generation;
    if (expected !== state.generation) throw new Error('Los datos cambiaron en otra pestaña. Cierra y vuelve a abrir el formulario para trabajar con la versión actual.');
    if (form.id === 'patient-form') {
      const id = form.dataset.id || uid(); const after = form.dataset.after;
      await commit(d => {
        const entry = { id, name: values.name, phone: values.phone, email: values.email, birthDate: values.birthDate, background: values.background, allergies: values.allergies, archived: d.patients.find(p => p.id === id)?.archived || false };
        const index = d.patients.findIndex(p => p.id === id); if (index >= 0) d.patients[index] = entry; else d.patients.push(entry);
      }, 'Ficha del paciente guardada.', expected);
      if (after === 'appointment') appointmentDialog('', id); else editor.close();
    } else if (form.id === 'appointment-form') {
      const id = form.dataset.id || uid();
      const nextStatus = values.status || 'scheduled';
      if (patient(values.patientId)?.archived && ['scheduled', 'arrived'].includes(nextStatus)) throw new Error('Reactiva al paciente antes de programar una nueva consulta.');
      if (nextStatus === 'cancelled' && appointment(id)?.status !== 'cancelled' && !(await askConfirmation('Cancelar la cita de ' + esc(patientName(values.patientId)), esc(shortDate(values.date) + ', ' + values.time + '. ') + 'El horario quedará disponible. Los pagos registrados se conservarán; una devolución debe hacerse por separado.', 'Cancelar cita',true))) return;
      await commit(d => {
        const a = validateAppointmentChange(d, { id, patientId: values.patientId, date: values.date, time: values.time, duration: Number(values.duration), service: values.service, priceCents: cents(values.price), status: nextStatus });
        const index = d.appointments.findIndex(a => a.id === id); if (index >= 0) d.appointments[index] = a; else d.appointments.push(a);
      }, 'Consulta guardada.', expected); selectedDate = values.date; selectedAppointment = id; editor.close(); render();
    } else if (form.id === 'note-form') {
      await commit(d => d.notes.push({ id: uid(), patientId: form.dataset.patient, appointmentId: form.dataset.appointment, content: values.content, plan: values.plan, createdAt: new Date().toISOString() }), 'Nota de seguimiento guardada.', expected); editor.close();
    } else if (form.id === 'payment-form') {
      const id = form.dataset.id, amountCents = cents(values.amount);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > balanceFor(data(), appointment(id))) throw new Error('El importe debe ser mayor que cero y no superar el saldo pendiente.');
      const paymentId = uid();
      await commit(d => d.payments.push({ id: paymentId, appointmentId: id, amountCents, method: values.method, reference: values.reference, createdAt: new Date().toISOString() }), 'Pago registrado.', expected); receiptDialog(paymentId);
    } else if (form.id === 'void-form') {
      await commit(d => { const p = d.payments.find(p => p.id === form.dataset.id); if (p.voidedAt) throw new Error('Este pago ya está anulado.'); p.voidedAt = new Date().toISOString(); p.voidReason = values.reason; }, 'Registro anulado. El saldo fue actualizado.', expected); editor.close();
    } else if (form.id === 'settings-form') {
      await commit(d => { d.settings = { ...values, reminderMinutes: Number(values.reminderMinutes) }; }, 'Configuración guardada.', expected);
    }
  } catch (error) { const field = /cruce|horario|jornada/.test(error.message) ? form.elements.time : /abonos|costo|saldo|importe/.test(error.message) ? form.elements.amount || form.elements.price : null; showFormErrors(form,[{field,message:error.message}]); }
  finally { if (submit.isConnected) submit.disabled = false; }
});
editor.addEventListener('cancel',event=>{event.preventDefault();void closeEditor();});
document.addEventListener('input', event => {
  if (event.target.closest('#payment-form') && event.target.name==='amount') {
    const form=event.target.form, total=cents(event.target.value);
    form.querySelector('[type=submit]').textContent=Number.isFinite(total)&&total>0?'Registrar '+(total<balanceFor(data(),appointment(form.dataset.id))?'abono de ':'pago de ')+money(total):'Registrar pago recibido';
  }
  if (event.target.id === 'patient-search') {
    const pos = event.target.selectionStart; query = event.target.value; render();
    $('#patient-search').focus(); $('#patient-search').setSelectionRange(pos, pos);
  }
});
document.addEventListener('change', async event => {
  const el = event.target;
  const actionGeneration = state?.generation;
  if (el.id === 'agenda-date' && el.value) { selectedDate = el.value; selectedAppointment=''; render(); }
  if (el.id === 'agenda-status') { statusFilter = el.value; render(); }
  if (el.id === 'archived-filter') { showArchived = el.checked; render(); }
  if (el.id === 'import-backup' && el.files[0]) {
    try {
      if (!(await mayLeave())) return;
      if (el.files[0].size > 5 * 1024 * 1024) throw new Error('El respaldo supera 5 MB.');
      const file = JSON.parse(await el.files[0].text());
      if (file.format !== 'ronda-backup') throw new Error('Este archivo no es un respaldo de Azora.');
      validateData(file.data);
      if (await askConfirmation('Restaurar respaldo', 'El archivo contiene ' + countLabel(file.data.patients.length,'paciente','pacientes') + ' y ' + countLabel(file.data.appointments.length,'cita','citas') + '. Reemplazará el espacio actual; antes se conservará una copia de recuperación.', 'Restaurar respaldo')) await restore(file.data, actionGeneration);
    } catch (error) { toast(error.message); }
    finally { if (el.isConnected) el.value = ''; }
  }
});
$('#sync-button').addEventListener('click', () => {
  if(conflict){void navigateSafely('ajustes');return;}
  const heading = !navigator.onLine?'Trabajo sin conexión':state.dirty?'Cambios guardados en el navegador':state.syncedAt?'Copia local confirmada':'Guardado local disponible';
  dialog(heading,'<div class="storage-status-detail">'+svg('backup')+'<p>Azora guarda primero en este navegador. La copia del servidor se almacena en esta computadora; no es un respaldo en la nube.</p><dl><div><dt>Estado</dt><dd>'+esc($('#sync-copy').textContent)+'</dd></div><div><dt>Última copia confirmada</dt><dd>'+(state.syncedAt?datetime(state.syncedAt):'Todavía no se ha creado')+'</dd></div></dl></div><div class="button-group">'+btn('Actualizar copia ahora','sync','','primary')+btn('Ver configuración','open-settings')+'</div>','ALMACENAMIENTO');
});
window.addEventListener('hashchange', async () => {
  const target = location.hash.slice(1);
  if (await mayLeave()) { recordPatient = ''; navigate(target, true); }
  else history.pushState(null, '', '#' + section);
});
window.addEventListener('beforeunload', event => { if (hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('online', () => void sync());
window.addEventListener('offline', syncStatus);
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('#install-button').hidden = false; });
$('#install-button').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $('#install-button').hidden = true; } });
document.addEventListener('keydown', event => {
  if (!state || editor.open || $('#confirmation').open || event.ctrlKey || event.metaKey || event.altKey || document.activeElement?.isContentEditable || hasUnsavedChanges()) return;
  if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) && event.key.toLowerCase() === 'n') { event.preventDefault(); appointmentDialog(); }
});
channel?.addEventListener('message', async () => { const latest = await readWorkspace(); if (latest && (latest.generation !== state?.generation || latest.revision !== state?.revision)) { const changed = latest.generation !== state?.generation; state = latest; if (changed && !editor.open && !hasUnsavedChanges()) { render(); toast('Vista actualizada con los cambios de otra pestaña.'); } syncStatus(); } });
const reminded = new Set();
async function checkReminders() {
  if (!state || !('Notification' in window) || Notification.permission !== 'granted') return;
  for (const a of data().appointments.filter(a => a.status === 'scheduled')) {
    const diff = new Date(a.date + 'T' + a.time).getTime() - Date.now();
    const key = a.id + a.date + a.time;
    if (diff < 0 || diff > data().settings.reminderMinutes * 60000 || reminded.has(key)) continue;
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) { await registration.showNotification('Tu próxima consulta', { body: 'Tienes una consulta a las ' + a.time + '. Abre Azora para ver los detalles.', icon: './icons/icon-192.png', tag: key }); reminded.add(key); }
    } catch { /* Notification capability varies by browser. Keep the agenda functional. */ }
  }
}
async function boot() {
  await withWorkspaceLock(async () => {
  state = await readWorkspace();
  if (!state) {
    const initial = migratePrototype();
    state = { data: initial, revision: 0, dirty: initial.appointments.length > 0, generation: uid(), syncedAt: null };
    await saveWorkspace(state);
  }
  });
  validateData(state.data);
  navigate(location.hash.slice(1) || 'hoy', true);
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }); } catch { toast('La app funciona, pero el modo sin conexión no pudo activarse.'); }
    navigator.serviceWorker.addEventListener('message', e => { if (e.data?.type === 'open-agenda') navigate('agenda'); });
  }
  await sync();
  if (new URLSearchParams(location.search).get('action') === 'new') appointmentDialog();
  setInterval(() => void sync(), 30000);
  setInterval(() => void checkReminders(), 30000);
  void checkReminders();
}
boot().catch(error => {
  main.innerHTML = '<div class="page">' + empty('No pudimos abrir tus datos', esc(error.message) + '<br>Revisa que el navegador permita almacenar información en este sitio y vuelve a cargar.') + '</div>';
});

