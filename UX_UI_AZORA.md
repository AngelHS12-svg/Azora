# Criterios de experiencia e interfaz de Azora

Investigación aplicada al rediseño del 23 de octubre de 2026.

## Dirección del producto

Azora es un espacio de trabajo para una práctica independiente. La tarea principal es pasar de una cita a la atención del paciente, su nota de seguimiento y su cuenta. La interfaz debe ayudar a resolver esas tareas con datos reales, en escritorio y en móvil.

La identidad usa una marca vectorial propia, azul profundo, fondos claros y un acento cálido reservado a la marca. La navegación, las acciones y los estados mantienen convenciones reconocibles. Esta es una decisión visual de Azora, no una receta prescrita por las fuentes.

## Hallazgos y decisiones aplicadas

### Nombres y contenido

NN/g explica que la consistencia y las convenciones permiten anticipar el comportamiento sin obligar a interpretar términos distintos para una misma tarea. Apple también recomienda nombres claros en menús, etiquetas y secciones. Por eso la identidad distintiva queda en la marca y la composición, mientras los destinos se llaman Jornada, Agenda, Pacientes y Cobros.

Se retiraron títulos publicitarios como Personas no números, Cuentas claras y A tu manera. Los encabezados ahora identifican la fecha, la colección de registros o el paciente. Las acciones expresan su resultado: Crear cita, Crear ficha de paciente, Añadir nota al expediente o Registrar pago de un importe concreto.

