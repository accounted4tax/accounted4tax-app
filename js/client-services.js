// Accounted4Tax Practice Manager — Assigned services panel (shown on client detail page)

const CLIENT_SERVICE_STATUSES = ['active', 'paused', 'completed', 'cancelled'];
const CLIENT_WORK_STATUSES = { not_started: 'Not started', in_progress: 'In progress', awaiting_info: 'Awaiting info', sent_for_approval: 'Sent for approval', approved: 'Approved', submitted: 'Submitted' };

function clientServiceStatusPill(status) {
  const cls = { active: 'pill-green', paused: 'pill-amber', completed: 'pill-grey', cancelled: 'pill-red' }[status] || 'pill-grey';
  return `<span class="pill ${cls}">${status || '—'}</span>`;
}

const ClientServicesPanel = {
  async render(clientId, containerEl, opts) {
    containerEl.innerHTML = `<p class="muted-line">Loading services…</p>`;
    this.opts = opts || {};
    this.showAll = this.showAll || false;

    const [assignedRes, catalogueRes, mtdRes, clientRes] = await Promise.all([
      sb.from('client_services').select('*, services_catalogue(name, billing_type)').eq('client_id', clientId).order('created_at', { ascending: false }),
      sb.from('services_catalogue').select('id, name, default_price, price_label, billing_type').order('sort_order', { ascending: true }),
      sb.from('mtd_submissions').select('client_service_id, deadline, status, quarter_label').eq('client_id', clientId).not('deadline', 'is', null),
      sb.from('clients').select('confirmation_statement_date').eq('id', clientId).maybeSingle()
    ]);

    if (assignedRes.error) {
      containerEl.innerHTML = `<p class="page-error">Could not load services: ${Esc(assignedRes.error.message)}</p>`;
      return;
    }

    this.clientId = clientId;
    this.assigned = assignedRes.data || [];
    this.catalogue = catalogueRes.data || [];
    this.mtd = mtdRes.data || [];
    this.client = (clientRes && clientRes.data) || {};
    this.containerEl = containerEl;
    this.draw();
  },

  // Closest deadline for a service: an open MTD/return row linked to it, otherwise worked out from the period.
  nextDeadline(cs) {
    const today = new Date().toISOString().slice(0, 10);
    const open = this.mtd.filter(m => m.client_service_id === cs.id && !/submitted|filed|done/i.test(m.status || '')).map(m => m.deadline).sort();
    if (open.length) return { date: open.find(d => d >= today) || open[open.length - 1], est: false };
    const d = pmServiceDeadline(cs, this.client);
    return d ? { date: d.date, est: true, why: d.why } : null;
  },

  draw() {
    const today = new Date().toISOString().slice(0, 10);
    const rows = this.assigned.map(cs => ({ cs, dl: this.nextDeadline(cs) }));
    const key = (r) => r.cs.work_status === 'submitted' || !r.dl ? '9999' : r.dl.date;
    const active = rows.filter(r => r.cs.status === 'active' || r.cs.status === 'paused')
      .sort((a, b) => key(a) < key(b) ? -1 : 1);
    const finished = rows.filter(r => !(r.cs.status === 'active' || r.cs.status === 'paused'));
    const ws = (cs) => `<select class="input input-select" data-work="${cs.id}" style="min-width:150px;">${Object.entries(CLIENT_WORK_STATUSES).map(([k, v]) => `<option value="${k}" ${(cs.work_status || 'not_started') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
    const dlCell = (dl, cs) => {
      if (cs && cs.work_status === 'submitted') return '<span class="pill pill-green">Submitted</span>';
      if (!dl) return '<span class="muted-line">No fixed deadline</span>';
      const days = Math.round((new Date(dl.date) - new Date(today)) / 86400000);
      const cls = days < 0 ? 'pill-red' : days <= 30 ? 'pill-amber' : 'pill-grey';
      return `${Fmt.date(dl.date)} <span class="pill ${cls}">${days < 0 ? `${-days}d overdue` : `${days}d`}</span>${dl.est ? `<div class="muted-line" style="font-size:11px;">${Esc(dl.why || 'worked out')}</div>` : ''}`;
    };
    const table = (list) => `<div style="overflow-x:auto;"><table class="data-table data-table-compact" style="width:100%;">
      <thead><tr><th>Service</th><th>Period</th><th>Next deadline</th><th>Work status</th><th>Service</th><th>Price</th><th></th></tr></thead>
      <tbody>${list.map(({ cs, dl }) => `
        <tr>
          <td><b>${Esc(cs.services_catalogue ? cs.services_catalogue.name : '—')}</b></td>
          <td class="muted-line">${Esc(pmRowKey(cs) ? pmKeyLabel(pmRowKey(cs)) : '—')}</td>
          <td>${dlCell(dl, cs)}</td>
          <td>${ws(cs)}</td>
          <td>${clientServiceStatusPill(cs.status)}</td>
          <td>${Esc(cs.price_label || Fmt.money(cs.custom_price))}</td>
          <td class="align-right" style="white-space:nowrap;">
            <button class="btn btn-secondary btn-sm" data-edit="${cs.id}">Edit</button>
            <button class="btn btn-danger-outline btn-sm" data-remove="${cs.id}">Remove</button>
          </td>
        </tr>`).join('')}</tbody></table></div>`;

    this.containerEl.innerHTML = `
      <div class="panel-header-row">
        <button type="button" id="assign-service-btn" class="btn btn-secondary btn-sm">+ Add</button>
      </div>
      ${active.length ? table(active) : `<p class="empty-state">No active services.</p>`}
      ${finished.length ? `<details style="margin-top:10px;" ${this.showAll ? 'open' : ''} id="services-finished"><summary style="cursor:pointer;font-size:13px;font-weight:600;">Completed or cancelled (${finished.length})</summary>${table(finished)}</details>` : ''}
    `;
    document.getElementById('assign-service-btn').addEventListener('click', () => this.openForm(null));
    const fin = document.getElementById('services-finished');
    if (fin) fin.addEventListener('toggle', () => { this.showAll = fin.open; });
    this.containerEl.querySelectorAll('[data-work]').forEach(sel => {
      sel.addEventListener('change', async () => {
        sel.disabled = true;
        const { error } = await sb.from('client_services').update({ work_status: sel.value }).eq('id', sel.dataset.work);
        sel.disabled = false;
        if (error) { alert(`Could not save: ${error.message}`); return; }
        const cs = this.assigned.find(a => a.id === sel.dataset.work); if (cs) cs.work_status = sel.value;
      });
    });
    this.containerEl.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => this.openForm(this.assigned.find(a => a.id === btn.dataset.edit)));
    });
    this.containerEl.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => this.handleRemove(btn.dataset.remove));
    });
  },

  openForm(existing) {
    const isNew = !existing;
    if (isNew && this.catalogue.length === 0) {
      alert('Your services catalogue is empty. Add services under the Services section first.');
      return;
    }
    const cs = existing || { service_id: '', status: 'active', custom_price: '', tax_year: '', period_start: '', period_end: '' };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>${isNew ? 'Assign service' : 'Edit assigned service'}</h3>
        <form id="assign-service-form">
          <label class="form-field"><span>Service *</span>
            <select class="input input-select" name="service_id" required ${!isNew ? 'disabled' : ''}>
              ${this.catalogue.map(c => `<option value="${c.id}" ${cs.service_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
            </select>
          </label>
          <div class="form-grid">
            <label class="form-field"><span>Status</span>
              <select class="input input-select" name="status">
                ${CLIENT_SERVICE_STATUSES.map(s => `<option value="${s}" ${cs.status === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </label>
            <label class="form-field"><span>Custom price (£)</span><input class="input" type="number" step="0.01" name="custom_price" value="${cs.custom_price ?? ''}" /></label>
            <label class="form-field"><span>Tax year</span><input class="input" name="tax_year" value="${cs.tax_year || ''}" placeholder="e.g. 2025/26" /></label>
            <label class="form-field"><span>Period start</span><input class="input" type="date" name="period_start" value="${cs.period_start || ''}" /></label>
            <label class="form-field"><span>Period end</span><input class="input" type="date" name="period_end" value="${cs.period_end || ''}" /></label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${isNew ? 'Assign service' : 'Save changes'}</button>
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
        status: fd.get('status'),
        custom_price: fd.get('custom_price') ? Number(fd.get('custom_price')) : null,
        tax_year: fd.get('tax_year') || null,
        period_start: fd.get('period_start') || null,
        period_end: fd.get('period_end') || null
      };
      if (isNew) {
        payload.client_id = this.clientId;
        payload.service_id = fd.get('service_id');
      }
      try {
        if (isNew) {
          const { error } = await sb.from('client_services').insert(payload);
          if (error) throw error;
        } else {
          const { error } = await sb.from('client_services').update(payload).eq('id', cs.id);
          if (error) throw error;
        }
        overlay.remove();
        this.render(this.clientId, this.containerEl, this.opts);
      } catch (err) {
        alert(`Could not save: ${err.message}`);
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
    this.render(this.clientId, this.containerEl, this.opts);
  }
};
