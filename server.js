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
  return {
    channels: {
      bienvenida: '', invitaciones: '', anuncios: '', encuestas: '',
      sorteos: '', chat: '', comandos: '', sugerencias: '',
      ticketsCategory: '', soportePublico: '', baneados: '',
      logs: '', logTickets: '', staffChat: ''
    },
    staffRoles: [],
    autoRole: { enabled: false, roleId: '' },
    welcome: {
      enabled: true,
      message: 'Hey {user}, bienvenido a **{server}**!\nContigo somos **{count}** miembros.\nInvitado por: {inviter}'
    },
    invites: { enabled: true },
    botName: 'JuliDev'
  };
}

function saveGuildConfig(guildId, cfg) {
  fs.writeFileSync(configPath(guildId), JSON.stringify(cfg, null, 2), 'utf8');
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

// Config del servidor
app.get('/api/guild/:id/config', requireAuth, (req, res) => {
  res.json(loadGuildConfig(req.params.id));
});

app.post('/api/guild/:id/config', requireAuth, (req, res) => {
  try {
    const current = loadGuildConfig(req.params.id);
    const updated = {
      ...current,
      ...req.body,
      channels: { ...current.channels, ...(req.body.channels || {}) },
      staffRoles: req.body.staffRoles !== undefined ? req.body.staffRoles : current.staffRoles,
      autoRole: req.body.autoRole !== undefined ? req.body.autoRole : current.autoRole,
      welcome: req.body.welcome !== undefined ? { ...current.welcome, ...req.body.welcome } : current.welcome,
      invites: req.body.invites !== undefined ? { ...current.invites, ...req.body.invites } : current.invites
    };
    saveGuildConfig(req.params.id, updated);
    res.json({ success: true, config: updated });
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
