// Accounted4Tax Practice Manager — CIS registration (CIS301) panel on the client page.
// Shows forms started online on the website (/cis-registration/): paid → client signs → you print and post.
// "Download PDF" gets the signed pages 1–2; "Mark posted" records the posting date. Runs through the Edge Function "start-online".

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

  draw() {
    const esc = this.esc.bind(this);
    this.bodyEl.innerHTML = this.list.map((f) => {
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
    this.bodyEl.querySelectorAll('[data-post]').forEach(b => b.addEventListener('click', () => this.posted(b.dataset.post, true, b)));
    this.bodyEl.querySelectorAll('[data-unpost]').forEach(b => b.addEventListener('click', () => this.posted(b.dataset.unpost, false, b)));
  },

  async pdf(id, btn) {
    btn.disabled = true;
    try { const r = await this.call({ action: 'admin_pdf', id }); window.open(r.url, '_blank'); }
    catch (err) { alert(err.message); }
    btn.disabled = false;
  },

  async posted(id, posted, btn) {
    btn.disabled = true;
    try { await this.call({ action: 'admin_posted', id, posted }); this.render(this.clientId, this.wrapEl, this.bodyEl); }
    catch (err) { alert(err.message); btn.disabled = false; }
  },
};
