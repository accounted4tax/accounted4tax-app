// Accounted4Tax Practice Manager — panels for the tabbed client page.
// ClientDetailsCard (every client field), ClientLoePanel (engagement letters + signed PDF),
// ClientHmrcPanel (HMRC authorisations per tax), ClientOnboarding (progress bar),
// ClientTimelinePanel (history + correspondence + portal events + approvals in one list).

const PM_DASH = '—';
const pmSignedUrl = async (fullPath, fileName) => {
  // stored as "<bucket>/<path>"
  const i = String(fullPath || '').indexOf('/');
  if (i < 1) throw new Error('No file stored');
  const bucket = fullPath.slice(0, i), path = fullPath.slice(i + 1);
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 120, fileName ? { download: fileName } : undefined);
  if (error) throw error;
  return data.signedUrl;
};


/* ---------------- Periods (same rules as the client portal) ---------------- */
// Individuals: tax years "2025/26". Companies with a year end: "YE 2026-03-31". Newest first.
const pmPeriods = (client) => {
  const c = client || {}, out = [], today = new Date();
  if (c.client_type === 'ltd' && c.year_end_date) {
    const ye = new Date(c.year_end_date + 'T12:00:00');
    while (ye < today) ye.setFullYear(ye.getFullYear() + 1);
    for (let i = 0; i < 4; i++) { const y = new Date(ye); y.setFullYear(ye.getFullYear() - i); const iso = y.toISOString().slice(0, 10); out.push({ value: 'YE ' + iso, label: 'YE ' + Fmt.date(iso), end: y }); }
  } else {
    const start = (today.getMonth() > 3 || (today.getMonth() === 3 && today.getDate() >= 6)) ? today.getFullYear() : today.getFullYear() - 1;
    for (let i = 0; i < 4; i++) { const a = start - i; const v = `${a}/${String(a + 1).slice(2)}`; out.push({ value: v, label: v, end: new Date(a + 1, 3, 5) }); }
  }
  return out;
};
const pmDefaultPeriod = (client) => { const p = pmPeriods(client), n = new Date(); const f = p.find(x => x.end < n); return f ? f.value : (p[0] ? p[0].value : ''); };
const pmPeriodLabel = (client, v) => { const p = pmPeriods(client).find(x => x.value === v); return p ? p.label : (v ? (String(v).startsWith('YE ') ? 'YE ' + Fmt.date(String(v).slice(3)) : v) : 'No period'); };
const DocGroups = { bank: ['Bank statements', 'all accounts'], income: ['Income', 'payslips, P45, P60, sales invoices, CIS statements'], expenses: ['Expenses', 'receipts, purchase invoices, mileage'], other: ['Other', 'HMRC letters, ID, anything else'] };

/* ---------------- Client details ---------------- */
const ClientDetailsCard = {
  render(el, client) {
    const c = client || {};
    const row = (label, v, fmt) => `<dt>${label}</dt><dd>${v ? (fmt === 'date' ? Fmt.date(v) : Esc(v)) : PM_DASH}</dd>`;
    const group = (title, rows) => `<dl class="pm-dl"><dt class="pm-dl-title">${title}</dt>${rows.join('')}</dl>`;
    const isLtd = c.client_type === 'ltd';
    el.innerHTML = `
      <div class="pm-card-head"><h3>Client details</h3><a class="btn btn-secondary btn-sm" href="#/clients/${c.id}/edit">Edit</a></div>
      <div class="pm-grid-3">
        ${group('Personal', [row('Full name', c.full_name), row('Date of birth', c.date_of_birth, 'date'), row('NI number', c.ni_number), row('UTR', c.utr)])}
        ${group('Contact', [row('Email', c.email), row('Portal email', c.portal_email), row('Phone', c.phone), row('Address', c.address)])}
        ${group(isLtd ? 'Company' : 'Business', [
          isLtd ? row('Company', c.company_name) : row('Trading name', c.trading_name),
          ...(isLtd ? [row('Company no.', c.crn), row('CT UTR', c.ct_utr), row('Incorporated', c.date_of_incorporation, 'date'), row('Year end', c.year_end_date, 'date'), row('Confirmation stmt', c.confirmation_statement_date, 'date')] : []),
          row('PAYE ref', c.paye_ref), row('Accounts office ref', c.accounts_office_ref), row('VAT number', c.vat_number), row('Industry', c.industry)])}
      </div>
      <div class="pm-grid-3" style="margin-top:10px;">
        ${group('Practice', [row('Client since', c.client_since, 'date'), row('Source', c.referral_source || c.source)])}
        ${c.notes_general ? `<div style="grid-column:span 2;"><div class="pm-dl-title">General notes</div><div style="white-space:pre-wrap;font-size:13px;">${Esc(c.notes_general)}</div></div>` : ''}
      </div>`;
  },
};

