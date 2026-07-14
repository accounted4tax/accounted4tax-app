// Accounted4Tax Practice Manager — Correspondence panel (shown on client detail page)

const CORRESPONDENCE_DIRECTIONS = ['sent', 'received', 'auto', 'internal'];

function directionPill(direction) {
  const cls = { sent: 'pill-green', received: 'pill-amber', auto: 'pill-grey', internal: 'pill-grey' }[direction] || 'pill-grey';
  return `<span class="pill ${cls}">${direction || '—'}</span>`;
}

const ClientCorrespondencePanel = {
  async render(clientId, containerEl, opts) {
    containerEl.innerHTML = `<p class="muted-line">Loading correspondence…</p>`;
    this.opts = opts || {};
    this.showAll = false;
    this.clientId = clientId;
    this.containerEl = containerEl;

    const { data, error } = await sb.from('correspondence').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
    if (error) {
      containerEl.innerHTML = `<p class="page-error">Could not load correspondence: ${error.message}</p>`;
      return;
    }
    this.items = data || [];
    this.draw();
  },

  draw() {
    const limit = this.showAll ? null : this.opts.limit;
    const rows = limit ? this.items.slice(0, limit) : this.items;
    const hasMore = !this.showAll && this.opts.limit && this.items.length > this.opts.limit;

    this.containerEl.innerHTML = `
      <div class="panel-header-row">
        <button type="button" id="add-correspondence-btn" class="btn btn-secondary btn-sm">+ Add</button>
      </div>
      ${rows.length === 0
        ? `<p class="empty-state">No correspondence logged yet.</p>`
        : `<table class="data-table data-table-compact">
            <thead><tr><th>Direction</th><th>Subject</th><th>Sent / logged</th></tr></thead>
            <tbody>
              ${rows.map(c => `
                <tr>
                  <td>${directionPill(c.direction)}</td>
                  <td>${c.subject}</td>
                  <td class="muted-line">${Fmt.date(c.sent_at || c.created_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
      }
      ${hasMore ? `<div style="padding:8px 0 0;"><a href="#" id="correspondence-view-all">View all (${this.items.length}) &rarr;</a></div>` : ''}
    `;
    document.getElementById('add-correspondence-btn').addEventListener('click', () => this.openForm());
    const viewAllLink = document.getElementById('correspondence-view-all');
    if (viewAllLink) {
      viewAllLink.addEventListener('click', (e) => { e.preventDefault(); this.showAll = true; this.draw(); });
    }
  },

  openForm() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>Log correspondence</h3>
        <form id="correspondence-form">
          <label class="form-field"><span>Direction</span>
            <select class="input input-select" name="direction">
              ${CORRESPONDENCE_DIRECTIONS.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
          </label>
          <label class="form-field"><span>Subject *</span><input class="input" name="subject" required /></label>
          <label class="form-field"><span>Body</span><textarea class="input textarea" name="body" rows="4"></textarea></label>
          <div class="form-grid">
            <label class="form-field"><span>From email</span><input class="input" type="email" name="from_email" /></label>
            <label class="form-field"><span>To email</span><input class="input" type="email" name="to_email" /></label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Log correspondence</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#correspondence-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        client_id: this.clientId,
        direction: fd.get('direction'),
        subject: fd.get('subject'),
        body: fd.get('body') || null,
        from_email: fd.get('from_email') || null,
        to_email: fd.get('to_email') || null,
        sent_at: new Date().toISOString(),
        is_read: true
      };
      try {
        const { error } = await sb.from('correspondence').insert(payload);
        if (error) throw error;
        overlay.remove();
        this.render(this.clientId, this.containerEl, this.opts);
      } catch (err) {
        alert(`Could not log correspondence: ${err.message}`);
      }
    });
  }
};
