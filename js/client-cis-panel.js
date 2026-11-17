// Accounted4Tax Practice Manager — online registrations panel on the client page (Edge Function "start-online").
// CIS registration (/cis-registration/, form CIS301): paid → client signs → "Download PDF" (signed pages 1–2) → print, post, "Mark posted".
// UTR registration (/utr-registration/, CWF1 or SA1): paid → ID check (Identity checks panel) → "Registration sheet" → register → "Mark registered".

const CisFormStatus = {
  awaiting_payment: { t: 'Not paid yet', c: 'pill-grey' },
  signed: { t: 'Signed – print and post', c: 'pill-amber' },
  posted: { t: 'Posted to HMRC', c: 'pill-green' },
};

const ClientCisPanel = {
  async render(clientId, wrapEl, bodyEl) {
    this.clientId = clientId; this.wrapEl = wrapEl; this.bodyEl = bodyEl;
    try {
      const r = await this.call({ action: 'admin_list', client_id: clientId });
      this.list = r.forms || [];
      if (!this.list.length) { wrapEl.style.display = 'none'; return; }   // only shown for clients who used the online form
      wrapEl.style.display = '';
      this.draw();
    } catch (err) {
      wrapEl.style.display = '';
      bodyEl.innerHTML = `<p class="page-error">Could not load the CIS registration form: ${this.esc(err.message)}</p>`;
    }
  },

  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  async call(body) {
    const res = await sb.functions.invoke('start-online', { body });
    if (res.error) {
      let m = res.error.message || 'Something went wrong';
      try { const b = await res.error.context.json(); if (b.error) m = b.error.message; } catch (_) {}
      throw new Error(m);
    }
    return res.data;
  },

  utrRow(f) {
    const esc = this.esc.bind(this), a = f.answers || {}, paid = f.quote && f.quote.status === 'paid';
    const st = f.status === 'registered' ? { t: 'Registered with HMRC', c: 'pill-green' } : paid ? { t: 'Paid – register once ID is approved', c: 'pill-amber' } : { t: 'Not paid yet', c: 'pill-grey' };
    const reason = { self_employed: 'Self-employed – form CWF1', director: 'Company director – form SA1', other: 'Other income – form SA1' }[a.reason] || a.reason;
    const meta = [f.quote ? `Quote ${esc(f.quote.quote_number)}` : '', `started ${Fmt.date(f.created_at)}`, f.registered_at ? `registered ${Fmt.date(f.registered_at)}` : ''].filter(Boolean).join(' · ');
    const addr = (x) => [x.line1, x.line2, x.town, x.county, x.postcode].filter(Boolean).join(', ') + (x.from ? ` (from ${x.from}${x.to ? ' to ' + x.to : ''})` : '');
    const rows = [['Registration', `UTR${a.cis ? ' + CIS subcontractor' : ''} · ${reason}`], ['Name', `${a.title || ''} ${a.first_names || ''} ${a.surname || ''}`], ['Other names', a.other_names],
      ['Date of birth', a.date_of_birth], ['NI number', a.ni_number], ['Phone', a.phone], ['Email', a.email],
      ...(a.addresses || []).map((x, i) => [i ? `Previous address ${i}` : 'Current address', addr(x)]),
      ['Self-employed since', a.start_date], ['Type of work', a.work_type], ['Business name', a.trading_name], ['Also employed', a.reason === 'self_employed' ? (a.also_employed ? 'Yes' : 'No') : ''],
      ['Company', a.company_name ? `${a.company_name} (${a.company_number}), director since ${a.director_since}` : ''], ['Other income', a.income_type ? `${a.income_type}${a.income_detail ? ' – ' + a.income_detail : ''}, since ${a.income_start}` : '']];
    const btns = [paid ? `<button type="button" class="btn btn-primary btn-sm" data-sheet="${f.id}">Registration sheet</button>` : '',
      paid && f.status !== 'registered' ? `<button type="button" class="btn btn-secondary btn-sm" data-post="${f.id}">Mark registered</button>` : '',
      f.status === 'registered' ? `<button type="button" class="btn btn-secondary btn-sm" data-unpost="${f.id}">Undo</button>` : ''].join(' ');
    return `<div class="note-row" style="padding:10px 0;border-top:1px solid var(--border, #E3E6EB);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <span><b style="font-size:13px;">UTR registration</b> <span class="pill ${st.c}">${st.t}</span> <span class="muted-line" style="font-size:12px;margin-left:6px;">${meta}</span></span><span>${btns}</span>
      </div>
      <details style="margin-top:6px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;">Answers</summary>
        <table class="data-table" style="width:100%;font-size:13px;margin-top:6px;"><tbody>${rows.filter(r => r[1] && String(r[1]).trim()).map(r => `<tr><td style="width:35%;color:#4A5568">${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></details></div>`;
  },

  draw() {
    const esc = this.esc.bind(this);
    this.bodyEl.innerHTML = this.list.map((f) => {
      if (f.form_type === 'sa_reg') return this.utrRow(f);
      const paid = f.quote && f.quote.status === 'paid';
      const st = f.status === 'awaiting_payment' && paid ? { t: 'Paid – waiting for client to sign', c: 'pill-amber' } : (CisFormStatus[f.status] || { t: f.status, c: 'pill-grey' });
      const a = f.answers || {};
      const meta = [f.quote ? `Quote ${esc(f.quote.quote_number)}` : '', `started ${Fmt.date(f.created_at)}`,
        f.signed_at ? `signed ${Fmt.date(f.signed_at)}` : '', f.posted_at ? `posted ${Fmt.date(f.posted_at)}` : ''].filter(Boolean).join(' · ');
      const btns = [
        f.has_pdf ? `<button type="button" class="btn btn-primary btn-sm" data-pdf="${f.id}">Download PDF</button>` : '',
        f.status === 'signed' ? `<button type="button" class="btn btn-secondary btn-sm" data-post="${f.id}">Mark posted</button>` : '',
        f.status === 'posted' ? `<button type="button" class="btn btn-secondary btn-sm" data-unpost="${f.id}">Undo posted</button>` : '',
      ].join(' ');
      return `<div class="note-row" style="padding:10px 0;border-top:1px solid var(--border, #E3E6EB);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <span><span class="pill ${st.c}">${st.t}</span> <span class="muted-line" style="font-size:12px;margin-left:6px;">${meta}</span></span>
          <span>${btns}</span>
        </div>
        <details style="margin-top:6px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;">Answers</summary>
          <table class="data-table" style="width:100%;font-size:13px;margin-top:6px;"><tbody>
          ${[['Name', `${a.title || ''} ${a.first_names || ''} ${a.surname || ''}`], ['Date of birth', a.date_of_birth], ['UTR', a.utr], ['NI number', a.ni_number],
             ['Address', [a.address_1, a.address_2, a.town, a.county, a.postcode].filter(Boolean).join(', ')], ['Phone', a.phone], ['Email', a.email],
             ['Started in construction', a.start_date], ['Type of work', a.work_type], ['Trading name', a.trading_name], ['Paid as subcontractor before', a.paid_before ? 'Yes' : 'No'],
             ['Verification number', a.verification_number]].filter(r => r[1]).map(r => `<tr><td style="width:40%;color:#4A5568">${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}
          </tbody></table></details></div>`;
    }).join('');
    this.bodyEl.querySelectorAll('[data-pdf]').forEach(b => b.addEventListener('click', () => this.pdf(b.dataset.pdf, b)));
    this.bodyEl.querySelectorAll('[data-sheet]').forEach(b => b.addEventListener('click', () => this.sheet(b.dataset.sheet, b)));
    this.bodyEl.querySelectorAll('[data-post]').forEach(b => b.addEventListener('click', () => this.posted(b.dataset.post, true, b)));
    this.bodyEl.querySelectorAll('[data-unpost]').forEach(b => b.addEventListener('click', () => this.posted(b.dataset.unpost, false, b)));
  },

  async pdf(id, btn) {
    btn.disabled = true;
    try { const r = await this.call({ action: 'admin_pdf', id }); window.open(r.url, '_blank'); }
    catch (err) { alert(err.message); }
    btn.disabled = false;
  },

  async sheet(id, btn) {
    btn.disabled = true;
    try {
      const r = await this.call({ action: 'admin_pdf', id });
      const bytes = Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = r.name || 'UTR registration.pdf'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) { alert(err.message); }
    btn.disabled = false;
  },

  async posted(id, posted, btn) {
    btn.disabled = true;
    try { await this.call({ action: 'admin_posted', id, posted }); this.render(this.clientId, this.wrapEl, this.bodyEl); }
    catch (err) { alert(err.message); btn.disabled = false; }
  },
};