/* ---------------- Engagement letters ---------------- */
const LoeStatus = { draft: ['Draft', 'pill-grey'], sent: ['Sent – not signed', 'pill-amber'], signed: ['Signed', 'pill-green'], expired: ['Expired', 'pill-red'] };
const ClientLoePanel = {
  async render(clientId, el) {
    el.innerHTML = `<div class="pm-card-head"><h3>Engagement letters</h3></div><p class="muted-line">Loading…</p>`;
    const { data, error } = await sb.from('loes').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
    if (error) { el.innerHTML = `<p class="page-error">Could not load engagement letters: ${Esc(error.message)}</p>`; return; }
    this.rows = data || [];
    el.innerHTML = `<div class="pm-card-head"><h3>Engagement letters</h3><span class="muted-line" style="font-size:12px;">New letters are created from an accepted quote.</span></div>` +
      (this.rows.length ? `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:13px;"><thead><tr><th>Period</th><th>Services covered</th><th>Status</th><th>Signed PDF</th></tr></thead><tbody>
        ${this.rows.map(l => { const st = LoeStatus[l.status] || [l.status, 'pill-grey'];
          const file = l.signed_file_url || l.file_url;
          return `<tr><td>${Esc(l.tax_year || PM_DASH)}</td><td>${Esc([...new Set(l.services_covered || [])].join(', ') || PM_DASH)}</td>
            <td><span class="pill ${st[1]}">${st[0]}${l.status === 'signed' && l.signed_date ? ' ' + Fmt.date(l.signed_date) : ''}</span></td>
            <td style="white-space:nowrap;">${file ? `<button type="button" class="btn btn-secondary btn-sm" data-loe-view="${l.id}">View</button> <button type="button" class="btn btn-secondary btn-sm" data-loe-dl="${l.id}">Download</button>` : '<span class="muted-line">No PDF</span>'}</td></tr>`; }).join('')}
        </tbody></table></div>` : `<p class="empty-state">No engagement letter yet.</p>`);
    const open = async (id, download) => {
      const l = this.rows.find(x => x.id === id); if (!l) return;
      try { const url = await pmSignedUrl(l.signed_file_url || l.file_url, download ? `Engagement letter ${l.tax_year || ''}.pdf`.replace(/\s+/g, ' ') : null); window.open(url, '_blank', 'noopener'); }
      catch (e) { alert(`Could not open the PDF: ${e.message}`); }
    };
    el.querySelectorAll('[data-loe-view]').forEach(b => b.addEventListener('click', () => open(b.dataset.loeView, false)));
    el.querySelectorAll('[data-loe-dl]').forEach(b => b.addEventListener('click', () => open(b.dataset.loeDl, true)));
  },
};

