// Accounted4Tax Practice Manager — Deadlines (MTD submissions)

const MTD_STATUSES = ['not_started', 'in_progress', 'submitted', 'late'];

function deadlineStatusPill(status) {
  const cls = { submitted: 'pill-green', in_progress: 'pill-amber', late: 'pill-red', not_started: 'pill-grey' }[status] || 'pill-grey';
  return `<span class="pill ${cls}">${(status || '').replace('_', ' ')}</span>`;
}

const DeadlinesPage = {
  allDeadlines: [],
  allClients: [],
  filterStatus: '',

  async render() {
    const el = App.content();
    el.innerHTML = `<div class="page-loading">Loading deadlines…</div>`;

    const [deadlinesRes, clientsRes] = await Promise.all([
      sb.from('mtd_submissions').select('*, clients(full_name)').order('deadline', { ascending: true, nullsFirst: false }),
      sb.from('clients').select('id, full_name').order('full_name', { ascending: true })
    ]);

    if (deadlinesRes.error) {
      el.innerHTML = `<div class="page-error">Could not load deadlines: ${deadlinesRes.error.message}</div>`;
      return;
    }
    this.allDeadlines = deadlinesRes.data || [];
    this.allClients = clientsRes.data || [];
    this.renderList();
  },

  renderList() {
    const el = App.content();
    el.innerHTML = `
      <div class="page-toolbar">
        <select id="filter-status" class="input input-select">
          <option value="">All statuses</option>
          ${MTD_STATUSES.map(s => `<option value="${s}" ${this.filterStatus === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
        </select>
        <button id="add-deadline-btn" class="btn btn-primary">+ Add deadline</button>
      </div>
      <div id="deadlines-table-wrap"></div>
    `;
    document.getElementById('filter-status').addEventListener('change', (e) => { this.filterStatus = e.target.value; this.renderTable(); });
    document.getElementById('add-deadline-btn').addEventListener('click', () => this.openForm(null));
    this.renderTable();
  },

  filteredDeadlines() {
    return this.allDeadlines.filter(d => !this.filterStatus || d.status === this.filterStatus);
  },

  renderTable() {
    const wrap = document.getElementById('deadlines-table-wrap');
    const rows = this.filteredDeadlines();
    if (rows.length === 0) {
      wrap.innerHTML = `<p class="empty-state">No deadlines match your filters.</p>`;
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Client</th><th>Quarter</th><th>Deadline</th><th>Status</th><th>Income / Expenses</th><th></th></tr></thead>
        <tbody>
          ${rows.map(d => `
            <tr>
              <td>${d.clients ? d.clients.full_name : '—'}</td>
              <td class="muted-line">${d.quarter_label || `Q${d.quarter}`} · ${d.tax_year || ''}</td>
              <td class="${d.deadline && d.deadline < today && d.status !== 'submitted' ? 'pill-red' : 'muted-line'}">${Fmt.date(d.deadline)}</td>
              <td>${deadlineStatusPill(d.status)}</td>
              <td class="muted-line">${Fmt.money(d.total_income)} / ${Fmt.money(d.total_expenses)}</td>
              <td class="align-right">
                <button class="btn btn-secondary btn-sm" data-edit="${d.id}">Edit</button>
                <button class="btn btn-danger-outline btn-sm" data-delete="${d.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => this.openForm(this.allDeadlines.find(d => d.id === btn.dataset.edit))));
    wrap.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => this.handleDelete(btn.dataset.delete)));
  },

  openForm(deadline) {
    const isNew = !deadline;
    const d = deadline || {
      client_id: '', tax_year: '', quarter: '', quarter_label: '', period_start: '', period_end: '',
      deadline: '', status: 'not_started', total_income: '', total_expenses: '', hmrc_ref: '', software: '', notes: ''
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>${isNew ? 'Add deadline' : 'Edit deadline'}</h3>
        <form id="deadline-form">
          <label class="form-field"><span>Client *</span>
            <select class="input input-select" name="client_id" required>
              <option value="">Select a client…</option>
              ${this.allClients.map(c => `<option value="${c.id}" ${d.client_id === c.id ? 'selected' : ''}>${c.full_name}</option>`).join('')}
            </select>
          </label>
          <div class="form-grid">
            <label class="form-field"><span>Tax year *</span><input class="input" name="tax_year" value="${d.tax_year || ''}" placeholder="2025/26" required /></label>
            <label class="form-field"><span>Quarter (1–4) *</span><input class="input" type="number" min="1" max="4" name="quarter" value="${d.quarter || ''}" required /></label>
            <label class="form-field"><span>Quarter label</span><input class="input" name="quarter_label" value="${d.quarter_label || ''}" placeholder="e.g. Q1 2025/26" /></label>
            <label class="form-field"><span>Period start</span><input class="input" type="date" name="period_start" value="${d.period_start || ''}" /></label>
            <label class="form-field"><span>Period end</span><input class="input" type="date" name="period_end" value="${d.period_end || ''}" /></label>
            <label class="form-field"><span>Deadline date</span><input class="input" type="date" name="deadline" value="${d.deadline || ''}" /></label>
            <label class="form-field"><span>Status</span>
              <select class="input input-select" name="status">
                ${MTD_STATUSES.map(s => `<option value="${s}" ${d.status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
              </select>
            </label>
            <label class="form-field"><span>Total income (£)</span><input class="input" type="number" step="0.01" name="total_income" value="${d.total_income ?? ''}" /></label>
            <label class="form-field"><span>Total expenses (£)</span><input class="input" type="number" step="0.01" name="total_expenses" value="${d.total_expenses ?? ''}" /></label>
            <label class="form-field"><span>HMRC reference</span><input class="input" name="hmrc_ref" value="${d.hmrc_ref || ''}" /></label>
            <label class="form-field"><span>Software</span><input class="input" name="software" value="${d.software || ''}" placeholder="e.g. FreeAgent" /></label>
          </div>
          <label class="form-field"><span>Notes</span><textarea class="input textarea" name="notes" rows="3">${d.notes || ''}</textarea></label>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${isNew ? 'Add deadline' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#deadline-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        client_id: fd.get('client_id'),
        tax_year: fd.get('tax_year'),
        quarter: Number(fd.get('quarter')),
        quarter_label: fd.get('quarter_label') || null,
        period_start: fd.get('period_start') || null,
        period_end: fd.get('period_end') || null,
        deadline: fd.get('deadline') || null,
        status: fd.get('status'),
        total_income: fd.get('total_income') ? Number(fd.get('total_income')) : null,
        total_expenses: fd.get('total_expenses') ? Number(fd.get('total_expenses')) : null,
        hmrc_ref: fd.get('hmrc_ref') || null,
        software: fd.get('software') || null,
        notes: fd.get('notes') || null
      };
      if (payload.status === 'submitted') payload.submitted_at = new Date().toISOString();
      try {
        if (isNew) {
          const { error } = await sb.from('mtd_submissions').insert(payload);
          if (error) throw error;
        } else {
          const { error } = await sb.from('mtd_submissions').update(payload).eq('id', d.id);
          if (error) throw error;
        }
        overlay.remove();
        this.render();
      } catch (err) {
        alert(`Could not save deadline: ${err.message}`);
      }
    });
  },

  async handleDelete(id) {
    if (!confirm('Delete this deadline record?')) return;
    const { error } = await sb.from('mtd_submissions').delete().eq('id', id);
    if (error) { alert(`Could not delete: ${error.message}`); return; }
    this.render();
  }
};
