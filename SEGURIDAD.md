# Seguridad y publicación del código

Revisión local · Azora 1.2 · 30 de octubre de 2026.

## Qué protege esta entrega

- `.gitignore` excluye bases SQLite y sus archivos auxiliares, respaldos/exportaciones, variables de entorno privadas, claves, documentos, archivos comprimidos, capturas de trabajo, dependencias y temporales.
- `.env.example` contiene únicamente una plantilla pública sin credenciales. No se carga automáticamente; el servidor lee variables del entorno.
- `npm run security:check` revisa rutas privadas versionadas y patrones comunes de tokens de GitHub, AWS, Google, claves de API y claves privadas. Nunca imprime el valor de una credencial. Es un control básico, no una auditoría completa.
- La verificación preparada para GitHub utiliza acciones oficiales fijadas a commits exactos, permisos de lectura y sin conservar credenciales de checkout ni caché de paquetes. Se verificó la existencia de esas referencias oficiales; la ejecución remota queda pendiente de publicar los cambios.
- La API escucha solo en `127.0.0.1`, valida Host y origen, limita el cuerpo a 5 MB y aplica cabeceras de seguridad. Los archivos se sirven mediante una lista permitida: no se exponen `.git`, `.env`, documentos ni bases.
- La exportación CSV neutraliza fórmulas iniciadas directamente o precedidas por espacios/tabuladores.
- Las citas con notas o pagos no pueden reasignarse a otro paciente desde la aplicación. Los pagos anulados se conservan.

## Resultado de la revisión de este clon

No se detectaron patrones de credenciales en los archivos de texto actuales ni en los blobs de texto del único commit disponible durante la revisión. La base `data/` no estaba versionada.

Se retiraron del índice de Git, **sin borrar las copias locales**, estos siete archivos de trabajo que sí estaban versionados:

- Configuracion_entorno_desarrollo_Ronda_PWA.docx
- Tabla_comparativa_tipos_de_aplicaciones.docx
- antes-identidad-azora.zip
- prototipo-original.zip
- azora-jornada.jpg
- azora-navegacion-horizontal.jpg
- ronda-funcional.jpg

En `git status` aparecerán como eliminaciones preparadas para el siguiente commit; eso se refiere al repositorio, no a tu disco. Su contenido sigue en commits anteriores. No se inspeccionó el interior de binarios/ZIP con el detector de patrones ni referencias remotas ausentes en este clon. Tampoco se cambiaron la visibilidad ni las opciones de seguridad de GitHub.

## Subir esta versión desde tu computadora original

Primero revisa los cambios, especialmente que no aparezcan datos de pacientes ni respaldos:

```powershell
npm.cmd run check
git status --short
git diff --stat
git diff --cached --stat
```

Si todo corresponde a la entrega y quieres publicarlo en tu repositorio:

```powershell
git add -A
git diff --cached --stat
git commit -m "Azora 1.2: correcciones, protección de datos y guía de instalación"
git push
```

No se ejecutaron commit ni push durante esta entrega. Hazlos antes de clonar en la universidad para recibir los cambios nuevos. La carpeta `.github/workflows/` prepara verificaciones para push y pull request; su ejecución remota depende de que GitHub Actions esté habilitado y no se verificó aquí.

## Si ya subiste un secreto o un expediente real

Agregar una regla a `.gitignore` no borra lo publicado ni las versiones anteriores. Si se publicó una contraseña, token o clave, revócalo/rotalo primero en el proveedor. Eliminarlo en el siguiente commit no invalida la credencial.

La limpieza del historial puede requerir reescritura y coordinación con otros clones, forks o cachés. No se hizo automáticamente porque cambia la historia del repositorio y puede afectar a otras personas. Si los documentos, ZIP o capturas anteriores incluyen datos reales privados, hay que evaluar esa limpieza y el manejo de la exposición antes de seguir compartiendo el repositorio.

Referencias: [archivos ignorados de GitHub](https://docs.github.com/en/get-started/git-basics/ignoring-files), [retirar datos sensibles y rotar secretos](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

## No confundir seguridad del repositorio con seguridad clínica

Esta versión **no tiene autenticación ni cifrado de expedientes**. Cualquier persona con acceso al equipo/perfil puede llegar a los datos locales. No la expongas a Internet, no abras puertos del router y no cambies el servidor para escuchar en `0.0.0.0` sin diseñar antes autenticación y protección del transporte.

Usa datos ficticios en la universidad. Para expedientes reales hace falta una fase adicional de control de acceso, cifrado, copias seguras externas y revisión de las obligaciones de protección de datos aplicables.

## Comprobación adicional del historial local

```powershell
node scripts/security-check.mjs --history
```

Los archivos de trabajo antiguos generan avisos: se informa de su presencia, no se eliminan. Esta revisión no sustituye el escaneo de secretos de GitHub ni garantiza ausencia de todo tipo de información sensible. Si tu repositorio tiene disponibles secret scanning y push protection, puedes habilitarlos desde sus opciones de seguridad.