Fuentes: [Consistencia y estándares de NN/g](https://www.nngroup.com/articles/consistency-and-standards/), [Nombres claros en interfaces de Apple](https://developer.apple.com/videos/play/wwdc2026/290/).

### Arquitectura y navegación

Apple distingue la navegación entre secciones de las acciones que modifican contenido. La barra inferior de Azora contiene cuatro destinos estables, con icono y etiqueta. El botón para crear una cita permanece dentro del contenido de agenda y jornada. Tras la segunda revisión de navegación, en escritorio se retiró la barra lateral: los cuatro destinos se muestran como enlaces horizontales con indicador de sección activa. El nombre de la consulta acompaña la marca y Configuración tiene un único acceso en la cabecera.

En tablet la cabecera se organiza en dos filas para conservar las etiquetas sin ocultarlas en un menú. En móvil permanece la navegación inferior. La agenda aprovecha el ancho liberado y mantiene el detalle seleccionado a la derecha cuando hay espacio; en ventanas estrechas el detalle se presenta debajo. Microsoft contempla la navegación superior para mostrar destinos y dejar más espacio al contenido. Es una referencia de diseño, no un requisito de PWA. La especificación del manifiesto no impone una barra lateral.

La fecha seleccionada, los filtros de agenda y la búsqueda de pacientes se conservan durante la navegación. El detalle de la consulta se mantiene junto a la agenda en escritorio y se vuelve accesible al seleccionar una cita en móvil.

Fuentes: [Tab bars de Apple](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [Patrones de navegación de Microsoft](https://learn.microsoft.com/en-us/windows/apps/design/basics/navigation-basics), [Manifiesto de aplicaciones web de W3C](https://www.w3.org/TR/appmanifest/#display-member).

### Cifras y cuentas

GOV.UK recomienda cifras tabulares para comparar cantidades y alinear a la derecha las columnas numéricas. Azora aplica dígitos de ancho uniforme a horarios, contadores, importes y folios. Los importes mantienen centavos y formato regional mexicano; en los resúmenes se diferencia la jerarquía del símbolo, la cantidad y los centavos.

Cada total define su alcance. Cobrado en el día suma movimientos válidos de la fecha elegida. Pendiente de estas citas suma los saldos de las consultas activas de esa fecha. En Cobros, el importe del mes identifica el mes y año, y el acumulado aclara que excluye anulaciones. No se presentan crecimiento, ocupación ni porcentajes inventados. Los contadores de pacientes y consultas no llevan ceros decorativos.

El detalle de una cuenta separa costo total, dinero recibido y saldo pendiente. El comprobante identifica paciente, servicio, fecha, método, referencia y folio, e indica su naturaleza no fiscal.

Fuentes: [Cifras tabulares de GOV.UK](https://design-system.service.gov.uk/styles/font-override-classes/), [Números en tablas de GOV.UK](https://design-system.service.gov.uk/components/table/).

### Formularios y confirmaciones

Carbon recomienda usar modales con moderación para tareas breves, porque bloquean el trabajo de la página. Azora diferencia la presentación según la tarea: fichas, citas y notas se editan en un panel lateral amplio; un pago usa un cuadro específico con saldo y desglose; el comprobante tiene una composición de recibo. En móvil el panel aprovecha la altura de la pantalla.

Las confirmaciones identifican la acción y sus consecuencias. Cancelar una cita informa sobre el horario liberado y los pagos conservados. Archivar un paciente explica dónde encontrarlo de nuevo. Salir de un formulario con cambios sin guardar requiere una decisión explícita. Las opciones principales no usan un Sí genérico.

Fuente: [Uso de modales en Carbon](https://carbondesignsystem.com/components/modal/usage/).

### Errores y recuperación

GOV.UK recomienda combinar un resumen de errores con mensajes junto a los campos afectados. Azora conserva los valores del formulario, enfoca el resumen y ofrece enlaces a los campos que deben corregirse. Un pago superior al saldo muestra el importe máximo; un cruce de horario señala el campo de inicio. Los campos opcionales se distinguen de los obligatorios.

Fuente: [Resumen de errores de GOV.UK](https://design-system.service.gov.uk/components/error-summary/).

### Listas y expedientes

Carbon sitúa búsqueda, filtros y acciones en la zona de herramientas de las tablas. El directorio de pacientes de Azora permite buscar por nombre, teléfono o correo y muestra contacto, última consulta atendida y cantidad de notas. Los expedientes conservan su historia de consultas y notas. En móvil las filas de tablas se adaptan conservando etiquetas de los campos.

Fuente: [Tablas de datos en Carbon](https://carbondesignsystem.com/components/data-table/usage/).

### Comportamiento PWA

web.dev explica que una PWA debe contemplar ventanas de distinto tamaño, icono, colores de inicio y modos de visualización. Azora utiliza la misma identidad en encabezado, iconos PNG, icono maskable, manifiesto y color de tema. El modo standalone conserva una estructura útil sin depender de la barra del navegador. La barra móvil respeta las zonas seguras del dispositivo.

El estado de guardado diferencia navegador, copia del servidor local y falta de conexión. Abrir ese estado muestra la última copia confirmada y dónde están los datos. No se presenta una conexión de red como prueba de que el respaldo haya terminado. La instalación se ofrece cuando el navegador la permite, mediante una acción del usuario.

Fuentes: [Diseño de aplicaciones PWA de web.dev](https://web.dev/learn/pwa/app-design), [Datos y recursos PWA de web.dev](https://web.dev/learn/pwa/assets-and-data).

### Confianza y accesibilidad

El estudio de NN/g sobre credibilidad relaciona la confianza con calidad visual, transparencia e información actual. Para Azora esto se traduce en estados verificables y límites claros: registro manual de pagos, datos locales, ejemplos identificados como ficticios y ausencia de afirmaciones de seguridad o sincronización en la nube que esta versión no puede respaldar.

WCAG 2.2 establece un mínimo de 24 por 24 píxeles CSS para objetivos de puntero, con excepciones por espacio y equivalencia. Las acciones principales de Azora apuntan a áreas de 40 a 46 píxeles, y la navegación móvil supera esa altura. Se mantienen foco visible, etiquetas y estado textual además del color. El objetivo de contraste es 4.5 a 1 para texto normal y 3 a 1 para texto grande.

Fuentes: [Credibilidad en diseño de NN/g](https://www.nngroup.com/articles/trustworthy-design/), [Tamaño mínimo de objetivo de W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Contraste mínimo de W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Continuidad de datos

El nombre visible cambia a Azora, pero se conservan los identificadores existentes de IndexedDB, localStorage, base SQLite y formato de respaldo para mantener la información previa. La identidad de instalación del manifiesto mantiene su id y alcance. El nombre de la consulta que haya configurado una persona no se reemplaza.

El archivo antes-identidad-azora.zip contiene una copia de las fuentes de interfaz anteriores al rediseño, sin incluir expedientes ni base de datos.

## Alcance de la revisión

Estas decisiones se apoyan en guías públicas y en revisión de la aplicación. No equivalen a una prueba de usabilidad con profesionales ni certifican conformidad completa con WCAG. El siguiente paso de investigación con usuarios sería observar tareas de programación, registro de abonos y recuperación de notas con personas del público objetivo.
