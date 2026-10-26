// توحيد الأسماء: each Apex user name belongs to one employee, so every order report uses the Marsad name.
// The Apex names come from the orders monitor on the cashier PC (its user list and the people in the day's orders).

function setup(app) {
  const { db, fail } = app;

  app.route('GET', '/api/apex-names', async ctx => {
    await app.requireAdmin(ctx);
    const map = await db.prepare('SELECT apex_name, employee_id FROM apex_names').all();
    const seen = new Set(map.map(m => m.apex_name));
    for (const r of await db.prepare('SELECT data FROM orders_days ORDER BY received_at DESC LIMIT 7').all()) {
      let d = null; try { d = JSON.parse(r.data); } catch {}
      for (const n of [...(d?.users || []), ...(d?.staff || []).map(s => s.name), ...(d?.cancels || []).flatMap(c => [c.user, c.by])]) if (n && !/^#\d+$/.test(n)) seen.add(String(n));
    }
    return { apexNames: map.map(m => ({ apexName: m.apex_name, employeeId: m.employee_id })), apexSeen: [...seen].sort((a, b) => a.localeCompare(b, 'ar')) };
  });

  app.route('PUT', '/api/apex-names', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const name = String(ctx.body.apexName || '').trim().slice(0, 100), id = ctx.body.employeeId == null ? null : Number(ctx.body.employeeId);
    if (!name) fail(400, 'اختار الاسم في Apex');
    // One Apex name belongs to one employee; an employee can have more than one Apex name.
    if (id == null) await db.prepare('DELETE FROM apex_names WHERE apex_name = ?').run(name);
    else {
      if (!await db.prepare('SELECT 1 FROM employees WHERE id = ? AND deleted_at IS NULL').get(id)) fail(404, 'الموظف غير موجود');
      await db.prepare('INSERT INTO apex_names (apex_name, employee_id, set_at) VALUES (?,?,?) ON CONFLICT(apex_name) DO UPDATE SET employee_id = excluded.employee_id, set_at = excluded.set_at').run(name, id, ctx.now);
    }
    await app.audit('apex_name_set', id, { actor: who.name, apexName: name });
    return { ok: true };
  });

  // Apex name -> Marsad name, for the order reports.
  app.apexNameMap = async () => Object.fromEntries((await db.prepare('SELECT a.apex_name, e.name FROM apex_names a JOIN employees e ON e.id = a.employee_id').all()).map(r => [r.apex_name, r.name]));
}

export { setup };
