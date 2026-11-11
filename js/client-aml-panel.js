// Accounted4Tax Practice Manager — Identity checks (CDD) panel on the client page.
// One row per person: the contact, plus every director and PSC from Companies House.
// "Request ID" emails that person a secure upload link (photo ID, selfie with the ID, proof of address).
// When documents arrive: "Review" shows them; "Verified" saves an AML record; "Not accepted" emails a new link with the reason.
// Everything runs through the Supabase Edge Function "aml" (shared with the Quotes app).

const AmlRoleLabel = { individual: 'Client', director: 'Director', psc: 'PSC', director_psc: 'Director + PSC' };
const AmlStatus = {
  none:      { t: 'Not requested', c: 'pill-grey' },
  requested: { t: 'Link sent', c: 'pill-amber' },
  received:  { t: 'Received – review', c: 'pill-amber' },
  verified:  { t: 'CDD verified', c: 'pill-green' },
  rejected:  { t: 'Not accepted', c: 'pill-red' },
};

const ClientAmlPanel = {
  async render(clientId, containerEl) {
    this.clientId = clientId; this.containerEl = containerEl;
    containerEl.innerHTML = `<p class="muted-line">Loading identity checks…</p>`;
    try {
      this.data = await this.call({ action: 'people', client_id: clientId });
      this.draw();
    } catch (err) {
      containerEl.innerHTML = `<p class="page-error">Could not load identity checks: ${this.esc(err.message)}</p>`;
    }
  },

  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  async call(body) {
    const res = await sb.functions.invoke('aml', { body });
    if (res.error) {
      let m = res.error.message || 'Something went wrong';
      try { const b = await res.error.context.json(); if (b.error) m = b.error.message; } catch (_) {}
      throw new Error(m);
    }
    return res.data;
  },

  draw() {
    const d = this.data, esc = this.esc.bind(this);
    const overall = AmlStatus[d.client.aml_status === 'not_requested' ? 'none' : d.client.aml_status] || AmlStatus.none;
    this.containerEl.innerHTML = `
      <div class="panel-header-row" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <span>Overall: <span class="pill ${overall.c}">${overall.t}</span>
          ${d.client.aml_status !== 'verified' ? '<span class="muted-line" style="font-size:12px;margin-left:6px;">Do not start work until CDD is verified.</span>' : ''}</span>
        <button type="button" class="btn btn-secondary btn-sm" id="aml-add">+ Add person</button>
      </div>
      <div style="overflow-x:auto;">
      <table class="data-table" style="width:100%;font-size:13px;">
        <thead><tr><th>Person</th><th>Role</th><th>Email</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${d.people.map((p, i) => {
            const st = AmlStatus[p.request ? p.request.status : 'none'] || AmlStatus.none;
            const when = p.request ? (p.request.verified_at || p.request.received_at || p.request.requested_at) : null;
            const actions = [];
            if (!p.request || ['requested', 'rejected'].includes(p.request.status)) actions.push(`<button class="btn btn-primary btn-sm" data-req="${i}">${p.request ? 'Resend link' : 'Request ID'}</button>`);
            if (p.request && p.request.status === 'received') actions.push(`<button class="btn btn-primary btn-sm" data-rev="${i}">Review</button>`);
            if (p.request && p.request.status === 'verified') actions.push(`<button class="btn btn-secondary btn-sm" data-rev="${i}">View</button>`);
            return `<tr>
              <td><b>${esc(p.name)}</b>${p.source === 'companies_house' ? '<div class="muted-line" style="font-size:11px;">from Companies House</div>' : ''}</td>
              <td>${esc(AmlRoleLabel[p.role] || p.role)}</td>
              <td><input class="input" style="min-width:190px;padding:4px 8px;font-size:13px;" type="email" data-email="${i}" value="${esc(p.email)}" placeholder="email needed"></td>
              <td><span class="pill ${st.c}">${st.t}</span>${when ? `<div class="muted-line" style="font-size:11px;">${Fmt.date(when)}</div>` : ''}
                ${p.record && p.record.review_date ? `<div class="muted-line" style="font-size:11px;">Review by ${Fmt.date(p.record.review_date)}</div>` : ''}</td>
              <td style="white-space:nowrap;">${actions.join(' ')}</td></tr>`;
          }).join('')}
        </tbody>
      </table></div>`;
    this.containerEl.querySelectorAll('[data-req]').forEach(b => b.addEventListener('click', () => this.request(+b.dataset.req, b)));
    this.containerEl.querySelectorAll('[data-rev]').forEach(b => b.addEventListener('click', () => this.review(+b.dataset.rev)));
    document.getElementById('aml-add').addEventListener('click', () => this.addPerson());
  },

  async request(i, btn) {
    const p = this.data.people[i];
    const email = this.containerEl.querySelector(`[data-email="${i}"]`).value.trim();
    if (!email) { alert(`Please enter ${p.name}'s email address first.`); return; }
    if (!confirm(`Email ${p.name} (${email}) a secure link to upload their ID?`)) return;
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await this.call({ action: 'request', client_id: this.clientId, person_name: p.name, person_role: p.role, email });
      if (!r.email_ok) alert(`The link was created but the email could not be sent: ${r.email_error || 'unknown error'}`);
      this.render(this.clientId, this.containerEl);
    } catch (err) { alert(`Could not send: ${err.message}`); btn.disabled = false; btn.textContent = 'Request ID'; }
  },

  addPerson() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal"><h3>Add person for identity checks</h3>
        <form id="aml-add-form">
          <label class="form-field"><span>Full name *</span><input class="input" name="name" required></label>
          <label class="form-field"><span>Role</span><select class="input input-select" name="role">
            <option value="director">Director</option><option value="psc">PSC (owns or controls more than 25%)</option><option value="director_psc">Director + PSC</option><option value="individual">Client</option></select></label>
          <label class="form-field"><span>Email *</span><input class="input" type="email" name="email" required></label>
          <div class="modal-actions"><button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button><button type="submit" class="btn btn-primary">Send ID request</button></div>
        </form></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#aml-add-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const r = await this.call({ action: 'request', client_id: this.clientId, person_name: fd.get('name'), person_role: fd.get('role'), email: fd.get('email') });
        if (!r.email_ok) alert(`The link was created but the email could not be sent: ${r.email_error || 'unknown error'}`);
        overlay.remove(); this.render(this.clientId, this.containerEl);
      } catch (err) { alert(`Could not send: ${err.message}`); }
    });
  },

  async review(i) {
    const p = this.data.people[i], esc = this.esc.bind(this);
    let D;
    try { D = await this.call({ action: 'docs', request_id: p.request.id }); } catch (err) { alert(err.message); return; }
    const s = D.request.submitted || {};
    const label = { photo_id: 'Photo ID', selfie: 'Selfie with ID', proof_of_address: 'Proof of address' };
    const files = D.docs.map(f => `<div style="border:1px solid var(--border, #E3E6EC);border-radius:8px;padding:6px;width:150px;">
        <div style="font-size:11px;font-weight:600;margin-bottom:4px;">${label[f.doc_type] || f.doc_type}</div>
        ${f.url && /^image\/(jpeg|png|webp)$/.test(f.mime || '') ? `<a href="${f.url}" target="_blank" rel="noopener"><img src="${f.url}" alt="" style="width:100%;height:110px;object-fit:cover;border-radius:4px;"></a>`
          : `<a href="${f.url}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Open ${f.mime === 'application/pdf' ? 'PDF' : 'file'}</a>`}
      </div>`).join('');
    const done = p.request.status === 'verified';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:720px;width:96%;">
        <h3>Identity check – ${esc(p.name)}</h3>
        <p class="muted-line" style="font-size:12px;">${esc(AmlRoleLabel[p.role] || p.role)} · received ${Fmt.date(D.request.received_at)}</p>
        <table style="font-size:13px;margin:8px 0;">
          <tr><td class="muted-line" style="padding-right:10px;">Photo ID</td><td>${esc(s.id_label || '')}</td></tr>
          <tr><td class="muted-line" style="padding-right:10px;">Proof of address</td><td>${esc(s.poa_label || '')}${s.poa_date ? ' – dated ' + Fmt.date(s.poa_date) : ''}</td></tr>
          <tr><td class="muted-line" style="padding-right:10px;">Uploaded from</td><td style="font-size:11px;">${esc(s.ip || '')} · ${esc((s.device || '').slice(0, 70))}</td></tr>
        </table>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px;">${files || '<p>No files.</p>'}</div>
        <p style="font-size:12px;">Check: the ID is in date · same name on both documents · the selfie matches the photo ID · a home address (not a PO box).</p>
        ${done ? `<p><span class="pill pill-green">CDD verified</span> ${p.record ? `Risk ${esc(p.record.risk_rating)} · PEP ${esc(p.record.pep_check)} · sanctions ${esc(p.record.sanctions_check)} · review by ${Fmt.date(p.record.review_date)}` : ''}</p>
          <div class="modal-actions"><button type="button" class="btn btn-secondary" id="modal-cancel">Close</button></div>`
        : `<form id="aml-review">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;">
            <label class="form-field"><span>PEP check</span><select class="input input-select" name="pep_check"><option value="no">Not a PEP</option><option value="yes">PEP</option><option value="close_associate">Close associate of a PEP</option></select></label>
            <label class="form-field"><span>Sanctions list check</span><select class="input input-select" name="sanctions_check"><option value="clear">Clear</option><option value="not_checked">Not checked</option><option value="match">Possible match</option></select></label>
            <label class="form-field"><span>Risk rating</span><select class="input input-select" name="risk_rating"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          </div>
          <label class="form-field"><span>Notes (optional)</span><textarea class="input textarea" name="notes" rows="2"></textarea></label>
          <label class="form-field"><span>If not accepted – what was wrong? (sent to the person)</span><input class="input" name="reason" placeholder="e.g. the bank statement is older than 3 months"></label>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button type="button" class="btn btn-secondary" id="aml-reject">Not accepted – ask again</button>
            <button type="submit" class="btn btn-primary">CDD verified</button>
          </div></form>`}
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    const form = overlay.querySelector('#aml-review');
    if (!form) return;
    const send = async (decision) => {
      const fd = new FormData(form);
      if (decision === 'rejected' && String(fd.get('reason') || '').trim().length < 5) { alert('Please say what was wrong, so the person knows what to upload.'); return; }
      if (decision === 'verified' && fd.get('sanctions_check') === 'match' && !confirm('A possible sanctions match is recorded. Mark as verified anyway?')) return;
      try {
        await this.call({ action: 'review', request_id: p.request.id, decision, pep_check: fd.get('pep_check'), sanctions_check: fd.get('sanctions_check'),
          risk_rating: fd.get('risk_rating'), notes: fd.get('notes'), reason: fd.get('reason') });
        overlay.remove(); this.render(this.clientId, this.containerEl);
      } catch (err) { alert(err.message); }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); send('verified'); });
    overlay.querySelector('#aml-reject').addEventListener('click', () => send('rejected'));
  },
};
