// Accounted4Tax Practice Manager — Services catalogue

const BILLING_TYPES = ['one_off', 'monthly', 'quarterly', 'annual'];

const ServicesPage = {
  allServices: [],

  async render() {
    const el = App.content();
    el.innerHTML = `<div class="page-loading">Loading services…</div>`;

    const { data, error } = await sb.from('services_catalogue').select('*').order('sort_order', { ascending: true });
    if (error) {
      el.innerHTML = `<div class="page-error">Could not load services: ${error.message}</div>`;
      return;
    }
    this.allServices = data || [];
    this.renderList();
  },

  renderList() {
    const el = App.content();
    el.innerHTML = `
      <div class="page-toolbar">
        <p class="muted-line" style="margin:0;">${this.allServices.length} service${this.allServices.length === 1 ? '' : 's'} in your catalogue</p>
        <button id="add-service-btn" class="btn btn-primary">+ Add service</button>
      </div>
      <div id="services-table-wrap"></div>
    `;
    document.getElementById('add-service-btn').addEventListener('click', () => this.openForm(null));
    this.renderTable();
  },

  renderTable() {
    const wrap = document.getElementById('services-table-wrap');
    if (this.allServices.length === 0) {
      wrap.innerHTML = `<p class="empty-state">No services yet. Click "+ Add service" to build your catalogue.</p>`;
      return;
    }
    wrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Client type</th>
            <th>Price</th>
            <th>Billing</th>
            <th>Recurring</th>
            <th>MTD</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${this.allServices.map(s => `
            <tr>
              <td>
                <div>${s.name}</div>
                ${s.description ? `<div class="muted-line" style="font-size:12px;">${s.description}</div>` : ''}
              </td>
              <td>${clientTypeLabel(s.client_type)}</td>
              <td>${s.price_label || Fmt.money(s.default_price)}</td>
              <td class="muted-line">${s.billing_type || '—'}</td>
              <td>${s.is_recurring ? icon('check-square', 15) : '—'}</td>
              <td>${s.is_mtd ? icon('check-square', 15) : '—'}</td>
              <td class="align-right">
                <button class="btn btn-secondary btn-sm" data-edit="${s.id}">Edit</button>
                <button class="btn btn-danger-outline btn-sm" data-delete="${s.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => this.openForm(this.allServices.find(s => s.id === btn.dataset.edit)));
    });
    wrap.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => this.handleDelete(btn.dataset.delete));
    });
  },

  openForm(service) {
    const isNew = !service;
    const s = service || {
      name: '', description: '', client_type: 'sole_trader', default_price: '', price_label: '',
      billing_type: 'monthly', is_recurring: true, is_mtd: false, sort_order: this.allServices.length + 1
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>${isNew ? 'Add service' : 'Edit service'}</h3>
        <form id="service-form">
          <label class="form-field"><span>Name *</span><input class="input" name="name" value="${s.name || ''}" required /></label>
          <label class="form-field"><span>Description</span><input class="input" name="description" value="${s.description || ''}" /></label>
          <div class="form-grid">
            <label class="form-field"><span>Client type</span>
              <select class="input input-select" name="client_type">
                ${CLIENT_TYPES.map(t => `<option value="${t.value}" ${s.client_type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
              </select>
            </label>
            <label class="form-field"><span>Default price (£)</span><input class="input" type="number" step="0.01" name="default_price" value="${s.default_price ?? ''}" /></label>
            <label class="form-field"><span>Price label</span><input class="input" name="price_label" value="${s.price_label || ''}" placeholder="e.g. from £99" /></label>
            <label class="form-field"><span>Billing type</span>
              <select class="input input-select" name="billing_type">
                ${BILLING_TYPES.map(b => `<option value="${b}" ${s.billing_type === b ? 'selected' : ''}>${b.replace('_', ' ')}</option>`).join('')}
              </select>
            </label>
            <label class="form-field"><span>Sort order</span><input class="input" type="number" name="sort_order" value="${s.sort_order ?? ''}" /></label>
          </div>
          <label class="form-field form-field-checkbox"><input type="checkbox" name="is_recurring" ${s.is_recurring ? 'checked' : ''} /><span>Recurring service</span></label>
          <label class="form-field form-field-checkbox"><input type="checkbox" name="is_mtd" ${s.is_mtd ? 'checked' : ''} /><span>MTD-related service</span></label>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${isNew ? 'Add service' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#service-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        name: fd.get('name'),
        description: fd.get('description') || null,
        client_type: fd.get('client_type'),
        default_price: fd.get('default_price') ? Number(fd.get('default_price')) : null,
        price_label: fd.get('price_label') || null,
        billing_type: fd.get('billing_type'),
        sort_order: fd.get('sort_order') ? Number(fd.get('sort_order')) : null,
        is_recurring: e.target.querySelector('[name="is_recurring"]').checked,
        is_mtd: e.target.querySelector('[name="is_mtd"]').checked
      };
      try {
        if (isNew) {
          const { error } = await sb.from('services_catalogue').insert(payload);
          if (error) throw error;
        } else {
          const { error } = await sb.from('services_catalogue').update(payload).eq('id', s.id);
          if (error) throw error;
        }
        overlay.remove();
        this.render();
      } catch (err) {
        alert(`Could not save service: ${err.message}`);
      }
    });
  },

  async handleDelete(id) {
    if (!confirm('Delete this service from your catalogue?')) return;
    const { error } = await sb.from('services_catalogue').delete().eq('id', id);
    if (error) {
      alert(`Could not delete service: ${error.message}`);
      return;
    }
    this.render();
  }
};
