// Accounted4Tax Practice Manager — Placeholder pages for later stages
// These will be replaced with full modules in the next build stages
// (Services + Tasks + Deadlines, then Correspondence + LOEs + Invoices,
// then Settings + onboarding + AML/CDD + MTD + intake forms + email templates).

function renderComingSoon(title, description) {
  App.content().innerHTML = `
    <div class="coming-soon">
      <h2>${title}</h2>
      <p>${description}</p>
      <p class="muted-line">This section is built in the next stage of Phase 3.</p>
    </div>
  `;
}

const CorrespondencePage = { render() { renderComingSoon('Correspondence', 'Client email history and templated correspondence will live here.'); } };
const LoesPage = { render() { renderComingSoon('Letters of Engagement', 'LOE generation and signing status will live here.'); } };
const InvoicesPage = { render() { renderComingSoon('Invoices', 'Invoice tracking and FreeAgent references will live here.'); } };
const SettingsPage = { render() { renderComingSoon('Settings', 'Firm settings, onboarding flows, AML/CDD, and email templates will live here.'); } };
