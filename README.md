# JuliDev Dashboard

Panel web multi-servidor (estilo Koya / MEE6) para configurar JuliDev.

## Funciones

- Login con Discord (OAuth2)
- Config por servidor: canales, staff, auto-rol, bienvenida, despedida
- AutoMod, moderación, tickets
- Comandos personalizados (`!trigger`)
- Reaction roles, niveles/XP, economía, starboard
- Logs detallados, auto-respuestas
- Enviar mensajes/embeds como el bot
- Exportar configuración JSON

## Requisitos

- Node.js 18+
- Aplicación en [Discord Developer Portal](https://discord.com/developers/applications)
  - OAuth2 Redirect: la misma `REDIRECT_URI`
  - Bot token
  - Scopes: `identify`, `guilds`

## Instalación

```bash
git clone <tu-repo>
cd juli-dev-dashboard   # o el nombre de la carpeta
cp .env.example .env
# edita .env con tus credenciales
npm install
npm start
```

Abre `http://localhost:3000`.

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `CLIENT_ID` | ID de la aplicación Discord |
| `CLIENT_SECRET` | Secret OAuth2 |
| `BOT_TOKEN` | Token del bot |
| `REDIRECT_URI` | Callback OAuth2 |
| `SESSION_SECRET` | Secreto de sesión Express |
| `PORT` | Puerto (default 3000) |

## Estructura

```
public/          # Frontend (HTML/CSS/JS)
server.js        # API + OAuth + Express
data/guilds/     # Config JSON por servidor (no se sube a git)
```

## Producción (Render / Railway / VPS)

1. Sube el repo a GitHub
2. Conecta el servicio y define las variables de `.env`
3. Build: `npm install`
4. Start: `npm start`
5. Pon la URL pública en `REDIRECT_URI` y en el Discord Developer Portal

## Licencia

Uso privado / del proyecto JuliDev.
