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
  { key: 'logs', label: 'Logs', hint: 'Logs de moderación' },
  { key: 'logTickets', label: 'Logs tickets', hint: 'Logs de tickets' },
  { key: 'staffChat', label: 'Staff chat', hint: 'Chat del staff' },
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
  invites: { enabled: true }
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
    invites: { enabled: true, ...(cfg.invites || {}) }
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
      setDirty(true);
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
      setDirty(true);
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
    setDirty(true);
  };
  en.onchange = () => {
    config.autoRole = { ...(config.autoRole || {}), enabled: en.checked };
    setDirty(true);
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
  setDirty(true);
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
    setDirty(true);
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

document.getElementById('btn-save').addEventListener('click', async () => {
  try {
    const res = await fetch(`/api/guild/${guildId}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(config)
    });
    if (res.status === 401) {
      toast('Sesión expirada. Vuelve a iniciar sesión.', 'error');
      setTimeout(() => location.href = '/auth/login', 1500);
      return;
    }
    const data = await res.json();
    if (data.success) {
      setDirty(false);
      document.getElementById('ov-channels').textContent =
        Object.values(config.channels || {}).filter(Boolean).length;
      toast('✅ Configuración guardada');
    } else toast(data.error || 'Error', 'error');
  } catch (_) {
    toast('Error de red', 'error');
  }
});

window.addEventListener('beforeunload', e => {
  if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

init();
