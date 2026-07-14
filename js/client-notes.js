// Accounted4Tax Practice Manager — Notes panel (shown on client detail page)

const NOTE_TYPES = ['call', 'meeting', 'hmrc', 'general'];

const ClientNotesPanel = {
  async render(clientId, containerEl, opts) {
    containerEl.innerHTML = `<p class="muted-line">Loading notes…</p>`;
    this.opts = opts || {};
    this.showAll = false;
    this.clientId = clientId;
    this.containerEl = containerEl;

    const { data, error } = await sb.from('notes').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
    if (error) {
      containerEl.innerHTML = `<p class="page-error">Could not load notes: ${error.message}</p>`;
      return;
    }
    this.notes = data || [];
    this.draw();
  },

  draw() {
    const limit = this.showAll ? null : this.opts.limit;
    const rows = limit ? this.notes.slice(0, limit) : this.notes;
    const hasMore = !this.showAll && this.opts.limit && this.notes.length > this.opts.limit;

    this.containerEl.innerHTML = `
      <div class="panel-header-row">
        <button type="button" id="add-note-btn" class="btn btn-secondary btn-sm">+ Add</button>
      </div>
      ${rows.length === 0
        ? `<p class="empty-state">No notes yet.</p>`
        : rows.map(n => `
            <div class="note-row">
              <div class="note-row-meta">
                <span class="pill pill-grey">${n.note_type}</span>
                <span class="muted-line" style="font-size:12px;">${Fmt.date(n.created_at)}</span>
              </div>
              <div style="font-size:13px;margin-top:4px;">${n.body}</div>
            </div>
          `).join('')
      }
      ${hasMore ? `<div style="padding:8px 0 0;"><a href="#" id="notes-view-all">View all (${this.notes.length}) &rarr;</a></div>` : ''}
    `;
    document.getElementById('add-note-btn').addEventListener('click', () => this.openForm());
    const viewAllLink = document.getElementById('notes-view-all');
    if (viewAllLink) {
      viewAllLink.addEventListener('click', (e) => { e.preventDefault(); this.showAll = true; this.draw(); });
    }
  },

  openForm() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>Add note</h3>
        <form id="note-form">
          <label class="form-field"><span>Type</span>
            <select class="input input-select" name="note_type">
              ${NOTE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
          </label>
          <label class="form-field"><span>Note *</span><textarea class="input textarea" name="body" rows="4" required></textarea></label>
          <label class="form-field"><span>HMRC reference (optional)</span><input class="input" name="hmrc_ref" /></label>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Add note</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#note-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        client_id: this.clientId,
        note_type: fd.get('note_type'),
        body: fd.get('body'),
        hmrc_ref: fd.get('hmrc_ref') || null
      };
      try {
        const { error } = await sb.from('notes').insert(payload);
        if (error) throw error;
        overlay.remove();
        this.render(this.clientId, this.containerEl, this.opts);
      } catch (err) {
        alert(`Could not save note: ${err.message}`);
      }
    });
  }
};
