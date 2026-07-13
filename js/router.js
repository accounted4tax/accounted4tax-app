// Accounted4Tax Practice Manager — Router
// Simple hash router: #/dashboard, #/clients, #/clients/:id

const Router = {
  routes: [],

  register(pattern, handler) {
    // pattern like '/clients/:id' -> regex with named group
    const paramNames = [];
    const regexStr = pattern.replace(/:[^/]+/g, (match) => {
      paramNames.push(match.slice(1));
      return '([^/]+)';
    });
    const regex = new RegExp(`^${regexStr}$`);
    this.routes.push({ regex, paramNames, handler });
  },

  handleRoute() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    const path = hash.split('?')[0];

    for (const route of this.routes) {
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
        route.handler(params);
        App.setActiveNav(path);
        return;
      }
    }
    // fallback
    window.location.hash = '#/dashboard';
  },

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
  },

  go(path) {
    window.location.hash = `#${path}`;
  }
};
