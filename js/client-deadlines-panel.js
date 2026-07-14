// Accounted4Tax Practice Manager — Deadlines panel (shown on client detail page)
// Reuses MTD_STATUSES / deadlineStatusPill defined in deadlines.js

const ClientDeadlinesPanel = {
  async render(clientId, containerEl, opts) {
    containerEl.innerHTML = `<p class="muted-line">Loading deadlines…</p>`;
    this.opts = opts || {};
    this.clientId = clientId;
    this.containerEl = containerEl;

    const [deadlinesRes, servicesRes] = await Promise.all([
      sb.from('mtd_submissions').select('*').eq('client_id', clientId).order('deadline', { ascending: true, nullsFirst: false }),
      sb.from('client_services').select('id, services_catalogue(name)').eq('client_id', clientId)
    ]);
    if (deadlinesRes.error) {
      containerEl.innerHTML = `<p class="page-error">Could not load deadlines: ${deadlinesRes.error.message}</p>`;
      return;
    }
    this.deadlines = deadlinesRes.data || [];
    this.clientServices = servicesRes.data || [];
    this.draw();
  },

  draw() {
    const limit = this.opts.limit;
    const rows = limit ? this.deadlines.slice(0, limit) : this.deadlines;
    const hasMore = limit && this.deadlines.length > limit;
    const today = new Date().toISOString().slice(0, 10);

    this.containerEl.innerHTML = `
      <div class="panel-header-row">
        <button type="button" id="add-deadline-btn" class="btn btn-secondary btn-sm">+ Add</button>
      </div>
      ${rows.length === 0
        ? `<p class="empty-state">No deadlines yet.</p>`
        : rows.map(d => `
            <div class="mini-row">
              <div>
                <div style="font-size:13px;">${d.quarter_label || `Q${d.quarter}`} &middot; ${d.tax_year || ''}</div>
                <div style="margin-top:2px;">${deadlineStatusPill(d.status)}</div>
              </div>
              <div class="${d.deadline && d.deadline < today && !['submitted', 'final_declaration'].includes(d.status) ? 'pill-red' : 'muted-line'}" style="font-size:12px;">${Fmt.date(d.deadline)}</div>
            </div>
          `).join('')
      }
      ${hasMore ? `<div style="padding:8px 0 0;"><a href="#" id="deadlines-view-all">View all (${this.deadlines.length}) &rarr;</a></div>` : ''}
    `;
    document.getElementById('add-deadline-btn').addEventListener('click', () => this.openForm());
    const viewAllLink = document.getElementById('deadlines-view-all');
    if (viewAllLink) {
      viewAllLink.addEventListener('click', (e) => {
        e.preventDefault();
        DeadlinesPage.filterClient = this.clientId;
        Router.go('/deadlines');
      });
    }
  },

  openForm() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>Add deadline</h3>
        <form id="client-deadline-form">
          <label class="form-field"><span>Service (optional)</span>
            <select class="input input-select" name="client_service_id">
              <option value="">— Not linked to a specific service —</option>
              ${this.clientServices.map(cs => `<option value="${cs.id}">${cs.services_catalogue ? cs.services_catalogue.name : 'Service'}</option>`).join('')}
            </select>
          </label>
          <div class="form-grid">
            <label class="form-field"><span>Tax year *</span><input class="input" name="tax_year" placeholder="2025/26" required /></label>
            <label class="form-field"><span>Quarter (1–4) *</span><input class="input" type="number" min="1" max="4" name="quarter" required /></label>
            <label class="form-field"><span>Quarter label</span><input class="input" name="quarter_label" placeholder="e.g. Q1 2025/26" /></label>
            <label class="form-field"><span>Deadline date</span><input class="input" type="date" name="deadline" /></label>
            <label class="form-field"><span>Status</span>
              <select class="input input-select" name="status">
                ${MTD_STATUSES.map(s => `<option value="${s}">${s.replace('_', ' ')}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Add deadline</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#client-deadline-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        client_id: this.clientId,
        client_service_id: fd.get('client_service_id') || null,
        tax_year: fd.get('tax_year'),
        quarter: Number(fd.get('quarter')),
        quarter_label: fd.get('quarter_label') || null,
        deadline: fd.get('deadline') || null,
        status: fd.get('status')
      };
      if (payload.status === 'submitted') payload.submitted_at = new Date().toISOString();
      try {
        const { error } = await sb.from('mtd_submissions').insert(payload);
        if (error) throw error;
        overlay.remove();
        this.render(this.clientId, this.containerEl, this.opts);
      } catch (err) {
        alert(`Could not save deadline: ${err.message}`);
      }
    });
  }
};
