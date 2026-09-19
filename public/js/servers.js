async function load() {
  const me = await fetch('/api/me').then(r => r.json());
  if (!me.loggedIn) { location.href = '/'; return; }

  const mini = document.getElementById('user-mini');
  const name = me.user.global_name || me.user.username;
  if (me.user.avatar) {
    mini.innerHTML = `<img src="https://cdn.discordapp.com/avatars/${me.user.id}/${me.user.avatar}.png?size=64" alt="" /> ${name}`;
  } else {
    mini.textContent = name;
  }

  if (me.inviteUrl) document.getElementById('invite-link').href = me.inviteUrl;

  await renderServers();
}

async function renderServers() {
  const grid = document.getElementById('servers-grid');
  grid.innerHTML = '<div class="loading">Cargando servidores…</div>';

  try {
    const data = await fetch('/api/servers', { credentials: 'include' }).then(r => r.json());
    if (data.inviteUrl) document.getElementById('invite-link').href = data.inviteUrl;

    if (data.warning) {
      grid.innerHTML = `<div class="loading" style="color:#fee75c">${data.warning}<br/><br/>Añade BOT_TOKEN en el .env del panel y reinicia.</div>`;
      // still continue to show servers below if any
    }

    const servers = data.servers || [];
    if (!servers.length) {
      grid.innerHTML = `
        <div class="loading">
          No tienes servidores con permisos de administrador.<br /><br />
          <a href="${data.inviteUrl || '#'}" class="btn btn-primary" target="_blank">Invitar bot</a>
        </div>`;
      return;
    }

    grid.innerHTML = servers.map(s => {
      const icon = s.icon
        ? `<img src="https://cdn.discordapp.com/icons/${s.id}/${s.icon}.png?size=64" alt="" />`
        : s.name[0].toUpperCase();
      const badge = s.botIn
        ? '<span class="server-badge ok">● Bot conectado</span>'
        : '<span class="server-badge no">○ Bot no está aquí</span>';
      const action = s.botIn
        ? `<a href="/panel/${s.id}" class="btn btn-sm btn-primary">Configurar</a>`
        : `<a href="${data.inviteUrl}&guild_id=${s.id}" class="btn btn-sm btn-invite" target="_blank">Invitar</a>`;
      const cls = s.botIn ? 'server-card' : 'server-card disabled';

      return `
        <div class="${cls}" ${s.botIn ? `onclick="location.href='/panel/${s.id}'"` : ''}>
          <div class="server-icon">${icon}</div>
          <div class="server-info">
            <strong>${escapeHtml(s.name)}</strong>
            ${badge}
          </div>
          <div class="server-action" onclick="event.stopPropagation()">${action}</div>
        </div>`;
    }).join('');
  } catch (e) {
    grid.innerHTML = `<div class="loading">Error al cargar: ${e.message}</div>`;
  }
}

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

document.getElementById('btn-refresh').addEventListener('click', () => {
  // Re-login would refresh guilds; for now just re-fetch
  renderServers();
});

load();
