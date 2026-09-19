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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;',"\"":'&quot;'}[ch]));
}

const LOCAL_CONFIG_KEY = `julidev-config:${location.pathname.split('/').pop()}`;

function saveLocalBackup() {
  try { localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(config)); } catch (_) {}
}
function loadLocalBackup() {
  try { const raw = localStorage.getItem(LOCAL_CONFIG_KEY); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
}

const guildId = location.pathname.split('/').pop();
let config = {
  channels: {},
  staffRoles: [],
  autoRole: { enabled: false, roleId: '' },
  welcome: { enabled: true, type: 'embed', message: DEFAULT_WELCOME, title: '¡Bienvenido!', color: '#9b59b6', image: '', thumbnail: '' },
  invites: { enabled: true },
  botName: 'JuliDev',
  automod: { enabled:false, spam:'off', links:'allow', words:[] },
  tickets: { enabled:false, category:'', logChannel:'', message:'' },
  suggestions: { enabled:true, channel:'', logChannel:'' },
  giveaways: { channel:'', duration:'1h', winners:1 },
  polls: { channel:'', multi:false },
  logs: { channel:'', messages:false, moderation:true, server:true },
  notifications: { channel:'', enabled:false },
  customCommands: []
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
    renderChannels(); renderStaffRoles(); renderSend(); refreshBuilderSelectors(); setupQuickActions();
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
    const r = await fetch(`/api/guild/${guildId}/setup-pack`, {method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({template:document.getElementById('setup-template')?.value||'community'})});
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

function setupQuickActions() {
  const ann = document.getElementById('quick-ann-channel');
  const log = document.getElementById('quick-log-channel');
  if (ann) ann.innerHTML = channelOptions(config.channels?.anuncios || '');
  if (log) log.innerHTML = channelOptions(config.logs?.channel || config.channels?.logs || '');
  const annBtn = document.getElementById('quick-ann-send'); if (annBtn) annBtn.onclick = async () => {
    const channelId = ann?.value; const content = document.getElementById('quick-ann-text')?.value.trim();
    if (!channelId || !content) return toast('Elige canal y escribe el anuncio','error');
    const r = await fetch(`/api/guild/${guildId}/send`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify({channelId, content, embedTitle:'📢 Anuncio', embedDescription:content, embedColor:'#9b59b6'}) });
    const d = await r.json(); if (!r.ok) return toast(d.error || 'No se pudo enviar','error');
    document.getElementById('quick-ann-text').value=''; toast('✅ Anuncio enviado');
  };
  const logBtn = document.getElementById('quick-log-test'); if (logBtn) logBtn.onclick = async () => {
    if (!log?.value) return toast('Elige un canal de logs','error');
    const r = await fetch(`/api/guild/${guildId}/test-log`, {method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({channelId:log.value})});
    const d = await r.json(); if (!r.ok) return toast(d.error || 'No se pudo probar','error'); toast('✅ Prueba enviada al canal');
  };
  const refreshBtn = document.getElementById('quick-refresh'); if (refreshBtn) refreshBtn.onclick = refreshGuildData;
  const forceSave = document.getElementById('btn-force-save'); if (forceSave) forceSave.onclick = () => saveConfigToServer(true);
  const clearLocal = document.getElementById('btn-clear-local'); if (clearLocal) clearLocal.onclick = () => { localStorage.removeItem(LOCAL_CONFIG_KEY); toast('🧹 Copia local borrada'); };
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

function channelSelectHtml(selectedId = '', categoriesOnly = false) {
  if (categoriesOnly) {
    return '<option value="">— Sin asignar —</option>' + guildChannels.filter(c=>c.type===4).map(c=>`<option value="${c.id}" ${c.id===selectedId?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
  }
  return channelOptions(selectedId);
}
function bindSelect(id, value, path) {
  const el=document.getElementById(id); if(!el) return;
  el.innerHTML=channelSelectHtml(value, path==='tickets.category'); el.value=value||'';
  el.onchange=()=>{ const [a,b]=path.split('.'); config[a]=config[a]||{}; config[a][b]=el.value; scheduleAutoSave(); };
}
function setupApps() {
  const a=config.automod||{};
  const t=config.tickets||{};
  const sg=config.suggestions||{};
  const g=config.giveaways||{};
  const p=config.polls||{};
  const l=config.logs||{};
  const n=config.notifications||{};
  const set=(id,v)=>{const e=document.getElementById(id); if(e)e.value=v??'';};
  const check=(id,v)=>{const e=document.getElementById(id); if(e)e.checked=!!v;};
  check('am-enabled',a.enabled); set('am-spam',a.spam||'off'); set('am-links',a.links||'allow'); set('am-words',(a.words||[]).join(', '));
  check('ticket-enabled',t.enabled); set('ticket-message',t.message||'');
  check('suggest-enabled',sg.enabled!==false);
  set('giveaway-duration',g.duration||'1h'); set('giveaway-winners',g.winners||1);
  check('poll-multi',p.multi); check('log-messages',l.messages); check('log-moderation',l.moderation!==false); check('log-server',l.server!==false);
  check('notify-enabled',n.enabled);
  const selects={
    'ticket-category':[t.category,true], 'ticket-log':[t.logChannel,false], 'suggest-channel':[sg.channel,false], 'suggest-log':[sg.logChannel,false],
    'giveaway-channel':[g.channel,false], 'poll-channel':[p.channel,false], 'log-channel':[l.channel,false], 'notify-channel':[n.channel,false], 'purge-channel':['',false], 'lock-channel':['',false]
  };
  Object.entries(selects).forEach(([id,[v,cat]])=>{const e=document.getElementById(id);if(!e)return;e.innerHTML=channelSelectHtml(v,cat);e.value=v||'';});
  const memberRole=document.getElementById('member-role'); if(memberRole) memberRole.innerHTML=roleOptions('');
  const saveField=(id, group, key, transform=v=>v)=>{const e=document.getElementById(id);if(!e)return; const ev=(e.type==='checkbox'||e.tagName==='SELECT')?'change':'input'; e.addEventListener(ev,()=>{config[group]=config[group]||{};config[group][key]=transform(e.type==='checkbox'?e.checked:e.value);scheduleAutoSave();});};
  saveField('am-enabled','automod','enabled'); saveField('am-spam','automod','spam'); saveField('am-links','automod','links'); saveField('am-words','automod','words',v=>v.split(',').map(x=>x.trim()).filter(Boolean));
  saveField('ticket-enabled','tickets','enabled'); saveField('ticket-category','tickets','category'); saveField('ticket-log','tickets','logChannel'); saveField('ticket-message','tickets','message');
  saveField('suggest-enabled','suggestions','enabled'); saveField('suggest-channel','suggestions','channel'); saveField('suggest-log','suggestions','logChannel');
  saveField('giveaway-channel','giveaways','channel'); saveField('giveaway-duration','giveaways','duration'); saveField('giveaway-winners','giveaways','winners',v=>Math.max(1,Math.min(50,Number(v)||1)));
  saveField('poll-channel','polls','channel'); saveField('poll-multi','polls','multi');
  saveField('log-channel','logs','channel'); saveField('log-messages','logs','messages'); saveField('log-moderation','logs','moderation'); saveField('log-server','logs','server');
  saveField('notify-channel','notifications','channel'); saveField('notify-enabled','notifications','enabled');
  renderCustomCommands();
  document.getElementById('custom-add')?.addEventListener('click',()=>{const tr=document.getElementById('custom-trigger').value.trim().replace(/^\//,'');const rs=document.getElementById('custom-response').value.trim();if(!tr||!rs)return toast('Completa comando y respuesta','error');config.customCommands=Array.isArray(config.customCommands)?config.customCommands:[];if(config.customCommands.some(x=>x.trigger.toLowerCase()===tr.toLowerCase()))return toast('Ese comando ya existe','error');config.customCommands.push({trigger:tr.slice(0,32),response:rs.slice(0,2000)});document.getElementById('custom-trigger').value='';document.getElementById('custom-response').value='';renderCustomCommands();scheduleAutoSave();});
}
function renderCustomCommands(){const box=document.getElementById('custom-list');if(!box)return;const arr=config.customCommands||[];box.innerHTML=arr.length?arr.map((x,i)=>`<div class="mini-item"><code>/${escapeHtml(x.trigger)}</code><span>${escapeHtml(x.response.slice(0,70))}</span><button data-cc="${i}" title="Eliminar">×</button></div>`).join(''):'<span class="hint">No hay comandos personalizados.</span>';box.querySelectorAll('[data-cc]').forEach(b=>b.onclick=()=>{config.customCommands.splice(Number(b.dataset.cc),1);renderCustomCommands();scheduleAutoSave();});}
async function memberRoleAction(mode){const userId=document.getElementById('member-id').value.trim(),roleId=document.getElementById('member-role').value;if(!userId||!roleId)return toast('Indica usuario y rol','error');const r=await fetch(`/api/guild/${guildId}/member-role`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({userId,roleId,mode})});const d=await r.json();if(!r.ok)return toast(d.error||'No se pudo cambiar el rol','error');toast(mode==='add'?'✅ Rol dado':'✅ Rol quitado');}
async function saveNick(){const userId=document.getElementById('member-nick-id').value.trim(),nick=document.getElementById('member-nick').value;if(!userId)return toast('Indica el ID del usuario','error');const r=await fetch(`/api/guild/${guildId}/nickname`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({userId,nick})});const d=await r.json();if(!r.ok)return toast(d.error||'No se pudo cambiar','error');toast('✅ Apodo actualizado');}
async function purge(){const channelId=document.getElementById('purge-channel').value,amount=Number(document.getElementById('purge-amount').value)||10;if(!channelId)return toast('Elige un canal','error');if(!confirm(`¿Eliminar hasta ${amount} mensajes?`))return;const r=await fetch(`/api/guild/${guildId}/purge`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({channelId,amount})});const d=await r.json();if(!r.ok)return toast(d.error||'No se pudo limpiar','error');toast(`🧹 Eliminados: ${d.deleted}`);}
async function lockChannel(locked){const channelId=document.getElementById('lock-channel').value;if(!channelId)return toast('Elige un canal','error');const r=await fetch(`/api/guild/${guildId}/channel-lock`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({channelId,locked})});const d=await r.json();if(!r.ok)return toast(d.error||'No se pudo cambiar','error');toast(locked?'🔒 Canal bloqueado':'🔓 Canal desbloqueado');}
function setupMembers(){document.getElementById('member-add-role')?.addEventListener('click',()=>memberRoleAction('add'));document.getElementById('member-remove-role')?.addEventListener('click',()=>memberRoleAction('remove'));document.getElementById('member-nick-save')?.addEventListener('click',saveNick);document.getElementById('purge-btn')?.addEventListener('click',purge);document.getElementById('lock-btn')?.addEventListener('click',()=>lockChannel(true));document.getElementById('unlock-btn')?.addEventListener('click',()=>lockChannel(false));}
function setupServerSection(){const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v??'—';};set('server-name-card',guildName);set('server-members-card',document.getElementById('ov-members')?.textContent);set('server-channels-card',guildChannels.length);set('server-roles-card',guildRoles.length);const ex=document.getElementById('server-export');if(ex)ex.href=`/api/guild/${guildId}/export`;document.getElementById('refresh-all')?.addEventListener('click',()=>location.reload());document.getElementById('reset-config')?.addEventListener('click',async()=>{if(!confirm('Esto borrará la configuración guardada del panel para este servidor. ¿Continuar?'))return;const r=await fetch(`/api/guild/${guildId}/reset-config`,{method:'POST',credentials:'include'});const d=await r.json();if(!r.ok)return toast(d.error||'No se pudo restablecer','error');config=d.config;setupApps();renderChannels();renderStaffRoles();renderAutoRole();renderWelcome();renderInvites();toast('🗑️ Configuración restablecida');});}

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

  const serverCfg = cfg && !cfg.error ? cfg : {};
  const localCfg = loadLocalBackup();
  const hasServerData = serverCfg.__persisted === true;
  const sourceCfg = hasServerData ? serverCfg : (localCfg || serverCfg);

  delete sourceCfg.__persisted;
  config = {
    channels: { ...(sourceCfg.channels || {}) },
    staffRoles: sourceCfg.staffRoles || [],
    autoRole: { enabled: false, roleId: '', ...(sourceCfg.autoRole || {}) },
    welcome: {
      enabled: true, type: 'embed', message: DEFAULT_WELCOME, title: '¡Bienvenido!',
      color: '#9b59b6', image: '', thumbnail: '',
      ...(sourceCfg.welcome || {})
    },
    invites: { enabled: true, ...(sourceCfg.invites || {}) },
    botName: sourceCfg.botName || 'JuliDev',
    automod: { enabled:false, spam:'off', links:'allow', words:[], ...(sourceCfg.automod||{}) },
    tickets: { enabled:false, category:'', logChannel:'', message:'', ...(sourceCfg.tickets||{}) },
    suggestions: { enabled:true, channel:'', logChannel:'', ...(sourceCfg.suggestions||{}) },
    giveaways: { channel:'', duration:'1h', winners:1, ...(sourceCfg.giveaways||{}) },
    polls: { channel:'', multi:false, ...(sourceCfg.polls||{}) },
    logs: { channel:'', messages:false, moderation:true, server:true, ...(sourceCfg.logs||{}) },
    notifications: { channel:'', enabled:false, ...(sourceCfg.notifications||{}) },
    customCommands: Array.isArray(sourceCfg.customCommands) ? sourceCfg.customCommands : []
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
  setupNewTools();
  setupApps();
  setupQuickActions();
  setupMembers();
  setupServerSection();
  saveLocalBackup();
  if (!hasServerData && localCfg) { scheduleAutoSave(); }
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

let autoSaveTimer = null;
let autoSaveInFlight = false;
let autoSaveQueued = false;

async function saveConfigToServer(showToast = false) {
  saveLocalBackup();
  if (autoSaveInFlight) {
    autoSaveQueued = true;
    return;
  }
  autoSaveInFlight = true;
  try {
    const res = await fetch(`/api/guild/${guildId}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(config)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo guardar');
    config = data.config || config;
    saveLocalBackup();
    setDirty(false);
    if (showToast) toast('✅ Configuración guardada');
  } catch (e) {
    saveLocalBackup();
    if (showToast) toast(`❌ No se pudo guardar en el servidor: ${e.message}. Se guardó una copia local.`, 'error');
  } finally {
    autoSaveInFlight = false;
    if (autoSaveQueued) {
      autoSaveQueued = false;
      saveConfigToServer(false);
    }
  }
}

function scheduleAutoSave() {
  setDirty(true);
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveConfigToServer(false), 350);
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
      scheduleAutoSave();
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
      scheduleAutoSave();
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
    scheduleAutoSave();
  };
  en.onchange = () => {
    config.autoRole = { ...(config.autoRole || {}), enabled: en.checked };
    scheduleAutoSave();
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
  scheduleAutoSave();
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
    scheduleAutoSave();
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

window.addEventListener('beforeunload', () => { if (dirty) saveLocalBackup(); });
window.addEventListener('pagehide', () => { if (dirty) saveLocalBackup(); });

init();
