import { uid, validateData } from './domain.js';

export function prepareChange(current, expectedGeneration, mutator) {
  if (current.generation !== expectedGeneration) {
    throw new Error('Los datos cambiaron en otra pestaña. Cierra y vuelve a abrir el formulario antes de guardar.');
  }
  const data = structuredClone(current.data);
  mutator(data);
  validateData(data);
  if (new TextEncoder().encode(JSON.stringify({ revision: current.revision, data })).length > 5 * 1024 * 1024) {
    throw new Error('El espacio supera el límite de respaldo de 5 MB. No se guardaron estos cambios; descarga una copia y revisa el tamaño de las notas.');
  }
  // Se toma la revisión más reciente, incluso si un respaldo no cambió la generación.
  return { ...current, data, generation: uid(), dirty: true, changedAt: new Date().toISOString() };
}

export function acknowledgeBackup(current, sentGeneration, result) {
  return { ...current, revision: result.revision, syncedAt: result.updatedAt, dirty: current.generation !== sentGeneration };
}
