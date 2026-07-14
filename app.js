// Accounted4Tax Practice Manager — App shell

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: 'grid' },
  { path: '/clients', label: 'Clients', icon: 'users' },
  { path: '/services', label: 'Services', icon: 'layers' },
  { path: '/tasks', label: 'Tasks', icon: 'check-square' },
  { path: '/deadlines', label: 'Deadlines', icon: 'calendar' },
  { path: '/correspondence', label: 'Correspondence', icon: 'mail' },
  { path: '/loes', label: 'Letters of Engagement', icon: 'file-text' },
  { path: '/invoices', label: 'Invoices', icon: 'credit-card' },
  { path: '/settings', label: 'Settings', icon: 'settings' }
];

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  'check-square': '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  mail: '<path d="M4 4h16v16H4z"/><polyline points="22,6 12,13 2,6"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
};

function icon(name, size = 18) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

const App = {
  root: null,

  init() {
    this.root = document.getElementById('app-root');
  },

  renderLogin(errorMsg) {
    this.root.innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="login-mark">A4T</div>
          <h1>Accounted4Tax</h1>
          <p class="login-sub">Practice Manager</p>
          ${errorMsg ? `<div class="login-error">${errorMsg}</div>` : ''}
          <form id="login-form">
            <label>Email
              <input type="email" id="login-email" required autocomplete="username" />
            </label>
            <label>Password
              <input type="password" id="login-password" required autocomplete="current-password" />
            </label>
            <button type="submit" class="btn btn-primary btn-block">Sign in</button>
          </form>
        </div>
      </div>
    `;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      try {
        await Auth.signIn(email, password);
      } catch (err) {
        this.renderLogin(err.message || 'Sign in failed. Check your details and try again.');
      }
    });
  },

  renderShell() {
    this.root.innerHTML = `
      <div class="shell">
        <aside class="sidebar">
          <div class="sidebar-brand">
            <span class="brand-mark">A4T</span>
            <span class="brand-name">Accounted4Tax</span>
          </div>
          <nav class="sidebar-nav" id="sidebar-nav">
            ${NAV_ITEMS.map(item => `
              <a href="#${item.path}" class="nav-item" data-path="${item.path}">
                ${icon(item.icon)}
                <span>${item.label}</span>
              </a>
            `).join('')}
          </nav>
          <div class="sidebar-footer">
            <button id="signout-btn" class="nav-item nav-item-muted">
              ${icon('settings', 16)}
              <span>Sign out</span>
            </button>
          </div>
        </aside>
        <div class="main-col">
          <header class="topbar">
            <div id="topbar-title" class="topbar-title">Dashboard</div>
            <div class="topbar-user">${Auth.currentUser ? Auth.currentUser.email : ''}</div>
          </header>
          <main class="content" id="content"></main>
        </div>
      </div>
    `;

    document.getElementById('signout-btn').addEventListener('click', () => Auth.signOut());
  },

  setActiveNav(path) {
    document.querySelectorAll('.nav-item[data-path]').forEach(el => {
      el.classList.toggle('active', path.startsWith(el.dataset.path));
    });
    const navItem = NAV_ITEMS.find(n => path.startsWith(n.path));
    const titleEl = document.getElementById('topbar-title');
    if (titleEl && navItem) titleEl.textContent = navItem.label;
  },

  content() {
    return document.getElementById('content');
  }
};

// Small shared helpers used across pages
const Fmt = {
  money(n) {
    if (n === null || n === undefined || n === '') return '—';
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
  },
  date(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  initials(name) {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  }
};
