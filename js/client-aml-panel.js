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
    const done = p.request.status === 'verified';
    const prev = D.request.review || {};
    const decision = {};   // item → { ok, reason }
    D.items.forEach(it => {
      if (it.accepted_earlier) decision[it.item] = { ok: true, locked: true };
      else if (done && prev[it.item]) decision[it.item] = { ...prev[it.item], locked: true };
    });
    const what = { photo_id: s.id_label, proof_of_address: (s.poa_label || '') + (s.poa_date ? ' – dated ' + Fmt.date(s.poa_date) : ''), selfie: 'Holding the photo ID next to their face' };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const fileHtml = (f) => f.url && /^image\/(jpeg|png|webp)$/.test(f.mime || '')
      ? `<a href="${f.url}" target="_blank" rel="noopener"><img src="${f.url}" alt="" style="width:120px;height:90px;object-fit:cover;border-radius:4px;border:1px solid #E3E6EC;"></a>`
      : `<a href="${f.url}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Open ${f.mime === 'application/pdf' ? 'PDF' : 'file'}</a>`;

    const draw = () => {
      const decided = D.items.every(it => decision[it.item] && (decision[it.item].ok === true || decision[it.item].ok === false));
      const anyNo = D.items.some(it => decision[it.item] && decision[it.item].ok === false);
      overlay.innerHTML = `
      <div class="modal" style="max-width:760px;width:96%;max-height:92vh;overflow:auto;">
        <h3>Identity check – ${esc(p.name)}</h3>
        <p class="muted-line" style="font-size:12px;">${esc(AmlRoleLabel[p.role] || p.role)} · received ${Fmt.date(D.request.received_at)} · uploaded from ${esc(s.ip || '?')}</p>
        <p style="font-size:12px;margin:6px 0 10px;">Check each document: ID in date · same name on both documents · selfie matches the photo ID · a home address (not a PO box). Tick ✓ to accept or ✗ to ask again.</p>
        ${D.items.map(it => {
          const dd = decision[it.item] || {};
          const col = dd.ok === true ? '#1E7B4B' : dd.ok === false ? '#B3261E' : '#E3E6EC';
          const bg = dd.ok === true ? '#EEF8F2' : dd.ok === false ? '#FCEEEE' : '#fff';
          return `<div style="border:2px solid ${col};background:${bg};border-radius:10px;padding:10px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
              <div><b>${esc(it.label)}</b> <span class="muted-line" style="font-size:12px;">${esc(what[it.item] || '')}</span>
                ${it.accepted_earlier ? '<span class="pill pill-green" style="margin-left:6px;">accepted earlier</span>' : ''}</div>
              ${dd.locked ? `<span class="pill ${dd.ok ? 'pill-green' : 'pill-red'}">${dd.ok ? '✓ Verified' : '✗ Not verified'}</span>` : `
              <div style="display:flex;gap:6px;">
                <button type="button" data-ok="${it.item}" title="Verified" style="width:44px;height:36px;border-radius:8px;font-size:18px;cursor:pointer;border:2px solid #1E7B4B;background:${dd.ok === true ? '#1E7B4B' : '#fff'};color:${dd.ok === true ? '#fff' : '#1E7B4B'};">✓</button>
                <button type="button" data-no="${it.item}" title="Not verified" style="width:44px;height:36px;border-radius:8px;font-size:18px;cursor:pointer;border:2px solid #B3261E;background:${dd.ok === false ? '#B3261E' : '#fff'};color:${dd.ok === false ? '#fff' : '#B3261E'};">✗</button>
              </div>`}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">${it.files.map(fileHtml).join('') || '<span class="muted-line">No file</span>'}</div>
            ${dd.ok === false && !dd.locked ? `<label class="form-field" style="margin-top:8px;"><span>Reason (sent to ${esc(p.name.split(' ')[0])}) *</span>
              <input class="input" data-reason="${it.item}" value="${esc(dd.reason || '')}" placeholder="e.g. the photo is blurred / the statement is older than 3 months"></label>` : ''}
            ${dd.locked && dd.ok === false && dd.reason ? `<p style="font-size:12px;margin:6px 0 0;">Reason: ${esc(dd.reason)}</p>` : ''}
          </div>`;
        }).join('')}
        ${done ? `<p><span class="pill pill-green">CDD verified</span> ${p.record ? `Risk ${esc(p.record.risk_rating)} · PEP ${esc(p.record.pep_check)} · sanctions ${esc(p.record.sanctions_check)} · review by ${Fmt.date(p.record.review_date)}` : ''}</p>
          <div class="modal-actions"><button type="button" class="btn btn-secondary" id="modal-cancel">Close</button></div>`
        : `<div id="aml-cdd" style="${anyNo ? 'opacity:.45;pointer-events:none;' : ''}">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;">
              <label class="form-field"><span>PEP check</span><select class="input input-select" id="aml-pep"><option value="no">Not a PEP</option><option value="yes">PEP</option><option value="close_associate">Close associate of a PEP</option></select></label>
              <label class="form-field"><span>Sanctions list check</span><select class="input input-select" id="aml-sanc"><option value="clear">Clear</option><option value="not_checked">Not checked</option><option value="match">Possible match</option></select></label>
              <label class="form-field"><span>Risk rating</span><select class="input input-select" id="aml-risk"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            </div>
            <label class="form-field"><span>Notes (optional)</span><textarea class="input textarea" id="aml-notes" rows="2"></textarea></label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            ${anyNo ? `<button type="button" class="btn btn-primary" id="aml-send" ${decided ? '' : 'disabled'}>Ask again for ✗ only</button>`
              : `<button type="button" class="btn btn-primary" id="aml-send" ${decided ? '' : 'disabled'}>CDD verified</button>`}
          </div>
          ${decided ? '' : '<p class="muted-line" style="font-size:12px;text-align:right;margin-top:4px;">Tick or cross every document first.</p>'}`}
      </div>`;
      overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
      overlay.querySelectorAll('[data-ok]').forEach(b => b.addEventListener('click', () => { decision[b.dataset.ok] = { ok: true }; keep(); draw(); }));
      overlay.querySelectorAll('[data-no]').forEach(b => b.addEventListener('click', () => { decision[b.dataset.no] = { ok: false, reason: (decision[b.dataset.no] || {}).reason || '' }; keep(); draw(); }));
      overlay.querySelectorAll('[data-reason]').forEach(inp => inp.addEventListener('input', () => { decision[inp.dataset.reason].reason = inp.value; }));
      const sendBtn = overlay.querySelector('#aml-send');
      if (sendBtn) sendBtn.addEventListener('click', () => send(anyNo));
      if (form) { ['pep', 'sanc', 'risk', 'notes'].forEach(k => { const el = overlay.querySelector('#aml-' + k); if (el && form[k] !== undefined) el.value = form[k]; }); }
    };
    let form = null;
    const keep = () => { // remember the dropdowns while redrawing
      const g = (k) => overlay.querySelector('#aml-' + k);
      if (g('pep')) form = { pep: g('pep').value, sanc: g('sanc').value, risk: g('risk').value, notes: g('notes').value };
    };
    const send = async (anyNo) => {
      keep();
      const items = {};
      for (const it of D.items) {
        if (it.accepted_earlier) continue;
        const dd = decision[it.item];
        if (!dd) { alert('Tick or cross every document first.'); return; }
        if (dd.ok === false && String(dd.reason || '').trim().length < 3) { alert(`Please give a reason for "${it.label}", so ${p.name.split(' ')[0]} knows what to send.`); return; }
        items[it.item] = dd.ok ? { ok: true } : { ok: false, reason: dd.reason.trim() };
      }
      if (anyNo) {
        const list = Object.entries(items).filter(([, v]) => !v.ok).map(([k]) => D.items.find(x => x.item === k).label).join(', ');
        if (!confirm(`Email ${p.name} asking again for: ${list}?`)) return;
      } else if (form && form.sanc === 'match' && !confirm('A possible sanctions match is recorded. Mark as CDD verified anyway?')) return;
      try {
        await this.call({ action: 'review', request_id: p.request.id, items, pep_check: form?.pep, sanctions_check: form?.sanc, risk_rating: form?.risk, notes: form?.notes });
        overlay.remove(); this.render(this.clientId, this.containerEl);
      } catch (err) { alert(err.message); }
    };
    draw();
  },
};
