const CHANNEL_KEYS = [
  { key: 'bienvenida', label: 'Bienvenida', hint: 'Mensaje al unirse' },
  { key: 'invitaciones', label: 'Invitaciones', hint: 'Log de quién invitó' },
  { key: 'anuncios', label: 'Anuncios', hint: 'Anuncios generales' },
  { key: 'encuestas', label: 'Encuestas', hint: 'Canal de /encuesta' },
  { key: 'sorteos', label: 'Sorteos', hint: 'Canal de /sorteo' },
  { key: 'chat', label: 'Chat general', hint: 'Chat principal' },
  { key: 'comandos', label: 'Comandos', hint: 'Canal de comandos' },
  { key: 'sugerencias', label: 'Sugerencias', hint: 'Canal de /sugerencia' },
  { key: 'ticketsCategory', label: 'Categoría Tickets', hint: 'Categoría de tickets' },
  { key: 'soportePublico', label: 'Soporte público', hint: 'Canal de soporte' },
  { key: 'baneados', label: 'Baneados', hint: 'Log de bans' },
  { key: 'logs', label: 'Logs generales', hint: 'Logs de moderación y eventos' },
  { key: 'logTickets', label: 'Logs tickets', hint: 'Logs de tickets' },
  { key: 'staffChat', label: 'Staff chat', hint: 'Chat del staff' },
  { key: 'streaming', label: 'Streaming', hint: 'Avisos de streams' },
  { key: 'eventos', label: 'Eventos', hint: 'Canal de eventos' },
  { key: 'boosteos', label: 'Boosteos', hint: 'Agradecimiento de boosts' },
  { key: 'multimedia', label: 'Multimedia', hint: 'Fotos / vídeos' },
  { key: 'memes', label: 'Memes', hint: 'Canal de memes' },
];

const DEFAULT_WELCOME =
  'Hey {user}, gracias por unirte a **{server}**.\n\n' +
  '**Contigo somos {count} miembros** 💜\n\n' +
  '📌 **Canales útiles**\n' +
  '💬 Chat · 🤖 Comandos · 🎫 Soporte\n\n' +
  '📨 Invitado por: {inviter}';

const guildId = location.pathname.split('/').pop();
let config = {
  channels: {},
  staffRoles: [],
  autoRole: { enabled: false, roleId: '' },
  welcome: { enabled: true, type: 'embed', message: DEFAULT_WELCOME, title: '¡Bienvenido!', color: '#9b59b6', image: '', thumbnail: '' },
  invites: { enabled: true },
  botName: 'JuliDev'
};
let guildChannels = [];
let guildRoles = [];
let dirty = false;
let guildName = 'Servidor';

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 2800);
}
function setDirty(v) {
  dirty = v;
  document.getElementById('btn-save').style.display = v ? 'inline-flex' : 'none';
}
function applyVars(t) {
  return (t || '')
    .replace(/{user}/g, '@Usuario')
    .replace(/{server}/g, guildName)
    .replace(/{count}/g, '128')
    .replace(/{inviter}/g, '@Invitador')
    .replace(/\*\*(.*?)\*\*/g, '$1');
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.section-panel').forEach(s => s.classList.remove('active'));
    item.classList.add('active');
    document.getElementById('section-' + item.dataset.section).classList.add('active');
    document.getElementById('page-title').textContent = item.textContent.trim();
  });
});


