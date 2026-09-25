require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const BOT_TOKEN = process.env.BOT_TOKEN;
const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;

const GUILDS_DIR = path.join(__dirname, 'data', 'guilds');
fs.mkdirSync(GUILDS_DIR, { recursive: true });

// ─── Config por servidor ─────────────────────────────────────
function configPath(guildId) {
  return path.join(GUILDS_DIR, `${guildId}.json`);
}

function loadGuildConfig(guildId) {
  const p = configPath(guildId);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {}
  }
  return getDefaultConfig();
}

function getDefaultConfig() {
  return {
    channels: {
      bienvenida: '', invitaciones: '', anuncios: '', encuestas: '',
      sorteos: '', chat: '', comandos: '', sugerencias: '',
      ticketsCategory: '', soportePublico: '', baneados: '',
      logs: '', logTickets: '', staffChat: '',
      streaming: '', eventos: '', boosteos: '', multimedia: '', memes: '',
      despedida: '', starboard: '', levelup: '', economia: ''
    },
    staffRoles: [],
    autoRole: { enabled: false, roleId: '' },
    welcome: {
      enabled: true,
      type: 'embed',
      title: '👋 ¡Bienvenido!',
      message: 'Hey {user}, gracias por unirte a **{server}**.\n\n**Contigo somos {count} miembros** 💜\n\n📨 Invitado por: {inviter}',
      color: '#9b59b6',
      image: '',
      thumbnail: ''
    },
    invites: { enabled: true },
    botName: 'JuliDev',
    // ── AutoMod ──────────────────────────────────────
    automod: {
      enabled: false,
      // Anti-spam
      spam: {
        enabled: false,
        maxMessages: 5,       // mensajes
        interval: 5,          // segundos
        action: 'timeout',    // delete | timeout | kick | warn
        timeoutMinutes: 5
      },
      // Anti-links
      links: {
        enabled: false,
        action: 'delete',     // delete | timeout | warn
        timeoutMinutes: 5,
        whitelist: []         // dominios permitidos
      },
      // Palabras prohibidas
      words: {
        enabled: false,
        list: [],
        action: 'delete',
        timeoutMinutes: 10
      },
      // Mass mentions
      mentions: {
        enabled: false,
        maxMentions: 5,
        action: 'timeout',
        timeoutMinutes: 10
      },
      // Caps lock excesivo
      caps: {
        enabled: false,
        percent: 70,          // % de mayúsculas
        minLength: 10,
        action: 'delete'
      },
      // Invites de otros servidores
      invites: {
        enabled: false,
        action: 'delete'
      },
      log: true               // registrar en canal de logs
    },
    // ── Moderación ───────────────────────────────────
    moderation: {
      dmOnAction: true,
      defaultReason: 'Incumplimiento de las reglas del servidor.',
      logActions: true,
      warnExpireDays: 30,
      maxWarnsBeforeKick: 3,
      maxWarnsBeforeBan: 5
    },
    // ── Despedida ────────────────────────────────────
    leave: {
      enabled: false,
      type: 'embed',
      title: '👋 Adiós',
      message: '{user} ha salido de **{server}**. Ahora somos {count} miembros.',
      color: '#ed4245',
      channel: ''  // si vacío usa canal de bienvenida
    },
    // ── Comandos personalizados (!trigger) ───────────
    customCommands: [],
    // ── Reaction roles ───────────────────────────────
    reactionRoles: [],
    // ── Niveles / XP ─────────────────────────────────
    levels: {
      enabled: false,
      xpMin: 15,
      xpMax: 25,
      cooldownSeconds: 60,
      announceLevelUp: true,
      levelUpChannel: '',
      levelUpMessage: '🎉 {user} subió a nivel **{level}**!',
      stackRoles: true,
      roles: []  // [{ level: 5, roleId: '...' }, ...]
    },
    // ── Economía ──────────────────────────────────────
    economy: {
      enabled: false,
      currency: 'monedas',
      dailyMin: 100,
      dailyMax: 300,
      workMin: 50,
      workMax: 150,
      workCooldownMinutes: 30,
      startBalance: 0
    },
    // ── Starboard ────────────────────────────────────
    starboard: {
      enabled: false,
      channel: '',
      emoji: '⭐',
      minStars: 3,
      selfStar: false
    },
    // ── Tickets (opciones extra) ─────────────────────
    tickets: {
      maxOpen: 3,
      supportRoles: [],
      welcomeMessage: 'Gracias por abrir un ticket. El staff te atenderá pronto.',
      closeOnLeave: false
    },
    // ── Logs detallados ──────────────────────────────
    logging: {
      messageDelete: true,
      messageEdit: true,
      memberJoin: true,
      memberLeave: true,
      memberRoles: true,
      bans: true,
      channels: true,
      roles: true,
      voice: false,
      nicknames: true
    },
    // ── Auto-respuestas (palabra clave → respuesta) ──
    autoReplies: []
  };
}

