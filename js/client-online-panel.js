// Accounted4Tax Practice Manager — "Online answers" on the client's Work tab (20 Nov 2026).
// Shows what the client answered when they started a service on the website (form_submissions):
// employer / CIS contractor registration (emp_reg), VAT registration (vat_reg), company and monthly services (acc_online),
// Self Assessment (sa_online). Read only; hidden for clients who never used an online form.

const OnlineFormNames = { emp_reg: 'Employer (PAYE) / CIS contractor registration', vat_reg: 'VAT registration', acc_online: 'Company / monthly services', sa_online: 'Self Assessment' };
const OnlineLabels = {
  biz_type: 'Business type', title: 'Title', first_names: 'First name(s)', surname: 'Surname', phone: 'Phone', email: 'Email', trading_name: 'Business name', utr: 'UTR',
  date_of_birth: 'Date of birth', ni_number: 'NI number', director: 'Confirmed director', company: 'Company',
  paye: 'Register for PAYE', first_payday: 'First payday', employees: 'People to pay', pension: 'Workplace pension', want_payroll: 'Monthly payroll',
  cis: 'Register as CIS contractor', cis_start: 'First payment to subcontractors', subcontractors: 'Subcontractors a month', want_cis_returns: 'Monthly CIS contractor returns',
  trading_address: 'Trading address',
  activity: 'What the business does', turnover_12m: 'Sales – last 12 months', expected_12m: 'Sales – next 12 months', reason: 'Why registering', reason_date: 'Date given',
  effective_date: 'VAT registration from', scheme: 'VAT scheme', want_package: 'VAT package', transactions: 'Bank transactions a month',
  service: 'Started on page', periods: 'Accounts years', extras: 'Services ticked', notes: 'Client note',
};
const OnlineSkip = new Set(['ip', 'quote_id', 'started_online', 'consent', 'website', 'elapsed', 'address_1', 'address_2', 'town', 'county', 'postcode', 'trading_diff', 'preview', 'action']);

const ClientOnlinePanel = {
  async render(clientId, wrapEl, bodyEl) {
    const { data, error } = await sb.from('form_submissions').select('id, form_type, form_data, created_at, status, quote:qs_quotes(quote_number, status)')
      .eq('client_id', clientId).in('form_type', Object.keys(OnlineFormNames)).order('created_at', { ascending: false });
    if (error) { wrapEl.style.display = ''; bodyEl.innerHTML = `<p class="page-error">Could not load the online answers: ${Esc(error.message)}</p>`; return; }
    if (!(data || []).length) { wrapEl.style.display = 'none'; return; }
    wrapEl.style.display = '';
    bodyEl.innerHTML = data.map((f, i) => this.row(f, i === 0)).join('');
  },

  value(k, v) {
    if (v === true) return 'Yes';
    if (v === false) return k === 'director' ? '' : 'No';
    if (v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) return '';
    if (k === 'biz_type') return { sole_trader: 'Sole trader', ltd: 'Limited company' }[v] || v;
    if (k === 'reason') return { over: 'Went over £90,000', expect: 'Expects to go over £90,000 in the next 30 days', voluntary: 'Voluntary' }[v] || v;
    if (k === 'scheme') return { standard: 'Standard', flat_rate: 'Flat Rate', not_sure: 'Not sure – please advise' }[v] || v;
    if (k === 'turnover_12m' || k === 'expected_12m') return Fmt.money(v);
    if (/date|payday|_start$/.test(k) && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) return Fmt.date(v);
    if (k === 'company') return v.name ? `${v.name} (${v.number})` : '';
    if (k === 'periods') return (v || []).map(p => `${Fmt.date(p.end)}${p.current ? ' (current)' : p.overdue ? ' (overdue)' : ''} – ${p.dormant ? 'dormant' : p.books_done ? 'books done' : 'books not done'}`).join('; ');
    if (k === 'extras') return Object.entries(v || {}).filter(([, x]) => x && x !== '0').map(([n, x]) => ({ vat_returns: 'VAT returns', payroll: `payroll (${x} people)`, cis_returns: `CIS contractor returns (${x} subcontractors)`,
      bookkeeping: 'bookkeeping', confirmation: 'confirmation statement', cs_changes: 'with changes', director_id: `director ID × ${x}` }[n])).filter(Boolean).join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  },

  row(f, open) {
    const a = f.form_data || {}, paid = f.quote && f.quote.status === 'paid';
    const addr = [a.address_1, a.address_2, a.town, a.county, a.postcode].filter(Boolean).join(', ');
    const rows = [];
    for (const [k, v] of Object.entries(a)) {
      if (OnlineSkip.has(k)) continue;
      const val = this.value(k, v); if (!val) continue;
      rows.push([OnlineLabels[k] || k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()), val]);
      if (k === 'ni_number' && addr) rows.push(['Address', addr]);
    }
    if (addr && !('ni_number' in a)) rows.push(['Address', addr]);
    const st = paid ? '<span class="pill pill-green">Paid</span>' : f.quote ? `<span class="pill pill-grey">Quote ${Esc(f.quote.status)}</span>` : '';
    return `<details ${open ? 'open' : ''} style="padding:8px 0;border-top:1px solid var(--border, #E3E6EB);"><summary style="cursor:pointer;font-size:13px;"><b>${Esc(OnlineFormNames[f.form_type])}</b> ${st}
      <span class="muted-line" style="font-size:12px;margin-left:6px;">${f.quote ? `Quote ${Esc(f.quote.quote_number)} · ` : ''}started ${Fmt.date(f.created_at)}</span></summary>
      <table class="data-table" style="width:100%;font-size:13px;margin-top:6px;"><tbody>${rows.map(r => `<tr><td style="width:35%;color:#4A5568">${Esc(r[0])}</td><td>${Esc(r[1])}</td></tr>`).join('')}</tbody></table></details>`;
  },
};