function refreshBuilderSelectors() {
  const parent = document.getElementById('new-channel-parent');
  if (!parent) return;
  const cats = guildChannels.filter(c => c.type === 4);
  parent.innerHTML = '<option value="">Sin categoría</option>' +
    cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

async function refreshGuildData() {
  try {
    const [channels, roles] = await Promise.all([
      fetch(`/api/guild/${guildId}/channels`, {credentials:'include'}).then(r=>r.json()),
      fetch(`/api/guild/${guildId}/roles`, {credentials:'include'}).then(r=>r.json())
    ]);
    guildChannels = Array.isArray(channels) ? channels : [];
    guildRoles = Array.isArray(roles) ? roles : [];
    renderChannels(); renderStaffRoles(); renderSend(); refreshBuilderSelectors();
    toast('Datos actualizados');
  } catch (e) { toast('No se pudieron actualizar los datos','error'); }
}

async function createChannelFromPanel() {
  const name = document.getElementById('new-channel-name').value.trim();
  const type = Number(document.getElementById('new-channel-type').value);
  const parentId = document.getElementById('new-channel-parent').value;
  const topic = document.getElementById('new-channel-topic').value.trim();
  if (!name) return toast('Escribe un nombre para el canal','error');
  const r = await fetch(`/api/guild/${guildId}/channels/create`, {
    method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
    body:JSON.stringify({name,type,parentId,topic})
  });
  const d = await r.json();
  if (!r.ok) return toast(d.error || 'No se pudo crear','error');
  toast(`✅ Canal ${d.channel.name} creado`);
  document.getElementById('new-channel-name').value='';
  await refreshGuildData();
}

async function createRoleFromPanel() {
  const name = document.getElementById('new-role-name').value.trim();
  const color = document.getElementById('new-role-color').value;
  const hoist = document.getElementById('new-role-hoist').checked;
  const mentionable = document.getElementById('new-role-mentionable').checked;
  if (!name) return toast('Escribe un nombre para el rol','error');
  const r = await fetch(`/api/guild/${guildId}/roles/create`, {
    method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
    body:JSON.stringify({name,color,hoist,mentionable})
  });
  const d = await r.json();
  if (!r.ok) return toast(d.error || 'No se pudo crear','error');
  toast(`✅ Rol ${d.role.name} creado`);
  document.getElementById('new-role-name').value='';
  await refreshGuildData();
}

async function setupPack() {
  if (!confirm('¿Crear la estructura completa? Esto creará varios canales y roles. No lo ejecutes dos veces.')) return;
  const btn = document.getElementById('btn-setup-pack'); btn.disabled=true;
  try {
    const r = await fetch(`/api/guild/${guildId}/setup-pack`, {method:'POST',credentials:'include'});
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error al crear el setup');
    toast(`✅ Creados ${d.created.channels.length} canales y ${d.created.roles.length} roles`);
    await refreshGuildData();
    const cfg = await fetch(`/api/guild/${guildId}/config`,{credentials:'include'}).then(r=>r.json());
    config = {...config,...cfg};
  } catch(e) { toast(e.message,'error'); }
  finally { btn.disabled=false; }
}

async function moderationAction(action) {
  const userId=document.getElementById('mod-user').value.trim();
  const reason=document.getElementById('mod-reason').value.trim();
  const minutes=Number(document.getElementById('mod-minutes').value)||10;
  if (!userId) return toast('Escribe el ID del usuario','error');
  const labels={timeout:'timeout',untimeout:'quitar timeout',kick:'expulsar',ban:'banear',unban:'desbanear'};
  if (!confirm(`¿Confirmas ${labels[action]} a ${userId}?`)) return;
  const r=await fetch(`/api/guild/${guildId}/moderation`,{
    method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',
    body:JSON.stringify({action,userId,reason,minutes})
  });
  const d=await r.json();
  if (!r.ok) return toast(d.error||'No se pudo ejecutar','error');
  toast(`✅ Acción ${labels[action]} ejecutada`);
}

function setupNewTools() {
  refreshBuilderSelectors();
  document.getElementById('btn-create-channel')?.addEventListener('click', createChannelFromPanel);
  document.getElementById('btn-create-role')?.addEventListener('click', createRoleFromPanel);
  document.getElementById('btn-refresh-data')?.addEventListener('click', refreshGuildData);
  document.getElementById('btn-setup-pack')?.addEventListener('click', setupPack);
  document.querySelectorAll('[data-mod]').forEach(b => b.addEventListener('click',()=>moderationAction(b.dataset.mod)));
  const ex=document.getElementById('export-config'); if(ex) ex.href=`/api/guild/${guildId}/export`;
  const bn=document.getElementById('bot-name'); if(bn) bn.value=config.botName||'JuliDev';
  document.getElementById('btn-save-bot-name')?.addEventListener('click', async()=>{
    const botName=document.getElementById('bot-name').value.trim()||'JuliDev';
    const r=await fetch(`/api/guild/${guildId}/bot-settings`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({botName})});
    const d=await r.json(); if(!r.ok)return toast(d.error||'Error','error');
    config.botName=d.botName; toast('✅ Nombre guardado');
  });
}
async function init() {
  const me = await fetch('/api/me', { credentials: 'include' }).then(r => r.json());
  if (!me.loggedIn) { location.href = '/'; return; }
  document.getElementById('user-name').textContent = me.user.global_name || me.user.username;
  const av = document.getElementById('user-avatar');
  if (me.user.avatar) {
    av.innerHTML = `<img src="https://cdn.discordapp.com/avatars/${me.user.id}/${me.user.avatar}.png?size=64" alt="" />`;
  } else av.textContent = (me.user.username || '?')[0].toUpperCase();

  const [cfg, channels, roles, guild] = await Promise.all([
    fetch(`/api/guild/${guildId}/config`, { credentials: 'include' }).then(r => r.json()),
    fetch(`/api/guild/${guildId}/channels`, { credentials: 'include' }).then(r => r.json()).catch(() => []),
    fetch(`/api/guild/${guildId}/roles`, { credentials: 'include' }).then(r => r.json()).catch(() => []),
    fetch(`/api/guild/${guildId}`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
  ]);

  config = {
    channels: { ...(cfg.channels || {}) },
    staffRoles: cfg.staffRoles || [],
    autoRole: { enabled: false, roleId: '', ...(cfg.autoRole || {}) },
    welcome: {
      enabled: true, type: 'embed', message: DEFAULT_WELCOME, title: '¡Bienvenido!',
      color: '#9b59b6', image: '', thumbnail: '',
      ...(cfg.welcome || {})
    },
    invites: { enabled: true, ...(cfg.invites || {}) },
    botName: cfg.botName || 'JuliDev',
    automod: {
      enabled: false,
      spam: { enabled: false, maxMessages: 5, interval: 5, action: 'timeout', timeoutMinutes: 5 },
      links: { enabled: false, action: 'delete', timeoutMinutes: 5, whitelist: [] },
      words: { enabled: false, list: [], action: 'delete', timeoutMinutes: 10 },
      mentions: { enabled: false, maxMentions: 5, action: 'timeout', timeoutMinutes: 10 },
      caps: { enabled: false, percent: 70, minLength: 10, action: 'delete' },
      invites: { enabled: false, action: 'delete' },
      log: true,
      ...(cfg.automod || {})
    },
    moderation: {
      dmOnAction: true,
      defaultReason: 'Incumplimiento de las reglas del servidor.',
      logActions: true,
      warnExpireDays: 30,
      maxWarnsBeforeKick: 3,
      maxWarnsBeforeBan: 5,
      ...(cfg.moderation || {})
    }
  };

  guildChannels = Array.isArray(channels) ? channels : [];
  guildRoles = Array.isArray(roles) ? roles : [];

  if (guild && guild.name) {
    guildName = guild.name;
    document.getElementById('guild-name').textContent = guild.name;
    document.getElementById('ov-name').textContent = guild.name;
    document.getElementById('ov-members').textContent = guild.memberCount?.toLocaleString() || '—';
    document.getElementById('ov-online').textContent = guild.onlineCount?.toLocaleString() || '—';
    const gi = document.getElementById('guild-icon');
    if (guild.icon) gi.innerHTML = `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64" alt="" />`;
    else gi.textContent = guild.name[0].toUpperCase();
  }
  document.getElementById('ov-channels').textContent = Object.values(config.channels || {}).filter(Boolean).length;

  renderChannels();
  renderStaffRoles();
  renderAutoRole();
  renderWelcome();
  renderInvites();
  renderSend();
  renderAutomod();
  renderModerationSettings();
  setupNewTools();
}

// ─── AutoMod ───────────────────────────────────────────────
function renderAutomod() {
  const am = config.automod || {};
  const set = (id, val, isCheck = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isCheck) el.checked = !!val;
    else el.value = val ?? '';
  };

  set('automod-enabled', am.enabled, true);
  set('am-log', am.log !== false, true);

  // Spam
  set('am-spam-enabled', am.spam?.enabled, true);
  set('am-spam-max', am.spam?.maxMessages ?? 5);
  set('am-spam-interval', am.spam?.interval ?? 5);
  set('am-spam-action', am.spam?.action ?? 'timeout');
  set('am-spam-timeout', am.spam?.timeoutMinutes ?? 5);

  // Links
  set('am-links-enabled', am.links?.enabled, true);
  set('am-links-action', am.links?.action ?? 'delete');
  set('am-links-timeout', am.links?.timeoutMinutes ?? 5);
  set('am-links-whitelist', (am.links?.whitelist || []).join(', '));

  // Words
  set('am-words-enabled', am.words?.enabled, true);
  set('am-words-list', (am.words?.list || []).join('\n'));
  set('am-words-action', am.words?.action ?? 'delete');
  set('am-words-timeout', am.words?.timeoutMinutes ?? 10);

  // Mentions
  set('am-mentions-enabled', am.mentions?.enabled, true);
  set('am-mentions-max', am.mentions?.maxMentions ?? 5);
  set('am-mentions-action', am.mentions?.action ?? 'timeout');
  set('am-mentions-timeout', am.mentions?.timeoutMinutes ?? 10);

  // Caps
  set('am-caps-enabled', am.caps?.enabled, true);
  set('am-caps-percent', am.caps?.percent ?? 70);
  set('am-caps-min', am.caps?.minLength ?? 10);
  set('am-caps-action', am.caps?.action ?? 'delete');

  // Invites
  set('am-invites-enabled', am.invites?.enabled, true);
  set('am-invites-action', am.invites?.action ?? 'delete');

  // Listeners
  const ids = [
    'automod-enabled','am-log',
    'am-spam-enabled','am-spam-max','am-spam-interval','am-spam-action','am-spam-timeout',
    'am-links-enabled','am-links-action','am-links-timeout','am-links-whitelist',
    'am-words-enabled','am-words-list','am-words-action','am-words-timeout',
    'am-mentions-enabled','am-mentions-max','am-mentions-action','am-mentions-timeout',
    'am-caps-enabled','am-caps-percent','am-caps-min','am-caps-action',
    'am-invites-enabled','am-invites-action'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { collectAutomod(); markConfigDirty(); });
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      el.addEventListener('input', () => { collectAutomod(); markConfigDirty(); });
    }
  });
}

