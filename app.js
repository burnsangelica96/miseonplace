// ─── SUPABASE INIT ─────────────────────────────────────────────────
const SUPABASE_URL = 'https://sfqyjaymtcbsnleyiide.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SxviKcggRk1crz20lsdVWw_mk30PVAa';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── APP STATE ─────────────────────────────────────────────────────
let currentUser = null;
let currentProfile = null;
let currentRestaurantId = null;
let restaurants = [];

// ─── AUTH ──────────────────────────────────────────────────────────
async function signIn() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
  await initApp(data.user);
}

async function signUp() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const fullName = document.getElementById('auth-name').value.trim();
  const requestedRole = document.getElementById('auth-role')?.value || 'kitchen';
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  if (!fullName) { errEl.textContent = 'Please enter your full name.'; errEl.style.display='block'; return; }
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: fullName, requested_role: requestedRole } }
  });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }

  // Set profile with requested role + pending status
  if (data.user) {
    await sb.from('profiles').upsert({
      id: data.user.id,
      full_name: fullName,
      requested_role: requestedRole,
      role: 'pending',
      approved: false
    });
  }

  errEl.style.display = 'block';
  errEl.style.background = 'rgba(106,170,106,0.12)';
  errEl.style.borderColor = 'rgba(106,170,106,0.3)';
  errEl.style.color = '#6aaa6a';
  errEl.textContent = 'Account created! The owner will approve your access. Check your email to confirm, then sign in.';
}

async function signOut() {
  await sb.auth.signOut();
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  currentUser = null; currentProfile = null; currentRestaurantId = null;
}

function toggleSignUp() {
  const f = document.getElementById('signup-fields');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

// ─── ROLE PERMISSIONS ──────────────────────────────────────────────
// Which pages each role can see. 'owner' sees everything.
const ROLE_PERMISSIONS = {
  owner: ['dashboard','kitchen','bar','misc','recipes','bar_program','food_cost','menu_pricing',
          'sop_foh','sop_boh','prep_checklist','daily_sales','order_history','financials','labor','hr',
          'team_logs','checklists','user_approvals'],
  manager: ['dashboard','kitchen','bar','misc','recipes','bar_program','food_cost','menu_pricing',
            'sop_foh','sop_boh','prep_checklist','daily_sales','order_history','labor',
            'team_logs','checklists'],
  kitchen: ['dashboard','kitchen','recipes','food_cost','sop_boh','prep_checklist',
            'order_history','team_logs','checklists'],
  bar: ['dashboard','bar','bar_program','food_cost','sop_foh','prep_checklist',
        'order_history','team_logs','checklists'],
};

let currentRole = 'pending';

function applyRolePermissions(role) {
  currentRole = role;
  const allowed = ROLE_PERMISSIONS[role] || [];
  // Hide nav items the role can't access
  document.querySelectorAll('.nav-item').forEach(item => {
    const onclick = item.getAttribute('onclick') || '';
    const match = onclick.match(/showPage\('([^']+)'\)/);
    if (match) {
      const page = match[1];
      item.style.display = allowed.includes(page) ? '' : 'none';
    }
  });
  // Hide nav section headers that have no visible items
  // Nav items are nested INSIDE each .nav-section, so check children directly
  document.querySelectorAll('.nav-section').forEach(section => {
    const items = section.querySelectorAll('.nav-item');
    const hasVisible = Array.from(items).some(item => item.style.display !== 'none');
    section.style.display = hasVisible ? '' : 'none';
  });
  // Show role badge
  const badge = document.getElementById('role-badge');
  if (badge) {
    const labels = { owner:'Owner', manager:'Manager', kitchen:'Kitchen', bar:'Bar' };
    badge.textContent = labels[role] || role;
    badge.style.display = role === 'owner' ? 'none' : 'inline-block';
  }
}

// ─── INIT APP ──────────────────────────────────────────────────────
async function initApp(user) {
  currentUser = user;
  document.getElementById('auth-screen').style.display = 'none';

  // Load profile with role
  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
  currentProfile = profile;

  // ── Check approval status ──
  if (!profile || !profile.approved || profile.role === 'pending') {
    // Show pending approval screen
    document.getElementById('app').style.display = 'none';
    document.getElementById('pending-screen').style.display = 'flex';
    const nameEl = document.getElementById('pending-name');
    if (nameEl) nameEl.textContent = profile?.full_name || user.email;
    return;
  }

  document.getElementById('pending-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('user-name').textContent = profile?.full_name || user.email;

  // Apply role-based menu permissions
  applyRolePermissions(profile.role);

  // Load restaurants
  const { data: rests } = await sb.from('restaurants').select('*').order('name');
  restaurants = rests || [];

  // Populate switcher
  const sel = document.getElementById('restaurant-select');
  sel.innerHTML = restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  currentRestaurantId = restaurants[0]?.id || null;

  // Land on first allowed page (kitchen sees kitchen, bar sees bar, etc.)
  const allowed = ROLE_PERMISSIONS[profile.role] || ['dashboard'];
  const landing = allowed.includes('dashboard') ? 'dashboard' : allowed[0];
  showPage(landing);
}

async function switchRestaurant(id) {
  currentRestaurantId = id;
  const page = document.querySelector('.page.active')?.id?.replace('page-', '') || 'dashboard';
  showPage(page);
}

// ─── NAVIGATION ────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + id);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick')?.includes("'" + id + "'")) n.classList.add('active');
  });
  const loaders = {
    dashboard: renderDashboard, kitchen: () => renderInv('kitchen'),
    bar: () => renderInv('bar'), misc: () => renderInv('misc'),
    recipes: renderRecipes, menu_pricing: renderMenuPricing,
    sop_foh: () => renderSops('foh'), sop_boh: () => renderSops('boh'),
    financials: renderPnl, labor: renderLabor,
    order_history: renderOrderHistory, hr: renderHr,
    daily_sales: renderDailySales,
    user_approvals: renderUserApprovals,
    team_logs: renderTeamLogs,
    bar_program: renderBarProgram, prep_checklist: renderPrepChecklist
  };
  if (loaders[id]) loaders[id]();
}

