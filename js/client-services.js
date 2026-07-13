// Accounted4Tax Practice Manager — Assigned services panel (shown on client detail page)

const CLIENT_SERVICE_STATUSES = ['pending', 'active', 'completed', 'cancelled'];

const ClientServicesPanel = {
  async render(clientId, containerEl) {
    containerEl.innerHTML = `<p class="muted-line">Loading services…</p>`;

    const [assignedRes, catalogueRes] = await Promise.all([
      sb.from('client_services').select('*, services_catalogue(name, billing_type)').eq('client_id', clientId).order('created_at', { ascending: false }),
      sb.from('services_catalogue').select('id, name, default_price, price_label, billing_type').order('sort_order', { ascending: true })
    ]);

    if (assignedRes.error) {
      containerEl.innerHTML = `<p class="page-error">Could not load services: ${assignedRes.error.message}</p>`;
      return;
    }

    this.clientId = clientId;
    this.assigned = assignedRes.data || [];
    this.catalogue = catalogueRes.data || [];
    this.containerEl = containerEl;
    this.draw();
  },

  draw() {
    this.containerEl.innerHTML = `
      <div class="panel-header-row">
        <button type="button" id="assign-service-btn" class="btn btn-secondary btn-sm">+ Assign service</button>
      </div>
      ${this.assigned.length === 0
        ? `<p class="empty-state">No services assigned to this client yet.</p>`
        : `<table class="data-table data-table-compact">
            <thead><tr><th>Service</th><th>Status</th><th>Price</th><th>Tax year</th><th></th></tr></thead>
            <tbody>
              ${this.assigned.map(cs => `
                <tr>
                  <td>${cs.services_catalogue ? cs.services_catalogue.name : '—'}</td>
                  <td>${statusPill(cs.status)}</td>
                  <td>${cs.price_label || Fmt.money(cs.custom_price)}</td>
                  <td class="muted-line">${cs.tax_year || '—'}</td>
                  <td class="align-right"><button class="btn btn-danger-outline btn-sm" data-remove="${cs.id}">Remove</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
      }
    `;
    document.getElementById('assign-service-btn').addEventListener('click', () => this.openAssignForm());
    this.containerEl.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => this.handleRemove(btn.dataset.remove));
    });
  },

  openAssignForm() {
    if (this.catalogue.length === 0) {
      alert('Your services catalogue is empty. Add services under the Services section first.');
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>Assign service</h3>
        <form id="assign-service-form">
          <label class="form-field"><span>Service *</span>
            <select class="input input-select" name="service_id" required>
              ${this.catalogue.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
          </label>
          <div class="form-grid">
            <label class="form-field"><span>Status</span>
              <select class="input input-select" name="status">
                ${CLIENT_SERVICE_STATUSES.map(s => `<option value="${s}" ${s === 'active' ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </label>
            <label class="form-field"><span>Custom price (£)</span><input class="input" type="number" step="0.01" name="custom_price" /></label>
            <label class="form-field"><span>Tax year</span><input class="input" name="tax_year" placeholder="e.g. 2025/26" /></label>
            <label class="form-field"><span>Period start</span><input class="input" type="date" name="period_start" /></label>
            <label class="form-field"><span>Period end</span><input class="input" type="date" name="period_end" /></label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Assign service</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#assign-service-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        client_id: this.clientId,
        service_id: fd.get('service_id'),
        status: fd.get('status'),
        custom_price: fd.get('custom_price') ? Number(fd.get('custom_price')) : null,
        tax_year: fd.get('tax_year') || null,
        period_start: fd.get('period_start') || null,
        period_end: fd.get('period_end') || null
      };
      try {
        const { error } = await sb.from('client_services').insert(payload);
        if (error) throw error;
        overlay.remove();
        this.render(this.clientId, this.containerEl);
      } catch (err) {
        alert(`Could not assign service: ${err.message}`);
      }
    });
  },

  async handleRemove(id) {
    if (!confirm('Remove this service from the client?')) return;
    const { error } = await sb.from('client_services').delete().eq('id', id);
    if (error) {
      alert(`Could not remove service: ${error.message}`);
      return;
    }
    this.render(this.clientId, this.containerEl);
  }
};
