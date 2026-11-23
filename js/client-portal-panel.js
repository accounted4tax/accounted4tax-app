// Accounted4Tax Practice Manager — Client portal panel on the client page.
// Parts: access, requests (by period), documents (by period and group: requested vs received),
// messages, approval records. Everything the client sees is controlled by the database rules;
// this panel is practice-only. Edge Function used: portal-invite (invite, revoke, notify_client).
// Show it in several places on one page with Object.create(ClientPortalPanel) per place.

// Where a file we share appears in the client portal.
const PortalKinds = { upload: 'Upload documents', approve: 'Review & approve', confirm: 'Confirm details', info: 'Information / question' };
// What the client's button does in the portal for each type.
const PortalKindHelp = { upload: 'Client gets an Upload button', approve: 'Client opens the document and approves it', confirm: 'Client checks My details', info: 'Client replies by message' };
const PortalReqStatus = { open: { t: 'Waiting for client', c: 'pill-amber' }, submitted: { t: 'Client replied – to check', c: 'pill-amber' }, done: { t: 'Done', c: 'pill-green' }, cancelled: { t: 'Cancelled', c: 'pill-grey' } };

const ClientPortalPanel = {
  // opts.sections: 'access','requests','docs','messages','approvals' (default all)
  // opts.messagesEl: draw Messages into this element instead (e.g. a column on the right)
  async render(clientId, containerEl, client, opts) {
    if (this.clientId !== clientId) { this.pmOpen = false; this.sel = null; this.act = null; } // another client: start from the service cards
    this.clientId = clientId; this.containerEl = containerEl; this.client = client || {};
    this.opts = opts || this.opts || {};
    this.sections = (this.opts.sections || ['access', 'requests', 'docs', 'messages', 'approvals']).map(s => s === 'files' ? 'docs' : s);
    this.messagesEl = this.opts.messagesEl || null;
    this.openGroup = this.openGroup || null;
    if (!this.loadedOnce) containerEl.innerHTML = `<p class="muted-line">Loading portal…</p>`;
    const [acc, req, docs, msgs, aps, svcs] = await Promise.all([
      sb.from('portal_access').select('id,invited_email,created_at,revoked_at,lang,first_signed_in_at,welcomed_at,details_confirmed_at').eq('client_id', clientId).order('created_at', { ascending: false }),
      sb.from('portal_requests').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      sb.from('documents').select('id,created_at,file_name,file_url,uploaded_by,visible_to_client,verified,category,doc_group,doc_type,tax_year,client_service_id,quarter').eq('client_id', clientId).like('file_url', 'portal-docs/%').order('created_at', { ascending: false }),
      sb.from('portal_messages').select('*').eq('client_id', clientId).order('created_at', { ascending: true }).limit(300),
      sb.from('portal_approvals').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      sb.from('client_services').select('id,service_id,status,work_status,tax_year,period_end,submitted_at,services_catalogue(name)').eq('client_id', clientId).order('created_at'),
    ]);
    const err = [acc, req, docs, msgs, aps].find(r => r.error);
    if (err) { containerEl.innerHTML = `<p class="page-error">Could not load the portal: ${Esc(err.error.message)}</p>`; return; }
    this.access = acc.data || []; this.requests = req.data || []; this.docs = docs.data || []; this.msgs = msgs.data || []; this.approvals = aps.data || []; this.services = svcs.data || [];
    this.tabs = pmServiceTabs(this.client, this.services, this.docs);
    // MTD for Income Tax: the quarters (Q1-Q4 + final declaration) of each tax year, created if missing (23 Nov 2026)
    this.mtd = {}; this.mtdQ = this.mtdQ || {};
    await Promise.all(this.tabs.filter(t => pmIsMtd(t.name)).flatMap(t => t.years.filter(y => /^\d{4}\/\d{2}$/.test(y || '')).map(async (y) => {
      const r = pmLinkRow(t, y); const { data } = await sb.rpc('pm_mtd_year', { p_client: clientId, p_cs: r ? r.id : null, p_tax_year: y });
      this.mtd[y] = data || [];
    })));
    this.queue = this.queue || [];
    this.loadedOnce = true;
    try { this.draw(); }
    catch (e) { console.error(e); containerEl.innerHTML = `<p class="page-error">This part of the page could not be shown (${Esc(e.message)}). Please press Ctrl+Shift+R to reload the latest version.</p>`; }
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
  // Is this document / request in the selected service tab and year?
  inSel(x) {
    const g = this.curTab(); if (!g) return true;
    const inTab = g.loose ? !this.tabs.ids[x.client_service_id] : this.tabs.ids[x.client_service_id] === g.key;
    return inTab && pmNormKey(x.tax_year) === this.sel.yr;
  },
  curTab() {
    const T = this.tabs || []; this.sel = this.sel || {};
    let g = T.find(t => t.key === this.sel.svc);
    if (!g) { g = T.find(t => t.rows.some(r => r.work_status !== 'submitted')) || T[0]; this.sel = { svc: g && g.key }; }
    if (g && !g.years.includes(this.sel.yr)) {
      const open = g.years.filter(y => { const r = pmRowFor(g, y); return r && r.work_status !== 'submitted'; });
      this.sel.yr = open.length ? open[open.length - 1] : g.years[0];
    }
    return g;
  },

  draw() {
    const has = (k) => this.sections.includes(k);
    const P = pmPeriods(this.client);
    const periodOpts = (sel) => P.map(p => `<option value="${Esc(p.value)}" ${p.value === sel ? 'selected' : ''}>${Esc(p.label)}</option>`).join('');
    const active = this.access.filter(a => !a.revoked_at);
    const unread = this.msgs.filter(m => m.sender === 'client' && !m.read_by_practice_at).length;
    const sec = (title, inner, kind) => `<section class="pp-sec${kind ? ' pp-sec-' + kind : ''}"><div class="pp-sec-h"><h3>${title}</h3></div><div class="pp-sec-b">${inner}</div></section>`;
    let html = '';

    // access
    if (has('access')) {
      html += sec('Access', active.length
        ? `<span class="pill pill-green">Portal active</span> <span class="muted-line" style="font-size:12px;margin-left:6px;">${active.map(a => `${Esc(a.invited_email)} (${a.lang === 'ro' ? 'Romanian' : 'English'}, invited ${Fmt.date(a.created_at)}${a.first_signed_in_at ? ', first signed in ' + Fmt.date(a.first_signed_in_at) : ', not signed in yet'})`).join(', ')}</span>`
        : `<span class="pill pill-grey">Not invited</span>`);
    }

    // documents and returns: year cards (sole trader) or service and year tabs (company) – js/client-year-work.js
    if ((has('docs') || has('requests')) && !this.workArea) throw new Error('an old copy of the page is in your browser');
    if (has('docs') || has('requests')) {
      const A = active[0];
      if (A) html += `<p class="muted-line" style="font-size:12.5px;margin:0 0 10px;">Portal: ${A.first_signed_in_at ? `first signed in ${Fmt.date(A.first_signed_in_at)}` : '<b>not signed in yet</b>'}${A.details_confirmed_at ? ` · details confirmed ${Fmt.date(A.details_confirmed_at)}` : ' · details not confirmed yet'}</p>`;
      html += this.workArea();
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
        ${this.approvals.map(a => { const doc = this.docs.find(d => d.id === a.document_id); return `<tr><td>${Fmt.date(a.created_at)} ${new Date(a.created_at).toTimeString().slice(0, 5)}</td><td>${a.decision === 'approved' ? '<span class="pill pill-green">Approved</span>' : '<span class="pill pill-amber">Changes requested</span>'}${a.comment ? `<div class="muted-line" style="white-space:pre-wrap;">${Esc(a.comment)}</div>` : ''}</td><td>${Esc(a.user_email)}</td><td>${Esc(doc ? doc.file_name : '—')}${doc ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;"><button type="button" class="btn btn-secondary btn-sm" data-pv="${doc.id}">Preview</button><button type="button" class="btn btn-secondary btn-sm" data-dl="${doc.id}">Download</button>${a.document_sha256 ? `<button type="button" class="btn btn-secondary btn-sm" data-check="${a.id}">Check</button>` : ''}</div><div class="muted-line" style="font-size:11.5px;margin-top:4px;" data-check-result="${a.id}"></div>` : ''}</td><td style="font-family:monospace;font-size:11px;word-break:break-all;">${Esc(a.document_sha256 || '—')}</td><td>${Esc(a.ip_address || '—')}</td></tr>`; }).join('')}
        </tbody></table></div>` : `<p class="empty-state">No approvals yet.</p>`);
    }

    this.containerEl.innerHTML = html;
    if (has('messages') && this.messagesEl) this.messagesEl.innerHTML = `<h3 style="font-size:15px;margin:0 0 8px;">${msgTitle}</h3>${msgHtml('520px')}`;
    this.wire();
    if (this.wireYear) this.wireYear();
    const th = document.getElementById('pp-thread'); if (th) th.scrollTop = th.scrollHeight;
    if (has('approvals') && this.approvals.some(a => !a.seen_by_practice_at)) sb.from('portal_approvals').update({ seen_by_practice_at: new Date().toISOString() }).eq('client_id', this.clientId).is('seen_by_practice_at', null).then(() => {});
    if (has('messages') && unread) sb.from('portal_messages').update({ read_by_practice_at: new Date().toISOString() }).eq('client_id', this.clientId).eq('sender', 'client').is('read_by_practice_at', null).then(() => {});
  },

  fileRow(d, P) {
    const fromClient = d.uploaded_by === 'client';
    const pill = fromClient ? (d.verified ? '<span class="pill pill-green">Checked</span>' : '<span class="pill pill-amber">New</span>') : (d.visible_to_client ? '<span class="pill pill-green">Shared</span>' : '<span class="pill pill-grey">Hidden</span>');
    return `<tr class="${fromClient ? 'pm-f-them' : 'pm-f-us'}"><td>${Esc(d.file_name)}<div class="muted-line" style="font-size:11.5px;">${Fmt.date(d.created_at)} · ${Esc(pmKeyLabel(pmNormKey(d.tax_year)))}</div></td><td>${pill}</td>
      <td style="white-space:nowrap;text-align:right;"><button type="button" class="btn btn-secondary btn-sm" data-pv="${d.id}">Preview</button> <button type="button" class="btn btn-secondary btn-sm" data-dl="${d.id}">Download</button>
      ${fromClient && !d.verified ? ` <button type="button" class="btn btn-secondary btn-sm" data-verify="${d.id}">Mark checked</button>` : ''}
      ${!fromClient ? ` <button type="button" class="btn btn-secondary btn-sm" data-share="${d.id}" data-on="${d.visible_to_client ? '0' : '1'}">${d.visible_to_client ? 'Hide' : 'Share'}</button>` : ''}
      <select class="input" data-move-group="${d.id}" title="Move to another category" style="max-width:170px;display:inline-block;">${Object.entries(DocGroups).map(([k, v]) => `<option value="${k}" ${(d.doc_group || 'other') === k ? 'selected' : ''}>${v[0]}</option>`).join('')}${fromClient ? '' : `<option value="returns" ${d.doc_group === 'returns' ? 'selected' : ''}>Returns and accounts</option><option value="filings" ${d.doc_group === 'filings' ? 'selected' : ''}>Company filings</option>`}</select>
      <select class="input" data-move-to="${d.id}" title="Move to another service or year" style="max-width:220px;display:inline-block;">${this.moveOpts(d)}</select>${this.quarterSel(d)}</td></tr>`;
  },

  // MTD files: which quarter (or the final declaration) they belong to
  quarterSel(d) {
    const t = this.tabs.find(x => x.key === this.tabs.ids[d.client_service_id]), ty = pmNormKey(d.tax_year);
    if (!t || !pmIsMtd(t.name) || !/^\d{4}\/\d{2}$/.test(ty || '')) return '';
    return ` <select class="input" data-doc-q="${d.id}" data-ty="${Esc(ty)}" title="Quarter" style="max-width:120px;display:inline-block;">${d.quarter ? '' : '<option value="">Quarter?</option>'}${[1, 2, 3, 4, 5].map(q => `<option value="${q}" ${d.quarter === q ? 'selected' : ''}>${pmQLabel(q)}</option>`).join('')}</select>`;
  },

  moveOpts(d) {
    const cur = `${this.tabs.ids[d.client_service_id] || '_other'}|${pmNormKey(d.tax_year) || ''}`, o = [];
    this.tabs.forEach(t => t.years.forEach(y => { const v = `${t.key}|${y || ''}`; o.push(`<option value="${Esc(v)}" ${v === cur ? 'selected' : ''}>${Esc(t.name)} · ${Esc(pmKeyLabel(y))}</option>`); }));
    if (!this.tabs.some(t => t.loose)) o.push(`<option value="_other|" ${cur === '_other|' ? 'selected' : ''}>General documents</option>`);
    if (!o.some(x => x.includes('selected'))) o.unshift(`<option value="${Esc(cur)}" selected>${Esc(pmKeyLabel(d.tax_year))}</option>`);
    return o.join('');
  },

  wire() {
    const $ = (id) => document.getElementById(id), C = this.containerEl;
    const reload = () => { this.render(this.clientId, this.containerEl, this.client, this.opts); if (this.onChange) this.onChange(); };
    const busy = (btn, on, text) => { if (!btn) return; btn.disabled = on; if (text) { btn.dataset.t = btn.dataset.t || btn.textContent; btn.textContent = on ? text : btn.dataset.t; } };

    C.querySelectorAll('[data-svc]').forEach(b => b.addEventListener('click', () => { this.sel = { svc: b.dataset.svc }; this.openGroup = null; this.draw(); }));
    C.querySelectorAll('[data-yr]').forEach(b => b.addEventListener('click', () => { this.sel.yr = b.dataset.yr || null; this.openGroup = null; this.draw(); }));
    C.querySelectorAll('[data-view-group]').forEach(b => b.addEventListener('click', () => { this.openGroup = this.openGroup === b.dataset.viewGroup ? null : b.dataset.viewGroup; this.draw(); }));
    C.querySelectorAll('[data-check-group]').forEach(b => b.addEventListener('click', async () => {
      const g = b.dataset.checkGroup;
      const ids = this.docs.filter(d => d.uploaded_by === 'client' && !d.verified && (d.doc_group || 'other') === g && this.inSel(d)).map(d => d.id);
      if (!ids.length) return;
      busy(b, true, 'Saving…');
      await sb.from('documents').update({ verified: true, verified_at: new Date().toISOString() }).in('id', ids);
      reload();
    }));
    C.querySelectorAll('[data-move-group]').forEach(s => s.addEventListener('change', async () => {
      await sb.from('documents').update({ doc_group: s.value, category: s.value === 'bank' ? 'bank_statement' : s.value === 'returns' ? 'tax_return' : 'other' }).eq('id', s.dataset.moveGroup); reload();
    }));
    C.querySelectorAll('[data-doc-q]').forEach(s => s.addEventListener('change', async () => {
      if (!s.value) return;
      const { error } = await sb.rpc('pm_doc_quarter', { p_doc: s.dataset.docQ, p_tax_year: s.dataset.ty, p_q: Number(s.value) });
      if (error) alert('Could not move the file: ' + error.message); reload();
    }));
    C.querySelectorAll('[data-move-to]').forEach(s => s.addEventListener('change', async () => {
      const [key, yr] = s.value.split('|'), t = this.tabs.find(x => x.key === key);
      const row = t && !t.loose ? pmLinkRow(t, yr || null) : null;
      await sb.from('documents').update({ client_service_id: row ? row.id : null, tax_year: yr || null }).eq('id', s.dataset.moveTo); reload();
    }));
    // request form
    const rf = $('pp-req-form');
    if (rf) {
      const kindVal = () => (rf.querySelector('[name="kind"]:checked') || {}).value || 'upload';
      const sync = () => { $('pp-doc-field').style.display = kindVal() === 'approve' ? '' : 'none'; $('pp-group-field').style.display = kindVal() === 'upload' ? '' : 'none'; };
      rf.querySelectorAll('[name="kind"]').forEach(r => r.addEventListener('change', sync)); sync();
      rf.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(rf), kind = f.get('kind');
        const row = { client_id: this.clientId, kind, title: String(f.get('title') || '').trim(), description: String(f.get('description') || '').trim() || null,
          due_date: f.get('due_date') || null, tax_year: this.sel.yr || null, client_service_id: (() => { const t = this.curTab(); const r = t && !t.loose ? pmLinkRow(t, this.sel.yr) : null; return r ? r.id : null; })(), doc_group: kind === 'upload' ? (f.get('doc_group') || 'other') : null,
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
    C.querySelectorAll('[data-req-kind]').forEach(sel => sel.addEventListener('change', async () => {
      const r = this.requests.find(x => x.id === sel.dataset.reqKind), patch = { kind: sel.value, updated_at: new Date().toISOString() };
      if (sel.value === 'upload' && r && !r.doc_group) patch.doc_group = /bank|statement/i.test(r.title || '') ? 'bank' : 'other';
      const { error } = await sb.from('portal_requests').update(patch).eq('id', sel.dataset.reqKind);
      if (error) alert(`Could not save: ${error.message}`); reload();
    }));
    C.querySelectorAll('[data-req-group]').forEach(sel => sel.addEventListener('change', async () => {
      const { error } = await sb.from('portal_requests').update({ doc_group: sel.value, updated_at: new Date().toISOString() }).eq('id', sel.dataset.reqGroup);
      if (error) alert(`Could not save: ${error.message}`); reload();
    }));
    C.querySelectorAll('[data-req-done]').forEach(b => b.addEventListener('click', async () => {
      busy(b, true); await sb.from('portal_requests').update({ status: 'done', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', b.dataset.reqDone); reload();
    }));
    C.querySelectorAll('[data-req-cancel]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Cancel this request? The client will no longer see it.')) return;
      busy(b, true); await sb.from('portal_requests').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', b.dataset.reqCancel); reload();
    }));

    // files
    C.querySelectorAll('[data-pv]').forEach(b => b.addEventListener('click', () => { const d = this.docs.find(x => x.id === b.dataset.pv); if (d) pmPreview(d.file_url, d.file_name); }));
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
    // staged sharing: choose files (several), check the list, then Share
    const fi = $('pp-share-files');
    if (fi) fi.addEventListener('change', () => {
      Array.from(fi.files).forEach(f => { if (!this.queue.some(x => x.name === f.name && x.size === f.size)) this.queue.push(f); });
      fi.value = ''; this.draw();
    });
    C.querySelectorAll('[data-unq]').forEach(b => b.addEventListener('click', () => { this.queue.splice(+b.dataset.unq, 1); this.draw(); }));
    if ($('pp-share-send')) $('pp-share-send').addEventListener('click', async () => {
      const btn = $('pp-share-send'), files = this.queue.slice(), where = $('pp-share-where').value, approve = $('pp-share-approve').checked;
      const big = files.filter(f => f.size > 20 * 1048576);
      if (big.length) { alert(`Bigger than 20 MB: ${big.map(f => f.name).join(', ')}`); return; }
      const t = this.curTab(), row = where === 'here' && t && !t.loose ? pmLinkRow(t, this.sel.yr) : null, noYear = where !== 'here' || (t && t.loose && !this.sel.yr);
      let title = null;
      if (approve) { title = prompt('What should the client approve? (they see this title)', files.length === 1 ? files[0].name.replace(/\.[a-z0-9]+$/i, '') : ''); if (title === null) return; }
      btn.disabled = true; const failed = [], ids = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i]; btn.textContent = `Sharing ${i + 1} of ${files.length}…`;
        const safe = file.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-90);
        const path = `${this.clientId}/shared/${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}-${safe}`;
        const up = await sb.storage.from('portal-docs').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (up.error) { failed.push(file.name); continue; }
        const { data: doc, error } = await sb.from('documents').insert({ client_id: this.clientId, client_service_id: row ? row.id : null,
          category: 'other', doc_group: where === 'filings' ? 'filings' : 'other', tax_year: noYear ? null : (this.sel.yr || null),
          file_name: file.name, file_url: 'portal-docs/' + path, file_size: file.size, mime_type: file.type || null, uploaded_by: 'practice', verified: true, visible_to_client: true,
          quarter: (() => { const q = t && this.mtdQ ? this.mtdQ[`${t.key}|${this.sel.yr || ''}`] : null; return where === 'here' && typeof q === 'number' ? q : null; })() }).select('id').single();
        if (error) { failed.push(file.name); continue; }
        ids.push(doc.id); this.queue = this.queue.filter(f => f !== file);
      }
      if (approve && title && title.trim()) {
        for (let i = 0; i < ids.length; i++) {
          await sb.from('portal_requests').insert({ client_id: this.clientId, kind: 'approve', title: (ids.length > 1 ? `${title.trim()} (${i + 1} of ${ids.length})` : title.trim()).slice(0, 160),
            document_id: ids[i], tax_year: noYear ? null : (this.sel.yr || null), client_service_id: row ? row.id : null });
        }
      }
      if (ids.length) this.notify(approve ? 'approve' : 'document');
      if (ids.length && where === 'general') { const g = (this.tabs || []).find(x => x.loose); this.sel = { svc: '_other', yr: null }; }
      if (failed.length) alert(`Not shared: ${failed.join(', ')}`);
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
