# Azora 1.2

Aplicación PWA funcional básica para un profesional: pacientes, expedientes, citas y cobros. Conserva la composición de la agenda y el contexto persistente aprobados durante el boceto.

**Nueva computadora:** sigue [INSTALACION.md](INSTALACION.md) para clonar en la universidad, arrancar Azora y trasladar tus registros mediante un respaldo privado. Consulta [SEGURIDAD.md](SEGURIDAD.md) antes de subir cambios a GitHub.

## Ejecutar

Requiere Node.js 24 o superior (SQLite incorporado). No requiere npm install ni servicios externos.

Desde esta carpeta:

~~~powershell
npm start
~~~

También puedes abrir Iniciar-Azora.cmd. Visita http://localhost:4187/ (o http://127.0.0.1:4187/). Usa siempre la misma dirección: el almacenamiento del navegador es independiente para cada origen. Detén el servidor con Ctrl+C.

El servidor escucha únicamente en 127.0.0.1. No usar python http.server: ese servidor no proporciona la API ni el respaldo SQLite.

En PowerShell puedes usar `npm.cmd start` si la política del equipo bloquea npm.ps1. No hace falta desactivar esa política.

## Funciones implementadas

- Alta y edición de pacientes, contacto, antecedentes y alergias. Archivo y reactivación sin perder historial.
- Notas de seguimiento con fecha, plan y relación opcional con la consulta.
- Citas por día y semana: alta, edición, reprogramación, llegada, atención y cancelación.
- Validación de duración, jornada y cruces de horarios.
- Abonos y liquidaciones manuales en centavos enteros, sin sobrepagos. Anulación con motivo y trazabilidad.
- Comprobante TXT descargable, compartir mediante Web Share o copiar al portapapeles.
- Exportación CSV de pagos y respaldo/restauración JSON validado, con copia de recuperación.
- Configuración de nombre de consulta, profesional, horario y anticipación de avisos.
- Avisos locales a través de notificaciones mientras la aplicación está abierta y el permiso está concedido. No usa un servicio Push remoto.
- PWA instalable con iconos PNG, caché del shell y trabajo offline.
- IndexedDB para datos del navegador y API Node/SQLite para respaldo real en este equipo.
- Control de revisiones: un conflicto entre navegadores conserva la versión local y permite descargarla antes de cargar el servidor. Bloqueo de escritura entre pestañas del mismo origen.
- Protección frente a formularios antiguos: conserva el texto escrito y rechaza guardados que sobrescribirían otra versión. Confirma la salida de Configuración con cambios pendientes.
- Navegación compatible con Atrás/Adelante y protección del paciente asociado a citas con notas o pagos.

## Datos

El espacio inicia vacío. Puedes agregar un paciente o cargar ejemplos ficticios desde la bienvenida. Las citas del prototipo anterior se migran si están en localStorage del mismo origen y cumplen las validaciones; el almacenamiento original no se borra.

SQLite está en data/ronda.sqlite, con las últimas 20 revisiones en la tabla history. Esta carpeta se excluye de Git y nunca se sirve por HTTP. Los Word, ZIP y capturas de trabajo se conservan solo en la computadora donde se crearon; se retiraron del seguimiento de Git y no estarán en un clon nuevo después de publicar esta actualización. Tampoco están disponibles a través del servidor web.

Los cambios se guardan primero en IndexedDB; el indicador confirma por separado cuándo el servidor recibió el respaldo. Si el servidor está detenido, se conserva el trabajo local y se vuelve a intentar al recuperar la conexión o cada 30 segundos. Para el funcionamiento offline, primero hay que abrir la aplicación con el servidor disponible.

En Configuración puedes descargar un respaldo y restaurarlo. La importación reemplaza el espacio actual después de confirmarlo y conserva una copia anterior en el navegador. También puedes recuperarla desde Configuración.

## Alcance de esta entrega

Versión local para un usuario. Los cobros son registros de dinero recibido por fuera de la app; no mueve dinero ni procesa tarjetas. No hay Stripe/Mercado Pago, cuentas remotas, inicio de sesión multiusuario, suscripciones SaaS ni Web Push con la aplicación cerrada. Esas funciones necesitan integración y credenciales específicas.

La base local no está cifrada ni cuenta con autenticación. Esta entrega es para desarrollo y validación; antes de usar expedientes clínicos reales se necesita implementar acceso, cifrado, respaldo externo y requisitos de protección de datos correspondientes.

## Pruebas

~~~powershell
npm test
~~~

Incluye validación de relaciones, cruces de horario, saldos y anulaciones, rechazo de respaldos inválidos, persistencia tras reiniciar el servidor, control de revisión, restricción de origen y protección de rutas privadas. Las pruebas de API usan una carpeta temporal independiente.

`npm run check` ejecuta las pruebas más la revisión de archivos/credenciales. `node scripts/security-check.mjs --history` revisa también el historial local con las limitaciones descritas en SEGURIDAD.md. Las automatizaciones preparadas para GitHub no requieren secretos propios ni claves de API.

## Archivos

- index.html y ronda.css: interfaz operativa y diseño adaptable.
- app.js: navegación, formularios, comprobantes, respaldo y sincronización.
- domain.js: reglas de negocio compartidas entre cliente y servidor.
- db.js: IndexedDB y migración del prototipo.
- workspace.js: validación de cambios de generación y confirmaciones de respaldo.
- server.js: servidor Node, API local y SQLite.
- sw.js y manifest.webmanifest: capacidades PWA.
- tests/: pruebas automatizadas del dominio y API.

styles.css se conserva como referencia del boceto; la versión funcional usa ronda.css.

## Diseño UX y UI

La identidad visible es Azora. La investigación y las fuentes aplicadas se encuentran en UX_UI_AZORA.md. La interfaz distingue agenda, expediente, registro de pago y comprobante, usa iconos SVG, cifras tabulares y mensajes vinculados a cada tarea. Los formularios extensos se abren como paneles laterales y conservan sus valores cuando hay errores. La salida con cambios pendientes requiere una confirmación específica.

La navegación principal es horizontal en escritorio y se distribuye en dos filas de cabecera en tablet. En móvil usa cuatro destinos inferiores. No hay barra lateral de navegación; Configuración tiene un único acceso. La agenda y el detalle de consulta aprovechan el ancho liberado. La actualización del caché PWA conserva las bases de datos existentes.

Los nombres internos ronda-functional-v1, ronda-appointments-v1, ronda-backup y ronda.sqlite se conservan por compatibilidad con los datos anteriores; la aplicación no crea un espacio vacío nuevo al cambiar de nombre.