function openModal(id) { document.getElementById('modal-' + id).classList.add('open'); }
function closeModal(id) { document.getElementById('modal-' + id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

function showToast() {
  const t = document.getElementById('save-toast');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ─── DASHBOARD ─────────────────────────────────────────────────────
async function renderDashboard() {
  if (!currentRestaurantId) return;
  const rest = restaurants.find(r => r.id === currentRestaurantId);
  document.getElementById('dash-title').textContent = rest?.name || 'Dashboard';
  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const isOwnerOrMgr = currentRole === 'owner' || currentRole === 'manager';

  // Date ranges
  const week7 = new Date(); week7.setDate(week7.getDate() - 7);
  const week7Str = week7.toISOString().split('T')[0];

  const queries = [
    sb.from('inventory').select('*').eq('restaurant_id', currentRestaurantId),
    sb.from('recipes').select('*').eq('restaurant_id', currentRestaurantId),
  ];
  if (isOwnerOrMgr) {
    queries.push(
      sb.from('daily_sales').select('*').eq('restaurant_id', currentRestaurantId).gte('date', week7Str),
      sb.from('financials').select('*').eq('restaurant_id', currentRestaurantId).order('created_at', { ascending: false }).limit(1)
    );
  }

  const results = await Promise.all(queries);
  const allInv = results[0].data || [];
  const recs   = results[1].data || [];
  const sales  = isOwnerOrMgr ? (results[2].data || []) : [];
  const pnl    = isOwnerOrMgr ? (results[3].data?.[0] || null) : null;

  // ── Inventory health ──
  const low = allInv.filter(x => x.par_level > 0 && x.qty / x.par_level <= 0.2);
  const totalItemsEl = document.getElementById('d-total-items');
  const lowStockEl   = document.getElementById('d-low-stock');
  const recipesEl    = document.getElementById('d-recipes');
  const avgFcEl      = document.getElementById('d-avg-fc');
  if (totalItemsEl) totalItemsEl.textContent = allInv.length;
  if (lowStockEl)   lowStockEl.textContent   = low.length;
  if (recipesEl)    recipesEl.textContent    = recs.length;

  const withPrice = recs.filter(r => r.plate_cost > 0 && r.menu_price > 0);
  const avgFc = withPrice.length
    ? Math.round(withPrice.reduce((s, r) => s + r.plate_cost / r.menu_price * 100, 0) / withPrice.length) + '%'
    : '—';
  if (avgFcEl) avgFcEl.textContent = avgFc;

  // ── Owner KPI row (weekly revenue, food %, labor %, prime %) ──
  const kpiRow = document.getElementById('dash-owner-kpis');
  if (kpiRow && isOwnerOrMgr) {
    const weekRev   = sales.reduce((s, e) => s + (e.total_revenue || 0), 0);
    const weekFood  = sales.reduce((s, e) => s + (e.food_revenue  || 0), 0);
    const weekCov   = sales.reduce((s, e) => s + (e.covers        || 0), 0);
    const rpc       = weekCov > 0 ? (weekRev / weekCov) : 0;

    // Food/labor % from latest P&L
    let foodPct = '—', laborPct = '—', primePct = '—';
    let foodColor = 'var(--text)', laborColor = 'var(--text)', primeColor = 'var(--text)';
    if (pnl && pnl.revenue > 0) {
      const fp = (pnl.food_cogs + pnl.bar_cogs) / pnl.revenue * 100;
      const lp = (pnl.boh_labor + pnl.foh_labor) / pnl.revenue * 100;
      const pp = fp + lp;
      foodPct  = fp.toFixed(1) + '%';
      laborPct = lp.toFixed(1) + '%';
      primePct = pp.toFixed(1) + '%';
      foodColor  = fp <= 32 ? 'var(--green)' : fp <= 36 ? 'var(--amber)' : 'var(--red)';
      laborColor = lp <= 35 ? 'var(--green)' : lp <= 40 ? 'var(--amber)' : 'var(--red)';
      primeColor = pp <= 60 ? 'var(--green)' : pp <= 65 ? 'var(--amber)' : 'var(--red)';
    }

    const ownerOnly = currentRole === 'owner';
    kpiRow.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Revenue · 7 days</div>
        <div class="stat-value">$${Math.round(weekRev).toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Rev / Cover</div>
        <div class="stat-value">${rpc > 0 ? '$' + rpc.toFixed(0) : '—'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Food Cost %</div>
        <div class="stat-value" style="color:${foodColor}">${foodPct}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Labor Cost %</div>
        <div class="stat-value" style="color:${laborColor}">${laborPct}</div>
      </div>`;
    kpiRow.style.display = 'grid';
  } else if (kpiRow) {
    kpiRow.style.display = 'none';
  }

  // ── Active alerts (consolidated) ──
  const alerts = document.getElementById('dash-alerts');
  if (alerts) {
    let alertItems = [];

    // Low stock
    low.forEach(x => alertItems.push({
      type: 'stock', sev: 'red',
      msg: `${x.name} low — ${x.qty} ${x.unit} left (par: ${x.par_level})`
    }));

    // Expiring certifications (owner only)
    if (currentRole === 'owner') {
      const { data: certs } = await sb.from('employee_certifications').select('*')
        .eq('restaurant_id', currentRestaurantId).eq('status', 'active');
      const today = new Date();
      const in30 = new Date(); in30.setDate(today.getDate() + 30);
      (certs || []).filter(c => new Date(c.expiry_date) <= in30).forEach(c => {
        const exp = new Date(c.expiry_date);
        const days = Math.ceil((exp - today) / 86400000);
        alertItems.push({
          type: 'cert', sev: days < 0 ? 'red' : 'amber',
          msg: `${c.cert_type} ${days < 0 ? 'expired' : 'expires in ' + days + 'd'}`
        });
      });
    }

    // Food cost over target (owner/manager)
    if (isOwnerOrMgr && pnl && pnl.revenue > 0) {
      const fp = (pnl.food_cogs + pnl.bar_cogs) / pnl.revenue * 100;
      if (fp > 35) alertItems.push({ type: 'cost', sev: 'amber', msg: `Food cost at ${fp.toFixed(1)}% — above 35% target` });
    }

    if (!alertItems.length) {
      alerts.innerHTML = '<div style="padding:14px;font-family:var(--serif);color:var(--green);font-size:14px">✓ All clear — no active alerts.</div>';
    } else {
      alerts.innerHTML = alertItems.map(a =>
        `<div class="alert alert-${a.sev}">${a.msg}</div>`
      ).join('');
    }
  }
}

// ─── INVENTORY ─────────────────────────────────────────────────────
function invStatus(qty, par) {
  if (!par) return '<span class="badge badge-blue">No Par</span>';
  const r = qty / par;
  if (r <= 0.2) return '<span class="badge badge-red">Low</span>';
  if (r <= 0.5) return '<span class="badge badge-amber">Watch</span>';
  return '<span class="badge badge-green">OK</span>';
}

let _invSection = 'kitchen';

async function openInvModal(section, item = null) {
  _invSection = section;
  document.getElementById('inv-section').value = section;
  document.getElementById('inv-modal-title').textContent = item ? 'Edit Item' : 'Add Inventory Item';

  // Load suppliers and render dynamic dropdowns
  await loadSupplierList();
  const catHtml = await renderCatDropdown(section, item?.category || '');
  const unitHtml = renderUnitDropdown(item?.unit || 'units');
  document.getElementById('inv-cat-wrap').innerHTML = catHtml;
  document.getElementById('inv-unit-wrap').innerHTML = unitHtml;

  // Render supplier search input
  const supWrap = document.getElementById('inv-suppliers-list');
  if (supWrap && !item) {
    supWrap.innerHTML = buildSupplierDropdown('');
  }

  if (item) {
    document.getElementById('inv-id').value = item.id;
    document.getElementById('inv-name').value = item.name;
    document.getElementById('inv-qty').value = item.qty;
    document.getElementById('inv-par').value = item.par_level;
    document.getElementById('inv-cost').value = item.cost_per_unit;
    loadItemSuppliers(item.id);
  } else {
    ['inv-id','inv-name','inv-qty','inv-par','inv-cost'].forEach(id =>
      document.getElementById(id).value = '');
    const supList = document.getElementById('inv-suppliers-list');
    if (supList) { supList.innerHTML = ''; addSupplierRow(); }
  }
  openModal('inv-modal');
}

async function loadItemSuppliers(itemId) {
  const list = document.getElementById('inv-suppliers-list');
  list.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0">Loading suppliers...</div>';
  const { data } = await sb.from('item_suppliers').select('*')
    .eq('inventory_id', itemId).order('is_preferred', { ascending: false });
  list.innerHTML = '';
  const suppliers = data || [];
  if (!suppliers.length) { addSupplierRow(); return; }
  suppliers.forEach(s => addSupplierRow(s));
}

function addSupplierRow(s = null) {
  const list = document.getElementById('inv-suppliers-list');
  const row = document.createElement('div');
  row.className = 'supplier-row';
  row.innerHTML = `
    <input type="hidden" class="sup-id" value="${s?.id || ''}">
    <input class="sup-name" placeholder="Supplier name (e.g. Sysco)" value="${s?.supplier_name || ''}">
    <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
      <input type="number" class="sup-cost" step="0.01" placeholder="Cost/unit ($)"
        value="${s?.cost_per_unit || ''}" style="flex:1">
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;
        text-transform:none;letter-spacing:0;color:var(--muted);white-space:nowrap;margin:0;cursor:pointer">
        <input type="checkbox" class="sup-preferred" ${s?.is_preferred ? 'checked' : ''}
          style="width:auto;padding:0;margin:0;cursor:pointer"> Preferred
      </label>
      <button onclick="this.closest('.supplier-row').remove()"
        style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;line-height:1;padding:0 4px;flex-shrink:0">×</button>
    </div>
    <input class="sup-notes" placeholder="Notes (optional)" value="${s?.notes || ''}"
      style="margin-top:6px">`;
  list.appendChild(row);
}

async function saveInvItem() {
  const id      = document.getElementById('inv-id').value;
  const section = document.getElementById('inv-section').value;
  const supRows = document.querySelectorAll('.supplier-row');

  // Use preferred supplier price as default cost
  let defaultCost = parseFloat(document.getElementById('inv-cost').value) || 0;
  supRows.forEach(r => {
    if (r.querySelector('.sup-preferred')?.checked) {
      const c = parseFloat(r.querySelector('.sup-cost')?.value);
      if (!isNaN(c) && c > 0) defaultCost = c;
    }
  });
  // If no preferred, use first supplier price
  if (!defaultCost && supRows.length) {
    const c = parseFloat(supRows[0].querySelector('.sup-cost')?.value);
    if (!isNaN(c) && c > 0) defaultCost = c;
  }

  const item = {
    restaurant_id: currentRestaurantId,
    section,
    name:          document.getElementById('inv-name').value.trim(),
    category:      document.getElementById('inv-cat').value.trim(),
    unit:          document.getElementById('inv-unit').value,
    qty:           parseFloat(document.getElementById('inv-qty').value) || 0,
    par_level:     parseFloat(document.getElementById('inv-par').value) || 0,
    cost_per_unit: defaultCost,
    supplier:      '',
    updated_at:    new Date().toISOString()
  };
  if (!item.name) return;

  let itemId = id;
  if (id) {
    await sb.from('inventory').update(item).eq('id', id);
  } else {
    const { data } = await sb.from('inventory').insert(item).select().single();
    itemId = data?.id;
  }

  // Save each supplier row
  if (itemId) {
    for (const row of supRows) {
      const supId   = row.querySelector('.sup-id')?.value;
      const supName = row.querySelector('.sup-name')?.value?.trim();
      const supCost = parseFloat(row.querySelector('.sup-cost')?.value) || 0;
      const supPref = row.querySelector('.sup-preferred')?.checked || false;
      const supNote = row.querySelector('.sup-notes')?.value?.trim() || '';
      if (!supName) continue;
      if (supId) {
        await sb.from('item_suppliers').update({
          supplier_name: supName, cost_per_unit: supCost,
          is_preferred: supPref, notes: supNote
        }).eq('id', supId);
      } else {
        await sb.from('item_suppliers').insert({
          inventory_id: itemId, supplier_name: supName,
          cost_per_unit: supCost, is_preferred: supPref, notes: supNote
        });
      }
    }
  }

  showToast();
  closeModal('inv-modal');
  renderInv(section);
  clearInvCache();
}

async function deleteInvItem(id, section) {
  if (!confirm('Delete this item?')) return;
  await sb.from('inventory').delete().eq('id', id);
  showToast();
  renderInv(section);
}

// renderInv is defined in inventory.js
// v4.2

// ─── RECIPES ───────────────────────────────────────────────────────
function recCalcPct() {
  const cost = parseFloat(document.getElementById('rec-cost').value) || 0;
  const price = parseFloat(document.getElementById('rec-price').value) || 0;
  const el = document.getElementById('rec-fc-preview');
  if (cost > 0 && price > 0) {
    const pct = Math.round(cost / price * 100);
    const cls = pct <= 25 ? 'cost-good' : pct <= 32 ? 'cost-ok' : 'cost-bad';
    el.innerHTML = `Food Cost: <span class="${cls}">${pct}%</span>`;
  } else { el.innerHTML = ''; }
}

async function saveRecipe() {
  const id = document.getElementById('rec-id').value;
  const rec = {
    restaurant_id: currentRestaurantId,
    section: 'kitchen',
    name: document.getElementById('rec-name').value.trim(),
    category: document.getElementById('rec-cat').value,
    serves: parseInt(document.getElementById('rec-serves').value) || 1,
    plate_cost: parseFloat(document.getElementById('rec-cost').value) || 0,
    menu_price: parseFloat(document.getElementById('rec-price').value) || 0,
    ingredients: document.getElementById('rec-ingredients').value.trim(),
    method: document.getElementById('rec-method').value.trim(),
    updated_at: new Date().toISOString()
  };
  if (!rec.name) return;
  if (id) {
    await sb.from('recipes').update(rec).eq('id', id);
  } else {
    await sb.from('recipes').insert(rec);
  }
  showToast();
  closeModal('recipe-modal');
  document.getElementById('rec-id').value = '';
  renderRecipes();
}

async function renderRecipes() {
  if (!currentRestaurantId) return;
  const { data } = await sb.from('recipes').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .or('section.eq.kitchen,section.is.null')
    .order('name');
  const recs = data || [];
  const grid = document.getElementById('recipe-grid');
  const empty = document.getElementById('recipes-empty');
  if (!recs.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  grid.innerHTML = recs.map(r => {
    const fc = r.plate_cost > 0 && r.menu_price > 0 ? Math.round(r.plate_cost / r.menu_price * 100) : null;
    const fcBadge = fc
      ? `<span class="badge ${fc <= 25 ? 'badge-green' : fc <= 32 ? 'badge-amber' : 'badge-red'}">${fc}% FC</span>`
      : '<span class="badge badge-blue">No price</span>';
    return `<div class="recipe-card" onclick="viewRecipe('${r.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><div class="recipe-name">${r.name}</div><div class="recipe-meta">${r.category} · Serves ${r.serves}</div></div>
        ${fcBadge}
      </div>
      <div class="tag-row">
        ${r.plate_cost ? `<span class="badge badge-blue" style="font-size:10px">$${r.plate_cost.toFixed(2)} cost</span>` : ''}
        ${r.menu_price ? `<span class="badge badge-teal" style="font-size:10px">$${r.menu_price.toFixed(2)} price</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function viewRecipe(id) {
  const { data: r } = await sb.from('recipes').select('*').eq('id', id).single();
  if (!r) return;
  const fc = r.plate_cost > 0 && r.menu_price > 0 ? Math.round(r.plate_cost / r.menu_price * 100) : null;
  document.getElementById('vr-content').innerHTML = `
    <div class="modal-title">${r.name}</div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <span class="badge badge-amber">${r.category}</span>
      <span class="badge badge-teal">Serves ${r.serves}</span>
      ${fc ? `<span class="badge ${fc <= 25 ? 'badge-green' : fc <= 32 ? 'badge-amber' : 'badge-red'}">${fc}% Food Cost</span>` : ''}
    </div>
    ${r.plate_cost || r.menu_price ? `<div class="cost-box" style="margin-bottom:14px">
      ${r.plate_cost ? `<div class="cost-row"><span style="color:var(--muted)">Plate Cost</span><span>$${r.plate_cost.toFixed(2)}</span></div>` : ''}
      ${r.menu_price ? `<div class="cost-row"><span style="color:var(--muted)">Menu Price</span><span>$${r.menu_price.toFixed(2)}</span></div>` : ''}
      ${r.plate_cost && r.menu_price ? `<div class="cost-row cost-row-total"><span>Gross Profit</span><span style="color:var(--green)">$${(r.menu_price - r.plate_cost).toFixed(2)}</span></div>` : ''}
    </div>` : ''}
    ${r.ingredients ? `<div style="font-size:13px;font-weight:600;margin-bottom:8px">Ingredients</div><div style="background:var(--bg3);border-radius:8px;padding:12px;font-size:13px;color:var(--muted);white-space:pre-line;margin-bottom:14px">${r.ingredients}</div>` : ''}
    ${r.method ? `<div style="font-size:13px;font-weight:600;margin-bottom:8px">Method</div><div style="font-size:13px;color:var(--muted);line-height:1.7;white-space:pre-line">${r.method}</div>` : ''}`;
  document.getElementById('vr-delete-btn').onclick = async () => {
    if (!confirm('Delete this recipe?')) return;
    await sb.from('recipes').delete().eq('id', id);
    showToast(); closeModal('view-recipe'); renderRecipes();
  };
  document.getElementById('vr-edit-btn').onclick = () => {
    closeModal('view-recipe');
    document.getElementById('rec-id').value = r.id;
    document.getElementById('rec-name').value = r.name;
    document.getElementById('rec-cat').value = r.category;
    document.getElementById('rec-serves').value = r.serves;
    document.getElementById('rec-cost').value = r.plate_cost || '';
    document.getElementById('rec-price').value = r.menu_price || '';
    document.getElementById('rec-ingredients').value = r.ingredients || '';
    document.getElementById('rec-method').value = r.method || '';
    recCalcPct();
    openModal('recipe-modal');
  };
  openModal('view-recipe');
}

// ─── FOOD COST CALC ─────────────────────────────────────────────────
function fcAddRow(name = '', qty = 1, unit = 'oz', cost = 0) {
  const row = document.createElement('div');
  row.className = 'ing-row-build';
  row.innerHTML = `<input placeholder="Ingredient" value="${name}"><input type="number" value="${qty}" min="0" step="0.01" oninput="fcCalc()"><select oninput="fcCalc()"><option>oz</option><option>lbs</option><option>kg</option><option>g</option><option>cups</option><option>tbsp</option><option>tsp</option><option>ea</option><option>bottles</option></select><input type="number" step="0.01" value="${cost}" min="0" oninput="fcCalc()"><button onclick="this.parentElement.remove();fcCalc()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;line-height:1">×</button>`;
  row.querySelector('select').value = unit;
  document.getElementById('fc-rows').appendChild(row);
  fcCalc();
}

function fcCalc() {
  const rows = document.querySelectorAll('.ing-row-build');
  let raw = 0;
  rows.forEach(r => {
    const inputs = r.querySelectorAll('input[type=number]');
    raw += (parseFloat(inputs[0]?.value) || 0) * (parseFloat(inputs[1]?.value) || 0);
  });
  const wastePct = (parseFloat(document.getElementById('fc-waste').value) || 0) / 100;
  const waste = raw * wastePct;
  const total = raw + waste + 0.5;
  const target = parseInt(document.getElementById('fc-target').value) || 28;
  document.getElementById('fc-target-lbl').textContent = target + '%';
  const suggested = total / (target / 100);
  document.getElementById('fc-raw').textContent = '$' + raw.toFixed(2);
  document.getElementById('fc-waste-cost').textContent = '$' + waste.toFixed(2);
  document.getElementById('fc-total').textContent = '$' + total.toFixed(2);
  document.getElementById('fc-price').textContent = '$' + suggested.toFixed(2);
  document.getElementById('fc-gp').textContent = '$' + (suggested - total).toFixed(2);
  const pctEl = document.getElementById('fc-actual-pct');
  pctEl.textContent = target + '%';
  pctEl.className = target <= 25 ? 'cost-good' : target <= 32 ? 'cost-ok' : 'cost-bad';
}

async function fcSaveAsRecipe() {
  const name = document.getElementById('fc-dish').value.trim();
  if (!name) return alert('Enter a dish name first.');
  const total = parseFloat(document.getElementById('fc-total').textContent.replace('$', '')) || 0;
  const price = parseFloat(document.getElementById('fc-price').textContent.replace('$', '')) || 0;
  const rows = document.querySelectorAll('.ing-row-build');
  const ings = [];
  rows.forEach(r => {
    const nameIn = r.querySelector('input:not([type=number])')?.value;
    const inputs = r.querySelectorAll('input[type=number]');
    const sel = r.querySelector('select');
    if (nameIn) ings.push(`${inputs[0]?.value || ''} ${sel?.value || ''} ${nameIn} @ $${inputs[1]?.value || 0}/unit`);
  });
  await sb.from('recipes').insert({
    restaurant_id: currentRestaurantId,
    name, category: 'Main',
    serves: parseInt(document.getElementById('fc-serves').value) || 1,
    plate_cost: parseFloat(total.toFixed(2)),
    menu_price: parseFloat(price.toFixed(2)),
    ingredients: ings.join('\n'), method: ''
  });
  showToast();
  alert('Recipe saved to Recipe Book!');
}

// ─── MENU PRICING ──────────────────────────────────────────────────
async function renderMenuPricing() {
  if (!currentRestaurantId) return;
  const { data } = await sb.from('recipes').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .gt('plate_cost', 0).order('name');
  const recs = data || [];
  const tbody = document.getElementById('mp-tbody');
  const empty = document.getElementById('mp-empty');
  if (!recs.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  const target = parseInt(document.getElementById('mp-target')?.value || 28);
  tbody.innerHTML = recs.map(r => {
    const sug = r.plate_cost / (target / 100);
    const cur = r.menu_price || 0;
    const diff = cur - sug;
    const varStr = cur > 0
      ? (diff > 0 ? `<span class="cost-good">Over +$${diff.toFixed(2)}</span>` : `<span class="cost-bad">Under -$${Math.abs(diff).toFixed(2)}</span>`)
      : '<span style="color:var(--muted)">Not set</span>';
    return `<tr>
      <td>${r.name}</td><td>${r.category}</td>
      <td>$${r.plate_cost.toFixed(2)}</td>
      <td>${cur > 0 ? '$' + cur.toFixed(2) : '—'}</td>
      <td>$${sug.toFixed(2)}</td>
      <td>${varStr}</td>
      <td><button class="btn btn-primary btn-sm" onclick="mpAccept('${r.id}',${sug.toFixed(2)})">Accept</button></td>
    </tr>`;
  }).join('');
}

async function mpAccept(id, price) {
  await sb.from('recipes').update({ menu_price: price }).eq('id', id);
  showToast(); renderMenuPricing();
}

// ─── SOPs ──────────────────────────────────────────────────────────
function openSopModal(section, sop = null) {
  document.getElementById('sop-section-input').value = section;
  if (sop) {
    document.getElementById('sop-id-input').value = sop.id;
    document.getElementById('sop-title-input').value = sop.title;
    document.getElementById('sop-tag-input').value = sop.tag || '';
    document.getElementById('sop-steps-input').value = (sop.steps || []).join('\n');
  } else {
    ['sop-id-input', 'sop-title-input', 'sop-tag-input', 'sop-steps-input'].forEach(id => document.getElementById(id).value = '');
  }
  openModal('sop-modal');
}

async function saveSop() {
  const id = document.getElementById('sop-id-input').value;
  const section = document.getElementById('sop-section-input').value;
  const sop = {
    restaurant_id: currentRestaurantId,
    section,
    title: document.getElementById('sop-title-input').value.trim(),
    tag: document.getElementById('sop-tag-input').value.trim(),
    steps: document.getElementById('sop-steps-input').value.split('\n').map(s => s.trim()).filter(Boolean)
  };
  if (!sop.title) return;
  if (id) { await sb.from('sops').update(sop).eq('id', id); }
  else { await sb.from('sops').insert(sop); }
  showToast(); closeModal('sop-modal'); renderSops(section);
}

async function renderSops(section) {
  if (!currentRestaurantId) return;
  const { data } = await sb.from('sops').select('*')
    .eq('restaurant_id', currentRestaurantId).eq('section', section).order('title');
  const items = data || [];
  const list = document.getElementById(section + '-sop-list');
  const empty = document.getElementById(section + '-empty');
  const tagColors = { Opening: 'badge-teal', Closing: 'badge-amber', Service: 'badge-blue', Safety: 'badge-red', Cleaning: 'badge-blue', Allergens: 'badge-red' };
  if (!items.length) { list.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';
  list.innerHTML = items.map(sop => `
    <div class="sop-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          ${sop.tag ? `<span class="badge ${tagColors[sop.tag] || 'badge-blue'}" style="margin-bottom:6px">${sop.tag}</span>` : ''}
          <div style="font-size:14px;font-weight:600">${sop.title}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="expand-btn" onclick="this.closest('.sop-card').querySelector('.sop-steps').classList.toggle('open');this.textContent=this.closest('.sop-card').querySelector('.sop-steps').classList.contains('open')?'▲ Hide':'▼ View Steps'">▼ View Steps</button>
          <button class="btn btn-ghost btn-sm" onclick='openSopModal("${section}", ${JSON.stringify(sop).replace(/'/g, "\\'")})'>Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSop('${sop.id}','${section}')">Del</button>
        </div>
      </div>
      <div class="sop-steps">
        ${(sop.steps || []).map((s, i) => `<div class="sop-step"><div class="sop-num">${i + 1}</div><div>${s}</div></div>`).join('')}
      </div>
    </div>`).join('');
}

async function deleteSop(id, section) {
  if (!confirm('Delete this SOP?')) return;
  await sb.from('sops').delete().eq('id', id);
  showToast(); renderSops(section);
}

// ─── P&L ───────────────────────────────────────────────────────────
async function savePnl() {
  const recordId = document.getElementById('pnl-record-id').value;
  const pnl = {
    restaurant_id: currentRestaurantId,
    month: document.getElementById('pnl-month-in').value,
    revenue: parseFloat(document.getElementById('pnl-rev-in').value) || 0,
    food_cogs: parseFloat(document.getElementById('pnl-fcogs-in').value) || 0,
    bar_cogs: parseFloat(document.getElementById('pnl-bcogs-in').value) || 0,
    boh_labor: parseFloat(document.getElementById('pnl-boh-in').value) || 0,
    foh_labor: parseFloat(document.getElementById('pnl-foh-in').value) || 0,
    rent: parseFloat(document.getElementById('pnl-rent-in').value) || 0,
    other_expenses: parseFloat(document.getElementById('pnl-other-in').value) || 0,
    updated_at: new Date().toISOString()
  };
  if (recordId) { await sb.from('financials').update(pnl).eq('id', recordId); }
  else { await sb.from('financials').insert(pnl); }
  showToast(); closeModal('pnl-modal'); renderPnl();
}

async function renderPnl() {
  if (!currentRestaurantId) return;
  const { data } = await sb.from('financials').select('*')
    .eq('restaurant_id', currentRestaurantId).order('created_at', { ascending: false }).limit(1);
  const pnl = data?.[0];
  const empty = document.getElementById('pnl-empty');
  if (!pnl) {
    ['pnl-rev', 'pnl-cogs', 'pnl-labor', 'pnl-net'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    if (empty) empty.style.display = 'block';
    document.getElementById('pnl-benchmarks').innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  document.getElementById('pnl-record-id').value = pnl.id;
  const cogs = pnl.food_cogs + pnl.bar_cogs;
  const labor = pnl.boh_labor + pnl.foh_labor;
  const net = pnl.revenue - cogs - labor - pnl.rent - pnl.other_expenses;
  const fmt = v => '$' + Math.round(v).toLocaleString();
  document.getElementById('pnl-rev').textContent = fmt(pnl.revenue);
  document.getElementById('pnl-cogs').textContent = fmt(cogs);
  document.getElementById('pnl-labor').textContent = fmt(labor);
  document.getElementById('pnl-net').textContent = fmt(net);
  const metrics = [
    { label: 'Food Cost %', val: pnl.revenue ? Math.round(pnl.food_cogs / pnl.revenue * 100) + '%' : '—', target: '28%', pct: pnl.revenue ? pnl.food_cogs / pnl.revenue : 0, color: 'var(--amber)' },
    { label: 'Bar Cost %', val: pnl.revenue ? Math.round(pnl.bar_cogs / pnl.revenue * 100) + '%' : '—', target: '22%', pct: pnl.revenue ? pnl.bar_cogs / pnl.revenue : 0, color: 'var(--blue)' },
    { label: 'Labor %', val: pnl.revenue ? Math.round(labor / pnl.revenue * 100) + '%' : '—', target: '30%', pct: pnl.revenue ? labor / pnl.revenue : 0, color: 'var(--teal)' },
    { label: 'Prime Cost', val: pnl.revenue ? Math.round((cogs + labor) / pnl.revenue * 100) + '%' : '—', target: '60%', pct: pnl.revenue ? (cogs + labor) / pnl.revenue : 0, color: 'var(--amber)' },
    { label: 'Net Margin', val: pnl.revenue ? Math.round(net / pnl.revenue * 100) + '%' : '—', target: '15%', pct: pnl.revenue ? net / pnl.revenue : 0, color: 'var(--green)' },
  ];
  document.getElementById('pnl-benchmarks').innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">` +
    metrics.map(m => `<div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
        <span>${m.label}</span><span style="color:${m.color}">${m.val} <span style="color:var(--muted);font-size:11px">(target ${m.target})</span></span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, Math.round(m.pct * 100 * 3))}%;background:${m.color}"></div></div>
    </div>`).join('') + '</div>';

  // Pre-fill modal
  document.getElementById('pnl-month-in').value = pnl.month || '';
  document.getElementById('pnl-rev-in').value = pnl.revenue;
  document.getElementById('pnl-fcogs-in').value = pnl.food_cogs;
  document.getElementById('pnl-bcogs-in').value = pnl.bar_cogs;
  document.getElementById('pnl-boh-in').value = pnl.boh_labor;
  document.getElementById('pnl-foh-in').value = pnl.foh_labor;
  document.getElementById('pnl-rent-in').value = pnl.rent;
  document.getElementById('pnl-other-in').value = pnl.other_expenses;
  renderFinanceCharts(pnl);
}

// ─── LABOR ─────────────────────────────────────────────────────────
async function saveLaborPosition() {
  const id = document.getElementById('lab-id').value;
  const pos = {
    restaurant_id: currentRestaurantId,
    position: document.getElementById('lab-pos').value.trim(),
    headcount: parseInt(document.getElementById('lab-count').value) || 1,
    avg_hours: parseFloat(document.getElementById('lab-hrs').value) || 0,
    avg_rate: parseFloat(document.getElementById('lab-rate').value) || 0
  };
  if (!pos.position) return;
  if (id) { await sb.from('labor').update(pos).eq('id', id); }
  else { await sb.from('labor').insert(pos); }
  showToast(); closeModal('labor-modal');
  document.getElementById('lab-id').value = '';
  renderLabor();
}

async function renderLabor() {
  if (!currentRestaurantId) return;
  const { data } = await sb.from('labor').select('*')
    .eq('restaurant_id', currentRestaurantId).order('position');
  const items = data || [];
  const tbody = document.getElementById('labor-tbody');
  const empty = document.getElementById('labor-empty');
  if (!items.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  let total = 0;
  tbody.innerHTML = items.map(p => {
    const weekly = p.headcount * p.avg_hours * p.avg_rate;
    total += weekly;
    return `<tr>
      <td>${p.position}</td><td>${p.headcount}</td><td>${p.avg_hours}</td>
      <td>$${(p.avg_rate || 0).toFixed(2)}/hr</td><td>$${Math.round(weekly).toLocaleString()}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="editLabor('${p.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" style="margin-left:4px" onclick="deleteLabor('${p.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
  tbody.innerHTML += `<tr style="font-weight:600;border-top:1px solid var(--border2)"><td colspan="4" style="color:var(--muted)">Total Weekly Labor</td><td style="color:var(--amber)">$${Math.round(total).toLocaleString()}</td><td></td></tr>`;
}

async function editLabor(id) {
  const { data: p } = await sb.from('labor').select('*').eq('id', id).single();
  if (!p) return;
  document.getElementById('lab-id').value = p.id;
  document.getElementById('lab-pos').value = p.position;
  document.getElementById('lab-count').value = p.headcount;
  document.getElementById('lab-hrs').value = p.avg_hours;
  document.getElementById('lab-rate').value = p.avg_rate;
  openModal('labor-modal');
}

async function deleteLabor(id) {
  if (!confirm('Delete this position?')) return;
  await sb.from('labor').delete().eq('id', id);
  showToast(); renderLabor();
}

// ─── BOOT ──────────────────────────────────────────────────────────
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    await initApp(session.user);
  }
  fcAddRow('', 1, 'oz', 0);
})();

// ─── COST CALCULATOR TABS ──────────────────────────────────────────
function switchFcTab(tab) {
  ['kitchen','spirits','beer','wine','cocktail'].forEach(t => {
    document.getElementById('fc-panel-' + t).style.display = t === tab ? 'block' : 'none';
    const btn = document.getElementById('fctab-' + t);
    if (btn) {
      btn.style.borderBottomColor = t === tab ? 'var(--olive)' : 'transparent';
      btn.style.color = t === tab ? 'var(--ivory)' : 'var(--muted)';
    }
  });
}

// ─── SPIRITS ──────────────────────────────────────────────────────
function calcSpirits() {
  const bottleOz   = parseFloat(document.getElementById('sp-bottle-oz')?.value) || 0;
  const bottleCost = parseFloat(document.getElementById('sp-bottle-cost')?.value) || 0;
  const pourOz     = parseFloat(document.getElementById('sp-pour-oz')?.value) || 0;
  const sell       = parseFloat(document.getElementById('sp-sell')?.value) || 0;
  if (!bottleOz || !pourOz) return;
  const costPerOz    = bottleCost / bottleOz;
  const costPerPour  = costPerOz * pourOz;
  const pours        = bottleOz / pourOz;
  const revBottle    = pours * sell;
  const gp           = sell - costPerPour;
  const pct          = sell > 0 ? (costPerPour / sell) * 100 : 0;
  const profitBottle = revBottle - bottleCost;
  document.getElementById('sp-cost-oz').textContent    = '$' + costPerOz.toFixed(3);
  document.getElementById('sp-cost-pour').textContent  = '$' + costPerPour.toFixed(2);
  document.getElementById('sp-pours').textContent      = pours.toFixed(1);
  document.getElementById('sp-rev-bottle').textContent = '$' + revBottle.toFixed(2);
  document.getElementById('sp-gp').textContent         = '$' + gp.toFixed(2);
  document.getElementById('sp-profit-bottle').textContent = '$' + profitBottle.toFixed(2);
  const pctEl = document.getElementById('sp-pct');
  pctEl.textContent = pct.toFixed(1) + '%';
  pctEl.className = pct <= 20 ? 'cost-good' : pct <= 30 ? 'cost-ok' : 'cost-bad';
}

// ─── BEER ─────────────────────────────────────────────────────────
function calcBeer() {
  const format   = document.getElementById('beer-format')?.value;
  const cost     = parseFloat(document.getElementById('beer-cost')?.value) || 0;
  const units    = parseFloat(document.getElementById('beer-units')?.value) || 1;
  const sell     = parseFloat(document.getElementById('beer-sell')?.value) || 0;
  const unitField = document.getElementById('beer-unit-field');
  if (unitField) unitField.style.display = format === 'case' ? 'block' : 'none';
  const costUnit = format === 'case' ? cost / units : cost;
  const gp       = sell - costUnit;
  const pct      = sell > 0 ? (costUnit / sell) * 100 : 0;
  const margin   = sell > 0 ? (gp / sell) * 100 : 0;
  document.getElementById('beer-cost-unit').textContent = '$' + costUnit.toFixed(2);
  document.getElementById('beer-sell-disp').textContent = sell > 0 ? '$' + sell.toFixed(2) : '—';
  document.getElementById('beer-gp').textContent        = sell > 0 ? '$' + gp.toFixed(2) : '—';
  document.getElementById('beer-margin').textContent    = sell > 0 ? margin.toFixed(1) + '%' : '—';
  const pctEl = document.getElementById('beer-pct');
  pctEl.textContent = sell > 0 ? pct.toFixed(1) + '%' : '—';
  if (sell > 0) pctEl.className = pct <= 25 ? 'cost-good' : pct <= 35 ? 'cost-ok' : 'cost-bad';
}

// ─── WINE ─────────────────────────────────────────────────────────
function calcWine() {
  const bottleCost  = parseFloat(document.getElementById('wine-cost')?.value) || 0;
  const pourOz      = parseFloat(document.getElementById('wine-pour')?.value) || 5;
  const sellGlass   = parseFloat(document.getElementById('wine-sell')?.value) || 0;
  const sellBottle  = parseFloat(document.getElementById('wine-sell-bottle')?.value) || 0;
  const bottleOz    = 25.4; // 750ml in oz
  const glasses     = pourOz === 750 ? 1 : bottleOz / pourOz;
  const costGlass   = bottleCost / glasses;
  const revGlass    = glasses * sellGlass;
  const profitGlass = revGlass - bottleCost;
  const pctGlass    = sellGlass > 0 ? (costGlass / sellGlass) * 100 : 0;
  const profitBtl   = sellBottle - bottleCost;
  const pctBtl      = sellBottle > 0 ? (bottleCost / sellBottle) * 100 : 0;
  document.getElementById('wine-glasses').textContent      = glasses.toFixed(1);
  document.getElementById('wine-cost-glass').textContent   = '$' + costGlass.toFixed(2);
  document.getElementById('wine-rev').textContent          = sellGlass > 0 ? '$' + revGlass.toFixed(2) : '—';
  document.getElementById('wine-profit').textContent       = sellGlass > 0 ? '$' + profitGlass.toFixed(2) : '—';
  document.getElementById('wine-bottle-profit').textContent= sellBottle > 0 ? '$' + profitBtl.toFixed(2) : '—';
  const pctEl  = document.getElementById('wine-pct');
  const pctEl2 = document.getElementById('wine-bottle-pct');
  pctEl.textContent  = sellGlass > 0 ? pctGlass.toFixed(1) + '%' : '—';
  pctEl2.textContent = sellBottle > 0 ? pctBtl.toFixed(1) + '%' : '—';
  if (sellGlass > 0)   pctEl.className  = pctGlass <= 25 ? 'cost-good' : pctGlass <= 33 ? 'cost-ok' : 'cost-bad';
  if (sellBottle > 0)  pctEl2.className = pctBtl <= 40 ? 'cost-good' : pctBtl <= 50 ? 'cost-ok' : 'cost-bad';
}

// ─── COCKTAILS ────────────────────────────────────────────────────
function ckAddRow(name='', qty=1, unit='oz', cost=0) {
  const row = document.createElement('div');
  row.className = 'ing-row-build';
  row.innerHTML = `
    <div style="position:relative;flex:2">
      <input class="ing-name-input" placeholder="Search inventory..." value="${name}"
        oninput="ingSearchInput(this)" onfocus="ingSearchInput(this)"
        onblur="setTimeout(()=>closeIngDropdown(this),200)"
        data-inv-id="" style="width:100%">
      <div class="ing-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg3);border:1px solid var(--border2);border-radius:2px;z-index:50;max-height:160px;overflow-y:auto"></div>
    </div>
    <input type="number" class="ing-qty" value="${qty}" min="0" step="0.01" oninput="calcCocktail()" style="flex:0 0 60px">
    <input class="ing-unit" value="${unit}" placeholder="oz" style="flex:0 0 50px">
    <input type="number" class="ing-cost" step="0.01" value="${cost}" min="0" oninput="calcCocktail()" placeholder="$/unit" style="flex:0 0 75px">
    <button onclick="this.closest('.ing-row-build').remove();calcCocktail()"
      style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;line-height:1;flex:0 0 24px">×</button>`;
  document.getElementById('ck-rows').appendChild(row);
  calcCocktail();
}

function calcCocktail() {
  const rows = document.querySelectorAll('#ck-rows .ing-row-build');
  let ingCost = 0;
  rows.forEach(r => {
    const qty  = parseFloat(r.querySelector('.ing-qty')?.value) || 0;
    const cost = parseFloat(r.querySelector('.ing-cost')?.value) || 0;
    ingCost += qty * cost;
  });
  const misc  = parseFloat(document.getElementById('ck-misc')?.value) || 0;
  const sell  = parseFloat(document.getElementById('ck-sell')?.value) || 0;
  const total = ingCost + misc;
  const gp    = sell - total;
  const pct   = sell > 0 ? (total / sell) * 100 : 0;
  document.getElementById('ck-ing-cost').textContent = '$' + ingCost.toFixed(2);
  document.getElementById('ck-misc-disp').textContent = '$' + misc.toFixed(2);
  document.getElementById('ck-total').textContent     = '$' + total.toFixed(2);
  document.getElementById('ck-sell-disp').textContent = sell > 0 ? '$' + sell.toFixed(2) : '—';
  document.getElementById('ck-gp').textContent        = sell > 0 ? '$' + gp.toFixed(2) : '—';
  const pctEl = document.getElementById('ck-pct');
  pctEl.textContent = sell > 0 ? pct.toFixed(1) + '%' : '—';
  if (sell > 0) pctEl.className = pct <= 20 ? 'cost-good' : pct <= 28 ? 'cost-ok' : 'cost-bad';
}

async function ckSaveAsRecipe() {
  const name = document.getElementById('ck-name')?.value.trim();
  if (!name) return alert('Enter a cocktail name first.');
  const total = parseFloat(document.getElementById('ck-total')?.textContent.replace('$','')) || 0;
  const sell  = parseFloat(document.getElementById('ck-sell')?.value) || 0;
  const rows  = document.querySelectorAll('#ck-rows .ing-row-build');
  const ings  = [];
  rows.forEach(r => {
    const n    = r.querySelector('.ing-name-input')?.value;
    const qty  = r.querySelector('.ing-qty')?.value;
    const unit = r.querySelector('.ing-unit')?.value;
    const cost = r.querySelector('.ing-cost')?.value;
    if (n) ings.push(`${qty} ${unit} ${n} @ $${cost}/unit`);
  });
  await sb.from('recipes').insert({
    restaurant_id: currentRestaurantId,
    section: 'bar',
    name, category: 'Cocktail',
    serves: 1,
    plate_cost: parseFloat(total.toFixed(2)),
    menu_price: parseFloat(sell.toFixed(2)),
    ingredients: ings.join('\n'), method: ''
  });
  showToast();
  alert('Cocktail saved to Recipe Book!');
}

// ─── FINANCE CHARTS ────────────────────────────────────────────────
let _chartDonut = null;
let _chartBar   = null;

function renderFinanceCharts(pnl) {
  if (!pnl) {
    document.getElementById('pnl-charts-empty').style.display = 'block';
    document.getElementById('pnl-charts-wrap').style.display  = 'none';
    return;
  }
  document.getElementById('pnl-charts-empty').style.display = 'none';
  document.getElementById('pnl-charts-wrap').style.display  = 'block';

  const rev    = pnl.revenue || 0;
  const fcogs  = pnl.food_cogs || 0;
  const bcogs  = pnl.bar_cogs || 0;
  const boh    = pnl.boh_labor || 0;
  const foh    = pnl.foh_labor || 0;
  const rent   = pnl.rent || 0;
  const other  = pnl.other_expenses || 0;
  const cogs   = fcogs + bcogs;
  const labor  = boh + foh;
  const net    = rev - cogs - labor - rent - other;

  const palette = {
    food:   '#766957',
    bar:    '#8f7e68',
    boh:    '#4a6fa5',
    foh:    '#6b8fc0',
    rent:   '#3a8c7e',
    other:  '#5a7a70',
    net:    '#4e9a6f',
    grid:   'rgba(255,255,255,0.06)',
    text:   '#7a7671'
  };

  const chartDefaults = {
    plugins: { legend: { labels: { color: palette.text, font: { family: 'Outfit', size: 11 } } } }
  };

  // ── Donut — cost breakdown ─────────────────────────────────────
  const donutCtx = document.getElementById('chart-donut');
  if (_chartDonut) _chartDonut.destroy();
  _chartDonut = new Chart(donutCtx, {
    type: 'doughnut',
    data: {
      labels: ['Food COGS', 'Bar COGS', 'BOH Labor', 'FOH Labor', 'Rent/Utils', 'Other', 'Net Income'],
      datasets: [{
        data: [fcogs, bcogs, boh, foh, rent, other, Math.max(net, 0)],
        backgroundColor: [palette.food, palette.bar, palette.boh, palette.foh, palette.rent, palette.other, palette.net],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      ...chartDefaults,
      cutout: '65%',
      plugins: {
        ...chartDefaults.plugins,
        tooltip: {
          callbacks: {
            label: ctx => ` $${Math.round(ctx.raw).toLocaleString()} (${rev > 0 ? Math.round(ctx.raw/rev*100) : 0}%)`
          }
        }
      }
    }
  });

  // ── Bar chart — revenue vs costs ──────────────────────────────
  const barCtx = document.getElementById('chart-bar');
  if (_chartBar) _chartBar.destroy();
  _chartBar = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: ['Revenue', 'Food Cost', 'Bar Cost', 'Labor', 'Rent/Other', 'Net'],
      datasets: [{
        data: [rev, fcogs, bcogs, labor, rent + other, Math.max(net, 0)],
        backgroundColor: [palette.net, palette.food, palette.bar, palette.boh, palette.rent, '#4e9a6f'],
        borderWidth: 0,
        borderRadius: 2
      }]
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` $${Math.round(ctx.raw).toLocaleString()}`
          }
        }
      },
      scales: {
        x: { ticks: { color: palette.text, font: { family: 'Outfit', size: 10 } }, grid: { color: palette.grid } },
        y: { ticks: { color: palette.text, font: { family: 'Outfit', size: 10 }, callback: v => '$' + Math.round(v/1000) + 'k' }, grid: { color: palette.grid } }
      }
    }
  });

  // ── KPI tiles ─────────────────────────────────────────────────
  const foodPct   = rev > 0 ? (fcogs / rev * 100) : 0;
  const laborPct  = rev > 0 ? (labor / rev * 100) : 0;
  const primePct  = rev > 0 ? ((cogs + labor) / rev * 100) : 0;

  const setKpi = (id, statusId, val, low, high) => {
    const el = document.getElementById(id);
    const st = document.getElementById(statusId);
    if (!el) return;
    el.textContent = val.toFixed(1) + '%';
    el.style.color = val <= low ? 'var(--green)' : val <= high ? 'var(--amber)' : '#e07070';
    if (st) st.style.color = val <= low ? 'var(--green)' : val <= high ? 'var(--amber)' : '#e07070';
  };
  setKpi('kpi-food-pct',  'kpi-food-status',  foodPct,  28, 32);
  setKpi('kpi-labor-pct', 'kpi-labor-status', laborPct, 28, 35);
  setKpi('kpi-prime-pct', 'kpi-prime-status', primePct, 55, 60);
}

// ─── ORDER HISTORY ─────────────────────────────────────────────────
async function renderOrderHistory() {
  if (!currentRestaurantId) return;
  const section = document.getElementById('oh-section-filter')?.value || '';
  let query = sb.from('orders').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false });
  if (section) query = query.eq('section', section);
  const { data } = await query;
  const orders = data || [];
  const empty = document.getElementById('oh-empty');
  const list  = document.getElementById('oh-list');
  if (!orders.length) {
    if (empty) empty.style.display = 'block';
    if (list)  list.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = orders.map(order => {
    const date = new Date(order.submitted_at).toLocaleDateString('en-US', {weekday:'short',month:'short',day:'numeric',year:'numeric'});
    const label = order.section === 'kitchen' ? 'Kitchen' : order.section === 'bar' ? 'Bar' : 'Misc';
    const items = order.items || [];
    return `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
        <div>
          <div style="font-size:14px;font-weight:400;color:var(--ivory)">${label} Order</div>
          <div style="font-size:11px;font-weight:300;color:var(--muted);margin-top:2px">${date} · ${items.length} item${items.length!==1?'s':''}</div>
        </div>
        <span class="badge badge-green">Submitted</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr>
          <th style="text-align:left;padding:6px 10px;font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);border-bottom:1px solid var(--border)">Item</th>
          <th style="text-align:center;padding:6px 10px;font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);border-bottom:1px solid var(--border)">Qty</th>
          <th style="text-align:left;padding:6px 10px;font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);border-bottom:1px solid var(--border)">Unit</th>
          <th style="text-align:left;padding:6px 10px;font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);border-bottom:1px solid var(--border)">Supplier</th>
        </tr></thead>
        <tbody>
          ${items.map(item => `<tr>
            <td style="padding:9px 10px;border-bottom:1px solid rgba(255,255,255,0.03);font-weight:300;color:var(--ivory)">${item.name}</td>
            <td style="padding:9px 10px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center;color:var(--ivory)">${item.qty}</td>
            <td style="padding:9px 10px;border-bottom:1px solid rgba(255,255,255,0.03);color:var(--muted)">${item.unit}</td>
            <td style="padding:9px 10px;border-bottom:1px solid rgba(255,255,255,0.03);color:var(--muted)">${item.supplier||'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }).join('');
}

// ─── QUICK MULTI-ITEM ADD ──────────────────────────────────────────
function openBulkAddItems() {
  closeModal('inv-modal');
  const section = document.getElementById('inv-section')?.value || _invSection;
  setTimeout(() => openBulkImport(section), 200);
}



// ═══════════════════════════════════════════════════════════════════
// ─── HR MODULE ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

let _currentEmployee = null;

async function renderHr() {
  if (!currentRestaurantId) return;
  const { data: emps } = await sb.from('employees').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .order('full_name');
  const employees = emps || [];
  const grid  = document.getElementById('hr-grid');
  const empty = document.getElementById('hr-empty');

  // Load certifications for expiry alerts
  const { data: certs } = await sb.from('employee_certifications').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .eq('status', 'active');
  const allCerts = certs || [];
  const today = new Date();
  const in30  = new Date(); in30.setDate(today.getDate() + 30);
  const expiring = allCerts.filter(c => new Date(c.expiry_date) <= in30);

  // Show alerts
  const alertsEl = document.getElementById('hr-alerts');
  if (alertsEl && expiring.length) {
    alertsEl.innerHTML = expiring.map(c => {
      const exp = new Date(c.expiry_date);
      const days = Math.ceil((exp - today) / 86400000);
      const expired = days < 0;
      return `<div class="alert alert-${expired?'red':'amber'}" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
        <span>⚠️ <strong>${c.cert_type}</strong> ${expired?'expired':'expires in '+days+' day'+( days!==1?'s':'')} — employee ID: ${c.employee_id.slice(0,8)}...</span>
      </div>`;
    }).join('');
  } else if (alertsEl) {
    alertsEl.innerHTML = '';
  }

  if (!employees.length) {
    if (empty) empty.style.display = 'block';
    if (grid)  grid.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const statusColor = { active: 'var(--green)', inactive: 'var(--muted)', on_leave: 'var(--olive)' };
  const deptColor   = { Kitchen: '#4a6fa5', Bar: '#3a8c7e', FOH: '#766957', Management: '#8f7e68' };

  grid.innerHTML = employees.map(emp => {
    const empCerts = allCerts.filter(c => c.employee_id === emp.id);
    const hasExpiring = empCerts.some(c => new Date(c.expiry_date) <= in30);
    return `<div class="card" style="cursor:pointer;transition:border .15s;position:relative"
      onclick="openEmployeeDetail('${emp.id}')"
      onmouseover="this.style.borderColor='var(--olive)'"
      onmouseout="this.style.borderColor='var(--border)'">
      ${hasExpiring ? `<div style="position:absolute;top:12px;right:12px;width:8px;height:8px;border-radius:50%;background:#e07070"></div>` : ''}
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px">
        <div style="width:42px;height:42px;border-radius:2px;background:var(--olive-bg);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
          ${emp.department === 'Kitchen' ? '👨‍🍳' : emp.department === 'Bar' ? '🍸' : emp.department === 'FOH' ? '🤝' : '👤'}
        </div>
        <div style="min-width:0">
          <div style="font-size:14px;font-weight:400;color:var(--ivory)">${emp.full_name}</div>
          <div style="font-size:11px;font-weight:300;color:var(--muted);margin-top:2px">${emp.role || '—'}</div>
          ${emp.department ? `<span style="font-size:9px;font-weight:400;letter-spacing:1px;text-transform:uppercase;color:${deptColor[emp.department]||'var(--muted)'};margin-top:4px;display:inline-block">${emp.department}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:300">
        <span style="color:var(--muted)">${emp.start_date ? 'Since ' + new Date(emp.start_date).toLocaleDateString('en-US',{month:'short',year:'numeric'}) : 'Start date not set'}</span>
        <span style="color:${statusColor[emp.status]||'var(--muted)'}">${emp.status?.replace('_',' ')||'active'}</span>
      </div>
      ${empCerts.length ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:10px;color:var(--muted)">${empCerts.length} certification${empCerts.length!==1?'s':''} on file</div>` : ''}
    </div>`;
  }).join('');
}

function openHrModal(emp = null) {
  _currentEmployee = emp;
  document.getElementById('hr-modal-title').textContent = emp ? 'Edit Employee' : 'Add Employee';
  document.getElementById('hr-emp-id').value = emp?.id || '';
  document.getElementById('hr-name').value = emp?.full_name || '';
  document.getElementById('hr-role').value = emp?.role || '';
  document.getElementById('hr-dept').value = emp?.department || '';
  document.getElementById('hr-start').value = emp?.start_date || '';
  document.getElementById('hr-email').value = emp?.email || '';
  document.getElementById('hr-phone').value = emp?.phone || '';
  document.getElementById('hr-status').value = emp?.status || 'active';
  document.getElementById('hr-ec-name').value = emp?.emergency_contact_name || '';
  document.getElementById('hr-ec-phone').value = emp?.emergency_contact_phone || '';
  document.getElementById('hr-ec-relation').value = emp?.emergency_contact_relation || '';
  document.getElementById('hr-notes').value = emp?.notes || '';
  openModal('hr-modal');
}

async function saveEmployee() {
  const id   = document.getElementById('hr-emp-id').value;
  const data = {
    restaurant_id: currentRestaurantId,
    full_name: document.getElementById('hr-name').value.trim(),
    role: document.getElementById('hr-role').value.trim(),
    department: document.getElementById('hr-dept').value,
    start_date: document.getElementById('hr-start').value || null,
    email: document.getElementById('hr-email').value.trim(),
    phone: document.getElementById('hr-phone').value.trim(),
    status: document.getElementById('hr-status').value,
    emergency_contact_name: document.getElementById('hr-ec-name').value.trim(),
    emergency_contact_phone: document.getElementById('hr-ec-phone').value.trim(),
    emergency_contact_relation: document.getElementById('hr-ec-relation').value.trim(),
    notes: document.getElementById('hr-notes').value.trim(),
    updated_at: new Date().toISOString()
  };
  if (!data.full_name) { alert('Please enter the employee name.'); return; }
  if (id) {
    await sb.from('employees').update(data).eq('id', id);
  } else {
    await sb.from('employees').insert(data);
  }
  showToast();
  closeModal('hr-modal');
  renderHr();
}

async function openEmployeeDetail(empId) {
  const { data: emp } = await sb.from('employees').select('*').eq('id', empId).single();
  if (!emp) return;
  _currentEmployee = emp;
  const { data: certs } = await sb.from('employee_certifications').select('*').eq('employee_id', empId).order('expiry_date');
  const { data: docs }  = await sb.from('employee_documents').select('*').eq('employee_id', empId).order('uploaded_at', {ascending:false});
  const allCerts = certs || [];
  const allDocs  = docs  || [];
  const today = new Date();

  document.getElementById('hr-detail-name').textContent = emp.full_name;

  const fmt = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

  let html = `
    <!-- Info grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      ${[
        ['Role', emp.role],
        ['Department', emp.department],
        ['Start Date', fmt(emp.start_date)],
        ['Status', emp.status?.replace('_',' ')],
        ['Email', emp.email],
        ['Phone', emp.phone]
      ].map(([label,val]) => `
        <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:2px;padding:12px">
          <div style="font-size:9px;font-weight:400;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">${label}</div>
          <div style="font-size:13px;font-weight:300;color:var(--ivory)">${val||'—'}</div>
        </div>`).join('')}
    </div>

    <!-- Emergency contact -->
    <div style="margin-bottom:20px">
      <div style="font-size:9px;font-weight:400;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:10px">Emergency Contact</div>
      <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:2px;padding:14px;font-size:13px;font-weight:300;color:var(--ivory)">
        ${emp.emergency_contact_name ? `${emp.emergency_contact_name} (${emp.emergency_contact_relation||'—'}) · ${emp.emergency_contact_phone||'—'}` : '<span style="color:var(--muted)">Not set</span>'}
      </div>
    </div>

    <!-- Certifications -->
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:9px;font-weight:400;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)">Certifications</div>
        <button class="btn btn-ghost btn-sm" onclick="openCertModal('${empId}')">+ Add</button>
      </div>
      ${allCerts.length ? allCerts.map(c => {
        const exp = new Date(c.expiry_date);
        const days = Math.ceil((exp - today) / 86400000);
        const expired = days < 0;
        const color = expired ? '#e07070' : days <= 30 ? 'var(--olive)' : 'var(--green)';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:2px;margin-bottom:6px">
          <div>
            <div style="font-size:13px;font-weight:300;color:var(--ivory)">${c.cert_type}</div>
            ${c.cert_number ? `<div style="font-size:11px;color:var(--muted)">#${c.cert_number}</div>` : ''}
          </div>
          <div style="text-align:right">
            <div style="font-size:12px;font-weight:400;color:${color}">${expired?'Expired':'Expires'} ${fmt(c.expiry_date)}</div>
            <div style="font-size:10px;color:var(--muted)">${expired?'':'in '+days+' day'+(days!==1?'s':'')}</div>
          </div>
        </div>`;
      }).join('') : '<div style="font-size:12px;color:var(--muted);padding:10px 0">No certifications on file.</div>'}
    </div>

    <!-- Documents -->
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:9px;font-weight:400;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)">Documents</div>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">
          + Upload
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style="display:none"
            onchange="uploadEmployeeDoc('${empId}', this)">
        </label>
      </div>
      <div id="hr-docs-list">
        ${allDocs.length ? allDocs.map(d => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:2px;margin-bottom:6px">
            <div style="font-size:13px;font-weight:300;color:var(--ivory)">📄 ${d.doc_name}</div>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-size:10px;color:var(--muted)">${d.doc_type}</span>
              ${d.file_url ? `<a href="${d.file_url}" target="_blank" class="btn btn-ghost btn-sm">View</a>` : ''}
            </div>
          </div>`).join('') : '<div style="font-size:12px;color:var(--muted);padding:10px 0">No documents uploaded.</div>'}
      </div>
    </div>

    <!-- Notes -->
    ${emp.notes ? `<div>
      <div style="font-size:9px;font-weight:400;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Notes</div>
      <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:2px;padding:14px;font-size:13px;font-weight:300;color:var(--ivory);line-height:1.6">${emp.notes}</div>
    </div>` : ''}`;

  document.getElementById('hr-detail-body').innerHTML = html;
  openModal('hr-detail-modal');
}

function editEmployee() {
  closeModal('hr-detail-modal');
  setTimeout(() => openHrModal(_currentEmployee), 200);
}

function openCertModal(empId) {
  document.getElementById('cert-emp-id').value = empId;
  document.getElementById('cert-type').value = 'Food Handler';
  document.getElementById('cert-issued').value = '';
  document.getElementById('cert-expiry').value = '';
  document.getElementById('cert-number').value = '';
  openModal('cert-modal');
}

async function saveCertification() {
  const empId = document.getElementById('cert-emp-id').value;
  const expiry = document.getElementById('cert-expiry').value;
  if (!expiry) { alert('Please enter an expiry date.'); return; }
  await sb.from('employee_certifications').insert({
    employee_id: empId,
    restaurant_id: currentRestaurantId,
    cert_type: document.getElementById('cert-type').value,
    issued_date: document.getElementById('cert-issued').value || null,
    expiry_date: expiry,
    cert_number: document.getElementById('cert-number').value.trim() || null,
    status: 'active'
  });
  showToast();
  closeModal('cert-modal');
  openEmployeeDetail(empId);
}

async function uploadEmployeeDoc(empId, input) {
  const file = input.files[0];
  if (!file) return;
  const ext  = file.name.split('.').pop();
  const path = `${currentRestaurantId}/${empId}/${Date.now()}.${ext}`;
  const { data, error } = await sb.storage.from('employee-docs').upload(path, file);
  if (error) { alert('Upload failed: ' + error.message); return; }
  const { data: urlData } = sb.storage.from('employee-docs').getPublicUrl(path);
  await sb.from('employee_documents').insert({
    employee_id: empId,
    restaurant_id: currentRestaurantId,
    doc_type: 'General',
    doc_name: file.name,
    file_url: urlData.publicUrl,
    file_path: path
  });
  showToast();
  openEmployeeDetail(empId);
}

// ═══════════════════════════════════════════════════════════════════
// ─── INVOICE SCANNER ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

let _invoiceFile     = null;
let _invoiceB64      = null;
let _invoiceItems    = [];
let _invoiceWorkflow = null;
let _invoiceSection  = 'kitchen';

function openInvoiceScanner(section) {
  _invoiceSection = section || 'kitchen';
  resetInvoiceModal();
  openModal('invoice-modal');
}

function resetInvoiceModal() {
  _invoiceFile = null; _invoiceB64 = null; _invoiceItems = []; _invoiceWorkflow = null;
  document.getElementById('invoice-upload-zone').style.display = 'block';
  document.getElementById('invoice-preview').style.display = 'none';
  document.getElementById('invoice-workflow').style.display = 'none';
  document.getElementById('invoice-status').style.display = 'none';
  document.getElementById('invoice-results').style.display = 'none';
  document.getElementById('invoice-confirm-btn').style.display = 'none';
  document.getElementById('invoice-file-input').value = '';
}

function handleInvoiceDrop(e) {
  e.preventDefault();
  document.getElementById('invoice-upload-zone').style.borderColor = 'var(--border2)';
  const file = e.dataTransfer.files[0];
  if (file) handleInvoiceFile(file);
}

function handleInvoiceFile(file) {
  if (!file) return;
  _invoiceFile = file;

  // PDFs: send as-is (can't resize). Images: compress/resize to stay under payload limits.
  if (file.type === 'application/pdf') {
    const reader = new FileReader();
    reader.onload = (e) => {
      _invoiceB64 = e.target.result.split(',')[1];
      document.getElementById('invoice-upload-zone').style.display = 'none';
      document.getElementById('invoice-workflow').style.display = 'block';
    };
    reader.readAsDataURL(file);
    return;
  }

  // Images — resize down to a max dimension and re-encode as JPEG to shrink payload.
  // This handles huge phone photos (and converts HEIC-decoded bitmaps) reliably.
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1600; // max width/height in px — plenty for reading an invoice
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Compress to JPEG at 0.82 quality — good legibility, small size
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      _invoiceB64 = dataUrl.split(',')[1];
      _invoiceFile = { type: 'image/jpeg' }; // force media type to jpeg

      document.getElementById('invoice-img-preview').src = dataUrl;
      document.getElementById('invoice-preview').style.display = 'block';
      document.getElementById('invoice-upload-zone').style.display = 'none';
      document.getElementById('invoice-workflow').style.display = 'block';
    };
    img.onerror = () => {
      // Fallback: if the browser can't decode it (e.g. HEIC), send raw and let the user know
      _invoiceB64 = e.target.result.split(',')[1];
      alert('This image format may not be supported. If scanning fails, try taking a screenshot of the invoice or saving it as a JPG/PNG.');
      document.getElementById('invoice-upload-zone').style.display = 'none';
      document.getElementById('invoice-workflow').style.display = 'block';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function scanInvoice(workflow) {
  _invoiceWorkflow = workflow;
  document.getElementById('invoice-workflow').style.display = 'none';
  document.getElementById('invoice-status').style.display = 'block';
  document.getElementById('invoice-status-text').textContent = 'Reading invoice with AI...';

  try {
    const isImage = _invoiceFile.type.startsWith('image/');
    const mediaType = isImage ? _invoiceFile.type : 'application/pdf';

    // Call our Vercel serverless function (avoids CORS issues)
    const response = await fetch('/api/scan-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData: _invoiceB64, mediaType })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      // Surface the real reason when we can
      const msg = data?.error || `Server error (${response.status}). The image may be too large or in an unsupported format — try a JPG/PNG or a screenshot.`;
      throw new Error(msg.length > 140 ? msg.slice(0,140) + '…' : msg);
    }
    if (data?.error && !data.items) throw new Error(data.error);

    _invoiceItems = (data.items || []).filter(i => i.name);
    if (!_invoiceItems.length) throw new Error('No items found. Try a clearer photo.');

    document.getElementById('invoice-status').style.display = 'none';
    showInvoiceResults(_invoiceItems);

  } catch(err) {
    document.getElementById('invoice-status-text').textContent = '❌ ' + err.message;
    document.getElementById('invoice-status-text').style.color = '#e07070';
  }
}

function showInvoiceResults(items) {
  const resultsEl = document.getElementById('invoice-results');
  const thStyle = 'text-align:left;padding:7px 10px;font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);border-bottom:1px solid var(--border)';
  const tdStyle = 'padding:9px 10px;border-bottom:1px solid rgba(255,255,255,0.03);font-weight:300;color:var(--ivory);font-size:13px';

  let html = `<div style="font-size:12px;font-weight:300;color:var(--muted);margin-bottom:12px">
    Found <strong style="color:var(--olive)">${items.length} items</strong> — review and edit before applying:
  </div>
  <div style="overflow-x:auto">
  <table style="width:100%;border-collapse:collapse">
    <thead><tr>
      <th style="${thStyle}">Item</th>
      <th style="${thStyle};text-align:center">Qty</th>
      <th style="${thStyle}">Unit</th>
      <th style="${thStyle}">$/Unit</th>
      <th style="${thStyle}">Supplier</th>
    </tr></thead><tbody>`;

  items.forEach((item, i) => {
    html += `<tr>
      <td style="${tdStyle}"><input value="${item.name||''}" oninput="_invoiceItems[${i}].name=this.value"
        style="background:transparent;border:none;color:var(--ivory);font-family:var(--sans);font-size:13px;width:100%;outline:none"></td>
      <td style="${tdStyle};text-align:center"><input type="number" value="${item.qty||''}" oninput="_invoiceItems[${i}].qty=parseFloat(this.value)"
        style="background:transparent;border:none;color:var(--ivory);font-family:var(--sans);font-size:13px;width:60px;text-align:center;outline:none"></td>
      <td style="${tdStyle}"><input value="${item.unit||'units'}" oninput="_invoiceItems[${i}].unit=this.value"
        style="background:transparent;border:none;color:var(--ivory);font-family:var(--sans);font-size:13px;width:60px;outline:none"></td>
      <td style="${tdStyle}"><input type="number" step="0.01" value="${item.price||''}" oninput="_invoiceItems[${i}].price=parseFloat(this.value)"
        style="background:transparent;border:none;color:var(--ivory);font-family:var(--sans);font-size:13px;width:70px;outline:none"></td>
      <td style="${tdStyle}"><input value="${item.supplier||''}" oninput="_invoiceItems[${i}].supplier=this.value"
        style="background:transparent;border:none;color:var(--muted);font-family:var(--sans);font-size:12px;width:100%;outline:none"></td>
    </tr>`;
  });

  html += '</tbody></table></div>';

  resultsEl.innerHTML = html;
  resultsEl.style.display = 'block';
  document.getElementById('invoice-confirm-btn').style.display = 'inline-flex';
  document.getElementById('invoice-confirm-btn').textContent =
    _invoiceWorkflow === 'order_received' ? 'Pre-fill Order Received →' : '⚡ Update Inventory Now';
}

async function confirmInvoiceScan() {
  if (_invoiceWorkflow === 'update_inventory') {
    // Update existing items OR create new ones
    const section = _invoiceSection || 'kitchen';
    let updated = 0;
    let created = 0;
    for (const item of _invoiceItems) {
      if (!item.name || !item.name.trim()) continue;
      const { data } = await sb.from('inventory').select('id,qty')
        .eq('restaurant_id', currentRestaurantId)
        .ilike('name', item.name.trim()).limit(1);
      if (data?.[0]) {
        // Item exists — update it
        const update = { updated_at: new Date().toISOString() };
        if (item.qty)   update.qty = (data[0].qty || 0) + item.qty;
        if (item.price) update.cost_per_unit = item.price;
        if (item.unit)  update.unit = item.unit;
        await sb.from('inventory').update(update).eq('id', data[0].id);
        updated++;
      } else {
        // Item is new — create it
        await sb.from('inventory').insert({
          restaurant_id: currentRestaurantId,
          section,
          name: item.name.trim(),
          category: item.category || '',
          qty: item.qty || 0,
          par_level: 0,
          unit: item.unit || 'units',
          cost_per_unit: item.price || 0,
          supplier: item.supplier || '',
          updated_at: new Date().toISOString()
        });
        created++;
      }
    }
    closeModal('invoice-modal');
    resetInvoiceModal();
    clearInvCache();
    // Refresh the inventory view so new items show immediately
    if (typeof renderInv === 'function') renderInv(section);
    const sectionName = section.charAt(0).toUpperCase() + section.slice(1);
    alert(`Done! Added to ${sectionName} inventory:\n\n${created} new item${created!==1?'s':''} created\n${updated} existing item${updated!==1?'s':''} updated`);
  } else {
    // Pre-fill Order Received
    closeModal('invoice-modal');
    resetInvoiceModal();
    alert('Open Order Received for the relevant section — the items will be pre-noted for you to match and confirm.');
    // Could pass items to order received here in future
  }
}

// ═══════════════════════════════════════════════════════════════════
// ─── DAILY SALES LOG ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

let _dsChart = null;

function openDailySalesModal(entry = null) {
  document.getElementById('ds-modal-title').textContent = entry ? 'Edit Entry' : 'Log Sales';
  document.getElementById('ds-entry-id').value = entry?.id || '';
  // Default date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('ds-date').value   = entry?.date   || today;
  document.getElementById('ds-food').value   = entry?.food_revenue  || '';
  document.getElementById('ds-bar').value    = entry?.bar_revenue   || '';
  document.getElementById('ds-total').value  = entry?.total_revenue || '';
  document.getElementById('ds-covers').value = entry?.covers       || '';
  document.getElementById('ds-notes').value  = entry?.notes        || '';
  document.getElementById('ds-cost-preview').style.display = 'none';
  openModal('daily-sales-modal');
}

function dsAutoTotal() {
  const food  = parseFloat(document.getElementById('ds-food').value)  || 0;
  const bar   = parseFloat(document.getElementById('ds-bar').value)   || 0;
  const total = food + bar;
  if (total > 0) {
    document.getElementById('ds-total').value = total.toFixed(2);
    // Show live preview
    const covers = parseFloat(document.getElementById('ds-covers').value) || 0;
    const preview = document.getElementById('ds-cost-preview');
    preview.style.display = 'block';
    // Bar % of total
    const barPct = total > 0 ? (bar / total * 100).toFixed(1) + '%' : '—';
    document.getElementById('ds-preview-bar-pct').textContent = barPct;
    // Rev per cover
    const rpc = covers > 0 ? '$' + (total / covers).toFixed(2) : '—';
    document.getElementById('ds-preview-rpc').textContent = rpc;
    // Food cost % — use latest P&L food cogs as estimate
    document.getElementById('ds-preview-food-pct').textContent = '—';
  } else {
    document.getElementById('ds-cost-preview').style.display = 'none';
  }
}

async function saveDailySales() {
  const id     = document.getElementById('ds-entry-id').value;
  const date   = document.getElementById('ds-date').value;
  const food   = parseFloat(document.getElementById('ds-food').value)   || 0;
  const bar    = parseFloat(document.getElementById('ds-bar').value)    || 0;
  const total  = parseFloat(document.getElementById('ds-total').value)  || (food + bar);
  const covers = parseInt(document.getElementById('ds-covers').value)   || 0;
  const notes  = document.getElementById('ds-notes').value.trim();

  if (!date)  { alert('Please select a date.'); return; }
  if (!total) { alert('Please enter at least the total revenue.'); return; }

  const payload = {
    restaurant_id: currentRestaurantId,
    date, food_revenue: food, bar_revenue: bar,
    total_revenue: total, covers, notes,
  };

  if (id) {
    await sb.from('daily_sales').update(payload).eq('id', id);
  } else {
    // Upsert by date — if same date exists, update it
    const { data: existing } = await sb.from('daily_sales').select('id')
      .eq('restaurant_id', currentRestaurantId).eq('date', date).single();
    if (existing) {
      await sb.from('daily_sales').update(payload).eq('id', existing.id);
    } else {
      await sb.from('daily_sales').insert(payload);
    }
  }

  showToast();
  closeModal('daily-sales-modal');
  renderDailySales();
}

async function renderDailySales() {
  if (!currentRestaurantId) return;
  const days  = parseInt(document.getElementById('ds-view')?.value || '14');
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const { data } = await sb.from('daily_sales').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .gte('date', sinceStr)
    .order('date', { ascending: false });
  const entries = data || [];

  // ── Weekly KPIs ──────────────────────────────────────────────────
  const kpiEl = document.getElementById('ds-weekly-kpis');
  if (kpiEl) {
    // Last 7 days
    const week7 = new Date(); week7.setDate(week7.getDate() - 7);
    const week7Str = week7.toISOString().split('T')[0];
    const weekEntries = entries.filter(e => e.date >= week7Str);
    const totalRev  = weekEntries.reduce((s, e) => s + (e.total_revenue || 0), 0);
    const totalFood = weekEntries.reduce((s, e) => s + (e.food_revenue  || 0), 0);
    const totalBar  = weekEntries.reduce((s, e) => s + (e.bar_revenue   || 0), 0);
    const totalCov  = weekEntries.reduce((s, e) => s + (e.covers        || 0), 0);
    const rpc       = totalCov > 0 ? (totalRev / totalCov).toFixed(2) : '—';
    const barPct    = totalRev > 0 ? (totalBar / totalRev * 100).toFixed(1) : '—';

    const kpis = [
      { label: 'Weekly Revenue',   val: '$' + Math.round(totalRev).toLocaleString(), color: 'var(--ivory)' },
      { label: 'Food Revenue',     val: '$' + Math.round(totalFood).toLocaleString(), color: 'var(--ivory)' },
      { label: 'Bar Revenue',      val: '$' + Math.round(totalBar).toLocaleString() + (totalRev>0?' ('+barPct+'%)':''), color: 'var(--ivory)' },
      { label: 'Rev per Cover',    val: rpc !== '—' ? '$' + rpc : '—', color: 'var(--olive2)' },
    ];
    kpiEl.innerHTML = kpis.map(k => `
      <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:2px;padding:16px">
        <div style="font-size:9px;font-weight:400;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:8px">${k.label}</div>
        <div style="font-size:24px;font-weight:200;color:${k.color}">${k.val}</div>
        <div style="font-size:9px;color:var(--muted);margin-top:4px">Last 7 days</div>
      </div>`).join('');
  }

  // ── Chart ─────────────────────────────────────────────────────────
  const chartEl    = document.getElementById('ds-chart');
  const chartEmpty = document.getElementById('ds-chart-empty');
  if (!entries.length) {
    if (chartEl)    chartEl.style.display    = 'none';
    if (chartEmpty) chartEmpty.style.display = 'block';
  } else {
    if (chartEl)    chartEl.style.display    = 'block';
    if (chartEmpty) chartEmpty.style.display = 'none';

    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const labels = sorted.map(e => {
      const d = new Date(e.date + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const foodData  = sorted.map(e => e.food_revenue  || 0);
    const barData   = sorted.map(e => e.bar_revenue   || 0);
    const totalData = sorted.map(e => e.total_revenue || 0);

    if (_dsChart) _dsChart.destroy();
    _dsChart = new Chart(chartEl, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Food',
            data: foodData,
            backgroundColor: 'rgba(118,105,87,0.7)',
            borderRadius: 2,
            stack: 'rev'
          },
          {
            label: 'Bar',
            data: barData,
            backgroundColor: 'rgba(58,140,126,0.7)',
            borderRadius: 2,
            stack: 'rev'
          }
        ]
      },
      options: {
        plugins: {
          legend: { labels: { color: '#7a7671', font: { family: 'Outfit', size: 11 } } },
          tooltip: {
            callbacks: {
              footer: (items) => {
                const total = items.reduce((s, i) => s + i.raw, 0);
                return 'Total: $' + Math.round(total).toLocaleString();
              }
            }
          }
        },
        scales: {
          x: { stacked: true, ticks: { color: '#7a7671', font: { family: 'Outfit', size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { stacked: true, ticks: { color: '#7a7671', font: { family: 'Outfit', size: 10 }, callback: v => '$' + (v>=1000?Math.round(v/1000)+'k':v) }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // ── Table ─────────────────────────────────────────────────────────
  const tableEl = document.getElementById('ds-table');
  const emptyEl = document.getElementById('ds-empty');
  if (!entries.length) {
    if (emptyEl)  emptyEl.style.display  = 'block';
    if (tableEl)  tableEl.innerHTML      = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const thStyle = 'text-align:left;padding:8px 12px;font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);border-bottom:1px solid var(--border)';
  const tdStyle = 'padding:11px 12px;border-bottom:1px solid rgba(255,255,255,0.03);font-size:13px;font-weight:300;color:var(--ivory)';

  tableEl.innerHTML = `
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="${thStyle}">Date</th>
        <th style="${thStyle};text-align:right">Food</th>
        <th style="${thStyle};text-align:right">Bar</th>
        <th style="${thStyle};text-align:right">Total</th>
        <th style="${thStyle};text-align:center">Covers</th>
        <th style="${thStyle};text-align:right">Rev/Cover</th>
        <th style="${thStyle}">Notes</th>
        <th style="${thStyle}"></th>
      </tr></thead>
      <tbody>
        ${entries.map(e => {
          const d   = new Date(e.date + 'T00:00:00');
          const dateStr = d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
          const rpc = e.covers > 0 ? '$' + (e.total_revenue / e.covers).toFixed(2) : '—';
          const barPct = e.total_revenue > 0 ? ' <span style="font-size:10px;color:var(--muted)">(' + (e.bar_revenue/e.total_revenue*100).toFixed(0) + '%)</span>' : '';
          return `<tr>
            <td style="${tdStyle};font-weight:400">${dateStr}</td>
            <td style="${tdStyle};text-align:right">$${Math.round(e.food_revenue||0).toLocaleString()}</td>
            <td style="${tdStyle};text-align:right">$${Math.round(e.bar_revenue||0).toLocaleString()}${barPct}</td>
            <td style="${tdStyle};text-align:right;font-weight:400">$${Math.round(e.total_revenue||0).toLocaleString()}</td>
            <td style="${tdStyle};text-align:center">${e.covers||'—'}</td>
            <td style="${tdStyle};text-align:right;color:var(--olive2)">${rpc}</td>
            <td style="${tdStyle};color:var(--muted);font-size:11px">${e.notes||''}</td>
            <td style="${tdStyle}">
              <button onclick='openDailySalesModal(${JSON.stringify(e)})' class="btn btn-ghost btn-sm">Edit</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ═══════════════════════════════════════════════════════════════════
// ─── USER APPROVALS (owner only) ───────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

async function renderUserApprovals() {
  if (currentRole !== 'owner') return;
  const { data } = await sb.from('profiles').select('*').order('approved').order('full_name');
  const profiles = data || [];

  const pending  = profiles.filter(p => !p.approved || p.role === 'pending');
  const approved = profiles.filter(p => p.approved && p.role !== 'pending');

  const roleColors = {
    owner: '#534AB7', manager: '#185FA5', kitchen: '#0F6E56', bar: '#993C1D', pending: '#888780'
  };
  const roleLabel = { owner:'Owner', manager:'Manager', kitchen:'Kitchen', bar:'Bar', pending:'Pending' };

  // ── Pending section ──
  let html = '';
  const pendEl = document.getElementById('ua-pending');
  if (pendEl) {
    if (!pending.length) {
      pendEl.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:14px 0">No pending requests.</div>';
    } else {
      pendEl.innerHTML = pending.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:14px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:2px;margin-bottom:8px">
          <div>
            <div style="font-size:14px;font-weight:400;color:var(--ivory)">${p.full_name || 'Unnamed user'}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">Requested: ${roleLabel[p.requested_role]||p.requested_role||'—'}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <select id="ua-role-${p.id}" style="background:rgba(255,255,255,0.04);border:1px solid var(--border2);border-radius:2px;color:var(--ivory);font-family:var(--sans);font-size:12px;padding:7px 10px;outline:none;cursor:pointer">
              <option value="kitchen"${p.requested_role==='kitchen'?' selected':''}>Kitchen</option>
              <option value="bar"${p.requested_role==='bar'?' selected':''}>Bar</option>
              <option value="manager"${p.requested_role==='manager'?' selected':''}>Manager</option>
              <option value="owner"${p.requested_role==='owner'?' selected':''}>Owner</option>
            </select>
            <button class="btn btn-primary btn-sm" onclick="approveUser('${p.id}')">Approve</button>
            <button class="btn btn-ghost btn-sm" onclick="denyUser('${p.id}')" style="color:#e07070">Deny</button>
          </div>
        </div>`).join('');
    }
  }

  // ── Approved (active team) section ──
  const teamEl = document.getElementById('ua-team');
  if (teamEl) {
    teamEl.innerHTML = approved.map(p => `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:12px 14px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:2px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:32px;height:32px;border-radius:2px;background:${roleColors[p.role]}22;display:flex;align-items:center;justify-content:center;font-size:13px;color:${roleColors[p.role]};font-weight:400">${(p.full_name||'?')[0].toUpperCase()}</div>
          <div>
            <div style="font-size:13px;font-weight:400;color:var(--ivory)">${p.full_name || 'Unnamed'}</div>
            <div style="font-size:10px;color:${roleColors[p.role]};text-transform:uppercase;letter-spacing:1px;margin-top:2px">${roleLabel[p.role]||p.role}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <select onchange="changeUserRole('${p.id}', this.value)" style="background:rgba(255,255,255,0.04);border:1px solid var(--border2);border-radius:2px;color:var(--ivory);font-family:var(--sans);font-size:12px;padding:6px 10px;outline:none;cursor:pointer">
            <option value="kitchen"${p.role==='kitchen'?' selected':''}>Kitchen</option>
            <option value="bar"${p.role==='bar'?' selected':''}>Bar</option>
            <option value="manager"${p.role==='manager'?' selected':''}>Manager</option>
            <option value="owner"${p.role==='owner'?' selected':''}>Owner</option>
          </select>
          ${p.id !== currentUser.id ? `<button class="btn btn-ghost btn-sm" onclick="revokeUser('${p.id}')" style="color:#e07070">Revoke</button>` : '<span style="font-size:10px;color:var(--muted)">you</span>'}
        </div>
      </div>`).join('');
  }
}

async function approveUser(userId) {
  const role = document.getElementById('ua-role-' + userId)?.value || 'kitchen';
  await sb.from('profiles').update({ role, approved: true }).eq('id', userId);
  showToast();
  renderUserApprovals();
}

async function denyUser(userId) {
  if (!confirm('Deny and remove this access request?')) return;
  await sb.from('profiles').update({ approved: false, role: 'pending' }).eq('id', userId);
  showToast();
  renderUserApprovals();
}

async function changeUserRole(userId, newRole) {
  await sb.from('profiles').update({ role: newRole }).eq('id', userId);
  showToast();
}

async function revokeUser(userId) {
  if (!confirm('Revoke access for this user? They will need to be re-approved.')) return;
  await sb.from('profiles').update({ approved: false, role: 'pending' }).eq('id', userId);
  showToast();
  renderUserApprovals();
}

// ═══════════════════════════════════════════════════════════════════
// ─── TEAM LOGS (shift close-out reports) ───────────────────────────
// ═══════════════════════════════════════════════════════════════════

// Which sections a role can log for
function sectionsForRole(role) {
  if (role === 'owner' || role === 'manager') return ['kitchen','bar','manager'];
  if (role === 'kitchen') return ['kitchen'];
  if (role === 'bar') return ['bar'];
  return [];
}

async function renderTeamLogs() {
  if (!currentRestaurantId) return;

  // Build the "New Log" buttons based on role
  const mySections = sectionsForRole(currentRole);
  const btnRow = document.getElementById('tl-new-buttons');
  if (btnRow) {
    const labels = { kitchen:'Kitchen Close', bar:'Bar Close', manager:'Manager Report' };
    btnRow.innerHTML = mySections.map(s =>
      `<button class="btn btn-primary btn-sm" onclick="openShiftLogModal('${s}')">+ ${labels[s]}</button>`
    ).join('');
  }

  // Owner & manager see all logs; kitchen/bar see only their own section
  const canSeeAll = currentRole === 'owner' || currentRole === 'manager';
  let query = sb.from('shift_logs').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .order('shift_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(60);
  if (!canSeeAll) {
    query = query.eq('section', currentRole);
  }
  const { data } = await query;
  const logs = data || [];

  // Section filter (owner/manager only)
  const filterEl = document.getElementById('tl-section-filter');
  if (filterEl) filterEl.style.display = canSeeAll ? '' : 'none';
  const activeFilter = filterEl?.value || '';
  const filtered = activeFilter ? logs.filter(l => l.section === activeFilter) : logs;

  const listEl  = document.getElementById('tl-list');
  const emptyEl = document.getElementById('tl-empty');
  if (!filtered.length) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (listEl)  listEl.innerHTML = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const sectionColors = { kitchen:'#2d5783', bar:'#2f6b5e', manager:'#49110B' };
  const sectionLabels = { kitchen:'Kitchen', bar:'Bar', manager:'Manager' };

  listEl.innerHTML = filtered.map(log => {
    const d = new Date(log.shift_date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    const time = new Date(log.created_at).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });

    const fields = [
      { label: 'Covers', val: log.covers ? String(log.covers) : null },
      { label: 'Waste / Mermas', val: log.waste_notes },
      { label: 'Incidents', val: log.incidents },
      { label: 'Staff Notes', val: log.staff_notes },
      { label: 'Maintenance', val: log.maintenance },
      { label: 'General Notes', val: log.general_notes },
    ].filter(f => f.val);

    return `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${sectionColors[log.section]};background:${sectionColors[log.section]}18;border:1px solid ${sectionColors[log.section]}33;padding:3px 9px;border-radius:2px;font-family:var(--sans)">${sectionLabels[log.section]||log.section}</span>
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--charcoal);font-family:var(--display)">${dateStr}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:1px">Logged by ${log.logged_by_name || 'Unknown'} at ${time}</div>
          </div>
        </div>
      </div>
      <div style="display:grid;gap:10px">
        ${fields.map(f => `
          <div>
            <div style="font-size:9px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:var(--woodland);margin-bottom:3px;font-family:var(--sans)">${f.label}</div>
            <div style="font-size:13px;color:var(--charcoal);font-family:var(--serif);line-height:1.5">${f.val}</div>
          </div>`).join('')}
        ${!fields.length ? '<div style="font-size:12px;color:var(--muted);font-style:italic">No details recorded.</div>' : ''}
      </div>
    </div>`;
  }).join('');
}

function openShiftLogModal(section) {
  document.getElementById('sl-section').value = section;
  const labels = { kitchen:'Kitchen Close-Out', bar:'Bar Close-Out', manager:'Manager Shift Report' };
  document.getElementById('sl-modal-title').textContent = labels[section] || 'Shift Log';

  // Default date to today
  document.getElementById('sl-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('sl-covers').value = '';
  document.getElementById('sl-waste').value = '';
  document.getElementById('sl-incidents').value = '';
  document.getElementById('sl-staff').value = '';
  document.getElementById('sl-maintenance').value = '';
  document.getElementById('sl-general').value = '';

  // Show/hide fields per section
  const isManager = section === 'manager';
  // Covers most relevant for manager; waste most relevant for kitchen/bar
  document.getElementById('sl-covers-field').style.display = isManager ? 'block' : 'none';
  document.getElementById('sl-waste-field').style.display = isManager ? 'none' : 'block';
  // Manager sees incidents + maintenance + staff; kitchen/bar see waste + staff + general

  openModal('shift-log-modal');
}

async function saveShiftLog() {
  const section = document.getElementById('sl-section').value;
  const date    = document.getElementById('sl-date').value;
  if (!date) { alert('Please select the shift date.'); return; }

  const payload = {
    restaurant_id: currentRestaurantId,
    section,
    shift_date: date,
    logged_by: currentUser.id,
    logged_by_name: currentProfile?.full_name || currentUser.email,
    covers: parseInt(document.getElementById('sl-covers').value) || 0,
    waste_notes: document.getElementById('sl-waste').value.trim(),
    incidents: document.getElementById('sl-incidents').value.trim(),
    staff_notes: document.getElementById('sl-staff').value.trim(),
    maintenance: document.getElementById('sl-maintenance').value.trim(),
    general_notes: document.getElementById('sl-general').value.trim(),
  };

  await sb.from('shift_logs').insert(payload);
  showToast();
  closeModal('shift-log-modal');
  renderTeamLogs();
}

// ═══════════════════════════════════════════════════════════════════
// ─── BAR PROGRAM ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

let _barTab = 'cocktails';

function switchBarTab(tab) {
  _barTab = tab;
  ['cocktails','prep','summary'].forEach(t => {
    const panel = document.getElementById('bp-panel-' + t);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    const btn = document.getElementById('bptab-' + t);
    if (btn) {
      btn.style.borderBottomColor = t === tab ? 'var(--mulled-wine)' : 'transparent';
      btn.style.color = t === tab ? 'var(--mulled-wine)' : 'var(--woodland)';
    }
  });
  if (tab === 'cocktails') renderBarCocktails();
  else if (tab === 'prep') renderBarPrep();
  else if (tab === 'summary') renderBarSummary();
}

async function renderBarProgram() {
  if (!currentRestaurantId) return;
  switchBarTab(_barTab);
}

// ─── Bar Cocktails ─────────────────────────────────────────────────
async function renderBarCocktails() {
  const { data } = await sb.from('recipes').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .eq('section', 'bar')
    .order('name');
  const recs = data || [];
  const grid = document.getElementById('bp-cocktail-grid');
  const empty = document.getElementById('bp-cocktail-empty');
  if (!recs.length) { if(grid) grid.innerHTML = ''; if(empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';
  grid.innerHTML = recs.map(r => {
    const pc = r.plate_cost > 0 && r.menu_price > 0 ? Math.round(r.plate_cost / r.menu_price * 100) : null;
    const profit = r.menu_price - r.plate_cost;
    const pcBadge = pc
      ? `<span class="badge ${pc <= 20 ? 'badge-green' : pc <= 28 ? 'badge-amber' : 'badge-red'}">${pc}% cost</span>`
      : '<span class="badge badge-blue">No price</span>';
    return `<div class="recipe-card" onclick="viewBarRecipe('${r.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><div class="recipe-name">${r.name}</div><div class="recipe-meta">${r.category || 'Cocktail'}</div></div>
        ${pcBadge}
      </div>
      <div class="tag-row">
        ${r.plate_cost ? `<span class="badge badge-blue" style="font-size:10px">$${r.plate_cost.toFixed(2)} cost</span>` : ''}
        ${r.menu_price ? `<span class="badge badge-teal" style="font-size:10px">$${r.menu_price.toFixed(2)} price</span>` : ''}
        ${r.menu_price && r.plate_cost ? `<span class="badge badge-green" style="font-size:10px">$${profit.toFixed(2)} profit</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function viewBarRecipe(id) {
  const { data: r } = await sb.from('recipes').select('*').eq('id', id).single();
  if (!r) return;
  const pc = r.plate_cost > 0 && r.menu_price > 0 ? Math.round(r.plate_cost / r.menu_price * 100) : null;
  const profit = (r.menu_price || 0) - (r.plate_cost || 0);
  document.getElementById('vbr-content').innerHTML = `
    <div class="modal-title">${r.name}</div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <span class="badge badge-amber">${r.category || 'Cocktail'}</span>
      ${pc ? `<span class="badge ${pc <= 20 ? 'badge-green' : pc <= 28 ? 'badge-amber' : 'badge-red'}">${pc}% pour cost</span>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
      <div style="background:rgba(86,72,59,0.06);border:1px solid var(--border);border-radius:3px;padding:12px;text-align:center">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--woodland);font-family:var(--sans);font-weight:600">Cost</div>
        <div style="font-size:18px;font-family:var(--display);color:var(--charcoal);margin-top:4px">$${(r.plate_cost||0).toFixed(2)}</div>
      </div>
      <div style="background:rgba(86,72,59,0.06);border:1px solid var(--border);border-radius:3px;padding:12px;text-align:center">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--woodland);font-family:var(--sans);font-weight:600">Price</div>
        <div style="font-size:18px;font-family:var(--display);color:var(--charcoal);margin-top:4px">$${(r.menu_price||0).toFixed(2)}</div>
      </div>
      <div style="background:rgba(86,72,59,0.06);border:1px solid var(--border);border-radius:3px;padding:12px;text-align:center">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--woodland);font-family:var(--sans);font-weight:600">Profit</div>
        <div style="font-size:18px;font-family:var(--display);color:var(--green);margin-top:4px">$${profit.toFixed(2)}</div>
      </div>
    </div>
    ${r.ingredients ? `<div style="margin-bottom:16px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--woodland);font-family:var(--sans);font-weight:600;margin-bottom:8px">Build / Ingredients</div><div style="font-size:13px;color:var(--charcoal);line-height:1.7;white-space:pre-wrap">${r.ingredients}</div></div>` : ''}
    ${r.method ? `<div style="margin-bottom:16px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--woodland);font-family:var(--sans);font-weight:600;margin-bottom:8px">Method</div><div style="font-size:13px;color:var(--charcoal);line-height:1.7;white-space:pre-wrap">${r.method}</div></div>` : ''}
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="deleteBarRecipe('${r.id}')" style="color:var(--red)">Delete</button>
      <button class="btn btn-ghost" onclick="closeModal('view-bar-recipe')">Close</button>
    </div>`;
  openModal('view-bar-recipe');
}

async function deleteBarRecipe(id) {
  if (!confirm('Delete this cocktail recipe?')) return;
  await sb.from('recipes').delete().eq('id', id);
  showToast(); closeModal('view-bar-recipe'); renderBarCocktails();
}

function openBarCocktailModal() {
  document.getElementById('bc-id').value = '';
  document.getElementById('bc-name').value = '';
  document.getElementById('bc-cat').value = 'Cocktail';
  document.getElementById('bc-cost').value = '';
  document.getElementById('bc-price').value = '';
  document.getElementById('bc-ingredients').value = '';
  document.getElementById('bc-method').value = '';
  openModal('bar-cocktail-modal');
}

async function saveBarCocktail() {
  const name = document.getElementById('bc-name').value.trim();
  if (!name) { alert('Enter a name.'); return; }
  await sb.from('recipes').insert({
    restaurant_id: currentRestaurantId,
    section: 'bar',
    name,
    category: document.getElementById('bc-cat').value || 'Cocktail',
    serves: 1,
    plate_cost: parseFloat(document.getElementById('bc-cost').value) || 0,
    menu_price: parseFloat(document.getElementById('bc-price').value) || 0,
    ingredients: document.getElementById('bc-ingredients').value.trim(),
    method: document.getElementById('bc-method').value.trim(),
    updated_at: new Date().toISOString()
  });
  showToast();
  closeModal('bar-cocktail-modal');
  renderBarCocktails();
}

// ─── Bar Prep / Batches ────────────────────────────────────────────
async function renderBarPrep() {
  const { data } = await sb.from('prep_items').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .eq('section', 'bar')
    .order('name');
  const items = data || [];
  const grid = document.getElementById('bp-prep-grid');
  const empty = document.getElementById('bp-prep-empty');
  if (!items.length) { if(grid) grid.innerHTML = ''; if(empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';
  grid.innerHTML = items.map(p => `
    <div class="recipe-card" onclick="viewPrepItem('${p.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><div class="recipe-name">${p.name}</div><div class="recipe-meta">${p.yield_amount || 'Batch'}${p.shelf_life ? ' · ' + p.shelf_life : ''}</div></div>
        ${p.cost ? `<span class="badge badge-blue">$${p.cost.toFixed(2)}</span>` : ''}
      </div>
    </div>`).join('');
}

async function viewPrepItem(id) {
  const { data: p } = await sb.from('prep_items').select('*').eq('id', id).single();
  if (!p) return;
  document.getElementById('vpi-content').innerHTML = `
    <div class="modal-title">${p.name}</div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      ${p.yield_amount ? `<span class="badge badge-amber">Yield: ${p.yield_amount}</span>` : ''}
      ${p.cost ? `<span class="badge badge-blue">$${p.cost.toFixed(2)} cost</span>` : ''}
      ${p.shelf_life ? `<span class="badge badge-teal">${p.shelf_life}</span>` : ''}
    </div>
    ${p.ingredients ? `<div style="margin-bottom:16px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--woodland);font-family:var(--sans);font-weight:600;margin-bottom:8px">Ingredients</div><div style="font-size:13px;color:var(--charcoal);line-height:1.7;white-space:pre-wrap">${p.ingredients}</div></div>` : ''}
    ${p.method ? `<div style="margin-bottom:16px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--woodland);font-family:var(--sans);font-weight:600;margin-bottom:8px">Method</div><div style="font-size:13px;color:var(--charcoal);line-height:1.7;white-space:pre-wrap">${p.method}</div></div>` : ''}
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="deletePrepItem('${p.id}')" style="color:var(--red)">Delete</button>
      <button class="btn btn-ghost" onclick="closeModal('view-prep-item')">Close</button>
    </div>`;
  openModal('view-prep-item');
}

async function deletePrepItem(id) {
  if (!confirm('Delete this prep item?')) return;
  await sb.from('prep_items').delete().eq('id', id);
  showToast(); closeModal('view-prep-item'); renderBarPrep();
}

function openPrepItemModal() {
  document.getElementById('pi-name').value = '';
  document.getElementById('pi-yield').value = '';
  document.getElementById('pi-cost').value = '';
  document.getElementById('pi-shelf').value = '';
  document.getElementById('pi-ingredients').value = '';
  document.getElementById('pi-method').value = '';
  openModal('prep-item-modal');
}

async function savePrepItem() {
  const name = document.getElementById('pi-name').value.trim();
  if (!name) { alert('Enter a name.'); return; }
  await sb.from('prep_items').insert({
    restaurant_id: currentRestaurantId,
    section: 'bar',
    name,
    yield_amount: document.getElementById('pi-yield').value.trim(),
    cost: parseFloat(document.getElementById('pi-cost').value) || 0,
    shelf_life: document.getElementById('pi-shelf').value.trim(),
    ingredients: document.getElementById('pi-ingredients').value.trim(),
    method: document.getElementById('pi-method').value.trim(),
    updated_at: new Date().toISOString()
  });
  showToast();
  closeModal('prep-item-modal');
  renderBarPrep();
}

// ─── Bar Program Summary ───────────────────────────────────────────
async function renderBarSummary() {
  const { data } = await sb.from('recipes').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .eq('section', 'bar');
  const recs = (data || []).filter(r => r.plate_cost > 0 && r.menu_price > 0);
  const wrap = document.getElementById('bp-summary-content');
  if (!recs.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:30px">Add cocktails with cost and price to see your program summary.</div>';
    return;
  }
  const withMargin = recs.map(r => ({
    ...r,
    profit: r.menu_price - r.plate_cost,
    pourCost: r.plate_cost / r.menu_price * 100
  }));
  const avgPourCost = withMargin.reduce((s, r) => s + r.pourCost, 0) / withMargin.length;
  const avgProfit   = withMargin.reduce((s, r) => s + r.profit, 0) / withMargin.length;
  const sortedByProfit = [...withMargin].sort((a, b) => b.profit - a.profit);
  const best = sortedByProfit.slice(0, 3);
  const worst = sortedByProfit.slice(-3).reverse();

  const pcColor = avgPourCost <= 20 ? 'var(--green)' : avgPourCost <= 25 ? 'var(--amber)' : 'var(--red)';

  wrap.innerHTML = `
    <div class="stat-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-label">Cocktails on Menu</div>
        <div class="stat-value">${recs.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Pour Cost</div>
        <div class="stat-value" style="color:${pcColor}">${avgPourCost.toFixed(1)}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Profit / Drink</div>
        <div class="stat-value" style="color:var(--green)">$${avgProfit.toFixed(2)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Menu Price Range</div>
        <div class="stat-value">$${Math.min(...recs.map(r=>r.menu_price)).toFixed(0)}–${Math.max(...recs.map(r=>r.menu_price)).toFixed(0)}</div>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="section-title" style="margin-bottom:14px">★ Best Margins</div>
        ${best.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
          <div><div style="font-size:14px;color:var(--charcoal)">${r.name}</div><div style="font-size:11px;color:var(--woodland)">${r.pourCost.toFixed(0)}% pour cost</div></div>
          <div style="font-size:15px;font-family:var(--display);color:var(--green)">$${r.profit.toFixed(2)}</div>
        </div>`).join('')}
      </div>
      <div class="card">
        <div class="section-title" style="margin-bottom:14px">⚠ Lowest Margins</div>
        ${worst.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
          <div><div style="font-size:14px;color:var(--charcoal)">${r.name}</div><div style="font-size:11px;color:var(--woodland)">${r.pourCost.toFixed(0)}% pour cost</div></div>
          <div style="font-size:15px;font-family:var(--display);color:${r.pourCost > 28 ? 'var(--red)' : 'var(--charcoal)'}">$${r.profit.toFixed(2)}</div>
        </div>`).join('')}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// ─── PREP CHECKLIST (shared kitchen + bar) ─────────────────────────
// ═══════════════════════════════════════════════════════════════════

function prepSectionsForRole(role) {
  if (role === 'owner' || role === 'manager') return ['kitchen','bar'];
  if (role === 'kitchen') return ['kitchen'];
  if (role === 'bar') return ['bar'];
  return [];
}

let _prepSection = null;

async function renderPrepChecklist() {
  if (!currentRestaurantId) return;
  const mySections = prepSectionsForRole(currentRole);
  if (!_prepSection || !mySections.includes(_prepSection)) _prepSection = mySections[0];

  // Section toggle (only if user can see both)
  const toggleEl = document.getElementById('pc-section-toggle');
  if (toggleEl) {
    if (mySections.length > 1) {
      toggleEl.style.display = 'flex';
      toggleEl.innerHTML = mySections.map(s =>
        `<button onclick="setPrepSection('${s}')" style="background:${_prepSection===s?'var(--mulled-wine)':'transparent'};color:${_prepSection===s?'var(--goat-milk)':'var(--woodland)'};border:1px solid ${_prepSection===s?'var(--mulled-wine)':'var(--border2)'};border-radius:2px;font-family:var(--sans);font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;padding:7px 16px;cursor:pointer">${s}</button>`
      ).join('');
    } else {
      toggleEl.style.display = 'none';
    }
  }

  const { data } = await sb.from('prep_checklist').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .eq('section', _prepSection)
    .order('done')
    .order('created_at', { ascending: false });
  const tasks = data || [];

  const listEl = document.getElementById('pc-list');
  const emptyEl = document.getElementById('pc-empty');
  if (!tasks.length) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (listEl) listEl.innerHTML = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  listEl.innerHTML = tasks.map(t => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:${t.done?'rgba(59,109,47,0.06)':'#F4F2EC'};border:1px solid ${t.done?'rgba(59,109,47,0.2)':'var(--border)'};border-radius:3px;margin-bottom:6px">
      <input type="checkbox" ${t.done?'checked':''} onchange="togglePrepTask('${t.id}', this.checked)"
        style="width:20px;height:20px;min-width:20px;cursor:pointer;accent-color:var(--green);margin:0">
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;color:var(--charcoal);${t.done?'text-decoration:line-through;opacity:0.6':''}">${t.task}</div>
        <div style="font-size:11px;color:var(--woodland);margin-top:2px">
          ${t.created_by ? 'Added by ' + t.created_by : ''}${t.done && t.done_by ? ' · Done by ' + t.done_by : ''}
        </div>
      </div>
      <button onclick="deletePrepTask('${t.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;line-height:1">×</button>
    </div>`).join('');
}

function setPrepSection(section) {
  _prepSection = section;
  renderPrepChecklist();
}

async function addPrepTask() {
  const input = document.getElementById('pc-new-task');
  const task = input.value.trim();
  if (!task) return;
  await sb.from('prep_checklist').insert({
    restaurant_id: currentRestaurantId,
    section: _prepSection,
    task,
    created_by: currentProfile?.full_name || currentUser.email,
    done: false
  });
  input.value = '';
  renderPrepChecklist();
}

async function togglePrepTask(id, done) {
  const update = { done };
  if (done) {
    update.done_by = currentProfile?.full_name || currentUser.email;
    update.done_at = new Date().toISOString();
  } else {
    update.done_by = null;
    update.done_at = null;
  }
  await sb.from('prep_checklist').update(update).eq('id', id);
  renderPrepChecklist();
}

async function deletePrepTask(id) {
  await sb.from('prep_checklist').delete().eq('id', id);
  renderPrepChecklist();
}

// ═══════════════════════════════════════════════════════════════════
// ─── MOBILE SIDEBAR (hamburger menu) ───────────────────────────────
// ═══════════════════════════════════════════════════════════════════

function toggleSidebar() {
  const sb = document.querySelector('.sidebar');
  const ov = document.querySelector('.sidebar-overlay');
  if (!sb) return;
  const isOpen = sb.classList.toggle('open');
  if (ov) ov.classList.toggle('open', isOpen);
}

function closeSidebar() {
  const sb = document.querySelector('.sidebar');
  const ov = document.querySelector('.sidebar-overlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('open');
}

// Auto-close the drawer when a nav item is tapped (mobile)
// Use event delegation so it works regardless of when items render
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 768 && e.target.closest('.nav-item')) {
    closeSidebar();
  }
});
