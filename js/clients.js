// Accounted4Tax Practice Manager — Clients

const CLIENT_TYPES = [
  { value: 'sole_trader', label: 'Sole trader' },
  { value: 'limited_company', label: 'Limited company' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'partnership', label: 'Partnership' }
];

const CLIENT_STATUSES = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' }
];

function clientTypeLabel(v) {
  return (CLIENT_TYPES.find(t => t.value === v) || {}).label || v || '—';
}

function statusPill(status) {
  const cls = { active: 'pill-green', onboarding: 'pill-amber', prospect: 'pill-grey', inactive: 'pill-grey' }[status] || 'pill-grey';
  const label = (CLIENT_STATUSES.find(s => s.value === status) || {}).label || status || '—';
  return `<span class="pill ${cls}">${label}</span>`;
}

const ClientsPage = {
  allClients: [],
  filterText: '',
  filterType: '',
  filterStatus: '',

  async render() {
    const el = App.content();
    el.innerHTML = `<div class="page-loading">Loading clients…</div>`;

    const { data, error } = await sb.from('clients').select('*').order('full_name', { ascending: true });
    if (error) {
      el.innerHTML = `<div class="page-error">Could not load clients: ${error.message}</div>`;
      return;
    }
    this.allClients = data || [];
    this.renderList();
  },

  renderList() {
    const el = App.content();
    el.innerHTML = `
      <div class="page-toolbar">
        <input type="search" id="client-search" class="input" placeholder="Search clients by name or email…" value="${this.filterText}" />
        <select id="filter-type" class="input input-select">
          <option value="">All types</option>
          ${CLIENT_TYPES.map(t => `<option value="${t.value}" ${this.filterType === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
        <select id="filter-status" class="input input-select">
          <option value="">All statuses</option>
          ${CLIENT_STATUSES.map(s => `<option value="${s.value}" ${this.filterStatus === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
        <button id="add-client-btn" class="btn btn-primary">+ Add client</button>
      </div>
      <div id="clients-table-wrap"></div>
    `;

    document.getElementById('client-search').addEventListener('input', (e) => {
      this.filterText = e.target.value;
      this.renderTable();
    });
    document.getElementById('filter-type').addEventListener('change', (e) => {
      this.filterType = e.target.value;
      this.renderTable();
    });
    document.getElementById('filter-status').addEventListener('change', (e) => {
      this.filterStatus = e.target.value;
      this.renderTable();
    });
    document.getElementById('add-client-btn').addEventListener('click', () => Router.go('/clients/new'));

    this.renderTable();
  },

  filteredClients() {
    const q = this.filterText.trim().toLowerCase();
    return this.allClients.filter(c => {
      if (this.filterType && c.client_type !== this.filterType) return false;
      if (this.filterStatus && c.status !== this.filterStatus) return false;
      if (q && !(`${c.full_name} ${c.email || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  },

  renderTable() {
    const wrap = document.getElementById('clients-table-wrap');
    const rows = this.filteredClients();

    if (rows.length === 0) {
      wrap.innerHTML = `<p class="empty-state">No clients match your filters.</p>`;
      return;
    }

    wrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Type</th>
            <th>Status</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Client since</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(c => `
            <tr class="clickable-row" data-id="${c.id}">
              <td>
                <div class="cell-with-avatar">
                  <span class="avatar">${Fmt.initials(c.full_name)}</span>
                  <span>${c.full_name}</span>
                </div>
              </td>
              <td>${clientTypeLabel(c.client_type)}</td>
              <td>${statusPill(c.status)}</td>
              <td class="muted-line">${c.email || '—'}</td>
              <td class="muted-line">${c.phone || '—'}</td>
              <td class="muted-line">${Fmt.date(c.client_since)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    wrap.querySelectorAll('.clickable-row').forEach(row => {
      row.addEventListener('click', () => Router.go(`/clients/${row.dataset.id}`));
    });
  },

  async renderDetail(params) {
    const el = App.content();
    const isNew = params.id === 'new';

    let client = {
      full_name: '', client_type: 'sole_trader', status: 'prospect', email: '', phone: '',
      address: '', date_of_birth: '', ni_number: '', utr: '', company_name: '', crn: '',
      ct_utr: '', paye_ref: '', accounts_office_ref: '', vat_number: '', date_of_incorporation: '',
      year_end_date: '', confirmation_statement_date: '', client_since: '', industry: '',
      trading_name: '', referral_source: '', notes_general: '', portal_invited: false,
      portal_active: false, portal_email: ''
    };

    if (!isNew) {
      el.innerHTML = `<div class="page-loading">Loading client…</div>`;
      const { data, error } = await sb.from('clients').select('*').eq('id', params.id).single();
      if (error) {
        el.innerHTML = `<div class="page-error">Could not load client: ${error.message}</div>`;
        return;
      }
      client = data;
    }

    el.innerHTML = `
      <div class="page-back">
        <a href="#/clients">&larr; Back to clients</a>
      </div>
      <form id="client-form" class="detail-form">
        <div class="detail-form-header">
          <h2>${isNew ? 'New client' : client.full_name}</h2>
          <div class="detail-form-actions">
            ${!isNew ? `<button type="button" id="delete-client-btn" class="btn btn-danger-outline">Delete</button>` : ''}
            <button type="submit" class="btn btn-primary">${isNew ? 'Create client' : 'Save changes'}</button>
          </div>
        </div>

        <div class="form-section">
          <h3>Overview</h3>
          <div class="form-grid">
            ${this.field('full_name', 'Full name', client.full_name, 'text', true)}
            ${this.selectField('client_type', 'Client type', client.client_type, CLIENT_TYPES)}
            ${this.selectField('status', 'Status', client.status, CLIENT_STATUSES)}
            ${this.field('email', 'Email', client.email, 'email', true)}
            ${this.field('phone', 'Phone', client.phone, 'text')}
            ${this.field('address', 'Address', client.address, 'text')}
            ${this.field('industry', 'Industry', client.industry, 'text')}
            ${this.field('referral_source', 'Referral source', client.referral_source, 'text')}
            ${this.field('client_since', 'Client since', client.client_since, 'date')}
          </div>
        </div>

        <div class="form-section">
          <h3>Individual details</h3>
          <div class="form-grid">
            ${this.field('date_of_birth', 'Date of birth', client.date_of_birth, 'date')}
            ${this.field('ni_number', 'NI number', client.ni_number, 'text')}
            ${this.field('utr', 'UTR (Self Assessment)', client.utr, 'text')}
          </div>
        </div>

        <div class="form-section">
          <h3>Company details</h3>
          <div class="form-grid">
            ${this.field('company_name', 'Company name', client.company_name, 'text')}
            ${this.field('trading_name', 'Trading name', client.trading_name, 'text')}
            ${this.field('crn', 'Company registration number', client.crn, 'text')}
            ${this.field('ct_utr', 'CT UTR', client.ct_utr, 'text')}
            ${this.field('paye_ref', 'PAYE reference', client.paye_ref, 'text')}
            ${this.field('accounts_office_ref', 'Accounts office reference', client.accounts_office_ref, 'text')}
            ${this.field('vat_number', 'VAT number', client.vat_number, 'text')}
            ${this.field('date_of_incorporation', 'Date of incorporation', client.date_of_incorporation, 'date')}
            ${this.field('year_end_date', 'Year end date', client.year_end_date, 'text')}
            ${this.field('confirmation_statement_date', 'Confirmation statement date', client.confirmation_statement_date, 'date')}
          </div>
        </div>

        <div class="form-section">
          <h3>Client portal</h3>
          <div class="form-grid">
            ${this.field('portal_email', 'Portal email', client.portal_email, 'email')}
            ${this.checkboxField('portal_invited', 'Portal invite sent', client.portal_invited)}
            ${this.checkboxField('portal_active', 'Portal active', client.portal_active)}
          </div>
        </div>

        <div class="form-section">
          <h3>Notes</h3>
          <textarea name="notes_general" class="input textarea" rows="4">${client.notes_general || ''}</textarea>
        </div>
      </form>

      ${!isNew ? `
        <div class="detail-form" style="margin-top:20px;">
          <div class="detail-form-header"><h2 style="font-size:16px;">Assigned services</h2></div>
          <div class="form-section" id="client-services-panel"></div>
        </div>
      ` : ''}
    `;

    document.getElementById('client-form').addEventListener('submit', (e) => this.handleSave(e, isNew, params.id));
    if (!isNew) {
      document.getElementById('delete-client-btn').addEventListener('click', () => this.handleDelete(params.id, client.full_name));
      ClientServicesPanel.render(params.id, document.getElementById('client-services-panel'));
    }
  },

  field(name, label, value, type = 'text', required = false) {
    return `
      <label class="form-field">
        <span>${label}${required ? ' *' : ''}</span>
        <input type="${type}" name="${name}" class="input" value="${value ?? ''}" ${required ? 'required' : ''} />
      </label>
    `;
  },

  selectField(name, label, value, options) {
    return `
      <label class="form-field">
        <span>${label}</span>
        <select name="${name}" class="input input-select">
          ${options.map(o => `<option value="${o.value}" ${value === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </label>
    `;
  },

  checkboxField(name, label, value) {
    return `
      <label class="form-field form-field-checkbox">
        <input type="checkbox" name="${name}" ${value ? 'checked' : ''} />
        <span>${label}</span>
      </label>
    `;
  },

  async handleSave(e, isNew, id) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    const formData = new FormData(form);
    const payload = {};
    for (const [key, value] of formData.entries()) {
      payload[key] = value === '' ? null : value;
    }
    payload.portal_invited = form.querySelector('[name="portal_invited"]').checked;
    payload.portal_active = form.querySelector('[name="portal_active"]').checked;

    try {
      if (isNew) {
        const { data, error } = await sb.from('clients').insert(payload).select().single();
        if (error) throw error;
        Router.go(`/clients/${data.id}`);
      } else {
        const { error } = await sb.from('clients').update(payload).eq('id', id);
        if (error) throw error;
        Router.go('/clients');
      }
    } catch (err) {
      alert(`Could not save client: ${err.message}`);
      btn.disabled = false;
      btn.textContent = isNew ? 'Create client' : 'Save changes';
    }
  },

  async handleDelete(id, name) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    const { error } = await sb.from('clients').delete().eq('id', id);
    if (error) {
      alert(`Could not delete client: ${error.message}`);
      return;
    }
    Router.go('/clients');
  }
};
