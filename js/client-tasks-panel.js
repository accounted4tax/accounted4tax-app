// Accounted4Tax Practice Manager — Tasks panel (shown on client detail page)
// Reuses TASK_STATUSES / taskStatusPill defined in tasks.js

const ClientTasksPanel = {
  async render(clientId, containerEl, opts) {
    containerEl.innerHTML = `<p class="muted-line">Loading tasks…</p>`;
    this.opts = opts || {};
    this.clientId = clientId;
    this.containerEl = containerEl;

    const { data, error } = await sb.from('tasks').select('*').eq('client_id', clientId).order('due_date', { ascending: true, nullsFirst: false });
    if (error) {
      containerEl.innerHTML = `<p class="page-error">Could not load tasks: ${error.message}</p>`;
      return;
    }
    this.tasks = data || [];
    this.draw();
  },

  draw() {
    const limit = this.opts.limit;
    const rows = limit ? this.tasks.slice(0, limit) : this.tasks;
    const hasMore = limit && this.tasks.length > limit;
    const today = new Date().toISOString().slice(0, 10);

    this.containerEl.innerHTML = `
      <div class="panel-header-row">
        <button type="button" id="add-task-btn" class="btn btn-secondary btn-sm">+ Add</button>
      </div>
      ${rows.length === 0
        ? `<p class="empty-state">No tasks yet.</p>`
        : rows.map(t => `
            <div class="mini-row">
              <div>
                <div style="font-size:13px;">${t.title}</div>
                <div style="margin-top:2px;">${taskStatusPill(t.status)}</div>
              </div>
              <div class="${t.due_date && t.due_date < today && t.status !== 'completed' ? 'pill-red' : 'muted-line'}" style="font-size:12px;">${Fmt.date(t.due_date)}</div>
            </div>
          `).join('')
      }
      ${hasMore ? `<div style="padding:8px 0 0;"><a href="#" id="tasks-view-all">View all (${this.tasks.length}) &rarr;</a></div>` : ''}
    `;
    document.getElementById('add-task-btn').addEventListener('click', () => this.openForm());
    const viewAllLink = document.getElementById('tasks-view-all');
    if (viewAllLink) {
      viewAllLink.addEventListener('click', (e) => {
        e.preventDefault();
        TasksPage.filterClient = this.clientId;
        Router.go('/tasks');
      });
    }
  },

  openForm() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>Add task</h3>
        <form id="client-task-form">
          <label class="form-field"><span>Title *</span><input class="input" name="title" required /></label>
          <label class="form-field"><span>Description</span><input class="input" name="description" /></label>
          <div class="form-grid">
            <label class="form-field"><span>Status</span>
              <select class="input input-select" name="status">
                ${TASK_STATUSES.map(s => `<option value="${s}">${s.replace('_', ' ')}</option>`).join('')}
              </select>
            </label>
            <label class="form-field"><span>Due date</span><input class="input" type="date" name="due_date" /></label>
            <label class="form-field"><span>Tax year</span><input class="input" name="tax_year" placeholder="e.g. 2025/26" /></label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Add task</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#client-task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        client_id: this.clientId,
        title: fd.get('title'),
        description: fd.get('description') || null,
        status: fd.get('status'),
        due_date: fd.get('due_date') || null,
        tax_year: fd.get('tax_year') || null
      };
      if (payload.status === 'completed') payload.completed_at = new Date().toISOString();
      try {
        const { error } = await sb.from('tasks').insert(payload);
        if (error) throw error;
        overlay.remove();
        this.render(this.clientId, this.containerEl, this.opts);
      } catch (err) {
        alert(`Could not save task: ${err.message}`);
      }
    });
  }
};
