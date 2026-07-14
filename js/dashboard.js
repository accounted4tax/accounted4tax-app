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
        correspondenceUnreadRes
      ] = await Promise.all([
        sb.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        sb.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'completed'),
        sb.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'completed').lt('due_date', new Date().toISOString().slice(0, 10)),
        sb.from('invoices').select('id, amount', { count: 'exact' }).neq('status', 'paid'),
        sb.from('mtd_submissions').select('id, client_id, quarter_label, deadline, clients(full_name)').not('status', 'in', '(submitted,final_declaration)').order('deadline', { ascending: true }).limit(6),
        sb.from('correspondence').select('id', { count: 'exact', head: true }).eq('is_read', false)
      ]);

      const unpaidTotal = (invoicesUnpaidRes.data || []).reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

      el.innerHTML = `
        <div class="stat-grid">
          ${this.statCard('Active clients', clientsRes.count ?? '—', 'users')}
          ${this.statCard('Open tasks', tasksOpenRes.count ?? '—', 'check-square')}
          ${this.statCard('Overdue tasks', tasksOverdueRes.count ?? '—', 'calendar', tasksOverdueRes.count > 0 ? 'danger' : '')}
          ${this.statCard('Unpaid invoices', `${invoicesUnpaidRes.count ?? 0} · ${Fmt.money(unpaidTotal)}`, 'credit-card')}
        </div>

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
    } catch (err) {
      el.innerHTML = `<div class="page-error">Could not load dashboard: ${err.message}</div>`;
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

  deadlinesList(rows) {
    if (!rows || rows.length === 0) {
      return `<p class="empty-state">No upcoming MTD deadlines outstanding.</p>`;
    }
    return `
      <table class="data-table data-table-compact">
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.clients ? r.clients.full_name : '—'}</td>
              <td class="muted-line">${r.quarter_label || ''}</td>
              <td class="align-right">${Fmt.date(r.deadline)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
};
