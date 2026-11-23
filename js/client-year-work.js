// Accounted4Tax Practice Manager — "Documents and returns" on the client page, mirroring the client portal.
// Sole traders: a card per year (past, submitted years collapsed). Limited companies: a tab per service and per year.
// Each year: Work status, the same 4-step bar the client sees, what we asked for (Mark received),
// Send return for approval (labelled files + figures), Mark submitted (receipt), shared files and the client's uploads. 20 Nov 2026: the balance taken on approval can be changed before sending.
// Adds methods to ClientPortalPanel (js/client-portal-panel.js). Loaded after it.

const PmBar = { not_started: 1, awaiting_info: 2, in_progress: 2, sent_for_approval: 3, approved: 3, submitted: 4 };
// What the client sees for each work status (same words as the portal).
const PmClientSees = { not_started: 'Not started', awaiting_info: 'Waiting for you', in_progress: 'In progress', sent_for_approval: 'Waiting for your approval', approved: 'Approved – we are submitting it', submitted: 'Submitted' };
const PmDocTypes = { sa100: 'Tax return (SA100)', tax_calc: 'Tax calculation (SA302)', supporting: 'Other supporting document', accounts: 'Annual accounts', ct600: 'CT600', ct_comp: 'Corporation Tax computation', vat_return: 'VAT return', cs_draft: 'Confirmation statement (draft)', mtd_summary: 'MTD quarterly summary', return_summary: 'Return summary', receipt: 'HMRC / Companies House receipt', id: 'Proof of identity' };
// Labelled upload slots for "Send return for approval", by service name. The first slot is required.
const pmSlots = (name) => {
  const n = (name || '').toLowerCase();
  if (/vat/.test(n)) return { slots: ['vat_return', 'supporting'], figs: null };
  if (/confirmation statement/.test(n)) return { slots: ['cs_draft'], figs: null };
  if (/mtd/.test(n) && !/end of year/.test(n)) return { slots: ['mtd_summary', 'supporting'], figs: null };
  if (/payroll|cis|pension/.test(n)) return { slots: ['return_summary', 'supporting'], figs: null };
  if (/self assessment|personal tax|end of year|p87/.test(n)) return { slots: ['sa100', 'tax_calc', 'supporting'], figs: 'sa' };
  if (/accounts|ct600|corporation|ltd company|limited/.test(n)) return { slots: ['accounts', 'ct600', 'ct_comp'], figs: 'ct' };
  return { slots: ['return_summary', 'supporting'], figs: null };
};
const pmYwAddMonths = (iso, m, days) => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); d.setMonth(d.getMonth() + m); if (days) d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const pmMoney = (v) => '£' + Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pmFigText = (f, y) => {
  if (!f) return '';
  if (f.kind === 'ct') return Number(f.ct) > 0 ? `Corporation Tax ${pmMoney(f.ct)} by ${Fmt.date(f.due)}` : 'No Corporation Tax to pay';
  const m = /^(\d{4})\//.exec(y || ''), a = m ? +m[1] : null, first = Number(f.balancing || 0) + Number(f.poa1 || 0);
  const bits = [];
  if (first > 0) bits.push(`${pmMoney(first)} by ${a ? Fmt.date(`${a + 2}-01-31`) : '31 Jan'}`);
  if (Number(f.poa2) > 0) bits.push(`then ${pmMoney(f.poa2)} by ${a ? Fmt.date(`${a + 2}-07-31`) : '31 Jul'}`);
  if (Number(f.refund) > 0) bits.push(`refund ${pmMoney(f.refund)}`);
  return bits.length ? 'Client sees: pay ' + bits.join(', ') : 'No tax to pay';
};