function collectAutomod() {
  const g = id => document.getElementById(id);
  const val = id => g(id)?.value ?? '';
  const checked = id => !!g(id)?.checked;
  const num = (id, def) => Number(val(id)) || def;

  config.automod = {
    enabled: checked('automod-enabled'),
    log: checked('am-log'),
    spam: {
      enabled: checked('am-spam-enabled'),
      maxMessages: num('am-spam-max', 5),
      interval: num('am-spam-interval', 5),
      action: val('am-spam-action') || 'timeout',
      timeoutMinutes: num('am-spam-timeout', 5)
    },
    links: {
      enabled: checked('am-links-enabled'),
      action: val('am-links-action') || 'delete',
      timeoutMinutes: num('am-links-timeout', 5),
      whitelist: val('am-links-whitelist').split(',').map(s => s.trim()).filter(Boolean)
    },
    words: {
      enabled: checked('am-words-enabled'),
      list: val('am-words-list').split('\n').map(s => s.trim()).filter(Boolean),
      action: val('am-words-action') || 'delete',
      timeoutMinutes: num('am-words-timeout', 10)
    },
    mentions: {
      enabled: checked('am-mentions-enabled'),
      maxMentions: num('am-mentions-max', 5),
      action: val('am-mentions-action') || 'timeout',
      timeoutMinutes: num('am-mentions-timeout', 10)
    },
    caps: {
      enabled: checked('am-caps-enabled'),
      percent: num('am-caps-percent', 70),
      minLength: num('am-caps-min', 10),
      action: val('am-caps-action') || 'delete'
    },
    invites: {
      enabled: checked('am-invites-enabled'),
      action: val('am-invites-action') || 'delete'
    }
  };
}