/* ---------------- HMRC authorisations ---------------- */
const HmrcTax = { sa: 'Self Assessment', ct: 'Corporation Tax', paye: 'PAYE', vat: 'VAT', cis: 'CIS', mtd: 'MTD Income Tax' };
const HmrcStatus = { needed: ['Needed', 'pill-amber'], link_sent: ['Link sent – waiting', 'pill-amber'], authorised: ['Authorised', 'pill-green'], not_needed: ['Not needed', 'pill-grey'] };
const HmrcMethod = { asa_link: 'Online link (Agent Services)', paper_64_8: 'Paper 64-8' };
const ClientHmrcPanel = {
  async render(clientId, el, onChange) {
    this.clientId = clientId; this.el = el; this.onChange = onChange;
    const { data, error } = await sb.from('qs_hmrc_authorisations').select('*').eq('client_id', clientId).order('created_at');
    if (error) { el.innerHTML = `<p class="page-error">Could not load HMRC authorisations: ${Esc(error.message)}</p>`; return; }
    this.rows = data || [];
    const missing = Object.keys(HmrcTax).filter(t => !this.rows.some(r => r.tax_type === t));
    el.innerHTML = `<div class="pm-card-head"><h3>HMRC authorisations</h3>
        ${missing.length ? `<span style="display:flex;gap:6px;align-items:center;"><select class="input" id="hmrc-add-type" style="min-width:170px;">${missing.map(t => `<option value="${t}">${HmrcTax[t]}</option>`).join('')}</select><button type="button" class="btn btn-secondary btn-sm" id="hmrc-add">+ Add tax</button></span>` : ''}</div>
      ${this.rows.length ? `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:13px;min-width:760px;"><thead><tr><th>Tax</th><th>Method</th><th>Status</th><th>Last action</th><th>Authorisation link / 64-8</th></tr></thead><tbody>
        ${this.rows.map(r => { const st = HmrcStatus[r.status] || [r.status, 'pill-grey'];
          const last = r.status === 'authorised' && r.authorised_date ? `Authorised ${Fmt.date(r.authorised_date)}` : r.link_sent_at ? `Sent ${Fmt.date(r.link_sent_at)}` : PM_DASH;
          return `<tr data-row="${r.id}">
            <td><b>${HmrcTax[r.tax_type] || Esc(r.tax_type)}</b></td>
            <td><select class="input" data-method="${r.id}">${Object.entries(HmrcMethod).map(([k, v]) => `<option value="${k}" ${r.method === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td><select class="input" data-status="${r.id}">${Object.entries(HmrcStatus).map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></td>
            <td>${last}</td>
            <td style="white-space:nowrap;">${r.auth_link ? `<button type="button" class="btn btn-secondary btn-sm" data-copy="${r.id}">Copy link</button>` : ''}
              <button type="button" class="btn btn-secondary btn-sm" data-setlink="${r.id}">${r.auth_link ? 'Change link' : 'Add link'}</button>
              ${r.form_64_8_path ? ` <button type="button" class="btn btn-secondary btn-sm" data-648="${r.id}">64-8 PDF</button>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>` : `<p class="empty-state">No HMRC authorisations recorded. Add each tax you act on.</p>`}
      <p class="muted-line" style="font-size:12px;margin-top:8px;">Sending the 64-8 or the authorisation link by email, and requesting the Self Assessment code, will be added as buttons here once you confirm the exact wording you use.</p>`;
    this.wire();
  },
  async save(id, patch) {
    const { error } = await sb.from('qs_hmrc_authorisations').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) alert(`Could not save: ${error.message}`);
    this.render(this.clientId, this.el, this.onChange); if (this.onChange) this.onChange();
  },
  wire() {
    const el = this.el;
    const add = el.querySelector('#hmrc-add');
    if (add) add.addEventListener('click', async () => {
      const t = el.querySelector('#hmrc-add-type').value;
      const { error } = await sb.from('qs_hmrc_authorisations').insert({ client_id: this.clientId, tax_type: t, method: 'asa_link', status: 'needed' });
      if (error) alert(`Could not add: ${error.message}`);
      this.render(this.clientId, el, this.onChange); if (this.onChange) this.onChange();
    });
    el.querySelectorAll('[data-status]').forEach(s => s.addEventListener('change', () => {
      const patch = { status: s.value };
      if (s.value === 'authorised') patch.authorised_date = new Date().toISOString().slice(0, 10);
      if (s.value === 'link_sent') patch.link_sent_at = new Date().toISOString();
      this.save(s.dataset.status, patch);
    }));
    el.querySelectorAll('[data-method]').forEach(s => s.addEventListener('change', () => this.save(s.dataset.method, { method: s.value })));
    el.querySelectorAll('[data-setlink]').forEach(b => b.addEventListener('click', () => {
      const r = this.rows.find(x => x.id === b.dataset.setlink);
      const v = prompt('Authorisation link (from HMRC Agent Services):', (r && r.auth_link) || '');
      if (v === null) return;
      if (v.trim() && !/^https:\/\//.test(v.trim())) { alert('Please paste a link starting with https://'); return; }
      this.save(b.dataset.setlink, { auth_link: v.trim() || null });
    }));
    el.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      const r = this.rows.find(x => x.id === b.dataset.copy);
      try { await navigator.clipboard.writeText(r.auth_link); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy link'; }, 1500); } catch (_) { prompt('Copy the link:', r.auth_link); }
    }));
    el.querySelectorAll('[data-648]').forEach(b => b.addEventListener('click', async () => {
      const r = this.rows.find(x => x.id === b.dataset['648']);
      try { window.open(await pmSignedUrl(r.form_64_8_path.includes('/') && !r.form_64_8_path.startsWith('qs-') ? 'qs-signed-docs/' + r.form_64_8_path : r.form_64_8_path), '_blank', 'noopener'); }
      catch (e) { alert(`Could not open the 64-8: ${e.message}`); }
    }));
  },
};

/* ---------------- Onboarding progress ---------------- */
const ClientOnboarding = {
  async load(clientId, client) {
    const c = client || {};
    const [loes, aml, hmrc, access] = await Promise.all([
      sb.from('loes').select('status,signed_date').eq('client_id', clientId),
      sb.from('aml_records').select('id_verified,address_verified').eq('client_id', clientId),
      sb.from('qs_hmrc_authorisations').select('status').eq('client_id', clientId),
      sb.from('portal_access').select('id').eq('client_id', clientId).is('revoked_at', null),
    ]);
    const steps = [];
    const missing = [];
    if (!c.email) missing.push('email'); if (!c.phone) missing.push('phone'); if (!c.address) missing.push('address');
    if (c.client_type === 'ltd') { if (!c.crn) missing.push('company number'); } else { if (!c.ni_number) missing.push('NI'); if (!c.utr) missing.push('UTR'); }
    steps.push({ label: 'Client details', state: missing.length ? 'part' : 'done', text: missing.length ? 'Missing: ' + missing.join(', ') : 'Complete' });
    const L = loes.data || [], signed = L.filter(l => l.status === 'signed').sort((a, b) => String(b.signed_date).localeCompare(String(a.signed_date)))[0];
    steps.push({ label: 'Engagement letter', state: signed ? 'done' : L.some(l => l.status === 'sent') ? 'part' : 'todo', text: signed ? `Signed ${signed.signed_date ? Fmt.date(signed.signed_date) : ''}` : L.some(l => l.status === 'sent') ? 'Sent – not signed' : 'Not sent' });
    const A = aml.data || [], ok = A.filter(a => a.id_verified && a.address_verified).length;
    steps.push({ label: 'ID checks', state: !A.length ? 'todo' : ok === A.length ? 'done' : 'part', text: !A.length ? 'Not started' : ok === A.length ? 'Verified' : `${ok} of ${A.length} people verified` });
    const H = (hmrc.data || []).filter(h => h.status !== 'not_needed'), auth = H.filter(h => h.status === 'authorised').length;
    steps.push({ label: 'HMRC authorisation', state: !H.length ? 'todo' : auth === H.length ? 'done' : 'part', text: !H.length ? 'Not recorded' : auth === H.length ? 'All authorised' : `${auth} of ${H.length} taxes` });
    const active = (access.data || []).length > 0;
    steps.push({ label: 'Portal access', state: active ? 'done' : 'todo', text: active ? 'Active' : 'Not invited' });
    this.steps = steps; this.portalActive = active;
    return steps;
  },
  html(steps) {
    const done = steps.filter(s => s.state === 'done').length;
    const color = { done: 'var(--teal)', part: 'var(--amber)', todo: 'var(--grey-bg)' }, tcol = { done: 'var(--green)', part: '#8A5A00', todo: 'var(--text-muted)' };
    return `<div class="pm-card-head"><h3>Onboarding progress – ${done} of ${steps.length} done</h3></div>
      <ol class="pm-steps">${steps.map(s => `<li><div class="pm-step-bar" style="background:${color[s.state]}"></div><b>${s.label}</b><span style="color:${tcol[s.state]}">${Esc(s.text)}</span></li>`).join('')}</ol>`;
  },
};

/* ---------------- Timeline (history + correspondence + portal + approvals) ---------------- */
const TimelineKinds = { email: ['Email / letter', 'pill-blue'], work: ['Work', 'pill-green'], approval: ['Approval', 'pill-amber'], portal: ['Portal', 'pill-grey'] };
const ClientTimelinePanel = {
  async render(clientId, el) {
    this.clientId = clientId; this.el = el;
    this.filter = this.filter || 'all';
    try { this.newest = localStorage.getItem('pm-timeline-newest') === '1'; } catch (_) { this.newest = false; }
    el.innerHTML = `<p class="muted-line">Loading timeline…</p>`;
    const [corr, tasks, mtd, svc, aps, audit, loes] = await Promise.all([
      sb.from('correspondence').select('id,direction,subject,sent_at,created_at').eq('client_id', clientId),
      sb.from('tasks').select('title,completed_at').eq('client_id', clientId).eq('status', 'completed').not('completed_at', 'is', null),
      sb.from('mtd_submissions').select('quarter_label,quarter,tax_year,status,submitted_at').eq('client_id', clientId).in('status', ['submitted', 'final_declaration']),
      sb.from('client_services').select('updated_at,created_at,services_catalogue(name)').eq('client_id', clientId).eq('status', 'completed'),
      sb.from('portal_approvals').select('created_at,decision,user_email,comment').eq('client_id', clientId),
      sb.from('portal_audit').select('created_at,action,detail').eq('client_id', clientId),
      sb.from('loes').select('tax_year,status,issued_date,signed_date').eq('client_id', clientId),
    ]);
    const E = [];
    const dirLabel = { sent: 'Sent', received: 'Received', auto: 'Automatic email', internal: 'Internal' };
    (corr.data || []).forEach(c => E.push({ k: 'email', d: c.sent_at || c.created_at, t: `${dirLabel[c.direction] || 'Email'} · ${c.subject || '(no subject)'}` }));
    (loes.data || []).forEach(l => { if (l.issued_date) E.push({ k: 'email', d: l.issued_date, t: `Engagement letter sent · ${l.tax_year || ''}` }); if (l.signed_date) E.push({ k: 'email', d: l.signed_date, t: `Engagement letter signed · ${l.tax_year || ''}` }); });
    (tasks.data || []).forEach(t => E.push({ k: 'work', d: t.completed_at, t: `Task completed · ${t.title}` }));
    (mtd.data || []).forEach(m => E.push({ k: 'work', d: m.submitted_at, t: `${m.status === 'final_declaration' ? 'Final declaration' : 'MTD update submitted'} · ${m.quarter_label || 'Q' + m.quarter} ${m.tax_year || ''}` }));
    (svc.data || []).forEach(s => E.push({ k: 'work', d: s.updated_at || s.created_at, t: `Service completed · ${s.services_catalogue ? s.services_catalogue.name : 'Service'}` }));
    (aps.data || []).forEach(a => E.push({ k: 'approval', d: a.created_at, t: `${a.decision === 'approved' ? 'Client approved' : 'Client asked for changes'} (${a.user_email})${a.comment ? ' – ' + a.comment : ''}` }));
    const uploadsByDay = {};
    (audit.data || []).forEach(a => {
      if (a.action === 'upload') { const day = String(a.created_at).slice(0, 10); (uploadsByDay[day] = uploadsByDay[day] || { n: 0, d: a.created_at }).n++; uploadsByDay[day].d = a.created_at; }
      else if (a.action === 'invited') E.push({ k: 'portal', d: a.created_at, t: `Portal invitation sent${a.detail && a.detail.email ? ' to ' + a.detail.email : ''}` });
      else if (a.action === 'access_revoked') E.push({ k: 'portal', d: a.created_at, t: 'Portal access removed' });
    });
    Object.values(uploadsByDay).forEach(u => E.push({ k: 'portal', d: u.d, t: `Client uploaded ${u.n} file${u.n === 1 ? '' : 's'} in the portal` }));
    this.events = E.filter(e => e.d);
    this.draw();
  },
  draw() {
    const el = this.el;
    const list = this.events.filter(e => this.filter === 'all' || e.k === this.filter)
      .sort((a, b) => this.newest ? new Date(b.d) - new Date(a.d) : new Date(a.d) - new Date(b.d));
    const time = (d) => String(d).length > 10 ? ' ' + new Date(d).toTimeString().slice(0, 5) : '';
    const filters = [['all', 'All'], ['email', 'Emails & letters'], ['work', 'Work completed'], ['approval', 'Approvals'], ['portal', 'Portal']];
    el.innerHTML = `
      <div class="pm-card-head"><h3>Timeline</h3><button type="button" class="btn btn-secondary btn-sm" id="tl-log">+ Log email or letter</button></div>
      <div class="pm-chips">${filters.map(([k, v]) => `<button type="button" class="pm-chip${this.filter === k ? ' is-on' : ''}" data-tl-filter="${k}">${v}</button>`).join('')}
        <button type="button" class="pm-chip" id="tl-sort" style="margin-left:auto;">${this.newest ? 'Newest first ↓' : 'Oldest first ↑'}</button></div>
      ${list.length ? `<ul class="pm-timeline">${list.map(e => `<li><span class="pill ${TimelineKinds[e.k][1]}">${TimelineKinds[e.k][0]}</span><span class="pm-tl-text">${Esc(e.t)}</span><span class="muted-line pm-tl-date">${Fmt.date(e.d)}${time(e.d)}</span></li>`).join('')}</ul>` : `<p class="empty-state">Nothing here yet.</p>`}
      <div id="tl-corr-host" style="display:none;"></div>`;
    el.querySelectorAll('[data-tl-filter]').forEach(b => b.addEventListener('click', () => { this.filter = b.dataset.tlFilter; this.draw(); }));
    el.querySelector('#tl-sort').addEventListener('click', () => { this.newest = !this.newest; try { localStorage.setItem('pm-timeline-newest', this.newest ? '1' : '0'); } catch (_) {} this.draw(); });
    el.querySelector('#tl-log').addEventListener('click', async () => {
      const host = el.querySelector('#tl-corr-host');
      await ClientCorrespondencePanel.render(this.clientId, host, { limit: 1 });
      ClientCorrespondencePanel.openForm();
      const timer = setInterval(() => { if (!document.getElementById('correspondence-form')) { clearInterval(timer); this.render(this.clientId, this.el); } }, 700);
    });
  },
};

// ---- Registrations (Work tab): CIS, UTR, payroll, VAT, company, CIS contractor ----
// Only types that exist for this client are shown. PDFs go to portal-docs/<client>/registrations/ (practice only:
// the client can read a portal file only when a documents row shares it).
const RegTypes = { cis_subcontractor: 'CIS subcontractor', utr: 'UTR (Self Assessment)', paye: 'Payroll (PAYE employer)', vat: 'VAT', company: 'Limited company', cis_contractor: 'CIS contractor' };
const RegStatus = { preparing: ['Preparing', 'pill-amber'], submitted: ['Submitted', 'pill-blue'], registered: ['Registered', 'pill-green'], rejected: ['Rejected', 'pill-red'] };

const ClientRegistrationsPanel = {
  async render(clientId, el) {
    this.clientId = clientId; this.el = el;
    const { data, error } = await sb.from('client_registrations').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
    if (error) { el.innerHTML = `<p class="page-error">Could not load registrations: ${Esc(error.message)}</p>`; return; }
    this.rows = data || [];
    this.draw();
  },

  draw() {
    const rows = this.rows;
    this.el.innerHTML = `
      ${rows.length ? `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;font-size:13px;"><thead><tr><th>Registration</th><th>Status</th><th>Date submitted</th><th>Reference</th><th>Form (PDF)</th><th></th></tr></thead><tbody>
        ${rows.map(r => { return `<tr>
          <td><b>${Esc(RegTypes[r.reg_type] || r.reg_type)}</b>${r.notes ? `<div class="muted-line" style="font-size:12px;white-space:pre-wrap;">${Esc(r.notes)}</div>` : ''}</td>
          <td><select class="input" data-reg-status="${r.id}" style="max-width:140px;">${Object.entries(RegStatus).map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></td>
          <td>${r.submitted_date ? Fmt.date(r.submitted_date) : '—'}</td>
          <td>${Esc(r.reference || '—')}</td>
          <td>${r.file_url ? `<button type="button" class="btn btn-secondary btn-sm" data-reg-view="${r.id}">View</button>` : `<label class="btn btn-secondary btn-sm" style="cursor:pointer;">Add PDF<input type="file" accept=".pdf,.jpg,.jpeg,.png" data-reg-file="${r.id}" hidden></label>`}</td>
          <td style="text-align:right;white-space:nowrap;"><button type="button" class="btn btn-secondary btn-sm" data-reg-edit="${r.id}">Edit</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="empty-state">No registrations for this client yet.</p>'}
      <details style="margin-top:8px;" id="reg-add"><summary style="cursor:pointer;font-size:13px;font-weight:600;">+ Add a registration</summary>
        <form id="reg-form" style="display:grid;gap:8px;margin-top:8px;max-width:640px;">
          <input type="hidden" name="id">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <label class="form-field" style="flex:1;min-width:200px;"><span>Type *</span><select name="reg_type" class="input">${Object.entries(RegTypes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
            <label class="form-field" style="flex:1;min-width:140px;"><span>Status</span><select name="status" class="input">${Object.entries(RegStatus).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label>
            <label class="form-field" style="min-width:150px;"><span>Date submitted</span><input type="date" name="submitted_date" class="input"></label>
          </div>
          <label class="form-field"><span>Reference (UTR, VAT number, PAYE ref, CRN…)</span><input name="reference" class="input" maxlength="80"></label>
          <label class="form-field"><span>Notes</span><input name="notes" class="input" maxlength="400"></label>
          <label class="form-field"><span>Copy of the form (PDF, optional)</span><input type="file" name="file" class="input" accept=".pdf,.jpg,.jpeg,.png"></label>
          <div><button type="submit" class="btn btn-primary btn-sm">Save</button></div>
        </form>
      </details>`;
    this.wire();
  },

  async uploadFile(regId, file) {
    if (file.size > 20 * 1048576) throw new Error('The file is bigger than 20 MB.');
    const safe = file.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-90);
    const path = `${this.clientId}/registrations/${new Date().toISOString().replace(/[:.]/g, '-')}-${safe}`;
    const up = await sb.storage.from('portal-docs').upload(path, file, { contentType: file.type || 'application/pdf', upsert: false });
    if (up.error) throw up.error;
    const { error } = await sb.from('client_registrations').update({ file_url: 'portal-docs/' + path, updated_at: new Date().toISOString() }).eq('id', regId);
    if (error) throw error;
  },

  wire() {
    const el = this.el, reload = () => this.render(this.clientId, this.el);
    el.querySelectorAll('[data-reg-status]').forEach(s => s.addEventListener('change', async () => {
      const patch = { status: s.value, updated_at: new Date().toISOString() };
      const r = this.rows.find(x => x.id === s.dataset.regStatus);
      if (s.value === 'submitted' && r && !r.submitted_date) patch.submitted_date = new Date().toISOString().slice(0, 10);
      const { error } = await sb.from('client_registrations').update(patch).eq('id', s.dataset.regStatus);
      if (error) alert(`Could not save: ${error.message}`); reload();
    }));
    el.querySelectorAll('[data-reg-view]').forEach(b => b.addEventListener('click', async () => {
      const r = this.rows.find(x => x.id === b.dataset.regView); if (!r) return;
      const { data, error } = await sb.storage.from('portal-docs').createSignedUrl(r.file_url.replace(/^portal-docs\//, ''), 60);
      if (error) { alert(`Could not open: ${error.message}`); return; }
      window.open(data.signedUrl, '_blank', 'noopener');
    }));
    el.querySelectorAll('[data-reg-file]').forEach(inp => inp.addEventListener('change', async () => {
      if (!inp.files[0]) return;
      try { await this.uploadFile(inp.dataset.regFile, inp.files[0]); } catch (e) { alert(`Upload failed: ${e.message}`); }
      reload();
    }));
    el.querySelectorAll('[data-reg-edit]').forEach(b => b.addEventListener('click', () => {
      const r = this.rows.find(x => x.id === b.dataset.regEdit), f = el.querySelector('#reg-form'); if (!r || !f) return;
      ['id', 'reg_type', 'status', 'submitted_date', 'reference', 'notes'].forEach(k => { f.elements[k].value = r[k] || ''; });
      el.querySelector('#reg-add').open = true; f.elements.reference.focus();
    }));
    const f = el.querySelector('#reg-form');
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(f), id = fd.get('id');
      const row = { reg_type: fd.get('reg_type'), status: fd.get('status'), submitted_date: fd.get('submitted_date') || null,
        reference: String(fd.get('reference') || '').trim() || null, notes: String(fd.get('notes') || '').trim() || null, updated_at: new Date().toISOString() };
      if (row.status === 'submitted' && !row.submitted_date) row.submitted_date = new Date().toISOString().slice(0, 10);
      const btn = f.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = 'Saving…';
      const res = id ? await sb.from('client_registrations').update(row).eq('id', id).select('id').single()
        : await sb.from('client_registrations').insert({ ...row, client_id: this.clientId }).select('id').single();
      if (res.error) { alert(`Could not save: ${res.error.message}`); btn.disabled = false; btn.textContent = 'Save'; return; }
      const file = f.elements.file.files[0];
      if (file) { try { await this.uploadFile(res.data.id, file); } catch (err) { alert(`Saved, but the PDF upload failed: ${err.message}`); } }
      reload();
    });
  },
};
