// Accounted4Tax Practice Manager — Tasks

const TASK_STATUSES = ['not_started', 'in_progress', 'completed', 'blocked'];

function taskStatusPill(status) {
  const cls = { completed: 'pill-green', in_progress: 'pill-amber', blocked: 'pill-red', not_started: 'pill-grey' }[status] || 'pill-grey';
  return `<span class="pill ${cls}">${(status || '').replace('_', ' ')}</span>`;
}

const TasksPage = {
  allTasks: [],
  allClients: [],
  filterStatus: '',
  filterClient: '',

  async render() {
    const el = App.content();
    el.innerHTML = `<div class="page-loading">Loading tasks…</div>`;

    const [tasksRes, clientsRes] = await Promise.all([
      sb.from('tasks').select('*, clients(full_name)').order('due_date', { ascending: true, nullsFirst: false }),
      sb.from('clients').select('id, full_name').order('full_name', { ascending: true })
    ]);

    if (tasksRes.error) {
      el.innerHTML = `<div class="page-error">Could not load tasks: ${tasksRes.error.message}</div>`;
      return;
    }
    this.allTasks = tasksRes.data || [];
    this.allClients = clientsRes.data || [];
    this.renderList();
  },

  renderList() {
    const el = App.content();
    el.innerHTML = `
      <div class="page-toolbar">
        <select id="filter-status" class="input input-select">
          <option value="">All statuses</option>
          ${TASK_STATUSES.map(s => `<option value="${s}" ${this.filterStatus === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
        </select>
        <select id="filter-client" class="input input-select">
          <option value="">All clients</option>
          ${this.allClients.map(c => `<option value="${c.id}" ${this.filterClient === c.id ? 'selected' : ''}>${c.full_name}</option>`).join('')}
        </select>
        <button id="add-task-btn" class="btn btn-primary">+ Add task</button>
      </div>
      <div id="tasks-table-wrap"></div>
    `;
    document.getElementById('filter-status').addEventListener('change', (e) => { this.filterStatus = e.target.value; this.renderTable(); });
    document.getElementById('filter-client').addEventListener('change', (e) => { this.filterClient = e.target.value; this.renderTable(); });
    document.getElementById('add-task-btn').addEventListener('click', () => this.openForm(null));
    this.renderTable();
  },

  filteredTasks() {
    return this.allTasks.filter(t => {
      if (this.filterStatus && t.status !== this.filterStatus) return false;
      if (this.filterClient && t.client_id !== this.filterClient) return false;
      return true;
    });
  },

  renderTable() {
    const wrap = document.getElementById('tasks-table-wrap');
    const rows = this.filteredTasks();
    if (rows.length === 0) {
      wrap.innerHTML = `<p class="empty-state">No tasks match your filters.</p>`;
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Task</th><th>Client</th><th>Status</th><th>Due date</th><th></th></tr></thead>
        <tbody>
          ${rows.map(t => `
            <tr>
              <td>
                <div>${t.title}</div>
                ${t.description ? `<div class="muted-line" style="font-size:12px;">${t.description}</div>` : ''}
              </td>
              <td class="muted-line">${t.clients ? t.clients.full_name : '—'}</td>
              <td>${taskStatusPill(t.status)}</td>
              <td class="${t.due_date && t.due_date < today && t.status !== 'completed' ? 'pill-red' : 'muted-line'}">${Fmt.date(t.due_date)}</td>
              <td class="align-right">
                ${t.status !== 'completed' ? `<button class="btn btn-secondary btn-sm" data-complete="${t.id}">Mark complete</button>` : ''}
                <button class="btn btn-secondary btn-sm" data-edit="${t.id}">Edit</button>
                <button class="btn btn-danger-outline btn-sm" data-delete="${t.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => this.openForm(this.allTasks.find(t => t.id === btn.dataset.edit))));
    wrap.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => this.handleDelete(btn.dataset.delete)));
    wrap.querySelectorAll('[data-complete]').forEach(btn => btn.addEventListener('click', () => this.handleComplete(btn.dataset.complete)));
  },

  openForm(task) {
    const isNew = !task;
    const t = task || { client_id: '', title: '', description: '', status: 'not_started', due_date: '', tax_year: '', notes: '' };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>${isNew ? 'Add task' : 'Edit task'}</h3>
        <form id="task-form">
          <label class="form-field"><span>Client *</span>
            <select class="input input-select" name="client_id" required>
              <option value="">Select a client…</option>
              ${this.allClients.map(c => `<option value="${c.id}" ${t.client_id === c.id ? 'selected' : ''}>${c.full_name}</option>`).join('')}
            </select>
          </label>
          <label class="form-field"><span>Title *</span><input class="input" name="title" value="${t.title || ''}" required /></label>
          <label class="form-field"><span>Description</span><input class="input" name="description" value="${t.description || ''}" /></label>
          <div class="form-grid">
            <label class="form-field"><span>Status</span>
              <select class="input input-select" name="status">
                ${TASK_STATUSES.map(s => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
              </select>
            </label>
            <label class="form-field"><span>Due date</span><input class="input" type="date" name="due_date" value="${t.due_date || ''}" /></label>
            <label class="form-field"><span>Tax year</span><input class="input" name="tax_year" value="${t.tax_year || ''}" placeholder="e.g. 2025/26" /></label>
          </div>
          <label class="form-field"><span>Notes</span><textarea class="input textarea" name="notes" rows="3">${t.notes || ''}</textarea></label>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${isNew ? 'Add task' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        client_id: fd.get('client_id'),
        title: fd.get('title'),
        description: fd.get('description') || null,
        status: fd.get('status'),
        due_date: fd.get('due_date') || null,
        tax_year: fd.get('tax_year') || null,
        notes: fd.get('notes') || null
      };
      if (payload.status === 'completed') payload.completed_at = new Date().toISOString();
      try {
        if (isNew) {
          const { error } = await sb.from('tasks').insert(payload);
          if (error) throw error;
        } else {
          const { error } = await sb.from('tasks').update(payload).eq('id', t.id);
          if (error) throw error;
        }
        overlay.remove();
        this.render();
      } catch (err) {
        alert(`Could not save task: ${err.message}`);
      }
    });
  },

  async handleComplete(id) {
    const { error } = await sb.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    if (error) { alert(`Could not update task: ${error.message}`); return; }
    this.render();
  },

  async handleDelete(id) {
    if (!confirm('Delete this task?')) return;
    const { error } = await sb.from('tasks').delete().eq('id', id);
    if (error) { alert(`Could not delete task: ${error.message}`); return; }
    this.render();
  }
};