// ─── Moderación settings ───────────────────────────────────
function renderModerationSettings() {
  const m = config.moderation || {};
  const set = (id, val, isCheck = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isCheck) el.checked = !!val;
    else el.value = val ?? '';
  };

  set('mod-dm', m.dmOnAction !== false, true);
  set('mod-log', m.logActions !== false, true);
  set('mod-default-reason', m.defaultReason || 'Incumplimiento de las reglas del servidor.');
  set('mod-max-kick', m.maxWarnsBeforeKick ?? 3);
  set('mod-max-ban', m.maxWarnsBeforeBan ?? 5);
  set('mod-warn-expire', m.warnExpireDays ?? 30);

  ['mod-dm','mod-log','mod-default-reason','mod-max-kick','mod-max-ban','mod-warn-expire'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => { collectModeration(); markConfigDirty(); });
    if (el.tagName === 'INPUT') el.addEventListener('input', () => { collectModeration(); markConfigDirty(); });
  });
}

function collectModeration() {
  const g = id => document.getElementById(id);
  config.moderation = {
    dmOnAction: !!g('mod-dm')?.checked,
    logActions: !!g('mod-log')?.checked,
    defaultReason: g('mod-default-reason')?.value || 'Incumplimiento de las reglas del servidor.',
    maxWarnsBeforeKick: Number(g('mod-max-kick')?.value) || 3,
    maxWarnsBeforeBan: Number(g('mod-max-ban')?.value) || 5,
    warnExpireDays: Number(g('mod-warn-expire')?.value) || 0
  };
}

