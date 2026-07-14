// Accounted4Tax Practice Manager — History panel (shown on client detail page)
// Combines completed tasks, submitted/finalised MTD deadlines, and completed
// assigned services into one chronological read-only log. No new tables needed.

const ClientHistoryPanel = {
  async render(clientId, containerEl) {
    containerEl.innerHTML = `<p class="muted-line">Loading history…</p>`;

    const [tasksRes, deadlinesRes, servicesRes] = await Promise.all([
      sb.from('tasks').select('id, title, completed_at').eq('client_id', clientId).eq('status', 'completed').not('completed_at', 'is', null),
      sb.from('mtd_submissions').select('id, quarter_label, quarter, tax_year, status, submitted_at').eq('client_id', clientId).in('status', ['submitted', 'final_declaration']),
      sb.from('client_services').select('id, status, updated_at, created_at, services_catalogue(name)').eq('client_id', clientId).eq('status', 'completed')
    ]);

    const entries = [];

    (tasksRes.data || []).forEach(t => entries.push({
      label: t.title,
      date: t.completed_at,
      tag: 'Task completed'
    }));

    (deadlinesRes.data || []).forEach(d => entries.push({
      label: `${d.quarter_label || `Q${d.quarter}`} MTD submission — ${d.tax_year || ''}`,
      date: d.submitted_at,
      tag: d.status === 'final_declaration' ? 'Final declaration' : 'MTD submitted'
    }));

    (servicesRes.data || []).forEach(cs => entries.push({
      label: cs.services_catalogue ? cs.services_catalogue.name : 'Service',
      date: cs.updated_at || cs.created_at,
      tag: 'Service completed'
    }));

    entries.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    if (entries.length === 0) {
      containerEl.innerHTML = `<p class="empty-state">Nothing completed yet. Completed tasks, submitted deadlines, and finished services will appear here automatically.</p>`;
      return;
    }

    containerEl.innerHTML = entries.slice(0, 10).map(e => `
      <div class="history-row">
        <span class="history-check">&#10003;</span>
        <span style="flex:1;">${e.label}</span>
        <span class="pill pill-grey" style="margin-right:8px;">${e.tag}</span>
        <span class="muted-line" style="font-size:12px;">${Fmt.date(e.date)}</span>
      </div>
    `).join('');
  }
};
