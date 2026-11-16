// Accounted4Tax Practice Manager — Client portal panel on the client page.
// Invite / revoke portal access, ask the client for things (upload, approve, confirm), share files,
// see what the client uploaded, read and reply to portal messages, and see approval records.
// Everything the client sees is controlled by the database rules; this panel is practice-only.
// Edge Function used: portal-invite (invite, revoke, notify_client).

const PortalKinds = { upload: 'Upload documents', approve: 'Review & approve', confirm: 'Confirm details', info: 'Information / question' };
const PortalReqStatus = { open: { t: 'Waiting for client', c: 'pill-amber' }, submitted: { t: 'Client replied – to check', c: 'pill-amber' }, done: { t: 'Done', c: 'pill-green' }, cancelled: { t: 'Cancelled', c: 'pill-grey' } };

const ClientPortalPanel = {
  async render(clientId, containerEl, client) {
    this.clientId = clientId; this.containerEl = containerEl; this.client = client || {};
    containerEl.innerHTML = `<p class="muted-line">Loading portal…</p>`;
    const [acc, req, docs, msgs, aps] = await Promise.all([
      sb.from('portal_access').select('id,invited_email,created_at,revoked_at,lang').eq('client_id', clientId).order('created_at', { ascending: false }),
      sb.from('portal_requests').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      sb.from('documents').select('id,created_at,file_name,file_url,uploaded_by,visible_to_client,verified,category').eq('client_id', clientId).like('file_url', 'portal-docs/%').order('created_at', { ascending: false }),
      sb.from('portal_messages').select('*').eq('client_id', clientId).order('created_at', { ascending: true }).limit(300),
      sb.from('portal_approvals').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    ]);
    const err = [acc, req, docs, msgs, aps].find(r => r.error);
    if (err) { containerEl.innerHTML = `<p class="page-error">Could not load the portal: ${Esc(err.error.message)}</p>`; return; }
    this.access = acc.data || []; this.requests = req.data || []; this.docs = docs.data || []; this.msgs = msgs.data || []; this.approvals = aps.data || [];
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

  draw() {
    const active = this.access.filter(a => !a.revoked_at);
    const unread = this.msgs.filter(m => m.sender === 'client' && !m.read_by_practice_at).length;
    const sharedDocs = this.docs.filter(d => d.uploaded_by !== 'client' && d.visible_to_client);
    const clientDocs = this.docs.filter(d => d.uploaded_by === 'client');
    const sec = (title, inner) => `<div style="padding:12px 0;border-top:1px solid var(--border, #E3E6EB);"><h3 style="font-size:14px;margin:0 0 8px;">${title}</h3>${inner}</div>`;

    // 1. access
    const accessHtml = active.length
      ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
           <span><span class="pill pill-green">Portal active</span> <span class="muted-line" style="font-size:12px;margin-left:6px;">${active.map(a => `${Esc(a.invited_email)} (${a.lang === 'ro' ? 'Romanian' : 'English'}, since ${Fmt.date(a.created_at)})`).join(', ')}</span></span>
           <span style="display:flex;gap:6px;flex-wrap:wrap;"><button type="button" class="btn btn-secondary btn-sm" id="pp-reinvite">Resend invitation</button><button type="button" class="btn btn-danger btn-sm" id="pp-revoke">Remove access</button></span>
         </div>`
      : `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
           <span><span class="pill pill-grey">Not invited</span> <span class="muted-line" style="font-size:12px;margin-left:6px;">${this.access.length ? 'Access was removed.' : 'The client cannot sign in yet.'}</span></span>
           <button type="button" class="btn btn-primary btn-sm" id="pp-invite">Invite to portal</button>
         </div>`;

    // 2. requests
    const reqRows = this.requests.filter(r => r.status !== 'cancelled').map(r => {
      const st = PortalReqStatus[r.status] || PortalReqStatus.open;
      const doc = r.document_id ? this.docs.find(d => d.id === r.document_id) : null;
      const btns = [
        r.status !== 'done' ? `<button type="button" class="btn btn-secondary btn-sm" data-req-done="${r.id}">Mark done</button>` : '',
        r.status === 'open' ? `<button type="button" class="btn btn-secondary btn-sm" data-req-cancel="${r.id}">Cancel</button>` : '',
      ].join(' ');
      return `<tr><td><b>${Esc(r.title)}</b>${r.description ? `<div class="muted-line" style="font-size:12px;">${Esc(r.description)}</div>` : ''}${doc ? `<div class="muted-line" style="font-size:12px;">Document: ${Esc(doc.file_name)}</div>` : ''}</td>
        <td>${Esc(PortalKinds[r.kind] || r.kind)}</td><td>${r.due_date ? Fmt.date(r.due_date) : '—'}</td><td><span class="pill ${st.c}">${st.t}</span></td><td style="white-space:nowrap;">${btns}</td></tr>`;
    }).join('');
    const docOptions = sharedDocs.map(d => `<option value="${d.id}">${Esc(d.file_name)}</option>`).join('');
    const reqHtml = `
      ${reqRows ? `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:13px;"><thead><tr><th>Request</th><th>Type</th><th>By</th><th>Status</th><th></th></tr></thead><tbody>${reqRows}</tbody></table></div>` : `<p class="empty-state">No requests yet.</p>`}
      <details style="margin-top:8px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;">+ Ask the client for something</summary>
        <form id="pp-req-form" style="display:grid;gap:8px;margin-top:8px;max-width:560px;">
          <label class="form-field"><span>Type</span><select name="kind" class="input">${Object.entries(PortalKinds).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label class="form-field"><span>Title (the client sees this) *</span><input name="title" class="input" required maxlength="160" placeholder="e.g. Bank statements Apr 2025 – Mar 2026"></label>
          <label class="form-field"><span>Details (optional)</span><input name="description" class="input" maxlength="400"></label>
          <label class="form-field" id="pp-doc-field" style="display:none;"><span>Document to approve *</span><select name="document_id" class="input"><option value="">— share the document first (below) —</option>${docOptions}</select></label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <label class="form-field" style="flex:1;"><span>Needed by</span><input name="due_date" type="date" class="input"></label>
            <label class="form-field" style="flex:1;"><span>Tax year</span><input name="tax_year" class="input" placeholder="2025/26" maxlength="9"></label>
          </div>
          <label style="font-size:13px;"><input type="checkbox" name="email" checked> Email the client that something is waiting</label>
          <div><button type="submit" class="btn btn-primary btn-sm">Add request</button></div>
        </form>
      </details>`;

    // 3. files
    const fileRow = (d) => `<tr><td>${Esc(d.file_name)}</td><td>${Fmt.date(d.created_at)}</td><td>${d.uploaded_by === 'client' ? (d.verified ? '<span class="pill pill-green">Checked</span>' : '<span class="pill pill-amber">New</span>') : (d.visible_to_client ? '<span class="pill pill-green">Shared</span>' : '<span class="pill pill-grey">Hidden</span>')}</td>
      <td style="white-space:nowrap;"><button type="button" class="btn btn-secondary btn-sm" data-dl="${d.id}">Download</button>
      ${d.uploaded_by === 'client' && !d.verified ? ` <button type="button" class="btn btn-secondary btn-sm" data-verify="${d.id}">Mark checked</button>` : ''}
      ${d.uploaded_by !== 'client' ? ` <button type="button" class="btn btn-secondary btn-sm" data-share="${d.id}" data-on="${d.visible_to_client ? '0' : '1'}">${d.visible_to_client ? 'Hide' : 'Share'}</button>` : ''}</td></tr>`;
    const filesHtml = `
      <div style="display:grid;gap:12px;">
        <div><b style="font-size:13px;">From the client</b>${clientDocs.length ? `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:13px;"><tbody>${clientDocs.map(fileRow).join('')}</tbody></table></div>` : `<p class="empty-state">Nothing uploaded yet.</p>`}</div>
        <div><b style="font-size:13px;">Shared by us</b>${this.docs.filter(d => d.uploaded_by !== 'client').length ? `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:13px;"><tbody>${this.docs.filter(d => d.uploaded_by !== 'client').map(fileRow).join('')}</tbody></table></div>` : `<p class="empty-state">Nothing shared yet.</p>`}</div>
        <form id="pp-share-form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
          <label class="form-field" style="flex:1;min-width:220px;"><span>Share a file with the client (PDF or image, max 20 MB)</span><input type="file" name="file" class="input" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" required></label>
          <label style="font-size:13px;"><input type="checkbox" name="approve"> Ask the client to approve it</label>
          <button type="submit" class="btn btn-primary btn-sm">Share</button>
        </form>
      </div>`;

    // 4. messages
    const msgHtml = `
      <div style="max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:4px;background:#F7F8FA;border-radius:8px;" id="pp-thread">
        ${this.msgs.length ? this.msgs.map(m => `<div style="align-self:${m.sender === 'client' ? 'flex-start' : 'flex-end'};max-width:80%;background:${m.sender === 'client' ? '#fff' : '#E3F1F0'};border:1px solid #E3E6EB;border-radius:10px;padding:8px 10px;font-size:13px;white-space:pre-wrap;">${Esc(m.body)}<div class="muted-line" style="font-size:11px;margin-top:4px;">${m.sender === 'client' ? 'Client' : 'Us'} · ${Fmt.date(m.created_at)} ${new Date(m.created_at).toTimeString().slice(0, 5)}${m.sender === 'practice' ? (m.read_by_client_at ? ' · read' : ' · not read yet') : ''}</div></div>`).join('') : '<p class="empty-state" style="margin:8px;">No messages yet.</p>'}
      </div>
      <form id="pp-msg-form" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
        <textarea name="body" class="input textarea" rows="2" style="flex:1;min-width:220px;" maxlength="5000" placeholder="Write to the client…" required></textarea>
        <button type="submit" class="btn btn-primary btn-sm">Send</button>
      </form>`;

    // 5. approvals evidence
    const apHtml = this.approvals.length ? `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:12.5px;"><thead><tr><th>When</th><th>Decision</th><th>Signed in as</th><th>Document</th><th>Fingerprint (SHA-256)</th><th>IP</th></tr></thead><tbody>
      ${this.approvals.map(a => { const doc = this.docs.find(d => d.id === a.document_id); return `<tr><td>${Fmt.date(a.created_at)} ${new Date(a.created_at).toTimeString().slice(0, 5)}</td><td>${a.decision === 'approved' ? '<span class="pill pill-green">Approved</span>' : '<span class="pill pill-amber">Changes requested</span>'}${a.comment ? `<div class="muted-line" style="white-space:pre-wrap;">${Esc(a.comment)}</div>` : ''}</td><td>${Esc(a.user_email)}</td><td>${Esc(doc ? doc.file_name : '—')}</td><td style="font-family:monospace;font-size:11px;word-break:break-all;">${Esc(a.document_sha256 || '—')}</td><td>${Esc(a.ip_address || '—')}</td></tr>`; }).join('')}
      </tbody></table></div>` : `<p class="empty-state">No approvals yet.</p>`;

    this.containerEl.innerHTML =
      sec('Access', accessHtml) +
      sec(`Requests to the client`, reqHtml) +
      sec('Files', filesHtml) +
      sec(`Messages${unread ? ` <span class="pill pill-amber">${unread} new</span>` : ''}`, msgHtml) +
      sec('Approval records', apHtml);
    this.wire();
    const th = document.getElementById('pp-thread'); if (th) th.scrollTop = th.scrollHeight;
    if (unread) sb.from('portal_messages').update({ read_by_practice_at: new Date().toISOString() }).eq('client_id', this.clientId).eq('sender', 'client').is('read_by_practice_at', null).then(() => {});
  },

  wire() {
    const $ = (id) => document.getElementById(id), C = this.containerEl;
    const reload = () => this.render(this.clientId, this.containerEl, this.client);
    const busy = (btn, on, text) => { if (!btn) return; btn.disabled = on; if (text) { btn.dataset.t = btn.dataset.t || btn.textContent; btn.textContent = on ? text : btn.dataset.t; } };

    const invite = async (btn) => {
      const to = prompt('Email address the client will sign in with:', (this.client.portal_email || this.client.email || '').trim());
      if (to === null) return;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) { alert('Please enter a valid email address.'); return; }
      const ro = confirm('Send the invitation in Romanian?\n\nOK = Romanian   ·   Cancel = English');
      busy(btn, true, 'Sending…');
      try {
        const r = await this.call({ action: 'invite', email: to.trim(), lang: ro ? 'ro' : 'en' });
        alert(r.emailed ? `Invitation emailed to ${r.email}.` : `Access set up for ${r.email}, but the email could not be sent. Tell the client to go to the portal and sign in with this email.`);
        reload();
      } catch (e) { alert(`Could not invite: ${e.message}`); busy(btn, false, 'x'); }
    };
    if ($('pp-invite')) $('pp-invite').addEventListener('click', (e) => invite(e.target));
    if ($('pp-reinvite')) $('pp-reinvite').addEventListener('click', (e) => invite(e.target));
    if ($('pp-revoke')) $('pp-revoke').addEventListener('click', async (e) => {
      if (!confirm('Remove this client\'s access to the portal? They will no longer be able to sign in to see this record.')) return;
      busy(e.target, true, 'Removing…');
      try { await this.call({ action: 'revoke' }); reload(); } catch (err) { alert(err.message); busy(e.target, false, 'x'); }
    });

    // request form
    const rf = $('pp-req-form');
    const kindSel = rf.querySelector('[name="kind"]');
    kindSel.addEventListener('change', () => { $('pp-doc-field').style.display = kindSel.value === 'approve' ? '' : 'none'; });
    rf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(rf), kind = f.get('kind');
      const row = { client_id: this.clientId, kind, title: String(f.get('title') || '').trim(), description: String(f.get('description') || '').trim() || null,
        due_date: f.get('due_date') || null, tax_year: String(f.get('tax_year') || '').trim() || null, document_id: kind === 'approve' ? (f.get('document_id') || null) : null };
      if (!row.title) { alert('Please add a title.'); return; }
      if (kind === 'approve' && !row.document_id) { alert('Choose the document to approve. Share it first in Files below.'); return; }
      const btn = rf.querySelector('button[type="submit"]'); busy(btn, true, 'Adding…');
      const { error } = await sb.from('portal_requests').insert(row);
      if (error) { alert(`Could not add: ${error.message}`); busy(btn, false, 'x'); return; }
      if (f.get('email')) this.notify(kind === 'approve' ? 'approve' : 'request');
      reload();
    });
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
    C.querySelectorAll('[data-verify]').forEach(b => b.addEventListener('click', async () => {
      busy(b, true); await sb.from('documents').update({ verified: true, verified_at: new Date().toISOString() }).eq('id', b.dataset.verify); reload();
    }));
    C.querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', async () => {
      busy(b, true); await sb.from('documents').update({ visible_to_client: b.dataset.on === '1' }).eq('id', b.dataset.share);
      if (b.dataset.on === '1') this.notify('document');
      reload();
    }));
    $('pp-share-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target, file = form.querySelector('[name="file"]').files[0], approve = form.querySelector('[name="approve"]').checked;
      if (!file) return;
      if (file.size > 20 * 1048576) { alert('The file is bigger than 20 MB.'); return; }
      const btn = form.querySelector('button'); busy(btn, true, 'Uploading…');
      const safe = file.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-90);
      const path = `${this.clientId}/shared/${new Date().toISOString().replace(/[:.]/g, '-')}-${safe}`;
      const up = await sb.storage.from('portal-docs').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (up.error) { alert(`Upload failed: ${up.error.message}`); busy(btn, false, 'x'); return; }
      const { data: doc, error } = await sb.from('documents').insert({ client_id: this.clientId, category: 'other', file_name: file.name, file_url: 'portal-docs/' + path,
        file_size: file.size, mime_type: file.type || null, uploaded_by: 'practice', verified: true, visible_to_client: true }).select('id').single();
      if (error) { alert(`Could not save: ${error.message}`); busy(btn, false, 'x'); return; }
      if (approve) {
        const title = prompt('What should the client approve? (they see this title)', file.name.replace(/\.[a-z0-9]+$/i, ''));
        if (title) await sb.from('portal_requests').insert({ client_id: this.clientId, kind: 'approve', title: title.trim().slice(0, 160), document_id: doc.id });
      }
      this.notify(approve ? 'approve' : 'document');
      reload();
    });

    // messages
    $('pp-msg-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ta = e.target.querySelector('textarea'), body = ta.value.trim(); if (!body) return;
      const btn = e.target.querySelector('button'); busy(btn, true, 'Sending…');
      const { error } = await sb.from('portal_messages').insert({ client_id: this.clientId, sender: 'practice', sender_user_id: Auth.currentUser ? Auth.currentUser.id : null, body: body.slice(0, 5000), read_by_practice_at: new Date().toISOString() });
      if (error) { alert(`Could not send: ${error.message}`); busy(btn, false, 'x'); return; }
      this.notify('message');
      reload();
    });
  },
};