function channelOptions(selectedId) {
  let html = '<option value="">— Sin asignar —</option>';
  const cats = guildChannels.filter(c => c.type === 4);
  const texts = guildChannels.filter(c => c.type === 0 || c.type === 5);
  const byParent = {};
  texts.forEach(c => {
    const p = c.parent_id || '_root';
    if (!byParent[p]) byParent[p] = [];
    byParent[p].push(c);
  });
  (byParent._root || []).forEach(c => {
    html += `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>#${c.name}</option>`;
  });
  cats.forEach(cat => {
    const list = byParent[cat.id] || [];
    if (!list.length) return;
    html += `<optgroup label="${cat.name}">`;
    list.forEach(c => {
      html += `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>#${c.name}</option>`;
    });
    html += '</optgroup>';
  });
  return html;
}

function roleOptions(selectedId) {
  let html = '<option value="">— Ninguno —</option>';
  guildRoles.forEach(r => {
    html += `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${r.name}</option>`;
  });
  return html;
}

let saveInFlight = false;

async function saveConfigToServer(showToast = false) {
  if (saveInFlight) return;
  saveInFlight = true;
  try {
    // Recoger valores actuales de los formularios antes de guardar
    if (typeof collectAutomod === 'function') collectAutomod();
    if (typeof collectModeration === 'function') collectModeration();

    const res = await fetch(`/api/guild/${guildId}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(config)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo guardar');
    config = data.config || config;
    setDirty(false);
    if (showToast) {
      toast(data.sync === false
        ? '⚠️ Guardado en el panel, pero no se pudo sincronizar con el bot'
        : '✅ Configuración guardada y sincronizada');
    }
  } catch (e) {
    if (showToast) toast(`❌ ${e.message}`, 'error');
  } finally {
    saveInFlight = false;
  }
}

function markConfigDirty() {
  setDirty(true);
}

function renderChannels() {
  const form = document.getElementById('channels-form');
  form.innerHTML = CHANNEL_KEYS.map(({ key, label, hint }) => {
    const val = (config.channels && config.channels[key]) || '';
    return `<div class="form-group"><label>${label}</label><div class="hint">${hint}</div>
      <select data-channel="${key}">${channelOptions(val)}</select></div>`;
  }).join('');
  form.querySelectorAll('select').forEach(sel => {
    sel.addEventListener('change', () => {
      config.channels = config.channels || {};
      config.channels[sel.dataset.channel] = sel.value;
      markConfigDirty();
    });
  });
}

function renderStaffRoles() {
  const list = document.getElementById('staff-roles-list');
  const selected = new Set(config.staffRoles || []);
  if (!guildRoles.length) {
    list.innerHTML = '<p style="color:var(--text-muted)">No se cargaron roles. ¿El bot está en el servidor?</p>';
    return;
  }
  list.innerHTML = guildRoles.map(r => {
    const color = r.color ? '#' + r.color.toString(16).padStart(6, '0') : '#99aab5';
    return `<label class="role-item">
      <input type="checkbox" value="${r.id}" ${selected.has(r.id) ? 'checked' : ''} />
      <span class="role-dot" style="background:${color}"></span>
      <span class="role-name">${r.name}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      config.staffRoles = [...list.querySelectorAll('input:checked')].map(i => i.value);
      markConfigDirty();
    });
  });
}

