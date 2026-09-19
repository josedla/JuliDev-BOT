# JuliDev Panel KoyaPlus v3

Panel multi-servidor para JuliDev.

## Cambios importantes
- Configuración por servidor con guardado automático.
- Copia local por servidor para evitar perder selecciones al recargar.
- El servidor devuelve la configuración persistida y la recupera automáticamente.
- `DATA_DIR` permite guardar los JSON en un directorio persistente de Render.
- Constructor de servidor con plantillas Comunidad, Gaming y Soporte.
- Las plantillas no duplican canales/roles que ya existen.
- Acciones rápidas: anuncios, prueba de logs y sincronización.
- AutoMod, tickets, sugerencias, sorteos, encuestas, logs y comandos personalizados como módulos configurables.
- Moderación, gestión de miembros, creación de canales/roles y mensajes/embeds.

## Render
Si usas un Render Disk, configura una ruta persistente y añade:

```env
DATA_DIR=/var/data
```

Sin un disco/base de datos persistente, los archivos locales del servidor pueden perderse cuando Render recrea la instancia. La copia local del navegador sí evita perder la configuración al recargar la página en el mismo navegador.

## Comandos
```powershell
npm install
npm start
```
