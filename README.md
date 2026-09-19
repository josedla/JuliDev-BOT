# JuliDev — Panel web

## Configuración

El panel funciona por servidor. Al entrar a un servidor, lee su configuración y permite cambiarla sin afectar a los demás.

### Guardado

El panel **NO tiene guardado automático**.

El funcionamiento es:

1. Cambias canales, roles o funciones.
2. El botón **Guardar cambios** aparece.
3. Puedes seguir haciendo cambios.
4. Solo al pulsar **Guardar cambios** se envía la configuración al servidor.
5. Si recargas sin guardar, los cambios pendientes se pierden.
6. Si guardaste, al volver a entrar se recuperan desde la configuración del servidor.

## Funciones disponibles

- Inicio: miembros, canales y estado del servidor.
- Canales: asigna canales a bienvenida, anuncios, logs, tickets, sugerencias, sorteos, encuestas, staff, multimedia y más.
- Roles Staff: selecciona qué roles pueden utilizar las funciones del bot.
- Auto Rol: rol que recibe un miembro al entrar.
- Bienvenida: texto o embed, color, imagen, miniatura y variables.
- Invitaciones: canal y activación del registro de invitaciones.
- Enviar mensaje: publica mensajes/embeds directamente como el bot.
- Crear cosas: canales, categorías y roles.
- Setup rápido: crea una estructura organizada sin duplicar elementos existentes.
- Moderación: timeout, kick, ban, unban y otras acciones.
- Apps y automatizaciones:
  - AutoMod.
  - Tickets.
  - Sugerencias.
  - Sorteos.
  - Encuestas.
  - Logs.
  - Comandos personalizados.
  - Notificaciones.
- Miembros:
  - Dar/quitar roles.
  - Cambiar apodos.
  - Limpiar mensajes.
  - Bloquear/desbloquear canales.
  - Modo lento.
- Acciones rápidas: anuncios, prueba de logs y sincronización.
- Servidor: estadísticas, exportación y restablecimiento.
- Herramientas: identidad del bot y exportación JSON.

## Variables de bienvenida

- `{user}`
- `{server}`
- `{count}`
- `{inviter}`

## Requisitos

Variables de entorno:

```env
BOT_TOKEN=TU_TOKEN
CLIENT_ID=TU_CLIENT_ID
CLIENT_SECRET=TU_CLIENT_SECRET
REDIRECT_URI=https://TU-DOMINIO/auth/callback
SESSION_SECRET=UNA_CLAVE_LARGA
PORT=10000
```

En producción usa el dominio real del servicio que atiende `/auth/callback`. Ese mismo callback debe estar configurado en Discord Developer Portal.

## Persistencia en Render

Los archivos JSON necesitan almacenamiento persistente si quieres conservarlos después de una recreación completa del servicio. Si tienes un Render Disk, puedes usar:

```env
DATA_DIR=/var/data
```

o configurar `PANEL_CONFIG_DIR` apuntando al directorio persistente que utilices.

## Seguridad

No incluyas `.env`, tokens ni secretos en GitHub o en el ZIP.