function renderAutoRole() {
  const sel = document.getElementById('autorole-select');
  const en = document.getElementById('autorole-enabled');
  sel.innerHTML = roleOptions(config.autoRole?.roleId || '');
  en.checked = !!(config.autoRole && config.autoRole.enabled);
  sel.onchange = () => {
    config.autoRole = { ...(config.autoRole || {}), roleId: sel.value };
    if (sel.value) { config.autoRole.enabled = true; en.checked = true; }
    markConfigDirty();
  };
  en.onchange = () => {
    config.autoRole = { ...(config.autoRole || {}), enabled: en.checked };
    markConfigDirty();
  };
}

function updateWelcomePreview() {
  const type = document.getElementById('welcome-type').value;
  const msg = applyVars(document.getElementById('welcome-message').value);
  const title = applyVars(document.getElementById('welcome-title').value);
  const color = document.getElementById('welcome-color').value;
  const image = document.getElementById('welcome-image').value;

  const textEl = document.getElementById('wp-text');
  const embedEl = document.getElementById('wp-embed');
  if (type === 'text') {
    textEl.textContent = msg;
    embedEl.style.display = 'none';
  } else {
    textEl.textContent = '';
    embedEl.style.display = 'flex';
    document.getElementById('wp-bar').style.background = color;
    document.getElementById('wp-title').textContent = title || '';
    document.getElementById('wp-desc').textContent = msg;
    const img = document.getElementById('wp-img');
    if (image) { img.src = image; img.style.display = 'block'; }
    else img.style.display = 'none';
  }
  document.getElementById('welcome-embed-fields').style.opacity = type === 'embed' ? '1' : '0.4';
}

