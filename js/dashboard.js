// Accounted4Tax Practice Manager — Dashboard

const DashboardPage = {
  async render() {
    const el = App.content();
    el.innerHTML = `<div class="page-loading">Loading dashboard…</div>`;

    try {
      const [
        clientsRes,
        tasksOpenRes,
        tasksOverdueRes,
        invoicesUnpaidRes,
        deadlinesRes,
        correspondenceUnreadRes,
        portalRes
      ] = await Promise.all([
        sb.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        sb.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'completed'),
        sb.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'completed').lt('due_date', new Date().toISOString().slice(0, 10)),
        sb.from('invoices').select('id, amount', { count: 'exact' }).neq('status', 'paid'),
        sb.from('mtd_submissions').select('id, client_id, quarter_label, deadline, clients(full_name)').not('status', 'in', '(submitted,final_declaration)').order('deadline', { ascending: true }).limit(6),
        sb.from('correspondence').select('id', { count: 'exact', head: true }).eq('is_read', false),
        sb.rpc('portal_activity')
      ]);

      const unpaidTotal = (invoicesUnpaidRes.data || []).reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

      el.innerHTML = `
        <div class="stat-grid">
          ${this.statCard('Active clients', clientsRes.count ?? '—', 'users')}
          ${this.statCard('Open tasks', tasksOpenRes.count ?? '—', 'check-square')}
          ${this.statCard('Overdue tasks', tasksOverdueRes.count ?? '—', 'calendar', tasksOverdueRes.count > 0 ? 'danger' : '')}
          ${this.statCard('Unpaid invoices', `${invoicesUnpaidRes.count ?? 0} · ${Fmt.money(unpaidTotal)}`, 'credit-card')}
        </div>

        <section class="panel" style="margin-bottom:16px;">
          <div class="panel-header">
            <h2>Client portal activity</h2>
          </div>
          <div class="panel-body">
            ${this.portalList(portalRes.error ? null : portalRes.data)}
          </div>
        </section>

        <div class="panel-grid">
          <section class="panel">
            <div class="panel-header">
              <h2>Upcoming MTD deadlines</h2>
            </div>
            <div class="panel-body">
              ${this.deadlinesList(deadlinesRes.data)}
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2>Correspondence</h2>
            </div>
            <div class="panel-body">
              <p class="muted-line">${correspondenceUnreadRes.count ?? 0} unread message${(correspondenceUnreadRes.count ?? 0) === 1 ? '' : 's'}</p>
              <a href="#/correspondence" class="btn btn-secondary btn-sm">View correspondence</a>
            </div>
          </section>
        </div>
      `;
      el.querySelectorAll('[data-portal-client]').forEach(row => row.addEventListener('click', () => Router.go(`/clients/${row.dataset.portalClient}`)));
    } catch (err) {
      el.innerHTML = `<div class="page-error">Could not load dashboard: ${Esc(err.message)}</div>`;
    }
  },

  statCard(label, value, iconName, tone = '') {
    return `
      <div class="stat-card ${tone}">
        <div class="stat-icon">${icon(iconName, 20)}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-label">${label}</div>
      </div>
    `;
  },

  portalList(rows) {
    if (rows === null) return `<p class="muted-line">Could not load portal activity.</p>`;
    if (!rows.length) return `<p class="empty-state">Nothing new from clients in the portal.</p>`;
    const pill = (n, one, many, c) => n ? `<span class="pill ${c}" style="margin-right:4px;">${n} ${n === 1 ? one : many}</span>` : '';
    return `
      <table class="data-table data-table-compact">
        <tbody>
          ${rows.map(r => `
            <tr class="clickable-row" data-portal-client="${r.client_id}" style="cursor:pointer;">
              <td><b>${Esc(r.display_name)}</b></td>
              <td>${pill(r.changes, 'change requested', 'changes requested', 'pill-red')}${pill(r.approved, 'approval', 'approvals', 'pill-green')}${pill(r.new_messages, 'new message', 'new messages', 'pill-amber')}${pill(r.new_uploads, 'new file', 'new files', 'pill-amber')}</td>
              <td class="align-right muted-line">${r.last_at ? Fmt.date(r.last_at) : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="muted-line" style="font-size:12px;margin-top:6px;">Open a client to see the details. Messages and approvals are marked as seen when you open the client; files when you mark them checked.</p>
    `;
  },

  deadlinesList(rows) {
    if (!rows || rows.length === 0) {
      return `<p class="empty-state">No upcoming MTD deadlines outstanding.</p>`;
    }
    return `
      <table class="data-table data-table-compact">
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.clients ? Esc(r.clients.full_name) : '—'}</td>
              <td class="muted-line">${r.quarter_label || ''}</td>
              <td class="align-right">${Fmt.date(r.deadline)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
};