Object.assign(ClientPortalPanel, {
  // Everything for one service + year.
  yearInfo(g, y) {
    const row = g.loose ? null : pmRowFor(g, y);
    // an ongoing service's items go to the year they belong to; a yearly service's items all belong to its year
    const inIt = (x) => (row && x.client_service_id === row.id && (pmRowKey(row) || pmItemKey(g, this.client, x) === y)) || ((g.loose ? !this.tabs.ids[x.client_service_id] : this.tabs.ids[x.client_service_id] === g.key) && pmNormKey(x.tax_year) === y);
    const R = this.requests.filter(r => r.status !== 'cancelled' && inIt(r));
    const D = this.docs.filter(d => d.doc_group !== 'filings' && inIt(d));
    const ap = R.filter(r => r.kind === 'approve');
    return { row, ws: row ? (row.work_status || 'not_started') : null, R, D,
      asked: R.filter(r => r.kind !== 'approve' && r.status !== 'done'),
      openAp: ap.find(r => r.status === 'open') || null,
      doneAp: ap.filter(r => r.status === 'done').sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0))[0] || null,
      shared: D.filter(d => d.uploaded_by !== 'client'), mine: D.filter(d => d.uploaded_by === 'client') };
  },
  bar(ws) {
    const n = ws ? PmBar[ws] || 1 : 0, lab = ['Documents', 'Working', 'Approve', 'Submitted'];
    return `<div class="yw-bar${ws === 'submitted' ? ' done' : ''}" aria-label="Step ${n} of 4">${[0, 1, 2, 3].map(i => `<span class="${i < n ? 'on' : ''}"></span>`).join('')}</div>
      <div class="yw-bar-l">${lab.map(l => `<span>${l}</span>`).join('')}</div>`;
  },

  workArea() {
    const sole = (this.client || {}).client_type !== 'ltd';
    const real = (this.tabs || []).filter(t => !t.loose), loose = (this.tabs || []).find(t => t.loose);
    if (!sole || !real.length) {
      const g = this.curTab(); if (!g) return '<p class="empty-state">No services yet.</p>';
      return `<div class="pm-chips" style="margin-bottom:6px;">${this.tabs.map(t => `<button type="button" class="pm-chip${t.key === g.key ? ' is-on' : ''}" data-svc="${Esc(t.key)}">${Esc(t.name)}</button>`).join('')}</div>
        <div class="pm-chips" style="margin-bottom:12px;"><span class="muted-line" style="font-size:12.5px;margin-right:4px;">Year:</span>${g.years.map(y => `<button type="button" class="pm-chip${y === this.sel.yr ? ' is-on' : ''}" data-yr="${Esc(y || '')}">${Esc(pmKeyLabel(y))}</button>`).join('')}</div>
        ${this.yearBlock(g, this.sel.yr, false)}${this.filingsBlock()}`;
    }
    const many = real.length > 1, cards = [], past = [];
    real.forEach(g => g.years.forEach(y => {
      const I = this.yearInfo(g, y);
      if (!I.row && y !== g.current && !I.D.length) return;
      (I.ws === 'submitted' ? past : cards).push({ g, y, I });
    }));
    cards.sort((a, b) => (a.I.row ? 0 : 1) - (b.I.row ? 0 : 1) || pmKeyEnd(a.y) - pmKeyEnd(b.y));
    past.sort((a, b) => pmKeyEnd(b.y) - pmKeyEnd(a.y));
    const looseHas = loose && this.docs.some(d => d.doc_group !== 'filings' && !this.tabs.ids[d.client_service_id]);
    return cards.map(x => this.yearBlock(x.g, x.y, many)).join('')
      + (past.length ? `<section class="pp-sec"><div class="pp-sec-h"><h3>Past years</h3></div><div class="pp-sec-b">${past.map(x => {
        const k = `${x.g.key}|${x.y || ''}`, open = this.openPast === k;
        return `<div class="yw-past"><button type="button" class="yw-past-hit" data-past="${Esc(k)}" aria-expanded="${open}"><b>${many ? Esc(x.g.name) + ' · ' : ''}${Esc(pmKeyLabel(x.y))}</b> <span class="muted-line">· Submitted${x.I.row && x.I.row.submitted_at ? ' ' + Fmt.date(x.I.row.submitted_at) : ''}</span><span style="margin-left:auto;">${open ? '▴' : '▾'}</span></button>${open ? this.yearBlock(x.g, x.y, many) : ''}</div>`;
      }).join('')}</div></section>` : '')
      + (looseHas ? this.yearBlock(loose, null, false, 'General documents (not linked to a service)') : '')
      + this.filingsBlock();
  },

  filingsBlock() {
    const filings = this.docs.filter(d => d.doc_group === 'filings'), P = pmPeriods(this.client);
    return filings.length ? `<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;">Company filings (${filings.length})</summary><table class="data-table" style="width:100%;font-size:12.5px;margin-top:6px;"><tbody>${filings.map(d => this.fileRow(d, P)).join('')}</tbody></table></details>` : '';
  },

  yearBlock(g, y, showName, title) {
    const I = this.yearInfo(g, y), key = `${g.key}|${y || ''}`, P = pmPeriods(this.client);
    const act = this.act && this.act.key === key ? this.act.kind : null;
    const WS = typeof CLIENT_WORK_STATUSES !== 'undefined' ? CLIENT_WORK_STATUSES : PmClientSees;
    const sees = I.ws ? (I.asked.some(r => r.status === 'open') && I.ws !== 'submitted' ? 'Waiting for you' : PmClientSees[I.ws]) : 'Current year';
    const head = `<div class="yw-h"><h3>${Esc(title || ((showName ? g.name + ' · ' : '') + pmKeyLabel(y)))}</h3>
      ${I.row ? `<label class="yw-ws">Work status <select class="input" data-ws="${I.row.id}">${Object.entries(WS).map(([k, v]) => `<option value="${k}" ${k === I.ws ? 'selected' : ''}>${Esc(v)}</option>`).join('')}</select></label>` : (g.loose ? '' : '<span class="muted-line" style="font-size:12.5px;">No service set up for this year (add it on the Work tab)</span>')}</div>`;
    const bar = g.loose ? '' : `${this.bar(I.ws)}<p class="yw-sees">Client sees: <span class="pill ${I.ws === 'submitted' ? 'pill-green' : sees === 'Waiting for you' || I.ws === 'sent_for_approval' ? 'pill-amber' : 'pill-grey'}">${Esc(sees)}</span></p>`;
    const asked = I.asked.length ? `<div class="yw-asked"><b>We asked</b>${I.asked.map(r => `<div class="yw-asked-r"><span>${Esc(r.title)} <span class="muted-line">· ${Esc(PortalKinds[r.kind] || r.kind)}${r.kind === 'upload' && r.doc_group && DocGroups[r.doc_group] ? ' – ' + DocGroups[r.doc_group][0] : ''}${r.due_date ? ' · by ' + Fmt.date(r.due_date) : ''}${r.status === 'submitted' ? ' · client replied' : ''}</span></span>
      <span style="white-space:nowrap;"><button type="button" class="btn btn-primary btn-sm" data-received="${r.id}">Mark received</button> <button type="button" class="btn btn-secondary btn-sm" data-req-cancel="${r.id}">Cancel</button></span></div>`).join('')}</div>` : '';
    const apLine = I.openAp ? `<div class="yw-ap"><b>Sent for approval ${Fmt.date(I.openAp.created_at)}</b> – waiting for the client${I.openAp.due_date ? ` (by ${Fmt.date(I.openAp.due_date)})` : ''}.
        <div class="muted-line" style="font-size:12.5px;">${Esc(I.openAp.title)}${I.openAp.figures ? ' · ' + Esc(pmFigText(I.openAp.figures, y)) : ''}</div>
        <button type="button" class="btn btn-secondary btn-sm" data-req-cancel="${I.openAp.id}" style="margin-top:6px;">Withdraw</button></div>`
      : I.doneAp ? `<div class="yw-ok">✔ <b>Approved by the client ${Fmt.date(I.doneAp.completed_at)}</b>${I.doneAp.figures ? ` <span class="muted-line">· ${Esc(pmFigText(I.doneAp.figures, y))}</span>` : ''} <span class="muted-line">(record under Records → Approval records)</span></div>` : '';
    // MTD: the quarters of this tax year; the files below show the selected quarter
    const QS = !g.loose && pmIsMtd(g.name) && this.mtd ? this.mtd[y] || null : null;
    let qSel = null, qRow = null;
    if (QS && QS.length) {
      const filed = (m) => ['submitted', 'final_declaration'].includes(m.status);
      if (this.mtdQ[key] === undefined) { const f = QS.find(m => !filed(m)); this.mtdQ[key] = f ? f.quarter : 'all'; }
      qSel = this.mtdQ[key]; qRow = QS.find(m => m.quarter === qSel) || null;
      const inQ = (d, q) => q === 'all' || d.quarter === q;
      I.shared = I.shared.filter(d => inQ(d, qSel)); I.mine = I.mine.filter(d => inQ(d, qSel));
      const today = new Date().toISOString().slice(0, 10);
      const chip = (m) => {
        const them = I.D.filter(d => d.uploaded_by === 'client' && d.quarter === m.quarter), us = I.D.filter(d => d.uploaded_by !== 'client' && d.quarter === m.quarter);
        const st = filed(m) ? `Filed ${m.submitted_at ? Fmt.date(m.submitted_at) : ''}` : m.deadline && m.deadline < today ? `Overdue – due ${Fmt.date(m.deadline)}` : `Due ${Fmt.date(m.deadline)}`;
        return `<button type="button" class="yw-q${qSel === m.quarter ? ' is-on' : ''}${filed(m) ? ' is-filed' : m.deadline && m.deadline < today ? ' is-late' : ''}" data-mtd-q="${Esc(key)}" data-q="${m.quarter}">
          <b>${pmQLabel(m.quarter)}</b><small>${Esc(st)}</small><span class="yw-qn"><i class="yw-qn-us" title="Shared by you">${us.length}</i><i class="yw-qn-them" title="Client's uploads">${them.length}</i></span></button>`;
      };
      I.qHtml = `<div class="yw-qs"><button type="button" class="yw-q${qSel === 'all' ? ' is-on' : ''}" data-mtd-q="${Esc(key)}" data-q="all"><b>All</b><small>Whole year</small></button>${QS.map(chip).join('')}</div>
        ${qRow ? `<div class="yw-q-info"><span><b>${Esc(qRow.quarter_label || pmQLabel(qRow.quarter))}</b> <span class="muted-line">· ${qRow.quarter === 5 ? 'whole tax year' : Fmt.date(qRow.period_start) + ' – ' + Fmt.date(qRow.period_end)} · due ${Fmt.date(qRow.deadline)}${qRow.hmrc_ref ? ' · HMRC ref ' + Esc(qRow.hmrc_ref) : ''}</span></span>
          ${filed(qRow) ? `<span><span class="pill pill-green">Filed – locked for the client</span> <button type="button" class="btn btn-secondary btn-sm" data-mtd-unlock="${qRow.id}">Unlock</button></span>`
            : `<button type="button" class="btn btn-primary btn-sm" data-mtd-file="${qRow.id}" data-label="${Esc(qRow.quarter_label || '')}">Mark ${Esc(pmQLabel(qRow.quarter))} filed</button>`}</div>
          <p class="muted-line" style="font-size:12px;margin:4px 0 0;">Once filed, the client can't add files to it – anything they upload later goes to the next open quarter${qRow.quarter >= 4 ? (qRow.quarter === 4 ? ' (the final declaration)' : ' (Q1 of the next tax year)') : ''}.</p>` : ''}`;
    }
    const btn = (kind, label, primary) => `<button type="button" class="btn ${act === kind ? 'btn-primary' : primary ? 'btn-primary' : 'btn-secondary'} btn-sm" data-act="${kind}" data-key="${Esc(key)}" aria-expanded="${act === kind}">${label}</button>`;
    const actions = `<div class="yw-acts">${btn('ask', '+ Ask the client for something')}${g.loose ? '' : btn('send', 'Send return for approval', I.ws === 'in_progress')}${g.loose || !I.row ? '' : btn('submit', I.ws === 'submitted' ? 'Edit submission' : 'Mark submitted', I.ws === 'approved')}${btn('share', 'Share other files')}</div>`;
    const panel = act === 'ask' ? this.askPanel(g, y) : act === 'send' ? this.sendPanel(g, y, I) : act === 'submit' ? this.submitPanel(g, y, I) : act === 'share' ? this.sharePanel(g, y) : '';
    // Client's uploads: the 4 folders, with Mark all checked
    const groups = Object.keys(DocGroups).map(k => {
      const req = I.R.filter(r => r.kind === 'upload' && (r.doc_group || 'other') === k), recv = I.mine.filter(d => (d.doc_group || 'other') === k);
      const fresh = recv.filter(d => !d.verified).length, gk = `${key}::${k}`, open = this.openGroup === gk;
      return `<div class="yw-grp"><div class="yw-grp-r"><span><b>${DocGroups[k][0]}</b> <span class="muted-line">${recv.length} file${recv.length === 1 ? '' : 's'}${req.length ? ` · ${req.length} asked` : ''}</span>${fresh ? ` <span class="pill pill-amber">${fresh} new</span>` : ''}</span>
        <span style="white-space:nowrap;">${fresh ? `<button type="button" class="btn btn-secondary btn-sm" data-check-key="${Esc(gk)}">Mark all checked</button> ` : ''}${recv.length ? `<button type="button" class="btn btn-secondary btn-sm" data-view-key="${Esc(gk)}">${open ? 'Hide' : 'View'}</button>` : ''}</span></div>
        ${open ? `<table class="data-table" style="width:100%;font-size:12.5px;"><tbody>${recv.map(d => this.fileRow(d, P)).join('')}</tbody></table>` : ''}</div>`;
    }).join('');
    const sharedHtml = I.shared.length ? `<ul class="yw-files">${I.shared.map(d => `<li><span><b>${Esc(d.doc_type ? PmDocTypes[d.doc_type] || d.doc_type : d.file_name)}</b><span class="muted-line" style="display:block;font-size:11.5px;">${d.doc_type ? Esc(d.file_name) + ' · ' : ''}${Fmt.date(d.created_at)}${d.visible_to_client ? '' : ' · hidden'}</span></span>
        <span class="yw-file-acts"><button type="button" class="btn btn-secondary btn-sm" data-pv="${d.id}">Preview</button><button type="button" class="btn btn-secondary btn-sm" data-share="${d.id}" data-on="${d.visible_to_client ? '0' : '1'}">${d.visible_to_client ? 'Hide' : 'Share'}</button>
        <select class="input" data-move-to="${d.id}" title="Move to another service or year">${this.moveOpts(d)}</select></span></li>`).join('')}</ul>` : '<p class="empty-state">Nothing shared yet.</p>';
    return `<section class="pp-sec yw-card${I.ws === 'submitted' ? ' yw-done' : ''}">${head}<div class="pp-sec-b">${bar}${I.qHtml || ''}${asked}${apLine}${actions}${panel}
      <div class="yw-cols"><div class="yw-col yw-col-us"><h4 class="yw-col-h">📤 Shared with the client (${I.shared.length})</h4>${sharedHtml}</div><div class="yw-col yw-col-them"><h4 class="yw-col-h">📥 Client's uploads (${I.mine.length})</h4>${groups}</div></div></div></section>`;
  },

  askPanel(g, y) {
    const kinds = Object.entries(PortalKinds).filter(([k]) => k !== 'approve');
    return `<form class="yw-panel" id="yw-ask">
      <fieldset class="pp-kinds"><legend>What should the client do?</legend>${kinds.map(([k, v], i) => `<label class="pp-kind"><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''}><b>${v}</b><span>${PortalKindHelp[k]}</span></label>`).join('')}</fieldset>
      <label class="form-field" id="yw-grp-f"><span>Folder</span><select name="doc_group" class="input">${Object.entries(DocGroups).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label>
      <label class="form-field"><span>What you need (the client sees this) *</span><input name="title" class="input" required maxlength="160" placeholder="e.g. December bank statement"></label>
      <label class="form-field"><span>Details (optional)</span><input name="description" class="input" maxlength="400"></label>
      <label class="form-field" style="max-width:200px;"><span>Needed by</span><input name="due_date" type="date" class="input"></label>
      ${g.loose ? '' : `<p class="muted-line" style="font-size:12.5px;margin:0;">The work status moves to <b>Awaiting info</b>; the client's bar does not move back – it shows “Waiting for you”.</p>`}
      <label style="font-size:13px;"><input type="checkbox" name="email" checked> Email the client</label>
      <div><button type="submit" class="btn btn-primary btn-sm">Ask the client</button> <button type="button" class="btn btn-secondary btn-sm" data-act-close>Cancel</button></div></form>`;
  },

  sendPanel(g, y, I) {
    const S = pmSlots(g.name), f = this.slotFiles || {}, fig = this.figDraft || {};
    const due = S.figs === 'ct' && /^YE /.test(y || '') ? pmYwAddMonths(y.slice(3), 9, 1) : '';
    const slot = (t, i) => `<div class="yw-slot"><span><b>${Esc(PmDocTypes[t])}</b>${i === 0 ? ' <span class="pill pill-amber">required</span>' : ' <span class="muted-line">(optional)</span>'}</span>
      ${f[t] ? `<span>${Esc(f[t].name)} <button type="button" class="btn btn-secondary btn-sm" data-slot-clear="${t}" aria-label="Remove ${Esc(f[t].name)}">×</button></span>` : `<label class="btn btn-secondary btn-sm" style="cursor:pointer;">Choose file<input type="file" data-slot="${t}" accept=".pdf,.jpg,.jpeg,.png" hidden></label>`}</div>`;
    const num = (n, l) => `<label class="form-field" style="max-width:170px;"><span>${l}</span><input name="${n}" class="input" inputmode="decimal" value="${Esc(fig[n] != null ? fig[n] : '')}" placeholder="0.00"></label>`;
    return `<form class="yw-panel" id="yw-send">
      <p style="margin:0 0 6px;">Each file goes in its own slot, so the portal shows the right name (the client approves them together).</p>
      ${S.slots.map(slot).join('')}
      ${S.figs === 'sa' ? `<div class="yw-figs"><b>Figures (you type them; the portal adds them up)</b><div style="display:flex;gap:8px;flex-wrap:wrap;">${num('balancing', 'Balancing payment £')}${num('poa1', '1st payment on account £')}${num('poa2', '2nd payment on account £')}${num('refund', 'Refund due £')}</div></div>` : ''}
      ${S.figs === 'ct' ? `<div class="yw-figs"><b>Figures</b><div style="display:flex;gap:8px;flex-wrap:wrap;">${num('ct', 'Corporation Tax to pay £')}<label class="form-field" style="max-width:190px;"><span>Due date</span><input name="due" type="date" class="input" value="${Esc(fig.due || due)}"></label></div></div>` : ''}
      <label class="form-field"><span>Title (the client sees this)</span><input name="title" class="input" maxlength="160" value="${Esc(fig.title || (() => { const q = pmIsMtd(g.name) && this.mtdQ ? this.mtdQ[`${g.key}|${y || ''}`] : null; return typeof q === 'number' ? `Please approve your MTD ${q === 5 ? 'final declaration' : 'update ' + pmQLabel(q)} ${pmKeyLabel(y)}` : `Please approve your ${g.name} ${pmKeyLabel(y)}`; })())}"></label>
      <label class="form-field" style="max-width:200px;"><span>Approve by</span><input name="due_date" type="date" class="input" value="${Esc(fig.due_date || '')}"></label>
      <div class="yw-bal" id="yw-bal"></div>
      <label style="font-size:13px;"><input type="checkbox" name="email" checked> Email the client</label>
      ${I.openAp ? '<p class="page-error" style="margin:0;">This year already has an approval waiting. Withdraw it first if you are replacing it.</p>' : ''}
      <div><button type="submit" class="btn btn-primary btn-sm" ${I.openAp ? 'disabled' : ''}>Send for approval</button> <button type="button" class="btn btn-secondary btn-sm" data-act-close>Cancel</button></div>
      <p class="muted-line" style="font-size:12px;margin:0;">Work status moves to Sent for approval. When the client approves, it moves to Approved and each file's fingerprint is kept.</p></form>`;
  },

  submitPanel(g, y, I) {
    const f = this.slotFiles || {}, today = new Date().toISOString().slice(0, 10);
    const rec = I.shared.find(d => d.doc_type === 'receipt');
    return `<form class="yw-panel" id="yw-submit">
      <div class="yw-slot"><span><b>${PmDocTypes.receipt}</b> <span class="muted-line">(optional – the client can open it)</span>${rec ? ` <span class="muted-line">· already shared: ${Esc(rec.file_name)}</span>` : ''}</span>
        ${f.receipt ? `<span>${Esc(f.receipt.name)} <button type="button" class="btn btn-secondary btn-sm" data-slot-clear="receipt">×</button></span>` : `<label class="btn btn-secondary btn-sm" style="cursor:pointer;">Choose file<input type="file" data-slot="receipt" accept=".pdf,.jpg,.jpeg,.png" hidden></label>`}</div>
      <label class="form-field" style="max-width:200px;"><span>Submitted on</span><input name="submitted_at" type="date" class="input" value="${Esc((I.row && I.row.submitted_at) || today)}" max="${today}"></label>
      <label style="font-size:13px;"><input type="checkbox" name="email" checked> Email the client</label>
      <div><button type="submit" class="btn btn-primary btn-sm">Mark submitted</button> <button type="button" class="btn btn-secondary btn-sm" data-act-close>Cancel</button></div></form>`;
  },

  sharePanel(g, y) {
    const q = this.queue || [], label = g.loose ? 'General documents' : `${g.name} · ${pmKeyLabel(y)}`;
    return `<div class="pp-share yw-panel">
      ${q.length ? `<ul style="list-style:none;margin:0 0 8px;padding:0;font-size:13px;">${q.map((f, i) => `<li style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid #EEF1F4;">${Esc(f.name)} <span class="muted-line">${(f.size / 1048576).toFixed(1)} MB <button type="button" class="btn btn-secondary btn-sm" data-unq="${i}" aria-label="Remove ${Esc(f.name)}">×</button></span></li>`).join('')}</ul>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
        <label class="btn btn-secondary btn-sm" style="cursor:pointer;">${q.length ? 'Add more files' : 'Choose files'}<input type="file" id="pp-share-files" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" hidden></label>
        <label class="form-field" style="margin:0;"><span>Shows in the portal under</span><select id="pp-share-where" class="input"><option value="here">${Esc(label)}</option>${g.loose ? '' : '<option value="general">General documents (not linked to a service)</option>'}<option value="filings">Company filings</option></select></label>
        <input type="checkbox" id="pp-share-approve" hidden>
        ${q.length ? `<button type="button" class="btn btn-primary btn-sm" id="pp-share-send">Share ${q.length} file${q.length === 1 ? '' : 's'}</button>` : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-act-close>Close</button>
      </div>
      <p class="muted-line" style="font-size:12px;margin:6px 0 0;">For a return to approve, use “Send return for approval”. PDF or images, max 20 MB each.</p></div>`;
  },

  // Upload one file the practice shares; returns the new documents id.
  async shareFile(file, row, y, docType) {
    const safe = file.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-90);
    const path = `${this.clientId}/shared/${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}-${safe}`;
    const up = await sb.storage.from('portal-docs').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (up.error) throw new Error(`${file.name}: ${up.error.message}`);
    const { data, error } = await sb.from('documents').insert({ client_id: this.clientId, client_service_id: row ? row.id : null, category: docType === 'receipt' ? 'other' : 'tax_return',
      doc_group: 'returns', doc_type: docType, tax_year: y || null, file_name: file.name, file_url: 'portal-docs/' + path, file_size: file.size, mime_type: file.type || null,
      uploaded_by: 'practice', verified: true, visible_to_client: true, quarter: typeof this._q === 'number' ? this._q : null }).select('id').single();
    if (error) throw new Error(`${file.name}: ${error.message}`);
    return data.id;
  },
  async setWork(rowId, patch) {
    const { error } = await sb.from('client_services').update(patch).eq('id', rowId);
    if (error) throw new Error(error.message);
  },

  wireYear() {
    const C = this.containerEl, $ = (id) => document.getElementById(id);
    const reload = () => { this.render(this.clientId, this.containerEl, this.client, this.opts); if (this.onChange) this.onChange(); };
    const parse = (key) => { const i = key.indexOf('|'); const svc = key.slice(0, i), y = key.slice(i + 1) || null; return { g: this.tabs.find(t => t.key === svc), y }; };
    const cur = () => this.act ? parse(this.act.key) : {};
    C.querySelectorAll('[data-past]').forEach(b => b.addEventListener('click', () => { this.openPast = this.openPast === b.dataset.past ? null : b.dataset.past; this.draw(); }));
    C.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const same = this.act && this.act.key === b.dataset.key && this.act.kind === b.dataset.act;
      this.act = same ? null : { key: b.dataset.key, kind: b.dataset.act }; this.slotFiles = {}; this.figDraft = {};
      if (!same) { const p = parse(b.dataset.key); this.sel = { svc: p.g && p.g.key, yr: p.y }; }
      this.draw();
      const f = C.querySelector('.yw-panel'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
    }));
    C.querySelectorAll('[data-act-close]').forEach(b => b.addEventListener('click', () => { this.act = null; this.draw(); }));
    // MTD quarters (23 Nov 2026)
    C.querySelectorAll('[data-mtd-q]').forEach(b => b.addEventListener('click', () => { const q = b.dataset.q; this.mtdQ[b.dataset.mtdQ] = q === 'all' ? 'all' : Number(q); this.draw(); }));
    C.querySelectorAll('[data-mtd-file]').forEach(b => b.addEventListener('click', async () => {
      const ref = prompt(`Mark ${b.dataset.label || 'this quarter'} as filed with HMRC.\nHMRC reference (optional):`, '');
      if (ref === null) return;
      b.disabled = true;
      const { error } = await sb.rpc('pm_mtd_set', { p_id: b.dataset.mtdFile, p_filed: true, p_ref: ref.trim() || null });
      if (error) { alert('Could not save: ' + error.message); b.disabled = false; return; }
      reload();
    }));
    C.querySelectorAll('[data-mtd-unlock]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Unlock this quarter? The client will be able to add files to it again.')) return;
      b.disabled = true;
      const { error } = await sb.rpc('pm_mtd_set', { p_id: b.dataset.mtdUnlock, p_filed: false, p_ref: null });
      if (error) { alert('Could not save: ' + error.message); b.disabled = false; return; }
      reload();
    }));
    C.querySelectorAll('[data-view-key]').forEach(b => b.addEventListener('click', () => { this.openGroup = this.openGroup === b.dataset.viewKey ? null : b.dataset.viewKey; this.draw(); }));
    C.querySelectorAll('[data-check-key]').forEach(b => b.addEventListener('click', async () => {
      const [key, grp] = b.dataset.checkKey.split('::'), p = parse(key), I = this.yearInfo(p.g, p.y);
      const ids = I.mine.filter(d => !d.verified && (d.doc_group || 'other') === grp).map(d => d.id);
      if (!ids.length) return; b.disabled = true;
      await sb.from('documents').update({ verified: true, verified_at: new Date().toISOString() }).in('id', ids); reload();
    }));
    C.querySelectorAll('[data-ws]').forEach(s => s.addEventListener('change', async () => {
      const patch = { work_status: s.value };
      if (s.value === 'submitted') patch.submitted_at = new Date().toISOString().slice(0, 10);
      try { await this.setWork(s.dataset.ws, patch); } catch (e) { alert(`Could not save: ${e.message}`); }
      reload();
    }));
    C.querySelectorAll('[data-received]').forEach(b => b.addEventListener('click', async () => {
      const r = this.requests.find(x => x.id === b.dataset.received); b.disabled = true;
      await sb.from('portal_requests').update({ status: 'done', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', r.id);
      // last one received → back to In progress
      const row = this.services.find(s => s.id === r.client_service_id);
      const left = this.requests.filter(x => x.id !== r.id && x.kind !== 'approve' && x.status === 'open' && x.client_service_id === r.client_service_id);
      if (row && row.work_status === 'awaiting_info' && !left.length) { try { await this.setWork(row.id, { work_status: 'in_progress' }); } catch (_) {} }
      reload();
    }));
    C.querySelectorAll('[data-slot]').forEach(inp => inp.addEventListener('change', () => {
      const file = inp.files[0]; if (!file) return;
      if (file.size > 20 * 1048576) { alert('That file is bigger than 20 MB.'); return; }
      const form = inp.closest('form'); if (form) this.figDraft = Object.fromEntries(new FormData(form).entries());
      this.slotFiles = { ...(this.slotFiles || {}), [inp.dataset.slot]: file }; this.draw();
    }));
    C.querySelectorAll('[data-slot-clear]').forEach(b => b.addEventListener('click', () => {
      const form = b.closest('form'); if (form) this.figDraft = Object.fromEntries(new FormData(form).entries());
      delete this.slotFiles[b.dataset.slotClear]; this.draw();
    }));
    const lockForm = (form, text) => { const s = form.querySelector('button[type="submit"]'); s.disabled = true; s.textContent = text; };

    const ask = $('yw-ask');
    if (ask) {
      const sync = () => { $('yw-grp-f').style.display = (ask.querySelector('[name="kind"]:checked') || {}).value === 'upload' ? '' : 'none'; };
      ask.querySelectorAll('[name="kind"]').forEach(r => r.addEventListener('change', sync)); sync();
      ask.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(ask), kind = f.get('kind'), { g, y } = cur(), row = g && !g.loose ? pmLinkRow(g, y) : null, exact = g && !g.loose ? pmRowFor(g, y) : null;
        const rec = { client_id: this.clientId, kind, title: String(f.get('title') || '').trim(), description: String(f.get('description') || '').trim() || null,
          due_date: f.get('due_date') || null, tax_year: y, client_service_id: row ? row.id : null, doc_group: kind === 'upload' ? (f.get('doc_group') || 'other') : null };
        if (!rec.title) { alert('Please say what you need.'); return; }
        lockForm(ask, 'Asking…');
        const { error } = await sb.from('portal_requests').insert(rec);
        if (error) { alert(`Could not add: ${error.message}`); reload(); return; }
        if (exact && ['not_started', 'in_progress'].includes(exact.work_status || 'not_started')) { try { await this.setWork(exact.id, { work_status: 'awaiting_info' }); } catch (_) {} }
        if (f.get('email')) this.notify('request');
        this.act = null; reload();
      });
    }

    const send = $('yw-send');
    // balance taken from the card when the client approves: shown and editable before sending
    if (send) (async () => {
      const box = $('yw-bal'), { g, y } = cur(), row = g ? pmLinkRow(g, y) : null;
      if (!box || !row) return;
      if (!this.balInfo || this.balInfo.rowId !== row.id) {
        const { data } = await sb.rpc('pm_balance_line', { p_client_service_id: row.id });
        this.balInfo = { rowId: row.id, ...((data && data[0]) || {}) };
      }
      const B = this.balInfo, fig = this.figDraft || {};
      if (!B.matches) return;
      if (B.matches > 1) { box.innerHTML = '<p class="muted-line" style="font-size:12.5px;margin:0;">This client has more than one balance waiting for this year – it will not be taken automatically. Charge it from Stripe.</p>'; return; }
      box.innerHTML = `<div class="yw-figs"><b>Balance taken from the client's card when they approve</b>
        <label class="form-field" style="max-width:190px;"><span>Balance £</span><input name="balance" class="input" inputmode="decimal" value="${Esc(fig.balance != null ? fig.balance : Number(B.amount).toFixed(2))}"></label>
        <p class="muted-line" style="font-size:12px;margin:0;">Quoted: £${Esc(Number(B.amount).toFixed(2))}. Change it here if the work turned out bigger or smaller – the portal shows the new amount on the approval button.</p></div>`;
    })();
    if (send) send.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(send), { g, y } = cur(), S = pmSlots(g.name), files = this.slotFiles || {};
      if (!files[S.slots[0]]) { alert(`Please add the ${PmDocTypes[S.slots[0]]} first.`); return; }
      const row = pmLinkRow(g, y), exact = pmRowFor(g, y);
      const n = (k) => { const v = String(f.get(k) || '').replace(/[£,\s]/g, ''); return v === '' ? null : Number(v); };
      const bad = ['balancing', 'poa1', 'poa2', 'refund', 'ct'].filter(k => f.has(k) && n(k) != null && (isNaN(n(k)) || n(k) < 0));
      if (bad.length) { alert('Please type the figures as numbers, e.g. 1240.50'); return; }
      const figures = S.figs === 'sa' ? { kind: 'sa', balancing: n('balancing'), poa1: n('poa1'), poa2: n('poa2'), refund: n('refund') }
        : S.figs === 'ct' ? { kind: 'ct', ct: n('ct'), due: f.get('due') || null } : null;
      const B = this.balInfo || {}, newBal = f.has('balance') ? n('balance') : null;
      if (f.has('balance') && (newBal == null || isNaN(newBal) || newBal <= 0 || newBal > 20000)) { alert('Please type the balance as a number, e.g. 250.00'); return; }
      lockForm(send, 'Uploading…');
      try {
        if (B.line_id && newBal != null && Math.round(newBal * 100) !== Math.round(Number(B.amount) * 100)) {
          const { error: be } = await sb.rpc('pm_set_balance', { p_line_id: B.line_id, p_amount: newBal });
          if (be) throw new Error(`balance not changed (${be.message})`);
          this.balInfo = null;
        }
        const ids = [];
        this._q = this.mtdQ ? this.mtdQ[`${g.key}|${y || ''}`] : null;
        for (const t of S.slots) if (files[t]) ids.push(await this.shareFile(files[t], row, y, t));
        const { error } = await sb.from('portal_requests').insert({ client_id: this.clientId, kind: 'approve', title: (String(f.get('title') || '').trim() || `Please approve your ${g.name} ${pmKeyLabel(y)}`).slice(0, 160),
          document_id: ids[0], document_ids: ids, figures, due_date: f.get('due_date') || null, tax_year: y, client_service_id: row ? row.id : null, quarter: typeof this._q === 'number' ? this._q : null });
        if (error) throw new Error(error.message);
        if (exact) await this.setWork(exact.id, { work_status: 'sent_for_approval' });
        if (f.get('email')) this.notify('approve');
        this.act = null; this.slotFiles = {}; this.figDraft = {}; this.balInfo = null;
      } catch (err) { alert(`Could not send: ${err.message}`); }
      reload();
    });

    const sub = $('yw-submit');
    if (sub) sub.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(sub), { g, y } = cur(), row = pmRowFor(g, y), files = this.slotFiles || {};
      if (!row) { alert('There is no service for this year. Add it on the Work tab first.'); return; }
      lockForm(sub, 'Saving…');
      try {
        this._q = this.mtdQ ? this.mtdQ[`${g.key}|${y || ''}`] : null;
        if (files.receipt) await this.shareFile(files.receipt, row, y, 'receipt');
        await this.setWork(row.id, { work_status: 'submitted', submitted_at: f.get('submitted_at') || new Date().toISOString().slice(0, 10) });
        if (f.get('email')) this.notify('document');
        this.act = null; this.slotFiles = {};
      } catch (err) { alert(`Could not save: ${err.message}`); }
      reload();
    });
  },
});
