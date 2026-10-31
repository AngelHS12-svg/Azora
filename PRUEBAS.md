# Verificación de Azora

## Rediseño 1.1 · 23 de octubre de 2026

### Actualización de navegación horizontal

- Retirado el lateral; los cuatro destinos se abren desde enlaces de cabecera y mantienen `aria-current` en la sección activa.
- Navegación a Agenda mediante Enter, apertura de las cuatro secciones y acceso único a Configuración verificados.
- Selección de consulta y apertura/cierre de su editor probados sin modificar datos.
- Revisión visual en escritorio de 1440 px, tablet de 768 px y móviles de 390 y 320 px.
- Comprobación del ancho del documento en 1024, 900, 768, 390 y 320 px: sin desbordamiento horizontal de la jornada.
- Cabecera de dos filas en tablet y navegación inferior en móvil. La selección desplaza al detalle únicamente cuando este se presenta debajo de la agenda.
- Sin errores de consola durante esta revisión. `npm test`: 7 pruebas aprobadas. Comprobación de sintaxis de app.js y sw.js aprobada.
- Con el servidor de QA detenido, la recarga conservó la jornada y la navegación móvil desde la caché PWA. El servidor principal permaneció disponible.
- Evidencia: azora-navegacion-horizontal.jpg, con datos ficticios separados del espacio principal.

### Verificación previa del rediseño

Se repitió `npm test`: 7 pruebas aprobadas y ninguna fallida. La comprobación de sintaxis de app.js, domain.js y sw.js también pasó.

Revisión adicional con datos ficticios en un origen de QA separado:

- Los registros y la configuración anteriores siguen disponibles después del cambio de identidad.
- Pago de $700 rechazado sobre un saldo de $650: mensaje específico, resumen enfocado y valores conservados.
- Abono de $200: comprobante con saldo de $450, folio y datos del movimiento.
- Alta de cita de $725.50 y cancelación posterior: los resúmenes reflejan los centavos y excluyen su saldo al cancelar.
- Confirmación de salida con cambios pendientes y opciones para continuar editando.
- Anulación de pago: contexto con paciente, importe, método y folio; consecuencias explícitas. La revisión final de este nuevo diálogo no anuló otro movimiento.
- Búsqueda y expediente en móvil de 390 px; panel de nota sin doble desplazamiento ni margen recortado.
- Tablas de cobros adaptadas a móvil con etiquetas por campo.
- Revisión de escritorio de 1440 px, navegación y detalle persistente de consulta.
- Recuperación del respaldo cuando el servidor local está vacío pero el navegador conserva información previamente sincronizada.
- Sin errores de consola en la revisión final del origen de QA.

Se revisaron combinaciones de contraste del texto secundario y se corrigieron las que no alcanzaban 4.5:1. Esto no sustituye una auditoría completa de accesibilidad ni pruebas con usuarios. No se completó la instalación en el sistema operativo.

Evidencia visual: azora-jornada.jpg (contiene exclusivamente ejemplos y registros ficticios de QA). Criterios y fuentes: UX_UI_AZORA.md.

## Historial de la versión funcional 1.0 (nombre anterior: Ronda)

Fecha: 23 de octubre de 2026.

## Automatizadas

`npm test`: 7 pruebas aprobadas.

- Relaciones entre pacientes, citas y notas.
- Cruces de horario y citas canceladas.
- Abonos, liquidación y anulación de movimientos.
- Rechazo de pagos superiores al costo de la consulta.
- Rechazo de fechas imposibles, referencias inexistentes e identificadores con HTML.
- Conservación del dinero recibido al cancelar una cita.
- API: persistencia SQLite después de reiniciar, conflictos de revisión, origen externo bloqueado y rutas privadas inaccesibles.

`node --check` aprobado para los archivos JavaScript de la aplicación y servidor.

## Navegador

Pruebas realizadas con datos ficticios en un servidor separado del espacio principal:

- Carga explícita de ejemplos y presentación de agenda y contexto clínico.
- Alta de paciente con contacto y antecedentes; búsqueda por nombre.
- Nota de seguimiento y consulta del expediente.
- Rechazo visible de una cita que cruza otra consulta.
- Alta de consulta desde el expediente y llegada registrada.
- Anticipo de $200 sobre una consulta de $500: comprobante con saldo $300.
- Anulación con motivo: el historial conserva el movimiento y el saldo vuelve a $500.
- Con el servidor detenido: nota guardada, recarga de página desde el Service Worker y recuperación desde IndexedDB.
- Al reiniciar: respaldo confirmado; la API devolvió la nota offline dentro de SQLite.
- Modificación de la configuración de consulta.
- Descarga JSON y restauración con copia de recuperación.
- Dos pestañas: un formulario antiguo rechaza el guardado después de que la otra pestaña modifica los datos.
- Revisión visual en móvil de 390 px y escritorio; se restableció el tamaño normal del navegador al terminar.

El espacio principal se entrega vacío. Los registros ficticios de QA se mantuvieron separados y se retiró su servidor al terminar.

## Límites verificados y pendientes

Las notificaciones requieren permiso y que la aplicación permanezca abierta; el aviso del sistema operativo no se probó porque no se solicitó permiso durante QA. La compartición usa Web Share cuando existe, o portapapeles/descarga como alternativa; no se enviaron mensajes externos.

La instalabilidad está preparada con manifiesto, iconos PNG y Service Worker. No se completó una instalación en el sistema operativo.

No hay pagos en línea, autenticación remota, suscripciones, backend en la nube ni Push con la app cerrada. Los pagos de esta versión son registros manuales.
