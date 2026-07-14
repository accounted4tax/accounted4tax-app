// Accounted4Tax Practice Manager — Auth

const Auth = {
  currentUser: null,

  async init() {
    const { data } = await sb.auth.getSession();
    this.currentUser = data.session ? data.session.user : null;

    sb.auth.onAuthStateChange((_event, session) => {
      this.currentUser = session ? session.user : null;
      if (this.currentUser) {
        App.renderShell();
        Router.handleRoute();
      } else {
        App.renderLogin();
      }
    });

    return this.currentUser;
  },

  async signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    await sb.auth.signOut();
  }
};
