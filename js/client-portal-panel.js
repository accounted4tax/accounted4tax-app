// Accounted4Tax Practice Manager — Client portal panel on the client page.
// Parts: access, requests (by period), documents (by period and group: requested vs received),
// messages, approval records. Everything the client sees is controlled by the database rules;
// this panel is practice-only. Edge Function used: portal-invite (invite, revoke, notify_client).
// Show it in several places on one page with Object.create(ClientPortalPanel) per place.

// Where a file we share appears in the client portal.
const PmShareKinds = { other: 'Documents (year folder)', returns: 'Returns and accounts (year folder)', filings: 'Company filings' };
const PortalKinds = { upload: 'Upload documents', approve: 'Review & approve', confirm: 'Confirm details', info: 'Information / question' };
const PortalReqStatus = { open: { t: 'Waiting for client', c: 'pill-amber' }, submitted: { t: 'Client replied – to check', c: 'pill-amber' }, done: { t: 'Done', c: 'pill-green' }, cancelled: { t: 'Cancelled', c: 'pill-grey' } };

const ClientPortalPanel = {
  // opts.sections: 'access','requests','docs','messages','approvals' (default all)
  // opts.messagesEl: draw Messages into this element instead (e.g. a column on the right)
  async render(clientId, containerEl, client, opts) {
    this.clientId = clientId; this.containerEl = containerEl; this.client = client || {};
    this.opts = opts || this.opts || {};
    this.sections = (this.opts.sections || ['access', 'requests', 'docs', 'messages', 'approvals']).map(s => s === 'files' ? 'docs' : s);
    this.messagesEl = this.opts.messagesEl || null;
    if (this.period === undefined) this.period = pmDefaultPeriod(this.client);
    this.openGroup = this.openGroup || null;
    if (!this.loadedOnce) containerEl.innerHTML = `<p class="muted-line">Loading portal…</p>`;
    const [acc, req, docs, msgs, aps] = await Promise.all([
      sb.from('portal_access').select('id,invited_email,created_at,revoked_at,lang').eq('client_id', clientId).order('created_at', { ascending: false }),
      sb.from('portal_requests').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      sb.from('documents').select('id,created_at,file_name,file_url,uploaded_by,visible_to_client,verified,category,doc_group,tax_year').eq('client_id', clientId).like('file_url', 'portal-docs/%').order('created_at', { ascending: false }),
      sb.from('portal_messages').select('*').eq('client_id', clientId).order('created_at', { ascending: true }).limit(300),
      sb.from('portal_approvals').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    ]);
    const err = [acc, req, docs, msgs, aps].find(r => r.error);
    if (err) { containerEl.innerHTML = `<p class="page-error">Could not load the portal: ${Esc(err.error.message)}</p>`; return; }
    this.access = acc.data || []; this.requests = req.data || []; this.docs = docs.data || []; this.msgs = msgs.data || []; this.approvals = aps.data || [];
    this.loadedOnce = true;
    this.draw();
  },

  async call(body) {
    const res = await sb.functions.invoke('portal-invite', { body: { client_id: this.clientId, ...body } });
    if (res.error) {
      let m = res.error.message || 'Something went wrong';
      try { const b = await res.error.context.json(); if (b.error) m = b.error.message; } catch (_) {}
      throw new Error(m);
    }
    return res.data;
  },
  notify(kind) { this.call({ action: 'notify_client', kind }).catch(() => {}); },
  inPeriod(x) { return this.period === 'all' || x.tax_year === this.period; },

  draw() {
    const has = (k) => this.sections.includes(k);
    const P = pmPeriods(this.client);
    const periodOpts = (sel) => P.map(p => `<option value="${Esc(p.value)}" ${p.value === sel ? 'selected' : ''}>${Esc(p.label)}</option>`).join('');
    const active = this.access.filter(a => !a.revoked_at);
    const unread = this.msgs.filter(m => m.sender === 'client' && !m.read_by_practice_at).length;
    const sec = (title, inner) => `<div class="pp-sec"><h3 style="font-size:14px;margin:0 0 8px;">${title}</h3>${inner}</div>`;
    let html = '';

    // period switcher (shared by requests + documents)
    if (has('requests') || has('docs')) {
      const noPeriod = this.docs.filter(d => !d.tax_year).length + this.requests.filter(r => !r.tax_year && r.status !== 'cancelled').length;
      html += `<div class="pm-chips" style="margin-bottom:12px;"><span class="muted-line" style="font-size:13px;font-weight:600;margin-right:4px;">Period:</span>
        ${P.map(p => `<button type="button" class="pm-chip${this.period === p.value ? ' is-on' : ''}" data-period="${Esc(p.value)}">${Esc(p.label)}</button>`).join('')}
        <button type="button" class="pm-chip${this.period === 'all' ? ' is-on' : ''}" data-period="all">All${noPeriod ? ` (${noPeriod} without a period)` : ''}</button></div>`;
    }

    // access
    if (has('access')) {
      html += sec('Access', active.length
        ? `<span class="pill pill-green">Portal active</span> <span class="muted-line" style="font-size:12px;margin-left:6px;">${active.map(a => `${Esc(a.invited_email)} (${a.lang === 'ro' ? 'Romanian' : 'English'}, since ${Fmt.date(a.created_at)})`).join(', ')}</span>`
        : `<span class="pill pill-grey">Not invited</span>`);
    }

    // documents: requested vs received per group
    if (has('docs')) {
      const D = this.docs.filter(d => this.inPeriod(d));
      const R = this.requests.filter(r => r.status !== 'cancelled' && this.inPeriod(r));
      const rows = Object.keys(DocGroups).map(g => {
        const req = R.filter(r => r.kind === 'upload' && (r.doc_group || 'other') === g);
        const recv = D.filter(d => d.uploaded_by === 'client' && (d.doc_group || 'other') === g);
        const fresh = recv.filter(d => !d.verified).length, waiting = req.filter(r => r.status === 'open').length;
        const st = waiting ? ['Waiting for client', 'pill-amber'] : fresh ? ['To check', 'pill-blue'] : recv.length ? ['Checked', 'pill-green'] : ['—', 'pill-grey'];
        const open = this.openGroup === g;
        const files = open ? `<tr><td colspan="5" style="background:#FAF9F5;padding:8px 10px;">${recv.length ? `<table class="data-table" style="width:100%;font-size:12.5px;"><tbody>${recv.map(d => this.fileRow(d, P)).join('')}</tbody></table>` : '<span class="muted-line">No files from the client in this group.</span>'}</td></tr>` : '';
        return `<tr><td><b>${DocGroups[g][0]}</b><div class="muted-line" style="font-size:12px;">${DocGroups[g][1]}</div></td>
          <td>${req.length ? `${req.length} request${req.length === 1 ? '' : 's'}` : '—'}</td>
          <td>${recv.length} file${recv.length === 1 ? '' : 's'}${fresh ? ` <span class="pill pill-amber">${fresh} new</span>` : ''}</td>
          <td><span class="pill ${st[1]}">${st[0]}</span></td>
          <td style="text-align:right;white-space:nowrap;">${fresh ? `<button type="button" class="btn btn-secondary btn-sm" data-check-group="${g}">Mark checked</button> ` : ''}<button type="button" class="btn btn-secondary btn-sm" data-view-group="${g}">${open ? 'Hide' : 'View'}</button></td></tr>${files}`;
      }).join('');
      const shared = D.filter(d => d.uploaded_by !== 'client');
      html += sec(`Documents – ${this.period === 'all' ? 'all periods' : Esc(pmPeriodLabel(this.client, this.period))}`, `
        <div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:13px;min-width:560px;"><thead><tr><th>Category</th><th>Requested</th><th>Received</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <details style="margin-top:10px;" ${this.openShared ? 'open' : ''} id="pp-shared"><summary style="cursor:pointer;font-size:13px;font-weight:600;">Shared by us (${shared.length})</summary>
          ${shared.length ? `<table class="data-table" style="width:100%;font-size:12.5px;margin-top:6px;"><tbody>${shared.map(d => this.fileRow(d, P)).join('')}</tbody></table>` : '<p class="empty-state">Nothing shared in this period.</p>'}
          <form id="pp-share-form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:8px;">
            <label class="form-field" style="flex:1;min-width:220px;"><span>Share a file with the client (PDF or image, max 20 MB)</span><input type="file" name="file" class="input" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" required></label>
            <label class="form-field"><span>Period</span><select name="period" class="input">${periodOpts(this.period === 'all' ? pmDefaultPeriod(this.client) : this.period)}</select></label>
            <label class="form-field"><span>Shows in the portal under</span><select name="kind" class="input">${Object.entries(PmShareKinds).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
            <label style="font-size:13px;"><input type="checkbox" name="approve"> Ask the client to approve it</label>
            <button type="submit" class="btn btn-primary btn-sm">Share</button>
          </form>
        </details>`);
    }

    // requests
    if (has('requests')) {
      const sharedDocs = this.docs.filter(d => d.uploaded_by !== 'client' && d.visible_to_client);
      const reqRows = this.requests.filter(r => r.status !== 'cancelled' && this.inPeriod(r)).map(r => {
        const st = PortalReqStatus[r.status] || PortalReqStatus.open;
        const doc = r.document_id ? this.docs.find(d => d.id === r.document_id) : null;
        const btns = [r.status !== 'done' ? `<button type="button" class="btn btn-secondary btn-sm" data-req-done="${r.id}">Mark done</button>` : '',
          r.status === 'open' ? `<button type="button" class="btn btn-secondary btn-sm" data-req-cancel="${r.id}">Cancel</button>` : ''].join(' ');
        return `<tr><td><b>${Esc(r.title)}</b>${r.description ? `<div class="muted-line" style="font-size:12px;">${Esc(r.description)}</div>` : ''}${doc ? `<div class="muted-line" style="font-size:12px;">Document: ${Esc(doc.file_name)}</div>` : ''}</td>
          <td>${Esc(PortalKinds[r.kind] || r.kind)}${r.kind === 'upload' && r.doc_group ? `<div class="muted-line" style="font-size:12px;">${DocGroups[r.doc_group][0]}</div>` : ''}</td><td>${r.due_date ? Fmt.date(r.due_date) : '—'}</td><td><span class="pill ${st.c}">${st.t}</span></td><td style="white-space:nowrap;">${btns}</td></tr>`;
      }).join('');
      html += sec('Requests to the client', `
        ${reqRows ? `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:13px;"><thead><tr><th>Request</th><th>Type</th><th>By</th><th>Status</th><th></th></tr></thead><tbody>${reqRows}</tbody></table></div>` : `<p class="empty-state">No requests in this period.</p>`}
        <details style="margin-top:8px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;">+ Ask the client for something</summary>
          <form id="pp-req-form" style="display:grid;gap:8px;margin-top:8px;max-width:600px;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <label class="form-field" style="flex:1;min-width:180px;"><span>Type</span><select name="kind" class="input">${Object.entries(PortalKinds).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
              <label class="form-field" style="flex:1;min-width:180px;" id="pp-group-field"><span>Category</span><select name="doc_group" class="input">${Object.entries(DocGroups).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label>
              <label class="form-field" style="flex:1;min-width:160px;"><span>Period</span><select name="tax_year" class="input">${periodOpts(this.period === 'all' ? pmDefaultPeriod(this.client) : this.period)}</select></label>
            </div>
            <label class="form-field"><span>Title (the client sees this) *</span><input name="title" class="input" required maxlength="160" placeholder="e.g. Bank statements Apr 2025 – Mar 2026"></label>
            <label class="form-field"><span>Details (optional)</span><input name="description" class="input" maxlength="400"></label>
            <label class="form-field" id="pp-doc-field" style="display:none;"><span>Document to approve *</span><select name="document_id" class="input"><option value="">— share the document first (Documents → Shared by us) —</option>${sharedDocs.map(d => `<option value="${d.id}">${Esc(d.file_name)}</option>`).join('')}</select></label>
            <label class="form-field" style="max-width:200px;"><span>Needed by</span><input name="due_date" type="date" class="input"></label>
            <label style="font-size:13px;"><input type="checkbox" name="email" checked> Email the client that something is waiting</label>
            <div><button type="submit" class="btn btn-primary btn-sm">Add request</button></div>
          </form>
        </details>`);
    }

    // messages
    const msgTitle = `Messages${unread ? ` <span class="pill pill-amber">${unread} new</span>` : ''}`;
    const msgHtml = (h) => `
      <div style="height:${h};overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:6px;background:#F7F8FA;border-radius:8px;" id="pp-thread">
        ${this.msgs.length ? this.msgs.map(m => `<div style="align-self:${m.sender === 'client' ? 'flex-start' : 'flex-end'};max-width:85%;background:${m.sender === 'client' ? '#fff' : '#E3F1F0'};border:1px solid #E3E6EB;border-radius:10px;padding:8px 10px;font-size:13px;white-space:pre-wrap;">${Esc(m.body)}<div class="muted-line" style="font-size:11px;margin-top:4px;">${m.sender === 'client' ? 'Client' : 'Us'} · ${Fmt.date(m.created_at)} ${new Date(m.created_at).toTimeString().slice(0, 5)}${m.sender === 'practice' ? (m.read_by_client_at ? ' · read' : ' · not read yet') : ''}</div></div>`).join('') : '<p class="empty-state" style="margin:8px;">No messages yet.</p>'}
      </div>
      <form id="pp-msg-form" style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
        <textarea name="body" class="input textarea" rows="3" maxlength="5000" placeholder="Write to the client…" required></textarea>
        <button type="submit" class="btn btn-primary btn-sm" style="align-self:flex-end;">Send</button>
      </form>`;
    if (has('messages') && !this.messagesEl) html += sec(msgTitle, msgHtml('320px'));

    // approvals
    if (has('approvals')) {
      html += sec('Approval records', this.approvals.length ? `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:12.5px;"><thead><tr><th>When</th><th>Decision</th><th>Signed in as</th><th>Document</th><th>Fingerprint (SHA-256)</th><th>IP</th></tr></thead><tbody>
        ${this.approvals.map(a => { const doc = this.docs.find(d => d.id === a.document_id); return `<tr><td>${Fmt.date(a.created_at)} ${new Date(a.created_at).toTimeString().slice(0, 5)}</td><td>${a.decision === 'approved' ? '<span class="pill pill-green">Approved</span>' : '<span class="pill pill-amber">Changes requested</span>'}${a.comment ? `<div class="muted-line" style="white-space:pre-wrap;">${Esc(a.comment)}</div>` : ''}</td><td>${Esc(a.user_email)}</td><td>${Esc(doc ? doc.file_name : '—')}${doc ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;"><button type="button" class="btn btn-secondary btn-sm" data-dl="${doc.id}">Open</button>${a.document_sha256 ? `<button type="button" class="btn btn-secondary btn-sm" data-check="${a.id}">Check</button>` : ''}</div><div class="muted-line" style="font-size:11.5px;margin-top:4px;" data-check-result="${a.id}"></div>` : ''}</td><td style="font-family:monospace;font-size:11px;word-break:break-all;">${Esc(a.document_sha256 || '—')}</td><td>${Esc(a.ip_address || '—')}</td></tr>`; }).join('')}
        </tbody></table></div>` : `<p class="empty-state">No approvals yet.</p>`);
    }

    this.containerEl.innerHTML = html;
    if (has('messages') && this.messagesEl) this.messagesEl.innerHTML = `<h3 style="font-size:15px;margin:0 0 8px;">${msgTitle}</h3>${msgHtml('520px')}`;
    this.wire();
    const th = document.getElementById('pp-thread'); if (th) th.scrollTop = th.scrollHeight;
    if (has('approvals') && this.approvals.some(a => !a.seen_by_practice_at)) sb.from('portal_approvals').update({ seen_by_practice_at: new Date().toISOString() }).eq('client_id', this.clientId).is('seen_by_practice_at', null).then(() => {});
    if (has('messages') && unread) sb.from('portal_messages').update({ read_by_practice_at: new Date().toISOString() }).eq('client_id', this.clientId).eq('sender', 'client').is('read_by_practice_at', null).then(() => {});
  },

  fileRow(d, P) {
    const fromClient = d.uploaded_by === 'client';
    const pill = fromClient ? (d.verified ? '<span class="pill pill-green">Checked</span>' : '<span class="pill pill-amber">New</span>') : (d.visible_to_client ? '<span class="pill pill-green">Shared</span>' : '<span class="pill pill-grey">Hidden</span>');
    return `<tr><td>${Esc(d.file_name)}<div class="muted-line" style="font-size:11.5px;">${Fmt.date(d.created_at)} · ${Esc(pmPeriodLabel(this.client, d.tax_year))}</div></td><td>${pill}</td>
      <td style="white-space:nowrap;text-align:right;"><button type="button" class="btn btn-secondary btn-sm" data-dl="${d.id}">Download</button>
      ${fromClient && !d.verified ? ` <button type="button" class="btn btn-secondary btn-sm" data-verify="${d.id}">Mark checked</button>` : ''}
      ${!fromClient ? ` <button type="button" class="btn btn-secondary btn-sm" data-share="${d.id}" data-on="${d.visible_to_client ? '0' : '1'}">${d.visible_to_client ? 'Hide' : 'Share'}</button>` : ''}
      <select class="input" data-move-group="${d.id}" title="Move to another category" style="max-width:170px;display:inline-block;">${Object.entries(DocGroups).map(([k, v]) => `<option value="${k}" ${(d.doc_group || 'other') === k ? 'selected' : ''}>${v[0]}</option>`).join('')}${fromClient ? '' : `<option value="returns" ${d.doc_group === 'returns' ? 'selected' : ''}>Returns and accounts</option><option value="filings" ${d.doc_group === 'filings' ? 'selected' : ''}>Company filings</option>`}</select>
      <select class="input" data-move-period="${d.id}" title="Move to another period" style="max-width:150px;display:inline-block;"><option value="">No period</option>${P.map(p => `<option value="${Esc(p.value)}" ${d.tax_year === p.value ? 'selected' : ''}>${Esc(p.label)}</option>`).join('')}</select></td></tr>`;
  },

  wire() {
    const $ = (id) => document.getElementById(id), C = this.containerEl;
    const reload = () => { this.render(this.clientId, this.containerEl, this.client, this.opts); if (this.onChange) this.onChange(); };
    const busy = (btn, on, text) => { if (!btn) return; btn.disabled = on; if (text) { btn.dataset.t = btn.dataset.t || btn.textContent; btn.textContent = on ? text : btn.dataset.t; } };

    C.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => { this.period = b.dataset.period; this.openGroup = null; this.draw(); }));
    C.querySelectorAll('[data-view-group]').forEach(b => b.addEventListener('click', () => { this.openGroup = this.openGroup === b.dataset.viewGroup ? null : b.dataset.viewGroup; this.draw(); }));
    const sh = $('pp-shared'); if (sh) sh.addEventListener('toggle', () => { this.openShared = sh.open; });
    C.querySelectorAll('[data-check-group]').forEach(b => b.addEventListener('click', async () => {
      const g = b.dataset.checkGroup;
      const ids = this.docs.filter(d => d.uploaded_by === 'client' && !d.verified && (d.doc_group || 'other') === g && this.inPeriod(d)).map(d => d.id);
      if (!ids.length) return;
      busy(b, true, 'Saving…');
      await sb.from('documents').update({ verified: true, verified_at: new Date().toISOString() }).in('id', ids);
      reload();
    }));
    C.querySelectorAll('[data-move-group]').forEach(s => s.addEventListener('change', async () => {
      await sb.from('documents').update({ doc_group: s.value, category: s.value === 'bank' ? 'bank_statement' : s.value === 'returns' ? 'tax_return' : 'other' }).eq('id', s.dataset.moveGroup); reload();
    }));
    C.querySelectorAll('[data-move-period]').forEach(s => s.addEventListener('change', async () => {
      await sb.from('documents').update({ tax_year: s.value || null }).eq('id', s.dataset.movePeriod); reload();
    }));

    // request form
    const rf = $('pp-req-form');
    if (rf) {
      const kindSel = rf.querySelector('[name="kind"]');
      const sync = () => { $('pp-doc-field').style.display = kindSel.value === 'approve' ? '' : 'none'; $('pp-group-field').style.display = kindSel.value === 'upload' ? '' : 'none'; };
      kindSel.addEventListener('change', sync); sync();
      rf.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(rf), kind = f.get('kind');
        const row = { client_id: this.clientId, kind, title: String(f.get('title') || '').trim(), description: String(f.get('description') || '').trim() || null,
          due_date: f.get('due_date') || null, tax_year: f.get('tax_year') || null, doc_group: kind === 'upload' ? (f.get('doc_group') || 'other') : null,
          document_id: kind === 'approve' ? (f.get('document_id') || null) : null };
        if (!row.title) { alert('Please add a title.'); return; }
        if (kind === 'approve' && !row.document_id) { alert('Choose the document to approve. Share it first under Documents → Shared by us.'); return; }
        const btn = rf.querySelector('button[type="submit"]'); busy(btn, true, 'Adding…');
        const { error } = await sb.from('portal_requests').insert(row);
        if (error) { alert(`Could not add: ${error.message}`); busy(btn, false, 'x'); return; }
        if (f.get('email')) this.notify(kind === 'approve' ? 'approve' : 'request');
        reload();
      });
    }
    C.querySelectorAll('[data-req-done]').forEach(b => b.addEventListener('click', async () => {
      busy(b, true); await sb.from('portal_requests').update({ status: 'done', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', b.dataset.reqDone); reload();
    }));
    C.querySelectorAll('[data-req-cancel]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Cancel this request? The client will no longer see it.')) return;
      busy(b, true); await sb.from('portal_requests').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', b.dataset.reqCancel); reload();
    }));

    // files
    C.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', async () => {
      const d = this.docs.find(x => x.id === b.dataset.dl); if (!d) return;
      const { data, error } = await sb.storage.from('portal-docs').createSignedUrl(d.file_url.slice(12), 60, { download: d.file_name || true });
      if (error) { alert(`Could not open: ${error.message}`); return; }
      window.open(data.signedUrl, '_blank', 'noopener');
    }));
    C.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', async () => {
      const a = this.approvals.find(x => x.id === b.dataset.check), d = a && this.docs.find(x => x.id === a.document_id);
      const out = C.querySelector(`[data-check-result="${b.dataset.check}"]`);
      if (!d || !out) return;
      busy(b, true, 'Checking…');
      try {
        const { data: blob, error } = await sb.storage.from('portal-docs').download(d.file_url.slice(12));
        if (error) throw error;
        const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        const hex = Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
        out.innerHTML = hex === a.document_sha256
          ? '<span class="pill pill-green">Matches</span> The stored file is exactly the one the client approved.'
          : '<span class="pill pill-red">Different</span> The stored file has changed since it was approved.';
      } catch (err) { out.textContent = `Could not check: ${err.message}`; }
      busy(b, false, 'x');
    }));
    C.querySelectorAll('[data-verify]').forEach(b => b.addEventListener('click', async () => {
      busy(b, true); await sb.from('documents').update({ verified: true, verified_at: new Date().toISOString() }).eq('id', b.dataset.verify); reload();
    }));
    C.querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', async () => {
      busy(b, true); await sb.from('documents').update({ visible_to_client: b.dataset.on === '1' }).eq('id', b.dataset.share);
      if (b.dataset.on === '1') this.notify('document');
      reload();
    }));
    if ($('pp-share-form')) $('pp-share-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target, file = form.querySelector('[name="file"]').files[0], approve = form.querySelector('[name="approve"]').checked, period = form.querySelector('[name="period"]').value || null, kind = form.querySelector('[name="kind"]').value || 'other';
      if (!file) return;
      if (file.size > 20 * 1048576) { alert('The file is bigger than 20 MB.'); return; }
      const btn = form.querySelector('button'); busy(btn, true, 'Uploading…');
      const safe = file.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-90);
      const path = `${this.clientId}/shared/${new Date().toISOString().replace(/[:.]/g, '-')}-${safe}`;
      const up = await sb.storage.from('portal-docs').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (up.error) { alert(`Upload failed: ${up.error.message}`); busy(btn, false, 'x'); return; }
      const { data: doc, error } = await sb.from('documents').insert({ client_id: this.clientId, category: kind === 'returns' ? 'tax_return' : 'other', doc_group: kind, tax_year: kind === 'filings' ? null : period, file_name: file.name, file_url: 'portal-docs/' + path,
        file_size: file.size, mime_type: file.type || null, uploaded_by: 'practice', verified: true, visible_to_client: true }).select('id').single();
      if (error) { alert(`Could not save: ${error.message}`); busy(btn, false, 'x'); return; }
      if (approve) {
        const title = prompt('What should the client approve? (they see this title)', file.name.replace(/\.[a-z0-9]+$/i, ''));
        if (title) await sb.from('portal_requests').insert({ client_id: this.clientId, kind: 'approve', title: title.trim().slice(0, 160), document_id: doc.id, tax_year: period });
      }
      this.notify(approve ? 'approve' : 'document');
      this.openShared = true;
      reload();
    });

    // messages (may be in the side column)
    if ($('pp-msg-form')) $('pp-msg-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ta = e.target.querySelector('textarea'), body = ta.value.trim(); if (!body) return;
      const btn = e.target.querySelector('button'); busy(btn, true, 'Sending…');
      const { error } = await sb.from('portal_messages').insert({ client_id: this.clientId, sender: 'practice', sender_user_id: Auth.currentUser ? Auth.currentUser.id : null, body: body.slice(0, 5000), read_by_practice_at: new Date().toISOString() });
      if (error) { alert(`Could not send: ${error.message}`); busy(btn, false, 'x'); return; }
      this.notify('message');
      reload();
    });
  },

  // Header buttons on the client page: invite (or resend) and remove access.
  async inviteFrom(btn, clientId, client, done) {
    const p = Object.create(ClientPortalPanel); p.clientId = clientId; p.client = client || {};
    const to = prompt('Email address the client will sign in with:', (p.client.portal_email || p.client.email || '').trim());
    if (to === null) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) { alert('Please enter a valid email address.'); return; }
    const ro = confirm('Send the invitation in Romanian?\n\nOK = Romanian   ·   Cancel = English');
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await p.call({ action: 'invite', email: to.trim(), lang: ro ? 'ro' : 'en' });
      alert(r.emailed ? `Invitation emailed to ${r.email}.` : `Access set up for ${r.email}, but the email could not be sent. Tell the client to go to the portal and sign in with this email.`);
      if (done) done();
    } catch (e) { alert(`Could not invite: ${e.message}`); }
    btn.disabled = false; btn.textContent = old;
  },
  async revokeFrom(btn, clientId, done) {
    if (!confirm('Remove this client\'s access to the portal? They will no longer be able to sign in to see this record.')) return;
    const p = Object.create(ClientPortalPanel); p.clientId = clientId;
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Removing…';
    try { await p.call({ action: 'revoke' }); if (done) done(); } catch (e) { alert(e.message); }
    btn.disabled = false; btn.textContent = old;
  },
};