function saveGuildConfig(guildId, cfg) {
  const target = configPath(guildId);
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(cfg, null, 2), 'utf8');
  fs.renameSync(temp, target);
  // Copia opcional para que el bot lea la misma config
  const syncDir = process.env.BOT_CONFIG_DIR;
  if (syncDir) {
    try {
      fs.mkdirSync(syncDir, { recursive: true });
      fs.writeFileSync(path.join(syncDir, `${guildId}.json`), JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {
      console.error('[sync bot config]', e.message);
    }
  }
}

// ─── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Detrás de Render/Railway/Nginx hace falta confiar en el proxy para cookies seguras
app.set('trust proxy', 1);

const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || !!process.env.RAILWAY_ENVIRONMENT;
app.use(session({
  secret: process.env.SESSION_SECRET || 'julidev-panel-secret-cambia-esto',
  resave: false,
  saveUninitialized: false,
  name: 'julidev.sid',
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    // En HTTPS (Render) debe ser true; en localhost false
    secure: isProd || (process.env.COOKIE_SECURE === 'true')
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });
  next();
}

function ensureGuildAdmin(req, guildId) {
  const guilds = req.session.userGuilds || [];
  const g = guilds.find(x => x.id === guildId);
  if (!g) return false;
  try { return !!g.owner || ((BigInt(g.permissions || '0') & 8n) === 8n); }
  catch (_) { return !!g.owner; }
}

async function discordApi(pathname, options = {}) {
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN no configurado');
  const headers = {
    Authorization: `Bot ${BOT_TOKEN}`,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const r = await fetch(`https://discord.com/api/v10${pathname}`, { ...options, headers });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!r.ok) {
    const msg = typeof data === 'string' ? data : (data?.message || `Discord API ${r.status}`);
    const err = new Error(msg);
    err.status = r.status;
    err.discord = data;
    throw err;
  }
  return data;
}

function adminGuild(req, res, guildId) {
  if (!ensureGuildAdmin(req, guildId)) {
    res.status(403).json({ error: 'No tienes permisos de administrador en este servidor.' });
    return false;
  }
  return true;
}

// ─── OAuth Discord ───────────────────────────────────────────
app.get('/auth/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds'
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  const oauthErr = req.query.error;
  if (oauthErr) {
    console.error('[OAuth] Discord denied:', oauthErr, req.query.error_description);
    return res.redirect('/?error=denied');
  }
  if (!code) return res.redirect('/?error=no_code');

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('[OAuth] Falta CLIENT_ID o CLIENT_SECRET en .env');
    return res.redirect('/?error=config');
  }

  try {
    console.log('[OAuth] Intercambiando code… redirect_uri=', REDIRECT_URI);
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: REDIRECT_URI
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('[OAuth] Token error:', JSON.stringify(tokenData));
      // invalid_grant suele ser redirect_uri distinto al del portal
      const why = tokenData.error || 'token';
      return res.redirect('/?error=' + encodeURIComponent(why));
    }

    const [userRes, guildsRes] = await Promise.all([
      fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      }),
      fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      })
    ]);

    const user = await userRes.json();
    const guilds = await guildsRes.json();

    if (!user || !user.id) {
      console.error('[OAuth] User fetch failed:', user);
      return res.redirect('/?error=user');
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
      avatar: user.avatar
    };
    req.session.accessToken = tokenData.access_token;
    req.session.userGuilds = Array.isArray(guilds) ? guilds : [];

    req.session.save(err => {
      if (err) {
        console.error('[OAuth] Session save error:', err);
        return res.redirect('/?error=session');
      }
      console.log('[OAuth] OK user=', user.username, 'guilds=', req.session.userGuilds.length);
      res.redirect('/servers');
    });
  } catch (e) {
    console.error('[OAuth] Exception:', e);
    res.redirect('/?error=oauth');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ─── API ─────────────────────────────────────────────────────
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });
  res.json({
    loggedIn: true,
    user: req.session.user,
    inviteUrl: INVITE_URL
  });
});

