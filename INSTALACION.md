# Instalar Azora en la computadora de la universidad

Guía para Windows · Azora 1.2 · 30 de octubre de 2026.

Esta versión funciona en tu computadora: no requiere contratar hosting, crear claves de API ni instalar PostgreSQL. El código se descarga de GitHub; los pacientes y cobros se guardan localmente y no viajan con el repositorio.

## 1. Preparar el equipo

Necesitas:

- **Node.js 24.x**, que es la versión usada para probar el proyecto. Descárgalo desde [Node.js](https://nodejs.org/en/download) y selecciona la rama 24. Incluye npm y SQLite; no tienes que instalar SQLite por separado.
- **Git**, desde [Git para Windows](https://git-scm.com/downloads/win).
- Un navegador actualizado, por ejemplo Edge, Chrome o Brave.

Si la universidad no te permite instalar programas, pide ayuda al encargado del laboratorio. No desactives protecciones ni cambies políticas del equipo para saltarte las restricciones. Usa datos ficticios en equipos compartidos.

Después de instalar, cierra y vuelve a abrir PowerShell. Comprueba:

```powershell
node --version
npm.cmd --version
git --version
```

Node debe indicar `v24...`. Si aparece una versión anterior, actualízala antes de continuar.

## 2. Clonar el código

Abre PowerShell en una carpeta donde tengas permiso de escritura (por ejemplo, una carpeta de proyectos dentro de Documentos):

```powershell
git clone https://github.com/AngelHS12-svg/Azora.git
cd Azora
```

Si el repositorio es privado, inicia sesión mediante el mecanismo que ofrece Git/GitHub. No pegues tokens dentro de la URL del repositorio ni en los archivos de la aplicación.

La primera vez tienes que subir a GitHub los cambios de esta entrega desde tu computadora original; de lo contrario, al clonar recibirás la versión anterior. Esta guía no hace commit ni push por ti.

## 3. Verificar y arrancar

```powershell
npm.cmd run check
npm.cmd start
```

No hace falta `npm install`: esta versión no tiene paquetes externos. La verificación ejecuta pruebas de citas, saldos, respaldos y revisión de archivos. Las pruebas usan una base temporal separada.

Cuando aparezca `Azora: http://127.0.0.1:4187/`, abre:

**[http://127.0.0.1:4187/](http://127.0.0.1:4187/)**

Deja PowerShell abierto mientras utilices el respaldo del servidor. Para detenerlo, presiona **Ctrl+C**. La siguiente vez puedes abrir `Iniciar-Azora.cmd` con doble clic o ejecutar nuevamente `npm.cmd start` desde la carpeta del proyecto.

No abras `index.html` con doble clic ni uses Live Server o `python http.server`: no proporcionan la API de respaldo de Azora.

## 4. Primer uso

1. En Configuración, escribe el nombre de tu consulta y el horario de atención.
2. Crea un paciente desde Pacientes.
3. Programa una cita desde Jornada o Agenda.
4. Selecciona la consulta para registrar llegada, añadir una nota o registrar un pago recibido.
5. Comprueba el estado de guardado en la cabecera. Puedes abrirlo para consultar la última copia confirmada.

Los cobros son registros manuales: la aplicación no cobra tarjetas ni transfiere dinero. Para explorar puedes usar los ejemplos ficticios de la bienvenida, disponibles solamente en un espacio vacío.

## 5. Pasar tus registros entre computadoras

Clonar GitHub **no copia tus pacientes ni tus notas**. En la computadora de origen:

1. Abre Configuración → Descargar respaldo JSON.
2. Lleva ese archivo por un medio privado autorizado. No lo subas al repositorio.
3. En la computadora de destino, inicia Azora y abre Configuración → Restaurar respaldo.
4. Selecciona el JSON y revisa la confirmación. La restauración reemplaza el espacio de destino y conserva una copia anterior para recuperación.

No hay sincronización automática entre ambas computadoras. Si trabajas en las dos, acuerda cuál es la copia principal antes de exportar e importar para no reemplazar trabajo más reciente.

Usa siempre `http://127.0.0.1:4187/` y el mismo perfil del navegador. `localhost`, otro puerto y otro perfil tienen almacenamientos de navegador diferentes. Borrar los datos del sitio o usar navegación privada puede eliminar la copia del navegador.

## 6. Datos, instalación PWA y funcionamiento sin conexión

El servidor crea automáticamente `data/ronda.sqlite`. El nombre interno se conserva por compatibilidad; no hace falta renombrarlo. También se utiliza IndexedDB dentro del navegador. Ambos contienen información privada y no están cifrados por Azora.

Abre una vez la aplicación con el servidor funcionando para que se prepare la caché. Después, el mismo navegador puede abrir la interfaz y guardar trabajo local aunque el servidor se detenga; el respaldo de este equipo se retoma cuando el servidor vuelva a estar disponible. No es una copia en la nube ni un respaldo externo.

Cuando el navegador ofrezca instalar Azora, puedes usar su opción de instalación o el botón de la aplicación. Instalarla como PWA no elimina la necesidad de arrancar el servidor para actualizar su respaldo SQLite. La opción y su ubicación dependen del navegador; si no aparece, puedes seguir usándola desde la URL.

## 7. Problemas frecuentes

| Problema | Qué hacer |
| --- | --- |
| `node` o `git` no se reconoce | Instala el programa y vuelve a abrir PowerShell. Si sigue igual, pide ayuda para revisar PATH. |
| PowerShell impide ejecutar `npm.ps1` | Usa `npm.cmd start` o `npm.cmd run check`. No hace falta desactivar la política de ejecución. |
| `node:sqlite` no existe o no se puede cargar | Comprueba `node --version`; usa Node.js 24.x. |
| Aviso `SQLite is an experimental feature` | En la versión de Node utilizada para desarrollo puede aparecer este aviso; por sí solo no indica que Azora falló. Comprueba que se imprimió la URL. |
| `EADDRINUSE` | El puerto 4187 ya está ocupado. Revisa si Azora ya está abierta en otra terminal; utiliza esa instancia o detén la instancia que tú iniciaste. |
| La página no abre | Confirma que el servidor sigue abierto y que usas la URL exacta. Recarga la página. |
| Guardado aquí, copia pendiente | El trabajo sigue en el navegador, pero el servidor no confirmó el respaldo. Inicia el servidor y revisa el estado. Exporta un JSON antes de borrar cualquier dato. |
| Faltan registros después de clonar | Restaura el respaldo JSON; GitHub solo contiene código. Revisa también URL y perfil del navegador. |
| No puedo guardar en la carpeta | Clona en una carpeta personal con permiso de escritura, no dentro de Archivos de programa. |

Si necesitas un puerto distinto, en una terminal nueva:

```powershell
$env:PORT = '4188'
npm.cmd start
```

Abre entonces `http://127.0.0.1:4188/`. Ese origen tiene un almacenamiento de navegador distinto; no lo alternes sin descargar antes un respaldo. Para volver al puerto normal, usa una terminal nueva sin definir PORT.

## 8. Actualizar el código

Antes de actualizar, descarga un respaldo JSON. Detén tu instancia con Ctrl+C y, si no hiciste cambios al código en esa computadora:

```powershell
git pull --ff-only
npm.cmd run check
npm.cmd start
```

Si Git avisa de cambios locales o conflictos, no ejecutes comandos de borrado o reset para resolverlos: conserva tus cambios y revísalos primero. La carpeta `data/` no se elimina al actualizar. La aplicación renueva su caché PWA; recarga después de actualizar.

## 9. Límites de seguridad

Es una primera versión local para demostración y validación: **no cuenta con inicio de sesión ni cifrado de expedientes**. No la expongas a Internet ni a la red de la universidad. No añadas datos clínicos reales en una computadora compartida. Para uso real se requiere una fase adicional de control de acceso, protección de datos y respaldo seguro externo.

Consulta también [SEGURIDAD.md](SEGURIDAD.md) para saber qué no subir a GitHub.
