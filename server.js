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

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const GUILDS_DIR = path.join(DATA_DIR, 'guilds');
fs.mkdirSync(GUILDS_DIR, { recursive: true });

// ─── Config por servidor ─────────────────────────────────────
function configPath(guildId) {
  return path.join(GUILDS_DIR, `${guildId}.json`);
}

function baseGuildConfig() {
  return {
    version: 3,
    channels: {
      bienvenida: '', invitaciones: '', anuncios: '', encuestas: '', sorteos: '', chat: '', comandos: '', sugerencias: '',
      ticketsCategory: '', soportePublico: '', baneados: '', logs: '', logTickets: '', staffChat: ''
    },
    staffRoles: [],
    autoRole: { enabled: false, roleId: '' },
    welcome: { enabled: true, type: 'embed', message: 'Hey {user}, bienvenido a **{server}**!\nContigo somos **{count}** miembros.\nInvitado por: {inviter}', title: '¡Bienvenido!', color: '#9b59b6', image: '', thumbnail: '' },
    invites: { enabled: true },
    botName: 'JuliDev',
    automod: { enabled: false, spam: 'off', links: 'allow', words: [] },
    tickets: { enabled: false, category: '', logChannel: '', message: '🎫 Abre un ticket para recibir ayuda.' },
    suggestions: { enabled: true, channel: '', logChannel: '' },
    giveaways: { channel: '', duration: '1h', winners: 1 },
    polls: { channel: '', multi: false },
    logs: { channel: '', messages: false, moderation: true, server: true },
    notifications: { channel: '', enabled: false },
    customCommands: []
  };
}

