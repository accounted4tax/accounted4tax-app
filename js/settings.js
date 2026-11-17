// Accounted4Tax Practice Manager — Settings page.
// Google Drive: the drive-sync Edge Function copies client files into Drive through a Google Apps Script
// running as info@ (same method as Tax Letter Sorted). Automatic every 10 minutes, or "Copy to Drive now".
const SettingsPage = {
  async render() {
    App.content().innerHTML = `
      <div class="page-header"><h1>Settings</h1></div>
      <div class="pm-card" id="set-drive"><p class="muted-line">Loading…</p></div>`;
    this.flash = null;
    this.drawDrive();
  },
  async call(action) {
    const res = await sb.functions.invoke('drive-sync', { body: { action } });
    if (res.error) {
      let m = res.error.message || 'Something went wrong';
      try { const b = await res.error.context.json(); if (b.error) m = b.error.message; } catch (_) {}
      throw new Error(m);
    }
    return res.data;
  },
  async drawDrive() {
    const el = document.getElementById('set-drive'); if (!el) return;
    let s;
    try { s = await this.call('status'); } catch (e) { el.innerHTML = `<p class="page-error">Could not check Google Drive: ${Esc(e.message)}</p>`; return; }
    const r = s.last_result || {};
    const when = (x) => x ? `${Fmt.date(x)} ${new Date(x).toTimeString().slice(0, 5)}` : '—';
    el.innerHTML = `
      <div class="pm-card-head"><h3>Google Drive copy of client files</h3>${s.connected ? '<span class="pill pill-green">Connected</span>' : '<span class="pill pill-grey">Not connected</span>'}</div>
      ${this.flash ? `<p class="${this.flash[0] === 'ok' ? 'pill pill-green' : 'page-error'}" style="display:inline-block;margin:0 0 10px;">${Esc(this.flash[1])}</p>` : ''}
      <p class="muted-line" style="font-size:13px;margin-top:0;">When a client first signs in to the portal, a folder is created for them in Drive. Every new file they upload, and every file you share, is copied into the right service and year folder. The Client details document and the Master list are kept up to date. It's a one-way copy: changes in Drive don't change the portal.</p>
      ${!s.configured ? `<p class="page-error">Not set up yet: the Google script's address and key (GDRIVE_URL and GDRIVE_SECRET) need adding in Supabase secrets.</p>` : ''}
      ${s.connected ? `
        <dl class="pm-dl" style="max-width:640px;">
          <dt>Google account</dt><dd>${Esc(s.email || '—')}</dd>
          <dt>Copying files added since</dt><dd>${when(s.sync_from)}</dd>
          <dt>Last copy</dt><dd>${when(s.last_run_at)}${s.last_error ? ` <span class="pill pill-red">Problem</span><div class="page-error" style="font-size:12.5px;">${Esc(s.last_error)}</div>` : r.files != null ? ` – ${r.files} file${r.files === 1 ? '' : 's'} copied${r.failed ? `, ${r.failed} failed (will retry)` : ''}${r.more ? ', more waiting' : ''}` : ''}</dd>
        </dl>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          ${s.root_link ? `<a class="btn btn-secondary btn-sm" href="${Esc(s.root_link)}" target="_blank" rel="noopener">Open clients folder ↗</a>` : ''}
          ${s.sheet_link ? `<a class="btn btn-secondary btn-sm" href="${Esc(s.sheet_link)}" target="_blank" rel="noopener">Open master list ↗</a>` : ''}
          <button type="button" class="btn btn-primary btn-sm" id="drive-sync">Copy to Drive now</button>
          <button type="button" class="btn btn-secondary btn-sm" id="drive-connect">Test connection</button>
          <button type="button" class="btn btn-danger-outline btn-sm" id="drive-off">Disconnect</button>
        </div>` : `<button type="button" class="btn btn-primary" id="drive-connect" ${s.configured ? '' : 'disabled'}>Connect and start copying</button>`}`;
    const $ = (id) => document.getElementById(id);
    if ($('drive-connect')) $('drive-connect').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const r = await this.call('connect');
        this.flash = ['ok', `Connected to ${r.email || 'Google Drive'}. Copying now…`]; this.drawDrive();
        await this.call('sync').catch(() => {});
        this.flash = ['ok', `Connected to ${r.email || 'Google Drive'}.`];
      } catch (err) { this.flash = ['err', err.message]; }
      this.drawDrive();
    });
    if ($('drive-sync')) $('drive-sync').addEventListener('click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Copying…';
      try { await this.call('sync'); } catch (err) { alert(err.message); }
      this.flash = null; this.drawDrive();
    });
    if ($('drive-off')) $('drive-off').addEventListener('click', async () => {
      if (!confirm('Stop copying to Google Drive? Files already in Drive stay there.')) return;
      await this.call('disconnect'); this.drawDrive();
    });
  },
};
