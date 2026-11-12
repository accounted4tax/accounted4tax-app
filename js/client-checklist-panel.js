// Accounted4Tax Practice Manager — Self Assessment checklist panel on the client page.
// "Send checklist" emails the client a private link to the website checklist (/checklist/?t=...).
// When they submit, their answers show here: what they have, what they need help with, and their note.
// Everything runs through the Supabase Edge Function "sa-checklist".

const ChecklistStatus = {
  draft:     { t: 'Sent – waiting for client', c: 'pill-amber' },
  submitted: { t: 'Received – to review', c: 'pill-amber' },
  reviewed:  { t: 'Reviewed', c: 'pill-green' },
};
const ChecklistAnswer = { have: { t: 'Has it', c: 'pill-green' }, help: { t: 'Needs help', c: 'pill-amber' }, na: { t: 'Not applicable', c: 'pill-grey' } };
const ChecklistTypes = { self_employed: 'Self-employed', cis: 'CIS subcontractor', landlord: 'Landlord', director: 'Company director', other_income: 'Other income' };

const ClientChecklistPanel = {
  async render(clientId, containerEl, client) {
    this.clientId = clientId; this.containerEl = containerEl; this.client = client || {};
    containerEl.innerHTML = `<p class="muted-line">Loading checklists…</p>`;
    try {
      const r = await this.call({ action: 'list', client_id: clientId });
      this.list = r.checklists || [];
      this.draw();
    } catch (err) {
      containerEl.innerHTML = `<p class="page-error">Could not load checklists: ${this.esc(err.message)}</p>`;
    }
  },

  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  async call(body) {
    const res = await sb.functions.invoke('sa-checklist', { body });
    if (res.error) {
      let m = res.error.message || 'Something went wrong';
      try { const b = await res.error.context.json(); if (b.error) m = b.error.message; } catch (_) {}
      throw new Error(m);
    }
    return res.data;
  },

  draw() {
    const esc = this.esc.bind(this), latest = this.list[0];
    const canResend = !latest || latest.status === 'draft';
    const btnLabel = !latest ? 'Send checklist' : latest.status === 'draft' ? 'Resend link' : 'Send a new checklist';
    let html = `
      <div class="panel-header-row" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="muted-line" style="font-size:12.5px;">The client ticks which documents they have, need help with, or don't need.</span>
        <button type="button" class="btn btn-primary btn-sm" id="cl-send">${btnLabel}</button>
      </div>`;
    if (!this.list.length) {
      html += `<p class="empty-state">No checklist sent yet.</p>`;
    } else {
      html += this.list.map((f, idx) => {
        const st = ChecklistStatus[f.status] || ChecklistStatus.draft;
        const d = f.form_data || {};
        const items = Array.isArray(d.items) ? d.items : [];
        const help = items.filter(i => i.answer === 'help'), have = items.filter(i => i.answer === 'have');
        const meta = f.status === 'draft'
          ? `Sent ${f.sent_at ? Fmt.date(f.sent_at) : ''} to ${esc(f.sent_to_email || '')}${f.expires_at ? ` · link works until ${Fmt.date(f.expires_at)}` : ''}`
          : `Submitted ${f.submitted_at ? Fmt.date(f.submitted_at) : ''}${f.reviewed_at ? ` · reviewed ${Fmt.date(f.reviewed_at)}` : ''}`;
        let body = '';
        if (f.status !== 'draft' && items.length) {
          const bySection = {};
          items.forEach(i => { (bySection[i.section] = bySection[i.section] || []).push(i); });
          body = `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;">
              ${(d.types || []).map(t => `<span class="pill pill-grey">${esc(ChecklistTypes[t] || t)}</span>`).join('') || '<span class="muted-line" style="font-size:12px;">No income type ticked</span>'}
              <span class="pill pill-green">${have.length} has</span>
              <span class="pill ${help.length ? 'pill-amber' : 'pill-grey'}">${help.length} needs help</span>
            </div>
            ${d.note ? `<div style="background:#FFF6E5;border-radius:8px;padding:8px 10px;font-size:13px;margin:6px 0;"><b>Client's note:</b> ${esc(d.note)}</div>` : ''}
            <details ${idx === 0 && f.status === 'submitted' ? 'open' : ''} style="margin-top:6px;">
              <summary style="cursor:pointer;font-size:13px;font-weight:600;">Show all answers (${items.length})</summary>
              <div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:13px;margin-top:6px;">
                <thead><tr><th>Section</th><th>Item</th><th>Answer</th></tr></thead>
                <tbody>${Object.keys(bySection).map(sec => bySection[sec].map((i, k) => {
                  const a = ChecklistAnswer[i.answer] || { t: '—', c: 'pill-grey' };
                  return `<tr><td>${k === 0 ? `<b>${esc(sec)}</b>` : ''}</td><td>${esc(i.label)}</td><td><span class="pill ${a.c}">${a.t}</span></td></tr>`;
                }).join('')).join('')}</tbody>
              </table></div>
            </details>`;
        }
        const actions = f.status === 'submitted' ? `<button type="button" class="btn btn-secondary btn-sm" data-reviewed="${f.id}">Mark reviewed</button>` : '';
        return `<div class="note-row" style="padding:10px 0;border-top:1px solid var(--border, #E3E6EB);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <span><span class="pill ${st.c}">${st.t}</span> <span class="muted-line" style="font-size:12px;margin-left:6px;">${meta}</span></span>
            ${actions}
          </div>${body}</div>`;
      }).join('');
    }
    this.containerEl.innerHTML = html;
    document.getElementById('cl-send').addEventListener('click', (e) => this.send(e.target, canResend));
    this.containerEl.querySelectorAll('[data-reviewed]').forEach(b => b.addEventListener('click', () => this.reviewed(b.dataset.reviewed, b)));
  },

  async send(btn, resend) {
    const email = (this.client.email || '').trim();
    const to = prompt(resend ? 'Email the checklist link to:' : 'Email a new Self Assessment checklist to:', email);
    if (to === null) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) { alert('Please enter a valid email address.'); return; }
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'Sending…';
    try {
      const r = await this.call({ action: 'send', client_id: this.clientId, email: to.trim() });
      if (!r.email_ok) {
        alert(`The checklist was created but the email could not be sent: ${r.email_error || 'unknown error'}\n\nYou can send the client this link yourself:\n${r.link}`);
      }
      this.render(this.clientId, this.containerEl, this.client);
    } catch (err) { alert(`Could not send: ${err.message}`); btn.disabled = false; btn.textContent = old; }
  },

  async reviewed(id, btn) {
    btn.disabled = true;
    try { await this.call({ action: 'reviewed', id }); this.render(this.clientId, this.containerEl, this.client); }
    catch (err) { alert(err.message); btn.disabled = false; }
  },
};
