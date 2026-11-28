// Accounted4Tax Practice Manager — Leads (new companies with a Romanian director, from Companies House)
// Data: view ch_report_rows (filled by the ch-romanian-leads Edge Function). Admin-only (RLS).
// Letters: Romanian, one A4 page each, address placed for a DL window envelope, QR code to
//   https://www.accounted4tax.co.uk/discutie/?c=CODE&g=c|t|o  (the booking form).
// Groups: construction (SIC 41-43), transport & delivery (SIC 49, 52, 53), other. Companies using a
//   formation-agent / virtual-office address are listed separately (letters can still be printed if wanted).
// QR codes: vendor/qrcode-generator (MIT), loaded on first use.

const LEADS_SITE = 'https://www.accounted4tax.co.uk/discutie/';
const LEAD_GROUPS = [
  { key: 'construction', label: 'Construction', g: 'c' },
  { key: 'transport', label: 'Transport & delivery', g: 't' },
  { key: 'other', label: 'Everyone else', g: 'o' },
  { key: 'formation', label: 'Formation-agent addresses', g: null },
];
const RO_MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

const LeadLetters = {
  // "POPESCU, Ion Marian" -> { first: "Ion", full: "Ion Marian Popescu" }
  name(raw) {
    const s = String(raw || '').trim();
    const [sur, giv] = s.includes(',') ? [s.split(',')[0], s.split(',').slice(1).join(',')] : ['', s];
    const proper = (w) => w.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    const given = giv.trim().replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, '');
    const full = [given, proper(sur.trim())].filter(Boolean).join(' ');
    return { first: given.split(/\s+/)[0] || full, full: full || s };
  },
  addressLines(single) {
    const drop = /^(england|wales|scotland|northern ireland|united kingdom|uk)$/i;
    const lines = String(single || '').split(',').map(x => x.trim()).filter(x => x && !drop.test(x));
    // at most 4 lines so the address stays inside the envelope window: join the first lines ("Flat 4, 12 Example Road")
    while (lines.length > 4) lines.splice(0, 2, lines[0] + ', ' + lines[1]);
    return lines;
  },
  // add months, clamping to the last day of the month (31 Jan + 1 month = 28/29 Feb)
  addMonths(iso, months, days = 0) {
    const d = new Date(iso + 'T12:00:00Z');
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + months;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const out = new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last), 12));
    out.setUTCDate(out.getUTCDate() + days);
    return out;
  },
  roDate(d) { return `${d.getUTCDate()} ${RO_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; },
  qrSvg(text) {
    const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    return qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
  },

  groupBox(group) {
    if (group === 'construction') return {
      title: 'Lucrați în construcții?',
      items: [
        '<b>Înregistrarea CIS a firmei.</b> Unui subcontractor neînregistrat i se rețin 30% din plăți; înregistrat, 20%. Vă înregistrăm rapid și verificăm dacă vă calificați pentru „gross payment” (fără rețineri).',
        '<b>Recuperarea taxei CIS reținute.</b> La o firmă, suma reținută se compensează lunar prin payroll, cu PAYE-ul firmei, nu abia la sfârșitul anului.',
        '<b>TVA în construcții.</b> Regula „domestic reverse charge” și când merită să vă înregistrați pentru TVA.',
        '<b>Lucrați cu subcontractori?</b> Vă înregistrăm ca contractor CIS și ne ocupăm de declarațiile lunare.',
      ] };
    if (group === 'transport') return {
      title: 'Lucrați în transport sau livrări?',
      items: [
        '<b>Schema TVA Flat Rate.</b> Plătiți la HMRC un procent fix din încasări, cu mai puține calcule. Pentru unele firme din transport este avantajoasă, pentru altele nu (de exemplu, din cauza regulii „limited cost trader”). Calculăm exact pentru cazul dumneavoastră.',
        '<b>Vehiculul și cheltuielile.</b> Ce puteți trece pe firmă: combustibil, leasing, asigurare, întreținere, telefon.',
        '<b>Când devine obligatorie TVA</b> și ce se întâmplă dacă depășiți pragul fără să vă înregistrați.',
      ] };
    return {
      title: 'Ce verificăm împreună pentru firma dumneavoastră',
      items: [
        '<b>TVA: da sau nu?</b> Când devine obligatorie și când merită să vă înregistrați voluntar.',
        '<b>Salarii (PAYE)</b> pentru dumneavoastră ca director și pentru angajați.',
        '<b>Cheltuielile deductibile</b> specifice domeniului dumneavoastră.',
      ] };
  },

  letter(r, today) {
    const dirs = r.romanian_directors || [];
    const n = this.name(dirs[0] && dirs[0].name);
    const grp = r.letter_group || 'other';
    const g = (LEAD_GROUPS.find(x => x.key === grp) || {}).g || 'o';
    const url = `${LEADS_SITE}?c=${encodeURIComponent(r.letter_code)}&g=${g}`;
    const box = this.groupBox(grp);
    const cs = this.roDate(this.addMonths(r.date_of_creation, 12, 14));
    const acc = this.roDate(this.addMonths(r.date_of_creation, 21));
    const addr = this.addressLines(r.registered_office);
    return `<section class="letter">
<header class="lh"><div><div class="brand">Accounted<i>4</i>Tax</div><div class="tag">Contabili licențiați AAT · în română și engleză</div></div>
<div class="contact">www.accounted4tax.co.uk<br>info@accounted4tax.co.uk<br>Tel. / WhatsApp 07563 811938</div></header>
<div class="window"><div class="ret">Accounted4Tax Ltd, 128 City Road, London EC1V 2NX</div>
<div class="to${addr.some(l => l.length > 38) ? ' to-long' : ''}"><b>${Esc(r.company_name)}</b><br>${Esc(n.full)}, Director<br>${addr.map(Esc).join('<br>')}</div></div>
<div class="date">${this.roDate(today)}</div>
<div class="body">
<h1>Felicitări pentru înființarea ${Esc(r.company_name)}!</h1>
<p>Bună ziua, ${Esc(n.full)},</p>
<p>Primele luni ale unei firme noi sunt cele în care se iau deciziile care contează cel mai mult la taxe: cum vă plătiți ca director, ce înregistrări vă trebuie la HMRC și ce termene aveți la Companies House. O decizie bună acum vă poate economisi bani ani la rând; o greșeală poate aduce amenzi.</p>
<p>Suntem <b>Accounted4Tax</b>, o firmă de contabilitate licențiată AAT. Lucrăm în română și în engleză cu firme mici din toată Marea Britanie și vă invităm la <b>o discuție gratuită de 20 de minute, fără nicio obligație</b>.</p>
<div class="box"><div class="box-t">${box.title}</div><ul>${box.items.map(i => `<li>${i}</li>`).join('')}</ul></div>
<div class="two">
<div><div class="sub">Ce mai putem discuta</div><ul class="ticks"><li>Cum să vă plătiți eficient (salariu și dividende)</li><li>Ce înregistrări vă trebuie</li><li>TVA sau fără TVA</li><li>O strategie fiscală eficientă</li><li>Orice altă întrebare aveți</li></ul></div>
<div><div class="sub">Primele termene ale firmei</div><ul class="dl"><li>Confirmation statement: <b>până la ${cs}</b></li><li>Primele conturi anuale la Companies House: <b>până la ${acc}</b></li><li>Înregistrarea pentru Corporation Tax: <b>în 3 luni</b> de la începerea activității</li></ul></div>
</div>
<div class="cta"><div class="cta-t"><b>Programați discuția gratuită</b><br>Scanați codul QR sau intrați pe <b>accounted4tax.co.uk/discutie</b> și scrieți codul <span class="code">${Esc(r.letter_code)}</span>. Alegeți ziua, ora și subiectele, iar noi vă sunăm.<br>Preferați WhatsApp? Scrieți-ne la <b>07563 811938</b>.</div><div class="qr">${this.qrSvg(url)}</div></div>
<p class="sign">Cu stimă,<br><b>Echipa Accounted4Tax</b></p>
</div>
<footer class="foot">Datele firmei provin din registrul public Companies House. Dacă nu doriți să mai primiți scrisori de la noi, apăsați „Nu doresc să mai primesc scrisori” pe pagina de mai sus sau trimiteți codul ${Esc(r.letter_code)} la info@accounted4tax.co.uk. Cum folosim datele: www.accounted4tax.co.uk/privacy.<br>Accounted4Tax Ltd, înregistrată în Anglia și Țara Galilor, nr. 16438537. Licensed and supervised by the AAT; details on request. ICO: ZC296363.</footer>
</section>`;
  },

  css: `@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:Inter,Arial,Helvetica,sans-serif;color:#14213D;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.letter{width:210mm;height:297mm;position:relative;padding:12mm 18mm 0;page-break-after:always;break-after:page;overflow:hidden;font-size:9.6pt;line-height:1.42}
.lh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0E6E6B;padding-bottom:3mm}
.brand{font-family:Fraunces,Georgia,serif;font-size:21pt;font-weight:600}.brand i{color:#0E6E6B;font-style:normal}
.tag{font-size:8.5pt;color:#4A5568}.contact{font-size:8.5pt;text-align:right;color:#3E4A5C;line-height:1.5}
.window{position:absolute;left:22mm;top:45mm;width:92mm;height:36mm}
.ret{font-size:6.5pt;color:#4A5568;border-bottom:.3mm solid #C7CDD8;padding-bottom:1mm;margin-bottom:2mm}
.to{font-size:10pt;line-height:1.35}.to-long{font-size:9pt;line-height:1.25}
.date{position:absolute;right:18mm;top:50mm;font-size:9.5pt}
.body{position:absolute;left:18mm;right:18mm;top:86mm}
h1{font-family:Fraunces,Georgia,serif;font-size:15pt;font-weight:600;margin:0 0 2.5mm;line-height:1.2}
p{margin:0 0 2.2mm}
.box{background:#F2F9F8;border-left:1.2mm solid #0E6E6B;border-radius:2mm;padding:2.5mm 4mm;margin:2.5mm 0}
.box-t{font-weight:700;font-size:10.5pt;margin-bottom:1mm}.box ul{margin:0;padding-left:4.5mm}.box li{margin:0 0 1mm}
.two{display:flex;gap:6mm;margin:2.5mm 0}.two>div{flex:1}
.sub{font-weight:700;font-size:9.8pt;margin-bottom:1mm}
ul.ticks,ul.dl{margin:0;padding-left:4.5mm}ul.ticks li,ul.dl li{margin:0 0 .8mm}
.cta{display:flex;gap:5mm;align-items:center;border:.5mm solid #14213D;border-radius:2.5mm;padding:3mm 4mm;margin:3mm 0}
.cta-t{flex:1}.qr{width:27mm;height:27mm;flex:none}.qr svg{width:100%;height:100%}
.code{font-family:'Courier New',monospace;font-weight:700;font-size:11pt;letter-spacing:.08em;background:#E3F1F0;padding:0 1.2mm;border-radius:1mm}
.sign{margin-top:2mm}
.foot{position:absolute;left:18mm;right:18mm;bottom:9mm;font-size:6.8pt;color:#4A5568;line-height:1.4;border-top:.3mm solid #DDE1E7;padding-top:1.5mm}
@media screen{body{background:#E5E7EB}.letter{background:#fff;margin:8mm auto;box-shadow:0 2px 12px rgba(0,0,0,.15)}}`,

  async loadQr() {
    if (window.qrcode) return;
    await new Promise((ok, bad) => { const s = document.createElement('script'); s.src = 'vendor/qrcode-generator/qrcode.js'; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
  },

  async print(rows) {
    await this.loadQr();
    const w = window.open('', '_blank');
    if (!w) { alert('Your browser blocked the print window. Allow pop-ups for this site and try again.'); return false; }
    const today = new Date();
    w.document.write(`<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Scrisori – ${rows.length}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter:wght@400;700&display=swap">
<style>${this.css}</style></head><body>${rows.map(r => this.letter(r, today)).join('')}
<script>document.fonts.ready.then(function(){setTimeout(function(){window.print()},300)});<\/script></body></html>`);
    w.document.close();
    return true;
  },
};

const LeadsPage = {
  rows: [],
  group: 'construction',
  status: 'to_print',
  selected: new Set(),

  async render() {
    const el = App.content();
    el.innerHTML = `<div class="page-loading">Loading leads…</div>`;
    const { data, error } = await sb.from('ch_report_rows')
      .select('company_number,company_name,date_of_creation,sic_codes,registered_office,romanian_directors,letter_code,letter_group,printed_at,responded_at,opted_out_at,client_id,ro_formation,dir_formation,status')
      .eq('status', 'checked').order('date_of_creation', { ascending: false }).limit(3000);
    if (error) { el.innerHTML = `<div class="page-error">Could not load leads: ${Esc(error.message)}</div>`; return; }
    this.rows = (data || []).map(r => ({ ...r, formation: !!(r.ro_formation || r.dir_formation) }));
    this.selected = new Set();
    this.renderPage();
  },

  inGroup(r) {
    if (this.group === 'formation') return r.formation;
    return !r.formation && (r.letter_group || 'other') === this.group;
  },
  statusOf(r) {
    if (r.opted_out_at) return 'opted_out';
    if (r.responded_at) return 'replied';
    if (r.printed_at) return 'printed';
    return 'to_print';
  },
  visible() {
    return this.rows.filter(r => this.inGroup(r) && (this.status === 'all' || this.statusOf(r) === this.status));
  },

  renderPage() {
    const el = App.content();
    const count = (g) => this.rows.filter(r => (g === 'formation' ? r.formation : !r.formation && (r.letter_group || 'other') === g) && this.statusOf(r) === 'to_print').length;
    el.innerHTML = `
      <p style="margin:0 0 14px;color:#4A5568;font-size:14px">New companies with a Romanian director, from Companies House. Print the letters for each group, post them, then mark them as printed. Replies from the QR form appear here and as new clients.</p>
      <div class="page-toolbar" style="flex-wrap:wrap;gap:8px">
        ${LEAD_GROUPS.map(g => `<button class="btn ${this.group === g.key ? 'btn-primary' : 'btn-secondary'}" data-group="${g.key}">${g.label} <span class="pill pill-grey" style="margin-left:6px">${count(g.key)}</span></button>`).join('')}
      </div>
      <div class="page-toolbar" style="flex-wrap:wrap;gap:8px">
        <select id="lead-status" class="input input-select">
          ${[['to_print', 'To print'], ['printed', 'Printed'], ['replied', 'Replied'], ['opted_out', 'Opted out'], ['all', 'All']].map(([v, l]) => `<option value="${v}" ${this.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button id="lead-print" class="btn btn-primary" style="margin-left:auto">Print letters</button>
        <button id="lead-mark" class="btn btn-secondary">Mark as printed</button>
      </div>
      ${this.group === 'formation' ? '<p style="margin:0 0 12px;font-size:13px;color:#8A5A00;background:#FFF6E5;padding:10px 12px;border-radius:8px">These companies use a formation-agent or virtual-office address, so a letter may be forwarded late, charged to the director, or not passed on. Print them only if you want to.</p>' : ''}
      <div id="leads-table"></div>`;
    el.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', () => { this.group = b.dataset.group; this.selected = new Set(); this.renderPage(); }));
    document.getElementById('lead-status').addEventListener('change', (e) => { this.status = e.target.value; this.selected = new Set(); this.renderPage(); });
    document.getElementById('lead-print').addEventListener('click', () => this.doPrint());
    document.getElementById('lead-mark').addEventListener('click', () => this.markPrinted(this.targets()));
    this.renderTable();
  },

  targets() {
    const vis = this.visible();
    return this.selected.size ? vis.filter(r => this.selected.has(r.company_number)) : vis;
  },
  updateButtons() {
    const n = this.targets().length;
    const sel = this.selected.size ? ' selected' : '';
    document.getElementById('lead-print').textContent = `Print ${n} letter${n === 1 ? '' : 's'}${sel}`;
    document.getElementById('lead-mark').textContent = `Mark ${n}${sel} as printed`;
    document.getElementById('lead-print').disabled = !n;
    document.getElementById('lead-mark').disabled = !n;
  },

  renderTable() {
    const rows = this.visible();
    const wrap = document.getElementById('leads-table');
    if (!rows.length) { wrap.innerHTML = '<div class="empty-state" style="padding:24px;color:#4A5568">Nothing here.</div>'; this.updateButtons(); return; }
    const pill = (s) => ({ to_print: '<span class="pill pill-amber">To print</span>', printed: '<span class="pill pill-grey">Printed</span>', replied: '<span class="pill pill-green">Replied</span>', opted_out: '<span class="pill pill-red">Opted out</span>' }[s]);
    wrap.innerHTML = `<table class="data-table"><thead><tr>
      <th style="width:32px"><input type="checkbox" id="lead-all" aria-label="Select all"></th><th>Company</th><th>Romanian director(s)</th><th>SIC</th><th>Formed</th><th>Registered office</th><th>Code</th><th>Status</th></tr></thead><tbody>
      ${rows.map(r => `<tr>
        <td><input type="checkbox" class="lead-cb" value="${Esc(r.company_number)}" ${this.selected.has(r.company_number) ? 'checked' : ''}></td>
        <td><a href="https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(r.company_number)}" target="_blank" rel="noopener">${Esc(r.company_name)}</a><div style="font-size:12px;color:#4A5568">${Esc(r.company_number)}</div></td>
        <td>${(r.romanian_directors || []).map(d => Esc(LeadLetters.name(d.name).full)).join('<br>')}</td>
        <td style="font-size:12px">${(r.sic_codes || []).map(Esc).join(', ')}</td>
        <td>${Fmt.date(r.date_of_creation)}</td>
        <td style="font-size:12px;max-width:260px">${Esc(r.registered_office)}${r.formation ? '<div style="color:#8A5A00;font-weight:600">Formation address' + (r.dir_formation && !r.ro_formation ? ' (director)' : '') + '</div>' : ''}</td>
        <td style="font-family:monospace">${Esc(r.letter_code || '')}</td>
        <td>${pill(this.statusOf(r))}${r.client_id ? `<div><a href="#/clients/${r.client_id}" style="font-size:12px">Client →</a></div>` : ''}</td>
      </tr>`).join('')}</tbody></table>`;
    wrap.querySelectorAll('.lead-cb').forEach(cb => cb.addEventListener('change', () => { cb.checked ? this.selected.add(cb.value) : this.selected.delete(cb.value); this.updateButtons(); }));
    document.getElementById('lead-all').addEventListener('change', (e) => {
      this.selected = e.target.checked ? new Set(rows.map(r => r.company_number)) : new Set();
      wrap.querySelectorAll('.lead-cb').forEach(cb => { cb.checked = e.target.checked; });
      this.updateButtons();
    });
    this.updateButtons();
  },

  async doPrint() {
    const rows = this.targets().filter(r => r.letter_code && !r.opted_out_at);
    if (!rows.length) { alert('No letters to print here (opted-out companies are never printed).'); return; }
    const ok = await LeadLetters.print(rows);
    if (!ok) return;
    if (this.statusOf(rows[0]) === 'to_print' && confirm(`When the ${rows.length} letter${rows.length === 1 ? ' has' : 's have'} printed correctly, press OK to mark ${rows.length === 1 ? 'it' : 'them'} as printed.`)) await this.markPrinted(rows);
  },

  async markPrinted(rows) {
    rows = rows.filter(r => !r.printed_at);
    if (!rows.length) return;
    const now = new Date().toISOString();
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('ch_new_companies').update({ printed_at: now }).in('company_number', rows.slice(i, i + 200).map(r => r.company_number));
      if (error) { alert('Could not mark as printed: ' + error.message); return; }
    }
    rows.forEach(r => { r.printed_at = now; });
    this.selected = new Set();
    this.renderPage();
  },
};