// Servidores donde el usuario es admin Y el bot está presente
app.get('/api/servers', requireAuth, async (req, res) => {
  try {
    const userGuilds = req.session.userGuilds || [];

    // Solo donde el usuario tiene ADMINISTRATOR (0x8) o es owner
    const adminGuilds = userGuilds.filter(g => {
      try {
        return g.owner || ((BigInt(g.permissions) & 8n) === 8n);
      } catch (_) {
        return !!g.owner;
      }
    });

    if (!BOT_TOKEN) {
      console.warn('[servers] BOT_TOKEN no configurado en el .env del panel');
      return res.json({
        servers: adminGuilds.map(g => ({
          id: g.id, name: g.name, icon: g.icon, owner: g.owner, botIn: false
        })),
        inviteUrl: INVITE_URL,
        warning: 'Falta BOT_TOKEN en el .env del panel. Sin él no se puede detectar si el bot está en el servidor.'
      });
    }

    // Comprobar servidor por servidor si el bot está dentro (más fiable)
    const servers = [];
    for (const g of adminGuilds) {
      let botIn = false;
      try {
        const r = await fetch(`https://discord.com/api/v10/guilds/${g.id}`, {
          headers: { Authorization: `Bot ${BOT_TOKEN}` }
        });
        botIn = r.ok; // 200 = bot está en el server; 403/404 = no
        if (!r.ok && r.status !== 403 && r.status !== 404) {
          const t = await r.text();
          console.warn(`[servers] guild ${g.name} (${g.id}): ${r.status} ${t}`);
        }
      } catch (e) {
        console.error(`[servers] error ${g.id}:`, e.message);
      }
      servers.push({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: g.owner,
        botIn
      });
    }

    servers.sort((a, b) => (b.botIn ? 1 : 0) - (a.botIn ? 1 : 0) || a.name.localeCompare(b.name));

    res.json({ servers, inviteUrl: INVITE_URL });
  } catch (e) {
    console.error('[servers]', e);
    res.status(500).json({ error: e.message });
  }
});

