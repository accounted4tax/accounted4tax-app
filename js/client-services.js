// Accounted4Tax Practice Manager — Assigned services panel (shown on client detail page)

const CLIENT_SERVICE_STATUSES = ['active', 'paused', 'completed', 'cancelled'];
const CLIENT_WORK_STATUSES = { not_started: 'Not started', in_progress: 'In progress', awaiting_info: 'Awaiting info', sent_for_approval: 'Sent for approval', approved: 'Approved', submitted: 'Submitted' };

function clientServiceStatusPill(status) {
  const cls = { active: 'pill-green', paused: 'pill-amber', completed: 'pill-grey', cancelled: 'pill-red' }[status] || 'pill-grey';
  return `<span class="pill ${cls}">${status || '—'}</span>`;
}


// ---- 23 Nov 2026: price list text and the years/periods offered when a service is assigned ----
function pmPriceAmount(c) {
  if (c.default_price != null && Number(c.default_price) > 0) return Number(c.default_price);
  if (Number(c.base_fee) > 0) return Number(c.base_fee);
  if (Number(c.per_unit_rate) > 0) return Number(c.per_unit_rate);
  return null;
}
function pmPriceText(c) {
  const a = pmPriceAmount(c);
  if (a == null) return 'price on quote';
  const p = c.price_period || (c.billing_type === 'monthly' ? 'monthly' : c.billing_type === 'annual' ? 'annual' : 'one_off');
  const money = '£' + (a % 1 ? a.toFixed(2) : String(a));
  const each = /per_employee|per_subcontractor/.test(c.pricing_type || '') && !(Number(c.base_fee) > 0) && c.unit_label ? ` per ${String(c.unit_label).split(' ')[0].replace(/s$/, '')}` : '';
  const from = !each && c.pricing_type && c.pricing_type !== 'fixed' ? 'from ' : '';
  return `${from}${money}${each}${p === 'monthly' ? ' pm' : p === 'annual' ? ' a year' : ' one-off'}`;
}
const pmIsoAddYears = (iso, n) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ty = y + n, tLast = new Date(Date.UTC(ty, m, 0)).getUTCDate();
  return `${ty}-${String(m).padStart(2, '0')}-${String(d === last ? tLast : Math.min(d, tLast)).padStart(2, '0')}`;
};
const pmIsoAddDays = (iso, n) => { const t = new Date(iso.slice(0, 10) + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const pmTaxYearOpt = (y) => ({ value: `${y}/${String(y + 1).slice(2)}`, taxYear: `${y}/${String(y + 1).slice(2)}`, text: `${y}/${String(y + 1).slice(2)}`, start: `${y}-04-06`, end: `${y + 1}-04-05` });
// Which kind of period a service has: tax year (Self Assessment, MTD), company year end (accounts), statement date
// (confirmation statement), ongoing (monthly services – runs until the client cancels) or none (registrations etc.)
function pmServiceKind(c) {
  const n = String(c.name || '');
  if (/registration|setup|set-up|director id/i.test(n)) return 'none';
  if (c.is_mtd || /\bmtd\b/i.test(n)) return 'mtd';
  if (/self assessment|p87|employment expenses/i.test(n)) return 'sa';
  if (/company accounts|dormant/i.test(n)) return 'co';
  if (/confirmation statement/i.test(n)) return 'cs';
  if ((c.price_period || c.billing_type) === 'monthly' || /payroll|vat return|cis return|bookkeeping|pension run|software/i.test(n)) return 'ongoing';
  return 'none';
}
function pmServicePeriods(c, client, existing) {
  const today = new Date().toISOString().slice(0, 10);
  const Y = today.slice(5) >= '04-06' ? +today.slice(0, 4) : +today.slice(0, 4) - 1; // current tax year starts 6 Apr Y
  const kind = pmServiceKind(c);
  const keep = (opts, sel) => {
    // an existing service keeps its own year even when it is outside the usual range
    if (existing && (existing.tax_year || existing.period_end)) {
      const v = existing.tax_year || 'YE ' + String(existing.period_end).slice(0, 10);
      if (!opts.some(o => o.value === v)) opts.unshift({ value: v, taxYear: existing.tax_year || null, text: existing.tax_year || 'Ending ' + Fmt.date(existing.period_end), start: existing.period_start, end: existing.period_end });
      return { options: opts, selected: v };
    }
    return { options: opts, selected: sel };
  };
  if (kind === 'sa') {
    const o = []; for (let y = Y - 3; y <= Y; y++) o.push(pmTaxYearOpt(y));
    return { ...keep(o, pmTaxYearOpt(Y - 1).value), label: 'Tax year', hint: 'Period start and end follow the tax year (6 April – 5 April).' };
  }
  if (kind === 'mtd') {
    const o = []; for (let y = Math.max(2026, Y); y <= Math.max(2026, Y) + 2; y++) o.push(pmTaxYearOpt(y));
    return { ...keep(o, o[0].value), label: 'Tax year', hint: 'MTD quarters (Q1–Q4 and the final declaration) are added for this tax year.' };
  }
  if (kind === 'co' || kind === 'cs') {
    const anchor = kind === 'co' ? client.year_end_date || (client.date_of_incorporation ? pmIsoAddDays(pmIsoAddYears(client.date_of_incorporation, 1), -1) : null)
      : client.confirmation_statement_date || (client.date_of_incorporation ? pmIsoAddYears(client.date_of_incorporation, 1) : null);
    if (!anchor) return { ...keep([], null), label: kind === 'co' ? 'Year ending' : 'Statement date', hint: `No ${kind === 'co' ? 'year end' : 'confirmation statement date'} saved for this client – add it on the Details tab, or type the period below.` };
    let last = anchor; while (last > today) last = pmIsoAddYears(last, -1); while (pmIsoAddYears(last, 1) <= today) last = pmIsoAddYears(last, 1);
    const o = [];
    for (let i = -3; i <= 1; i++) {
      const end = pmIsoAddYears(last, i), start = pmIsoAddDays(pmIsoAddYears(end, -1), 1);
      o.push({ value: 'YE ' + end, taxYear: null, start, end, text: kind === 'co' ? `Year ending ${Fmt.date(end)}${i === 1 ? ' (current year)' : ''}` : `Statement date ${Fmt.date(end)}${i === 1 ? ' (next)' : ''}` });
    }
    return { ...keep(o, kind === 'co' ? 'YE ' + last : 'YE ' + pmIsoAddYears(last, 1)), label: kind === 'co' ? 'Year ending' : 'Statement date',
      hint: kind === 'co' ? 'From the company\'s year end. Period start and end are filled in for you.' : 'From the confirmation statement date. The period is the 12 months up to it.' };
  }
  if (kind === 'ongoing') return { ...keep([], null), options: existing && (existing.tax_year || existing.period_end) ? keep([], null).options : [], start: today.slice(0, 8) + '01',
    hint: 'Runs every month until the client cancels – a card is added for each year. Period start is the month it starts; leave the end empty.' };
  return { options: [], hint: 'No period needed for this service.' };
}

const ClientServicesPanel = {
  async render(clientId, containerEl, opts) {
    containerEl.innerHTML = `<p class="muted-line">Loading services…</p>`;
    this.opts = opts || {};
    this.showAll = this.showAll || false;

    const [assignedRes, catalogueRes, mtdRes, clientRes] = await Promise.all([
      sb.from('client_services').select('*, services_catalogue(name, billing_type)').eq('client_id', clientId).order('created_at', { ascending: false }),
      sb.from('services_catalogue').select('id, name, default_price, price_label, billing_type, price_period, pricing_type, base_fee, per_unit_rate, included_units, unit_label, is_mtd, is_active, client_type').order('sort_order', { ascending: true }),
      sb.from('mtd_submissions').select('client_service_id, deadline, status, quarter_label').eq('client_id', clientId).not('deadline', 'is', null),
      sb.from('clients').select('client_type, year_end_date, confirmation_statement_date, date_of_incorporation').eq('id', clientId).maybeSingle()
    ]);

    if (assignedRes.error) {
      containerEl.innerHTML = `<p class="page-error">Could not load services: ${Esc(assignedRes.error.message)}</p>`;
      return;
    }

    this.clientId = clientId;
    this.assigned = assignedRes.data || [];
    this.catalogue = catalogueRes.data || [];
    this.mtd = mtdRes.data || [];
    this.client = (clientRes && clientRes.data) || {};
    this.containerEl = containerEl;
    this.draw();
  },

  // Closest deadline for a service: an open MTD/return row linked to it, otherwise worked out from the period.
  nextDeadline(cs) {
    const today = new Date().toISOString().slice(0, 10);
    const open = this.mtd.filter(m => m.client_service_id === cs.id && !/submitted|filed|done/i.test(m.status || '')).map(m => m.deadline).sort();
    if (open.length) return { date: open.find(d => d >= today) || open[open.length - 1], est: false };
    const d = pmServiceDeadline(cs, this.client);
    return d ? { date: d.date, est: true, why: d.why } : null;
  },

  draw() {
    const today = new Date().toISOString().slice(0, 10);
    const rows = this.assigned.map(cs => ({ cs, dl: this.nextDeadline(cs) }));
    const key = (r) => r.cs.work_status === 'submitted' || !r.dl ? '9999' : r.dl.date;
    const active = rows.filter(r => r.cs.status === 'active' || r.cs.status === 'paused')
      .sort((a, b) => key(a) < key(b) ? -1 : 1);
    const finished = rows.filter(r => !(r.cs.status === 'active' || r.cs.status === 'paused'));
    const ws = (cs) => `<select class="input input-select" data-work="${cs.id}" style="min-width:150px;">${Object.entries(CLIENT_WORK_STATUSES).map(([k, v]) => `<option value="${k}" ${(cs.work_status || 'not_started') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
    const dlCell = (dl, cs) => {
      if (cs && cs.work_status === 'submitted') return '<span class="pill pill-green">Submitted</span>';
      if (!dl) return '<span class="muted-line">No fixed deadline</span>';
      const days = Math.round((new Date(dl.date) - new Date(today)) / 86400000);
      const cls = days < 0 ? 'pill-red' : days <= 30 ? 'pill-amber' : 'pill-grey';
      return `${Fmt.date(dl.date)} <span class="pill ${cls}">${days < 0 ? `${-days}d overdue` : `${days}d`}</span>${dl.est ? `<div class="muted-line" style="font-size:11px;">${Esc(dl.why || 'worked out')}</div>` : ''}`;
    };
    const table = (list) => `<div style="overflow-x:auto;"><table class="data-table data-table-compact" style="width:100%;">
      <thead><tr><th>Service</th><th>Period</th><th>Next deadline</th><th>Work status</th><th>Service</th><th>Price</th><th></th></tr></thead>
      <tbody>${list.map(({ cs, dl }) => `
        <tr>
          <td><b>${Esc(cs.services_catalogue ? cs.services_catalogue.name : '—')}</b></td>
          <td class="muted-line">${Esc(pmRowKey(cs) ? pmKeyLabel(pmRowKey(cs)) : '—')}</td>
          <td>${dlCell(dl, cs)}</td>
          <td>${ws(cs)}</td>
          <td>${clientServiceStatusPill(cs.status)}</td>
          <td>${Esc(cs.price_label || Fmt.money(cs.custom_price))}</td>
          <td class="align-right" style="white-space:nowrap;">
            <button class="btn btn-secondary btn-sm" data-edit="${cs.id}">Edit</button>
            <button class="btn btn-danger-outline btn-sm" data-remove="${cs.id}">Remove</button>
          </td>
        </tr>`).join('')}</tbody></table></div>`;

    this.containerEl.innerHTML = `
      <div class="panel-header-row">
        <button type="button" id="assign-service-btn" class="btn btn-secondary btn-sm">+ Add</button>
      </div>
      ${active.length ? table(active) : `<p class="empty-state">No active services.</p>`}
      ${finished.length ? `<details style="margin-top:10px;" ${this.showAll ? 'open' : ''} id="services-finished"><summary style="cursor:pointer;font-size:13px;font-weight:600;">Completed or cancelled (${finished.length})</summary>${table(finished)}</details>` : ''}
    `;
    document.getElementById('assign-service-btn').addEventListener('click', () => this.openForm(null));
    const fin = document.getElementById('services-finished');
    if (fin) fin.addEventListener('toggle', () => { this.showAll = fin.open; });
    this.containerEl.querySelectorAll('[data-work]').forEach(sel => {
      sel.addEventListener('change', async () => {
        sel.disabled = true;
        const { error } = await sb.from('client_services').update({ work_status: sel.value }).eq('id', sel.dataset.work);
        sel.disabled = false;
        if (error) { alert(`Could not save: ${error.message}`); return; }
        const cs = this.assigned.find(a => a.id === sel.dataset.work); if (cs) cs.work_status = sel.value;
      });
    });
    this.containerEl.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => this.openForm(this.assigned.find(a => a.id === btn.dataset.edit)));
    });
    this.containerEl.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => this.handleRemove(btn.dataset.remove));
    });
  },

  openForm(existing) {
    const isNew = !existing;
    if (isNew && this.catalogue.length === 0) {
      alert('Your services catalogue is empty. Add services under the Services section first.');
      return;
    }
    const cs = existing || { service_id: '', status: 'active', custom_price: '', tax_year: '', period_start: '', period_end: '' };
    // 23 Nov 2026: the list shows each service's price; only active services that fit this client (sole trader / company)
    const ctype = this.client.client_type === 'ltd' ? 'ltd' : 'sole_trader';
    const list = this.catalogue.filter(c => c.id === cs.service_id || (isNew && c.is_active !== false && (!c.client_type || c.client_type === 'both' || c.client_type === ctype)));
    const groups = [['monthly', 'Monthly services'], ['annual', 'Yearly services'], ['one_off', 'One-off services']];
    const per = (c) => c.price_period || (c.billing_type === 'monthly' ? 'monthly' : c.billing_type === 'annual' ? 'annual' : 'one_off');
    const opt = (c) => `<option value="${c.id}" ${cs.service_id === c.id ? 'selected' : ''}>${Esc(c.name)} – ${Esc(pmPriceText(c))}</option>`;
    const options = groups.map(([k, label]) => { const g = list.filter(c => per(c) === k); return g.length ? `<optgroup label="${label}">${g.map(opt).join('')}</optgroup>` : ''; }).join('')
      + list.filter(c => !groups.some(([k]) => k === per(c))).map(opt).join('');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>${isNew ? 'Assign service' : 'Edit assigned service'}</h3>
        <form id="assign-service-form">
          <label class="form-field"><span>Service *</span>
            <select class="input input-select" name="service_id" required ${!isNew ? 'disabled' : ''}>${isNew ? '<option value="">Choose a service…</option>' : ''}${options}</select>
          </label>
          <div class="form-grid">
            <label class="form-field"><span>Status</span>
              <select class="input input-select" name="status">
                ${CLIENT_SERVICE_STATUSES.map(s => `<option value="${s}" ${cs.status === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </label>
            <label class="form-field"><span>Price (£)</span><input class="input" type="number" step="0.01" min="0" name="custom_price" value="${cs.custom_price ?? ''}" />
              <small class="muted-line" id="as-price-hint"></small></label>
            <label class="form-field" id="as-year-wrap"><span id="as-year-label">Tax year</span><select class="input input-select" name="year_pick" id="as-year"></select></label>
            <label class="form-field"><span>Period start</span><input class="input" type="date" name="period_start" value="${cs.period_start || ''}" /></label>
            <label class="form-field"><span>Period end</span><input class="input" type="date" name="period_end" value="${cs.period_end || ''}" /></label>
          </div>
          <p class="muted-line" id="as-period-hint" style="margin:4px 0 0;font-size:12px;"></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${isNew ? 'Assign service' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const F = overlay.querySelector('#assign-service-form');
    const svcSel = F.elements.service_id, yearSel = F.elements.year_pick, priceIn = F.elements.custom_price;
    const ps = F.elements.period_start, pe = F.elements.period_end;
    let periods = [];
    const setPeriod = () => {
      const p = periods.find(x => x.value === yearSel.value);
      if (p) { ps.value = p.start || ''; pe.value = p.end || ''; }
    };
    // service chosen → price from the price list (can be changed) and the years/periods that fit it
    const onService = (first) => {
      const c = this.catalogue.find(x => x.id === svcSel.value);
      overlay.querySelector('#as-year-wrap').hidden = !c;
      if (!c) { overlay.querySelector('#as-price-hint').textContent = ''; overlay.querySelector('#as-period-hint').textContent = ''; return; }
      if (!first || isNew) { const a = pmPriceAmount(c); if (isNew || !first) priceIn.value = a != null ? a : ''; }
      overlay.querySelector('#as-price-hint').textContent = `Price list: ${pmPriceText(c)}${c.price_label && c.price_label !== pmPriceText(c) ? ` (${c.price_label})` : ''} – change it if needed`;
      const P = pmServicePeriods(c, this.client, first ? cs : null);
      periods = P.options;
      overlay.querySelector('#as-year-wrap').hidden = !periods.length;
      overlay.querySelector('#as-year-label').textContent = P.label || 'Tax year';
      yearSel.innerHTML = periods.map(o => `<option value="${Esc(o.value)}">${Esc(o.text)}</option>`).join('');
      if (periods.length) { yearSel.value = P.selected || periods[0].value; if (!(first && !isNew)) setPeriod(); }
      else if (!(first && !isNew)) { ps.value = P.start || ''; pe.value = ''; }
      overlay.querySelector('#as-period-hint').textContent = P.hint || '';
    };
    svcSel.addEventListener('change', () => onService(false));
    yearSel.addEventListener('change', setPeriod);
    onService(true);

    F.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const p = periods.find(x => x.value === yearSel.value);
      const payload = {
        status: fd.get('status'),
        custom_price: fd.get('custom_price') !== '' && fd.get('custom_price') != null ? Number(fd.get('custom_price')) : null,
        tax_year: p && p.taxYear ? p.taxYear : null,
        period_start: fd.get('period_start') || null,
        period_end: fd.get('period_end') || null
      };
      if (isNew) {
        payload.client_id = this.clientId;
        payload.service_id = fd.get('service_id');
      }
      try {
        if (isNew) {
          const { error } = await sb.from('client_services').insert(payload);
          if (error) throw error;
        } else {
          const { error } = await sb.from('client_services').update(payload).eq('id', cs.id);
          if (error) throw error;
        }
        overlay.remove();
        this.render(this.clientId, this.containerEl, this.opts);
      } catch (err) {
        alert(`Could not save: ${err.message}`);
      }
    });
  },

  async handleRemove(id) {
    if (!confirm('Remove this service from the client?')) return;
    const { error } = await sb.from('client_services').delete().eq('id', id);
    if (error) {
      alert(`Could not remove service: ${error.message}`);
      return;
    }
    this.render(this.clientId, this.containerEl, this.opts);
  }
};
