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
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: fullName } }
  });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
  errEl.style.display = 'block';
  errEl.style.background = 'rgba(106,170,106,0.12)';
  errEl.style.borderColor = 'rgba(106,170,106,0.3)';
  errEl.style.color = '#6aaa6a';
  errEl.textContent = 'Account created! Check your email to confirm, then sign in.';
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

// ─── INIT APP ──────────────────────────────────────────────────────
async function initApp(user) {
  currentUser = user;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
  currentProfile = profile;
  document.getElementById('user-name').textContent = profile?.full_name || user.email;

  const { data: rests } = await sb.from('restaurants').select('*').order('name');
  restaurants = rests || [];

  const sel = document.getElementById('restaurant-select');
  sel.innerHTML = restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  currentRestaurantId = restaurants[0]?.id || null;

  renderDashboard();
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
    financials: renderPnl, labor: renderLabor
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

  const [{ data: inv }, { data: recs }] = await Promise.all([
    sb.from('inventory').select('*').eq('restaurant_id', currentRestaurantId),
    sb.from('recipes').select('*').eq('restaurant_id', currentRestaurantId)
  ]);

  const allInv = inv || [];
  const low = allInv.filter(x => x.par_level > 0 && x.qty / x.par_level <= 0.2);
  document.getElementById('d-total-items').textContent = allInv.length;
  document.getElementById('d-low-stock').textContent = low.length;
  document.getElementById('d-recipes').textContent = (recs || []).length;

  const withPrice = (recs || []).filter(r => r.plate_cost > 0 && r.menu_price > 0);
  const avgFc = withPrice.length
    ? Math.round(withPrice.reduce((s, r) => s + r.plate_cost / r.menu_price * 100, 0) / withPrice.length) + '%'
    : '—';
  document.getElementById('d-avg-fc').textContent = avgFc;

  const alerts = document.getElementById('dash-alerts');
  if (!low.length) {
    alerts.innerHTML = '<div class="empty-state" style="padding:16px 0"><div class="empty-icon">✅</div>No low stock alerts!</div>';
  } else {
    alerts.innerHTML = low.map(x =>
      `<div class="alert alert-red">${x.name} — ${x.qty} ${x.unit} remaining (par: ${x.par_level} ${x.unit})</div>`
    ).join('');
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

function openInvModal(section, item = null) {
  _invSection = section;
  document.getElementById('inv-section').value = section;
  document.getElementById('inv-modal-title').textContent = item ? 'Edit Item' : 'Add Inventory Item';
  if (item) {
    document.getElementById('inv-id').value = item.id;
    document.getElementById('inv-name').value = item.name;
    document.getElementById('inv-cat').value = item.category || '';
    document.getElementById('inv-unit').value = item.unit;
    document.getElementById('inv-qty').value = item.qty;
    document.getElementById('inv-par').value = item.par_level;
    document.getElementById('inv-cost').value = item.cost_per_unit;
    document.getElementById('inv-supplier').value = item.supplier || '';
  } else {
    ['inv-id','inv-name','inv-cat','inv-qty','inv-par','inv-cost','inv-supplier'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('inv-unit').value = 'lbs';
  }
  openModal('inv-modal');
}

async function saveInvItem() {
  const id = document.getElementById('inv-id').value;
  const section = document.getElementById('inv-section').value;
  const item = {
    restaurant_id: currentRestaurantId,
    section,
    name: document.getElementById('inv-name').value.trim(),
    category: document.getElementById('inv-cat').value.trim(),
    unit: document.getElementById('inv-unit').value,
    qty: parseFloat(document.getElementById('inv-qty').value) || 0,
    par_level: parseFloat(document.getElementById('inv-par').value) || 0,
    cost_per_unit: parseFloat(document.getElementById('inv-cost').value) || 0,
    supplier: document.getElementById('inv-supplier').value.trim(),
    updated_at: new Date().toISOString()
  };
  if (!item.name) return;
  if (id) { await sb.from('inventory').update(item).eq('id', id); }
  else { await sb.from('inventory').insert(item); }
  showToast();
  closeModal('inv-modal');
  renderInv(section);
}

async function deleteInvItem(id, section) {
  if (!confirm('Delete this item?')) return;
  await sb.from('inventory').delete().eq('id', id);
  showToast();
  renderInv(section);
}

async function renderInv(section) {
  if (!currentRestaurantId) return;
  const { data } = await sb.from('inventory').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .eq('section', section)
    .order('name');
  const items = data || [];
  const tbody = document.getElementById(section + '-tbody');
  const empty = document.getElementById(section + '-empty');

  if (!items.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
  } else {
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = items.map(item => `
      <tr>
        <td><strong>${item.name}</strong>${item.supplier ? `<br><span style="font-size:11px;color:var(--muted)">${item.supplier}</span>` : ''}</td>
        <td>${item.category || '—'}</td>
        <td>${item.qty}</td>
        <td>${item.unit}</td>
        <td>${item.par_level}</td>
        <td>$${(item.cost_per_unit || 0).toFixed(2)}</td>
        <td>${invStatus(item.qty, item.par_level)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" onclick='openInvModal("${section}", ${JSON.stringify(item).replace(/'/g, "\\'")} )'>Edit</button>
          <button class="btn btn-danger btn-sm" style="margin-left:4px" onclick="deleteInvItem('${item.id}','${section}')">Del</button>
        </td>
      </tr>`).join('');
  }

  if (section === 'kitchen') {
    const low = items.filter(x => x.par_level > 0 && x.qty / x.par_level <= 0.2).length;
    const val = items.reduce((s, x) => s + x.qty * x.cost_per_unit, 0);
    document.getElementById('k-total').textContent = items.length;
    document.getElementById('k-low').textContent = low;
    document.getElementById('k-value').textContent = '$' + Math.round(val).toLocaleString();
  }
  if (section === 'bar') {
    const low = items.filter(x => x.par_level > 0 && x.qty / x.par_level <= 0.2).length;
    const val = items.reduce((s, x) => s + x.qty * x.cost_per_unit, 0);
    document.getElementById('b-total').textContent = items.length;
    document.getElementById('b-low').textContent = low;
    document.getElementById('b-value').textContent = '$' + Math.round(val).toLocaleString();
  }
}

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
  if (id) { await sb.from('recipes').update(rec).eq('id', id); }
  else { await sb.from('recipes').insert(rec); }
  showToast();
  closeModal('recipe-modal');
  document.getElementById('rec-id').value = '';
  renderRecipes();
}

async function renderRecipes() {
  if (!currentRestaurantId) return;
  const { data } = await sb.from('recipes').select('*')
    .eq('restaurant_id', currentRestaurantId).order('name');
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
    ['sop-id-input','sop-title-input','sop-tag-input','sop-steps-input'].forEach(id => document.getElementById(id).value = '');
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
  const tagColors = { Opening:'badge-teal', Closing:'badge-amber', Service:'badge-blue', Safety:'badge-red', Cleaning:'badge-blue', Allergens:'badge-red' };
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
    ['pnl-rev','pnl-cogs','pnl-labor','pnl-net'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
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
    { label:'Food Cost %', val: pnl.revenue ? Math.round(pnl.food_cogs/pnl.revenue*100)+'%' : '—', target:'28%', pct: pnl.revenue ? pnl.food_cogs/pnl.revenue : 0, color:'var(--amber)' },
    { label:'Bar Cost %',  val: pnl.revenue ? Math.round(pnl.bar_cogs/pnl.revenue*100)+'%'  : '—', target:'22%', pct: pnl.revenue ? pnl.bar_cogs/pnl.revenue  : 0, color:'var(--blue)'  },
    { label:'Labor %',     val: pnl.revenue ? Math.round(labor/pnl.revenue*100)+'%'           : '—', target:'30%', pct: pnl.revenue ? labor/pnl.revenue           : 0, color:'var(--teal)'  },
    { label:'Prime Cost',  val: pnl.revenue ? Math.round((cogs+labor)/pnl.revenue*100)+'%'   : '—', target:'60%', pct: pnl.revenue ? (cogs+labor)/pnl.revenue    : 0, color:'var(--amber)' },
    { label:'Net Margin',  val: pnl.revenue ? Math.round(net/pnl.revenue*100)+'%'             : '—', target:'15%', pct: pnl.revenue ? net/pnl.revenue             : 0, color:'var(--green)' },
  ];
  document.getElementById('pnl-benchmarks').innerHTML =
    `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">` +
    metrics.map(m => `<div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
        <span>${m.label}</span><span style="color:${m.color}">${m.val} <span style="color:var(--muted);font-size:11px">(target ${m.target})</span></span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100,Math.round(m.pct*100*3))}%;background:${m.color}"></div></div>
    </div>`).join('') + '</div>';

  document.getElementById('pnl-month-in').value = pnl.month || '';
  document.getElementById('pnl-rev-in').value = pnl.revenue;
  document.getElementById('pnl-fcogs-in').value = pnl.food_cogs;
  document.getElementById('pnl-bcogs-in').value = pnl.bar_cogs;
  document.getElementById('pnl-boh-in').value = pnl.boh_labor;
  document.getElementById('pnl-foh-in').value = pnl.foh_labor;
  document.getElementById('pnl-rent-in').value = pnl.rent;
  document.getElementById('pnl-other-in').value = pnl.other_expenses;
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
  if (session?.user) { await initApp(session.user); }
  fcAddRow('', 1, 'oz', 0);
})();