// Info de un guild
app.get('/api/guild/:id', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!BOT_TOKEN) return res.status(400).json({ error: 'BOT_TOKEN no configurado' });

  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Bot no está en ese servidor o sin permisos' });
    const g = await r.json();
    res.json({
      id: g.id,
      name: g.name,
      icon: g.icon,
      memberCount: g.approximate_member_count,
      onlineCount: g.approximate_presence_count
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/guild/:id/channels', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const channels = await r.json();
    const filtered = channels
      .filter(c => [0, 4, 5].includes(c.type))
      .map(c => ({ id: c.id, name: c.name, type: c.type, parent_id: c.parent_id, position: c.position }))
      .sort((a, b) => a.position - b.position);
    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/guild/:id/roles', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const roles = await r.json();
    res.json(
      roles
        .filter(r => r.name !== '@everyone')
        .map(r => ({ id: r.id, name: r.name, color: r.color, position: r.position }))
        .sort((a, b) => b.position - a.position)
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ─── Herramientas del panel ──────────────────────────────────
// Crear canal
app.post('/api/guild/:id/channels/create', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  const { name, type = 0, parentId = '', topic = '', nsfw = false } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Escribe un nombre.' });
  if (![0, 4, 5].includes(Number(type))) return res.status(400).json({ error: 'Tipo de canal no permitido.' });
  try {
    const body = { name: String(name).trim().slice(0, 100), type: Number(type) };
    if (parentId) body.parent_id = parentId;
    if (Number(type) === 0 || Number(type) === 5) {
      if (topic) body.topic = String(topic).slice(0, 1024);
      body.nsfw = !!nsfw;
    }
    const ch = await discordApi(`/guilds/${guildId}/channels`, { method: 'POST', body: JSON.stringify(body) });
    res.json({ success: true, channel: { id: ch.id, name: ch.name, type: ch.type, parent_id: ch.parent_id || null } });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Crear rol
app.post('/api/guild/:id/roles/create', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  const { name, color = 0, hoist = false, mentionable = false } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Escribe un nombre.' });
  try {
    const body = {
      name: String(name).trim().slice(0, 100),
      color: Math.max(0, Math.min(0xFFFFFF, parseInt(String(color).replace('#',''), 16) || 0)),
      hoist: !!hoist,
      mentionable: !!mentionable
    };
    const role = await discordApi(`/guilds/${guildId}/roles`, { method: 'POST', body: JSON.stringify(body) });
    res.json({ success: true, role: { id: role.id, name: role.name, color: role.color, position: role.position } });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Crear un pack inicial completo
app.post('/api/guild/:id/setup-pack', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  const pack = {
    roles: ['Owner','Admin','Staff','Mod','Helper','Miembro'],
    categories: [
      { name: '📌 INFORMACIÓN', channels: ['📢・anuncios','📜・reglas','👋・bienvenida','📌・información'] },
      { name: '💬 COMUNIDAD', channels: ['💬・general','🤖・comandos','💡・sugerencias','📸・media','🎉・sorteos','📊・encuestas'] },
      { name: '🎫 SOPORTE', channels: ['🎫・soporte','🎟️・tickets'] },
      { name: '🛡️ STAFF', channels: ['💬・staff','📋・logs','🚨・reportes'] }
    ]
  };
  const created = { roles: [], categories: [], channels: [] };
  try {
    for (const roleName of pack.roles) {
      const role = await discordApi(`/guilds/${guildId}/roles`, {
        method: 'POST', body: JSON.stringify({ name: roleName, color: 0x9B59B6, mentionable: true })
      });
      created.roles.push({ id: role.id, name: role.name });
    }
    for (const cat of pack.categories) {
      const category = await discordApi(`/guilds/${guildId}/channels`, {
        method: 'POST', body: JSON.stringify({ name: cat.name, type: 4 })
      });
      created.categories.push({ id: category.id, name: category.name });
      for (const channelName of cat.channels) {
        const ch = await discordApi(`/guilds/${guildId}/channels`, {
          method: 'POST', body: JSON.stringify({ name: channelName, type: 0, parent_id: category.id })
        });
        created.channels.push({ id: ch.id, name: ch.name, parent_id: category.id });
      }
    }
    const cfg = loadGuildConfig(guildId);
    const find = (needle) => created.channels.find(c => c.name.includes(needle))?.id || '';
    const findCategory = (needle) => created.categories.find(c => c.name.includes(needle))?.id || '';
    cfg.channels = {
      ...cfg.channels,
      anuncios: find('anuncios'),
      bienvenida: find('bienvenida'),
      chat: find('general'),
      comandos: find('comandos'),
      sugerencias: find('sugerencias'),
      sorteos: find('sorteos'),
      encuestas: find('encuestas'),
      logs: find('logs'),
      logTickets: find('logs'),
      ticketsCategory: findCategory('SOPORTE'),
      soportePublico: find('soporte'),
      staffChat: find('staff')
    };
    cfg.staffRoles = created.roles.filter(r => ['Owner','Admin','Staff','Mod','Helper'].includes(r.name)).map(r => r.id);
    saveGuildConfig(guildId, cfg);
    const sync = await syncConfigToBot(guildId, cfg);
    res.json({ success: true, created, sync });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, created });
  }
});

// Acción de moderación individual desde el panel
app.post('/api/guild/:id/moderation', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  const { action, userId, reason = '' } = req.body || {};
  if (!/^\d{17,20}$/.test(String(userId || ''))) return res.status(400).json({ error: 'ID de usuario inválido.' });
  try {
    let result;
    if (action === 'kick') {
      result = await discordApi(`/guilds/${guildId}/members/${userId}`, {
        method: 'DELETE',
        body: JSON.stringify({})
      });
    } else if (action === 'ban') {
      result = await discordApi(`/guilds/${guildId}/bans/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ delete_message_seconds: 0, reason: String(reason).slice(0, 512) })
      });
    } else if (action === 'unban') {
      result = await discordApi(`/guilds/${guildId}/bans/${userId}`, {
        method: 'DELETE',
        body: JSON.stringify({})
      });
    } else if (action === 'timeout') {
      const until = new Date(Date.now() + Math.max(1, Math.min(28 * 24 * 60, Number(req.body.minutes) || 10)) * 60000).toISOString();
      result = await discordApi(`/guilds/${guildId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ communication_disabled_until: until })
      });
    } else if (action === 'untimeout') {
      result = await discordApi(`/guilds/${guildId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ communication_disabled_until: null })
      });
    } else {
      return res.status(400).json({ error: 'Acción no válida.' });
    }
    res.json({ success: true, result });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Eliminar un canal creado por el usuario desde el panel
app.delete('/api/guild/:id/channels/:channelId', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  try {
    await discordApi(`/channels/${req.params.channelId}`, { method: 'DELETE' });
    res.json({ success: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Eliminar un rol desde el panel
app.delete('/api/guild/:id/roles/:roleId', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  try {
    await discordApi(`/guilds/${guildId}/roles/${req.params.roleId}`, { method: 'DELETE' });
    res.json({ success: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Guardar nombre del bot en la configuración del servidor
app.post('/api/guild/:id/bot-settings', requireAuth, (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  const cfg = loadGuildConfig(guildId);
  cfg.botName = String(req.body?.botName || 'JuliDev').slice(0, 80);
  saveGuildConfig(guildId, cfg);
  res.json({ success: true, botName: cfg.botName });
});

async function syncConfigToBot(guildId, cfg) {
  if (!process.env.BOT_SYNC_URL) return true;
  try {
    const r = await fetch(`${process.env.BOT_SYNC_URL.replace(/\/$/, '')}/internal/panel-config/${guildId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.PANEL_SYNC_SECRET ? { 'Authorization': `Bearer ${process.env.PANEL_SYNC_SECRET}` } : {})
      },
      body: JSON.stringify(cfg)
    });
    if (!r.ok) {
      console.error('[sync bot config]', await r.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[sync bot config]', e.message);
    return false;
  }
}

// ── El BOT puede enviar config aquí (después de /setup) ─────
// POST /internal/bot-config/:guildId
// Header: Authorization: Bearer PANEL_SYNC_SECRET
app.post('/internal/bot-config/:guildId', express.json({ limit: '1mb' }), (req, res) => {
  const secret = process.env.PANEL_SYNC_SECRET || '';
  const auth = String(req.headers.authorization || '');
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const guildId = req.params.guildId;
  if (!/^\d{17,20}$/.test(guildId)) {
    return res.status(400).json({ error: 'guildId inválido' });
  }
  try {
    const current = loadGuildConfig(guildId);
    const body = req.body || {};
    const updated = {
      ...current,
      ...body,
      channels: { ...(current.channels || {}), ...(body.channels || {}) },
      staffRoles: Array.isArray(body.staffRoles) ? body.staffRoles : (current.staffRoles || []),
      roles: { ...(current.roles || {}), ...(body.roles || {}) },
      categories: { ...(current.categories || {}), ...(body.categories || {}) },
      autoRole: body.autoRole !== undefined ? body.autoRole : current.autoRole,
      welcome: body.welcome !== undefined ? { ...current.welcome, ...body.welcome } : current.welcome
    };
    saveGuildConfig(guildId, updated);
    console.log(`[bot→panel] Config recibida de /setup para guild ${guildId}`);
    res.json({ success: true, guildId });
  } catch (e) {
    console.error('[bot→panel]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Config del servidor
app.get('/api/guild/:id/config', requireAuth, (req, res) => {
  if (!adminGuild(req, res, req.params.id)) return;
  res.json(loadGuildConfig(req.params.id));
});

app.post('/api/guild/:id/config', requireAuth, async (req, res) => {
  if (!adminGuild(req, res, req.params.id)) return;
  try {
    const current = loadGuildConfig(req.params.id);
    const updated = {
      ...current,
      ...req.body,
      channels: { ...current.channels, ...(req.body.channels || {}) },
      staffRoles: req.body.staffRoles !== undefined ? req.body.staffRoles : current.staffRoles,
      autoRole: req.body.autoRole !== undefined ? req.body.autoRole : current.autoRole,
      welcome: req.body.welcome !== undefined ? { ...current.welcome, ...req.body.welcome } : current.welcome,
      invites: req.body.invites !== undefined ? { ...current.invites, ...req.body.invites } : current.invites,
      leave: req.body.leave !== undefined ? { ...(current.leave || {}), ...req.body.leave } : current.leave,
      automod: req.body.automod !== undefined ? { ...(current.automod || {}), ...req.body.automod } : current.automod,
      moderation: req.body.moderation !== undefined ? { ...(current.moderation || {}), ...req.body.moderation } : current.moderation,
      levels: req.body.levels !== undefined ? { ...(current.levels || {}), ...req.body.levels } : current.levels,
      economy: req.body.economy !== undefined ? { ...(current.economy || {}), ...req.body.economy } : current.economy,
      starboard: req.body.starboard !== undefined ? { ...(current.starboard || {}), ...req.body.starboard } : current.starboard,
      tickets: req.body.tickets !== undefined ? { ...(current.tickets || {}), ...req.body.tickets } : current.tickets,
      logging: req.body.logging !== undefined ? { ...(current.logging || {}), ...req.body.logging } : current.logging,
      customCommands: req.body.customCommands !== undefined ? req.body.customCommands : current.customCommands,
      reactionRoles: req.body.reactionRoles !== undefined ? req.body.reactionRoles : current.reactionRoles,
      autoReplies: req.body.autoReplies !== undefined ? req.body.autoReplies : current.autoReplies
    };
    saveGuildConfig(req.params.id, updated);

    // Si panel y bot están en servicios distintos (Render), sincroniza la config
    // inmediatamente al bot. Si BOT_CONFIG_DIR está configurado, saveGuildConfig
    // ya hizo la copia local y no necesitamos esta llamada.
    const sync = await syncConfigToBot(req.params.id, updated);
    res.json({ success: true, config: updated, sync });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/guild/:id/export', requireAuth, (req, res) => {
  const cfg = loadGuildConfig(req.params.id);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=config-${req.params.id}.json`);
  res.json(cfg);
});



// Probar bienvenida en un canal
app.post('/api/guild/:id/test-welcome', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  const { channelId } = req.body || {};
  if (!BOT_TOKEN) return res.status(400).json({ error: 'BOT_TOKEN no configurado' });
  const cfg = loadGuildConfig(guildId);
  const ch = channelId || cfg.channels?.bienvenida;
  if (!ch) return res.status(400).json({ error: 'Configura el canal de bienvenida o indica uno' });

  const welcome = cfg.welcome || {};
  const user = req.session.user;
  const mention = user ? `<@${user.id}>` : '@Usuario';
  const guildName = (await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` }
  }).then(r => r.ok ? r.json() : null).catch(() => null))?.name || 'Servidor';

  let text = welcome.message || `Hey {user}, gracias por unirte.\n\n**Contigo somos {count} miembros** 💜\n\n📨 Invitado por: {inviter}`;
  text = text
    .replace(/\{user\}/gi, mention)
    .replace(/\{server\}/gi, guildName)
    .replace(/\{count\}/gi, '999')
    .replace(/\{inviter\}/gi, 'Prueba');

  const body = {};
  if ((welcome.type || 'embed') === 'text') {
    body.content = text.slice(0, 2000);
  } else {
    body.content = mention;
    body.embeds = [{
      title: (welcome.title || '👋 ¡Bienvenido!').replace(/\{server\}/gi, guildName).replace(/\{user\}/gi, user?.username || 'Usuario'),
      description: text.slice(0, 4096),
      color: welcome.color ? parseInt(String(welcome.color).replace('#', ''), 16) : 0x9B59B6,
      image: welcome.image ? { url: welcome.image } : undefined,
      thumbnail: welcome.thumbnail ? { url: welcome.thumbnail } : undefined,
      footer: { text: `JuliDev • ${guildName}` }
    }];
  }

  try {
    const r = await fetch(`https://discord.com/api/v10/channels/${ch}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Enviar mensaje como el bot
app.post('/api/guild/:id/send', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  const { channelId, content, embedTitle, embedDescription, embedColor, embedImage, embedThumbnail } = req.body || {};
  if (!BOT_TOKEN) return res.status(400).json({ error: 'BOT_TOKEN no configurado' });
  if (!channelId) return res.status(400).json({ error: 'Elige un canal' });
  if (!content && !embedTitle && !embedDescription) {
    return res.status(400).json({ error: 'Escribe un mensaje o un embed' });
  }
  try {
    const body = {};
    if (content) body.content = content.slice(0, 2000);
    if (embedTitle || embedDescription || embedImage) {
      body.embeds = [{
        title: embedTitle || undefined,
        description: embedDescription || undefined,
        color: embedColor ? parseInt(String(embedColor).replace('#', ''), 16) : 0x9B59B6,
        image: embedImage ? { url: embedImage } : undefined,
        thumbnail: embedThumbnail ? { url: embedThumbnail } : undefined
      }];
    }
    const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }
    const msg = await r.json();
    res.json({ success: true, messageId: msg.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


app.get('/api/invite', (req, res) => {
  res.json({ url: INVITE_URL, clientId: CLIENT_ID });
});

app.get('/api/guild/:id/stats', requireAuth, async (req, res) => {
  if (!adminGuild(req, res, req.params.id)) return;
  const guildId = req.params.id;
  try {
    const g = await discordApi(`/guilds/${guildId}?with_counts=true`);
    const channels = await discordApi(`/guilds/${guildId}/channels`).catch(() => []);
    const roles = await discordApi(`/guilds/${guildId}/roles`).catch(() => []);
    const cfg = loadGuildConfig(guildId);
    res.json({
      name: g.name,
      memberCount: g.approximate_member_count || g.member_count || 0,
      channels: Array.isArray(channels) ? channels.length : 0,
      roles: Array.isArray(roles) ? roles.length : 0,
      features: {
        welcome: !!(cfg.welcome?.enabled),
        leave: !!(cfg.leave?.enabled),
        automod: !!(cfg.automod?.enabled),
        levels: !!(cfg.levels?.enabled),
        economy: !!(cfg.economy?.enabled),
        starboard: !!(cfg.starboard?.enabled),
        customCommands: (cfg.customCommands || []).length,
        reactionRoles: (cfg.reactionRoles || []).length,
        autoReplies: (cfg.autoReplies || []).length
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Páginas ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/servers', (req, res) => {
  if (!req.session.user) {
    console.warn('[servers] Sin sesión → reenviando a login');
    return res.redirect('/auth/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'servers.html'));
});

// Debug rápido (quítalo en prod si quieres)
app.get('/api/debug/session', (req, res) => {
  res.json({
    hasUser: !!req.session?.user,
    user: req.session?.user || null,
    guilds: (req.session?.userGuilds || []).length,
    redirectUri: REDIRECT_URI,
    hasClientId: !!CLIENT_ID,
    hasSecret: !!CLIENT_SECRET,
    hasBotToken: !!BOT_TOKEN
  });
});

app.get('/panel/:guildId', (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  res.sendFile(path.join(__dirname, 'public', 'panel.html'));
});

app.listen(PORT, () => {
  console.log(`\n💜 JuliDev Dashboard → http://localhost:${PORT}`);
  console.log(`   Invite bot: ${INVITE_URL}\n`);
  if (!CLIENT_SECRET) console.warn('⚠️  Falta CLIENT_SECRET en .env');
  if (!BOT_TOKEN) console.warn('⚠️  Falta BOT_TOKEN en .env');
});