function syncWelcomeConfig() {
  config.welcome = {
    enabled: document.getElementById('welcome-enabled').checked,
    type: document.getElementById('welcome-type').value,
    message: document.getElementById('welcome-message').value,
    title: document.getElementById('welcome-title').value,
    color: document.getElementById('welcome-color').value,
    image: document.getElementById('welcome-image').value,
    thumbnail: document.getElementById('welcome-thumb').value
  };
  updateWelcomePreview();
  markConfigDirty();
}

async function testWelcome() {
  const channelId = config.channels?.bienvenida || '';
  try {
    const res = await fetch(`/api/guild/${guildId}/test-welcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ channelId })
    });
    const data = await res.json();
    if (data.success) toast('✅ Bienvenida de prueba enviada al canal');
    else toast(data.error || 'Error', 'error');
  } catch (_) {
    toast('Error de red', 'error');
  }
}

function renderWelcome() {
  const w = config.welcome || {};
  document.getElementById('welcome-enabled').checked = w.enabled !== false;
  document.getElementById('welcome-type').value = w.type || 'embed';
  document.getElementById('welcome-message').value = w.message || DEFAULT_WELCOME;
  document.getElementById('welcome-title').value = w.title || '¡Bienvenido!';
  document.getElementById('welcome-color').value = w.color || '#9b59b6';
  document.getElementById('welcome-image').value = w.image || '';
  document.getElementById('welcome-thumb').value = w.thumbnail || '';
  ['welcome-enabled','welcome-type','welcome-message','welcome-title','welcome-color','welcome-image','welcome-thumb']
    .forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener(el.tagName === 'TEXTAREA' || el.type === 'text' || el.type === 'url' || el.type === 'color' ? 'input' : 'change', syncWelcomeConfig);
    });
  updateWelcomePreview();
  const btnTest = document.getElementById('btn-test-welcome');
  if (btnTest) btnTest.onclick = testWelcome;
}


function renderInvites() {
  const en = document.getElementById('invites-enabled');
  en.checked = config.invites?.enabled !== false;
  en.onchange = () => {
    config.invites = { ...(config.invites || {}), enabled: en.checked };
    markConfigDirty();
  };
}

function updateSendPreview() {
  const content = document.getElementById('send-content').value;
  const title = document.getElementById('send-title').value;
  const desc = document.getElementById('send-desc').value;
  const color = document.getElementById('send-color').value;
  const image = document.getElementById('send-image').value;
  document.getElementById('sp-text').textContent = content;
  const emb = document.getElementById('sp-embed');
  if (title || desc || image) {
    emb.style.display = 'flex';
    document.getElementById('sp-bar').style.background = color;
    document.getElementById('sp-title').textContent = title;
    document.getElementById('sp-desc').textContent = desc;
    const img = document.getElementById('sp-img');
    if (image) { img.src = image; img.style.display = 'block'; }
    else img.style.display = 'none';
  } else emb.style.display = 'none';
}

function renderSend() {
  document.getElementById('send-channel').innerHTML = channelOptions('');
  ['send-content','send-title','send-desc','send-color','send-image'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateSendPreview);
  });
  document.getElementById('btn-send-msg').onclick = async () => {
    const channelId = document.getElementById('send-channel').value;
    const body = {
      channelId,
      content: document.getElementById('send-content').value,
      embedTitle: document.getElementById('send-title').value,
      embedDescription: document.getElementById('send-desc').value,
      embedColor: document.getElementById('send-color').value,
      embedImage: document.getElementById('send-image').value
    };
    try {
      const res = await fetch(`/api/guild/${guildId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.status === 401) {
        toast('Sesión expirada', 'error');
        setTimeout(() => location.href = '/auth/login', 1200);
        return;
      }
      if (data.success) toast('✅ Mensaje enviado');
      else toast(data.error || 'Error al enviar', 'error');
    } catch (_) {
      toast('Error de red', 'error');
    }
  };
}

document.getElementById('btn-save').addEventListener('click', () => saveConfigToServer(true));

window.addEventListener('beforeunload', e => {
  if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

init();
