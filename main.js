// Accounted4Tax Practice Manager — Bootstrap

Router.register('/dashboard', () => DashboardPage.render());
Router.register('/clients', () => ClientsPage.render());
Router.register('/clients/:id', (params) => ClientsPage.renderDetail(params));
Router.register('/services', () => ServicesPage.render());
Router.register('/tasks', () => TasksPage.render());
Router.register('/deadlines', () => DeadlinesPage.render());
Router.register('/correspondence', () => CorrespondencePage.render());
Router.register('/loes', () => LoesPage.render());
Router.register('/invoices', () => InvoicesPage.render());
Router.register('/settings', () => SettingsPage.render());

(async function bootstrap() {
  App.init();
  Router.init();
  const user = await Auth.init();
  if (user) {
    App.renderShell();
    Router.handleRoute();
  } else {
    App.renderLogin();
  }
})();