function loadGuildConfig(guildId) {
  const defaults = baseGuildConfig();
  const p = configPath(guildId);
  let saved = {};
  if (fs.existsSync(p)) {
    try { saved = JSON.parse(fs.readFileSync(p, 'utf8')) || {}; } catch (_) { saved = {}; }
  }
  return {
    ...defaults, ...saved,
    channels: { ...defaults.channels, ...(saved.channels || {}) },
    autoRole: { ...defaults.autoRole, ...(saved.autoRole || {}) },
    welcome: { ...defaults.welcome, ...(saved.welcome || {}) },
    invites: { ...defaults.invites, ...(saved.invites || {}) },
    automod: { ...defaults.automod, ...(saved.automod || {}) },
    tickets: { ...defaults.tickets, ...(saved.tickets || {}) },
    suggestions: { ...defaults.suggestions, ...(saved.suggestions || {}) },
    giveaways: { ...defaults.giveaways, ...(saved.giveaways || {}) },
    polls: { ...defaults.polls, ...(saved.polls || {}) },
    logs: { ...defaults.logs, ...(saved.logs || {}) },
    notifications: { ...defaults.notifications, ...(saved.notifications || {}) },
    staffRoles: Array.isArray(saved.staffRoles) ? saved.staffRoles : defaults.staffRoles,
    customCommands: Array.isArray(saved.customCommands) ? saved.customCommands : defaults.customCommands
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
app.use(session({
  secret: process.env.SESSION_SECRET || 'julidev-panel-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: false // true solo si usas HTTPS
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

function defaultGuildConfig() {
  return loadGuildConfig('__default__');
}

function cleanWords(value) {
  if (Array.isArray(value)) return value.map(String).map(x => x.trim()).filter(Boolean).slice(0, 200);
  return String(value || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 200);
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
  if (!code) return res.redirect('/?error=no_code');

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Token error:', tokenData);
      return res.redirect('/?error=token');
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

    req.session.user = {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
      avatar: user.avatar
    };
    req.session.accessToken = tokenData.access_token;
    req.session.userGuilds = Array.isArray(guilds) ? guilds : [];

    // Asegurar que la sesión se guarda antes del redirect
    req.session.save(err => {
      if (err) console.error('Session save error:', err);
      res.redirect('/servers');
    });
  } catch (e) {
    console.error('OAuth:', e);
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

// Crear una estructura inicial completa, con plantillas y sin duplicar nombres existentes.
app.post('/api/guild/:id/setup-pack', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  const template = String(req.body?.template || 'community');
  const templates = {
    community: {
      roles: ['Owner','Admin','Staff','Mod','Helper','Miembro'],
      categories: [
        { name: '📌 INFORMACIÓN', channels: ['📢・anuncios','📜・reglas','👋・bienvenida','📌・información'] },
        { name: '💬 COMUNIDAD', channels: ['💬・general','🤖・comandos','💡・sugerencias','📸・media','🎉・sorteos','📊・encuestas'] },
        { name: '🎫 SOPORTE', channels: ['🎫・soporte','🎟️・tickets'] },
        { name: '🛡️ STAFF', channels: ['💬・staff','📋・logs','🚨・reportes'] }
      ]
    },
    gaming: {
      roles: ['Owner','Admin','Moderador','Helper','Creador','Miembro'],
      categories: [
        { name: '📌 INFORMACIÓN', channels: ['📢・anuncios','📜・reglas','👋・bienvenida'] },
        { name: '🎮 GAMING', channels: ['💬・general','🎮・juegos','🏆・eventos','📸・clips','🤖・comandos'] },
        { name: '🎫 SOPORTE', channels: ['🎫・tickets','💡・sugerencias'] },
        { name: '🛡️ STAFF', channels: ['📋・logs','💬・staff'] }
      ]
    },
    support: {
      roles: ['Owner','Admin','Soporte','Moderador','Miembro'],
      categories: [
        { name: '📌 INFORMACIÓN', channels: ['📢・anuncios','📜・reglas','👋・bienvenida'] },
        { name: '🎫 SOPORTE', channels: ['🎫・soporte','🎟️・tickets','💡・sugerencias'] },
        { name: '🛡️ STAFF', channels: ['📋・logs','💬・staff','🚨・reportes'] }
      ]
    }
  };
  const pack = templates[template] || templates.community;
  const created = { roles: [], categories: [], channels: [], skipped: [] };
  try {
    const existingChannels = await discordApi(`/guilds/${guildId}/channels`);
    const existingRoles = await discordApi(`/guilds/${guildId}/roles`);
    const channelByName = new Map(existingChannels.map(c => [c.name.toLowerCase(), c]));
    const roleByName = new Map(existingRoles.map(r => [r.name.toLowerCase(), r]));

    for (const roleName of pack.roles) {
      if (roleByName.has(roleName.toLowerCase())) { created.skipped.push(`rol:${roleName}`); continue; }
      const role = await discordApi(`/guilds/${guildId}/roles`, {
        method: 'POST', body: JSON.stringify({ name: roleName, color: 0x9B59B6, mentionable: true })
      });
      created.roles.push({ id: role.id, name: role.name });
      roleByName.set(role.name.toLowerCase(), role);
    }
    for (const cat of pack.categories) {
      let category = channelByName.get(cat.name.toLowerCase());
      if (!category) {
        category = await discordApi(`/guilds/${guildId}/channels`, { method: 'POST', body: JSON.stringify({ name: cat.name, type: 4 }) });
        created.categories.push({ id: category.id, name: category.name });
        channelByName.set(category.name.toLowerCase(), category);
      } else {
        created.skipped.push(`categoría:${cat.name}`);
      }
      for (const channelName of cat.channels) {
        if (channelByName.has(channelName.toLowerCase())) { created.skipped.push(`canal:${channelName}`); continue; }
        const ch = await discordApi(`/guilds/${guildId}/channels`, {
          method: 'POST', body: JSON.stringify({ name: channelName, type: 0, parent_id: category.id })
        });
        created.channels.push({ id: ch.id, name: ch.name, parent_id: category.id });
        channelByName.set(ch.name.toLowerCase(), ch);
      }
    }
    const cfg = loadGuildConfig(guildId);
    const allChannels = [...existingChannels, ...created.channels, ...created.categories];
    const find = (needle) => allChannels.find(c => String(c.name).toLowerCase().includes(needle))?.id || '';
    cfg.channels = {
      ...cfg.channels,
      anuncios: find('anuncios') || cfg.channels.anuncios,
      bienvenida: find('bienvenida') || cfg.channels.bienvenida,
      chat: find('general') || cfg.channels.chat,
      comandos: find('comandos') || cfg.channels.comandos,
      sugerencias: find('sugerencias') || cfg.channels.sugerencias,
      sorteos: find('sorteos') || cfg.channels.sorteos,
      encuestas: find('encuestas') || cfg.channels.encuestas,
      logs: find('logs') || cfg.channels.logs,
      soportePublico: find('soporte') || cfg.channels.soportePublico,
      ticketsCategory: allChannels.find(c => c.type === 4 && String(c.name).toLowerCase().includes('soporte'))?.id || cfg.channels.ticketsCategory,
      staffChat: find('staff') || cfg.channels.staffChat
    };
    const wantedRoles = new Set(pack.roles.filter(x => x !== 'Miembro'));
    cfg.staffRoles = [...new Set([...cfg.staffRoles, ...allRoles(existingRoles, created.roles).filter(r => wantedRoles.has(r.name)).map(r => r.id)])];
    saveGuildConfig(guildId, cfg);
    res.json({ success: true, template, created });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, created });
  }
});

function allRoles(existing, created) {
  return [...existing.map(r => ({ id: r.id, name: r.name })), ...created];
}

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

// Config del servidor
app.get('/api/guild/:id/config', requireAuth, (req, res) => {
  if (!adminGuild(req, res, req.params.id)) return;
  const guildId = req.params.id;
  const cfg = loadGuildConfig(guildId);
  res.json({ ...cfg, __persisted: fs.existsSync(configPath(guildId)) });
});

app.post('/api/guild/:id/config', requireAuth, (req, res) => {
  if (!adminGuild(req, res, req.params.id)) return;
  try {
    const current = loadGuildConfig(req.params.id);
    const b = req.body || {};
    const updated = {
      ...current,
      ...b,
      channels: { ...current.channels, ...(b.channels || {}) },
      staffRoles: b.staffRoles !== undefined ? (Array.isArray(b.staffRoles) ? b.staffRoles : current.staffRoles) : current.staffRoles,
      autoRole: b.autoRole !== undefined ? { ...current.autoRole, ...b.autoRole } : current.autoRole,
      welcome: b.welcome !== undefined ? { ...current.welcome, ...b.welcome } : current.welcome,
      invites: b.invites !== undefined ? { ...current.invites, ...b.invites } : current.invites,
      automod: b.automod !== undefined ? { ...current.automod, ...b.automod, words: cleanWords(b.automod.words) } : current.automod,
      tickets: b.tickets !== undefined ? { ...current.tickets, ...b.tickets } : current.tickets,
      suggestions: b.suggestions !== undefined ? { ...current.suggestions, ...b.suggestions } : current.suggestions,
      giveaways: b.giveaways !== undefined ? { ...current.giveaways, ...b.giveaways, winners: Math.max(1, Math.min(50, Number(b.giveaways.winners) || 1)) } : current.giveaways,
      polls: b.polls !== undefined ? { ...current.polls, ...b.polls } : current.polls,
      logs: b.logs !== undefined ? { ...current.logs, ...b.logs } : current.logs,
      notifications: b.notifications !== undefined ? { ...current.notifications, ...b.notifications } : current.notifications,
      customCommands: b.customCommands !== undefined ? (Array.isArray(b.customCommands) ? b.customCommands.slice(0, 100) : current.customCommands) : current.customCommands
    };
    saveGuildConfig(req.params.id, updated);
    res.json({ success: true, config: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/guild/:id/export', requireAuth, (req, res) => {
  if (!adminGuild(req, res, req.params.id)) return;
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


// Probar escritura en el canal de logs elegido.
app.post('/api/guild/:id/test-log', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  const cfg = loadGuildConfig(guildId);
  const channelId = req.body?.channelId || cfg.logs?.channel || cfg.channels?.logs;
  if (!channelId) return res.status(400).json({ error: 'Selecciona un canal de logs.' });
  try {
    const body = { embeds: [{ title: '🧪 Prueba de logs', description: 'JuliDev pudo escribir correctamente en este canal.', color: 0x9B59B6, footer: { text: `Servidor ${guildId}` }, timestamp: new Date().toISOString() }] };
    await discordApi(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(body) });
    res.json({ success: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ─── Acciones avanzadas del panel ───────────────────────────
app.post('/api/guild/:id/member-role', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  const { userId, roleId, mode = 'add' } = req.body || {};
  if (!/^\d{15,25}$/.test(String(userId || '')) || !/^\d{15,25}$/.test(String(roleId || ''))) return res.status(400).json({ error: 'ID de usuario o rol inválido.' });
  try {
    await discordApi(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: mode === 'remove' ? 'DELETE' : 'PUT' });
    res.json({ success: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.post('/api/guild/:id/nickname', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  const { userId, nick = '' } = req.body || {};
  if (!/^\d{15,25}$/.test(String(userId || ''))) return res.status(400).json({ error: 'ID de usuario inválido.' });
  try {
    await discordApi(`/guilds/${guildId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ nick: String(nick).slice(0, 32) || null }) });
    res.json({ success: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.post('/api/guild/:id/purge', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  const { channelId, amount = 10 } = req.body || {};
  const n = Math.max(1, Math.min(100, Number(amount) || 10));
  if (!channelId) return res.status(400).json({ error: 'Elige un canal.' });
  try {
    const msgs = await discordApi(`/channels/${channelId}/messages?limit=${n}`);
    if (!Array.isArray(msgs) || !msgs.length) return res.json({ success: true, deleted: 0 });
    let deleted = 0;
    if (msgs.length === 1) {
      await discordApi(`/channels/${channelId}/messages/${msgs[0].id}`, { method: 'DELETE' }); deleted = 1;
    } else {
      const recent = msgs.filter(m => Date.now() - Date.parse(m.timestamp) < 14 * 24 * 60 * 60 * 1000).map(m => m.id);
      if (!recent.length) return res.json({ success: true, deleted: 0, note: 'Discord no permite borrar masivamente mensajes de más de 14 días.' });
      if (recent.length === 1) { await discordApi(`/channels/${channelId}/messages/${recent[0]}`, { method: 'DELETE' }); deleted = 1; }
      else { await discordApi(`/channels/${channelId}/messages/bulk-delete`, { method: 'POST', body: JSON.stringify({ messages: recent }) }); deleted = recent.length; }
    }
    res.json({ success: true, deleted });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.post('/api/guild/:id/channel-lock', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  const { channelId, locked = true } = req.body || {};
  if (!channelId) return res.status(400).json({ error: 'Elige un canal.' });
  try {
    await discordApi(`/channels/${channelId}/permissions/${guildId}`, {
      method: 'PUT',
      body: JSON.stringify({ type: 0, allow: locked ? '0' : '2048', deny: locked ? '2048' : '0' })
    });
    res.json({ success: true, locked: !!locked });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.post('/api/guild/:id/reset-config', requireAuth, (req, res) => {
  const guildId = req.params.id;
  if (!adminGuild(req, res, guildId)) return;
  try {
    const current = loadGuildConfig(guildId);
    const fresh = {
      channels: {}, staffRoles: [], autoRole: { enabled: false, roleId: '' },
      welcome: { enabled: true, type: 'embed', message: 'Hey {user}, gracias por unirte a **{server}**.', title: '¡Bienvenido!', color: '#9b59b6', image: '', thumbnail: '' },
      invites: { enabled: true }, botName: current.botName || 'JuliDev',
      automod: { enabled: false, spam: 'off', links: 'allow', words: [] },
      tickets: { enabled: false, category: '', logChannel: '', message: '🎫 Abre un ticket para recibir ayuda.' },
      suggestions: { enabled: true, channel: '', logChannel: '' }, giveaways: { channel: '', duration: '1h', winners: 1 },
      polls: { channel: '', multi: false }, logs: { channel: '', messages: false, moderation: true, server: true },
      notifications: { channel: '', enabled: false }, customCommands: []
    };
    saveGuildConfig(guildId, fresh); res.json({ success: true, config: fresh });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Páginas ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/servers', (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  res.sendFile(path.join(__dirname, 'public', 'servers.html'));
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
