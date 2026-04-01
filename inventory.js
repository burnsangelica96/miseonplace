// ─── SUPPLIER MANAGEMENT ──────────────────────────────────────────
let _supplierCache = null;

async function loadSupplierList() {
  if (_supplierCache) return _supplierCache;
  const { data } = await sb.from('inventory').select('supplier')
    .eq('restaurant_id', currentRestaurantId)
    .not('supplier', 'is', null);
  const unique = [...new Set((data || []).map(r => r.supplier).filter(Boolean))].sort();
  _supplierCache = unique;
  return unique;
}

function clearSupplierCache() { _supplierCache = null; }

function buildSupplierDropdown(currentVal = '') {
  const suppliers = _supplierCache || [];
  return `
    <div style="position:relative">
      <input type="text" id="inv-supplier-input" placeholder="Search or type supplier name..."
        value="${currentVal}"
        oninput="filterSupplierDropdown(this.value)"
        onfocus="showSupplierDropdown(this)"
        onblur="setTimeout(()=>hideSupplierDropdown(),200)"
        autocomplete="off"
        style="width:100%;background:rgba(255,255,255,0.04);border:1px solid var(--border2);border-radius:2px;color:var(--ivory);font-family:var(--sans);font-size:13px;font-weight:300;padding:10px 12px;outline:none;transition:border .15s">
      <div id="supplier-dropdown"
        style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg3);border:1px solid var(--border2);border-radius:2px;z-index:50;max-height:180px;overflow-y:auto">
        ${suppliers.map(s => `
          <div class="sup-opt" onmousedown="selectSupplierOption('${s}')"
            style="padding:10px 12px;cursor:pointer;font-size:13px;font-weight:300;color:var(--ivory);border-bottom:1px solid rgba(255,255,255,0.04);transition:background .1s"
            onmouseover="this.style.background='rgba(255,255,255,0.04)'"
            onmouseout="this.style.background=''">
            ${s}
          </div>`).join('')}
      </div>
    </div>`;
}

function showSupplierDropdown(input) {
  filterSupplierDropdown(input.value);
  document.getElementById('supplier-dropdown').style.display = 'block';
}

function hideSupplierDropdown() {
  const d = document.getElementById('supplier-dropdown');
  if (d) d.style.display = 'none';
}

function filterSupplierDropdown(val) {
  const q = val.toLowerCase();
  const drop = document.getElementById('supplier-dropdown');
  if (!drop) return;
  drop.style.display = 'block';
  drop.querySelectorAll('.sup-opt').forEach(opt => {
    opt.style.display = opt.textContent.trim().toLowerCase().includes(q) ? '' : 'none';
  });
}

function selectSupplierOption(name) {
  const input = document.getElementById('inv-supplier-input');
  if (input) input.value = name;
  hideSupplierDropdown();
}

// ─── DYNAMIC CATEGORIES & UNITS ───────────────────────────────────
let _catCache = {};  // { 'kitchen': [...], 'bar': [...] }
let _unitList = ['oz','lbs','kg','g','gallons','qt','cups','cases','bottles','units','ea','each','bags','boxes'];

async function loadCategories(section) {
  if (_catCache[section]) return _catCache[section];
  const { data } = await sb.from('inv_categories').select('name')
    .eq('restaurant_id', currentRestaurantId)
    .eq('section', section)
    .order('name');
  _catCache[section] = (data || []).map(r => r.name);
  return _catCache[section];
}

async function renderCatDropdown(section, currentVal='') {
  const cats = await loadCategories(section);
  const opts = cats.map(c =>
    `<option value="${c}"${c===currentVal?' selected':''}>${c}</option>`
  ).join('');
  return `<div style="display:flex;gap:6px;align-items:center">
    <select id="inv-cat" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid var(--border2);border-radius:2px;color:var(--ivory);font-family:var(--sans);font-size:13px;font-weight:300;padding:10px 12px;outline:none;cursor:pointer">
      <option value="">Select category...</option>
      ${opts}
    </select>
    <button type="button" onclick="addNewCategory()" title="Add new category"
      style="background:rgba(118,105,87,0.15);border:1px solid rgba(118,105,87,0.3);border-radius:2px;color:var(--olive);font-family:var(--sans);font-size:18px;font-weight:200;padding:6px 12px;cursor:pointer;flex-shrink:0;line-height:1">+</button>
  </div>`;
}

function renderUnitDropdown(currentVal='units') {
  const opts = _unitList.map(u =>
    `<option value="${u}"${u===currentVal?' selected':''}>${u}</option>`
  ).join('');
  return `<div style="display:flex;gap:6px;align-items:center">
    <select id="inv-unit" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid var(--border2);border-radius:2px;color:var(--ivory);font-family:var(--sans);font-size:13px;font-weight:300;padding:10px 12px;outline:none;cursor:pointer">
      ${opts}
    </select>
    <button type="button" onclick="addNewUnit()" title="Add new unit"
      style="background:rgba(118,105,87,0.15);border:1px solid rgba(118,105,87,0.3);border-radius:2px;color:var(--olive);font-family:var(--sans);font-size:18px;font-weight:200;padding:6px 12px;cursor:pointer;flex-shrink:0;line-height:1">+</button>
  </div>`;
}

async function addNewCategory() {
  const section = document.getElementById('inv-section').value || _invSection;
  const name = prompt('New category name:');
  if (!name || !name.trim()) return;
  const clean = name.trim();
  // Save to DB
  await sb.from('inv_categories').insert({
    restaurant_id: currentRestaurantId,
    section,
    name: clean
  });
  // Clear cache and re-render dropdown
  delete _catCache[section];
  const cats = await loadCategories(section);
  const catWrap = document.getElementById('inv-cat')?.closest('div');
  if (catWrap) {
    const currentVal = document.getElementById('inv-cat')?.value || '';
    catWrap.outerHTML = await renderCatDropdown(section, clean);
  }
}

function addNewUnit() {
  const name = prompt('New unit name (e.g. flats, trays, packs):');
  if (!name || !name.trim()) return;
  const clean = name.trim().toLowerCase();
  if (!_unitList.includes(clean)) _unitList.push(clean);
  const currentVal = document.getElementById('inv-unit')?.value || 'units';
  const unitWrap = document.getElementById('inv-unit')?.closest('div');
  if (unitWrap) unitWrap.outerHTML = renderUnitDropdown(clean);
}

// ─── INVENTORY SEARCH & FILTER ─────────────────────────────────────
function buildFilterBar(section, items) {
  const suppliers  = [...new Set(items.map(i => i.supplier).filter(Boolean))].sort();
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
  return `<div class="inv-filter-bar">
    <input class="inv-search" type="text" placeholder="Search items..."
      oninput="applyInvFilters('${section}')" id="inv-search-${section}">
    <select class="inv-filter-select" onchange="applyInvFilters('${section}')" id="inv-cat-${section}">
      <option value="">All categories</option>
      ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
    </select>
    <select class="inv-filter-select" onchange="applyInvFilters('${section}')" id="inv-sup-${section}">
      <option value="">All suppliers</option>
      ${suppliers.map(s => `<option value="${s}">${s}</option>`).join('')}
    </select>
    <select class="inv-filter-select" onchange="applyInvFilters('${section}')" id="inv-status-${section}">
      <option value="">All status</option>
      <option value="low">Low</option>
      <option value="watch">Watch</option>
      <option value="ok">OK</option>
    </select>
    <button class="btn btn-ghost btn-sm" onclick="clearInvFilters('${section}')">Clear</button>
  </div>`;
}

function getItemStatus(qty, par) {
  if (!par) return 'none';
  const r = qty / par;
  if (r <= 0.2) return 'low';
  if (r <= 0.5) return 'watch';
  return 'ok';
}

function applyInvFilters(section) {
  const search = document.getElementById(`inv-search-${section}`)?.value.toLowerCase() || '';
  const cat    = document.getElementById(`inv-cat-${section}`)?.value || '';
  const sup    = document.getElementById(`inv-sup-${section}`)?.value || '';
  const status = document.getElementById(`inv-status-${section}`)?.value || '';
  const rows   = document.querySelectorAll(`#${section}-tbody tr`);
  let visible  = 0;
  rows.forEach(row => {
    const show =
      (!search || (row.dataset.name||'').includes(search)) &&
      (!cat    || row.dataset.cat === cat) &&
      (!sup    || row.dataset.sup === sup) &&
      (!status || row.dataset.status === status);
    row.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  const empty = document.getElementById(`${section}-empty`);
  if (empty) empty.style.display = visible === 0 && !search && !cat && !sup && !status ? 'block' : 'none';
}

function clearInvFilters(section) {
  ['inv-search','inv-cat','inv-sup','inv-status'].forEach(id => {
    const el = document.getElementById(`${id}-${section}`);
    if (el) el.value = '';
  });
  document.querySelectorAll(`#${section}-tbody tr`).forEach(r => r.style.display = '');
}

// ─── renderInv with filter bar ─────────────────────────────────────
async function renderInv(section) {
  if (!currentRestaurantId) return;
  const { data } = await sb.from('inventory').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .eq('section', section).order('name');
  const items = data || [];
  const tbody = document.getElementById(section + '-tbody');
  const empty     = document.getElementById(section + '-empty');
  const tableWrap = tbody?.closest('.table-wrap');
  const card      = tableWrap?.parentElement;

  // Inject or refresh filter bar — insert before .table-wrap
  let bar = document.getElementById('inv-filter-' + section);
  if (!bar && tableWrap && card) {
    bar = document.createElement('div');
    bar.id = 'inv-filter-' + section;
    card.insertBefore(bar, tableWrap);
  }
  if (bar) bar.innerHTML = buildFilterBar(section, items);

  const badgeMap = { low:'badge-red', watch:'badge-amber', ok:'badge-green', none:'badge-blue' };
  const labelMap = { low:'Low', watch:'Watch', ok:'OK', none:'No Par' };

  if (!items.length) {
    if (tbody) tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
  } else {
    if (empty) empty.style.display = 'none';
    if (tbody) tbody.innerHTML = items.map(item => {
      const status = getItemStatus(item.qty, item.par_level);
      return `<tr
        data-name="${(item.name||'').toLowerCase()}"
        data-cat="${item.category||''}"
        data-sup="${item.supplier||''}"
        data-status="${status}">
        <td><span style="font-weight:400">${item.name}</span>${item.supplier?`<br><span style="font-size:11px;color:var(--muted)">${item.supplier}</span>`:''}</td>
        <td>${item.category||'—'}</td>
        <td>${item.qty}</td>
        <td>${item.unit}</td>
        <td>${item.par_level}</td>
        <td>$${(item.cost_per_unit||0).toFixed(2)}</td>
        <td><span class="badge ${badgeMap[status]}">${labelMap[status]}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" onclick='openInvModal("${section}",${JSON.stringify(item).replace(/'/g,"\\'")} )'>Edit</button>
          <button class="btn btn-danger btn-sm" style="margin-left:4px" onclick="deleteInvItem('${item.id}','${section}')">Del</button>
        </td>
      </tr>`;
    }).join('');
  }

  if (section === 'kitchen') {
    const low = items.filter(x => x.par_level > 0 && x.qty/x.par_level <= 0.2).length;
    const val = items.reduce((s,x) => s + x.qty*x.cost_per_unit, 0);
    document.getElementById('k-total').textContent = items.length;
    document.getElementById('k-low').textContent   = low;
    document.getElementById('k-value').textContent = '$'+Math.round(val).toLocaleString();
  }
  if (section === 'bar') {
    const low = items.filter(x => x.par_level > 0 && x.qty/x.par_level <= 0.2).length;
    const val = items.reduce((s,x) => s + x.qty*x.cost_per_unit, 0);
    document.getElementById('b-total').textContent = items.length;
    document.getElementById('b-low').textContent   = low;
    document.getElementById('b-value').textContent = '$'+Math.round(val).toLocaleString();
  }
}

// ─── BULK IMPORT ───────────────────────────────────────────────────
function openBulkImport(section) {
  document.getElementById('bulk-section').value = section;
  document.getElementById('bulk-section-label').textContent = section.charAt(0).toUpperCase()+section.slice(1);
  document.getElementById('bulk-paste').value = '';
  document.getElementById('bulk-preview').innerHTML = '';
  document.getElementById('bulk-preview-wrap').style.display = 'none';
  document.getElementById('bulk-import-btn').style.display = 'none';
  openModal('bulk-modal');
}

function parseBulkPaste() {
  const raw = document.getElementById('bulk-paste').value.trim();
  if (!raw) return;
  const lines = raw.split('\n').filter(l => l.trim());
  const rows  = lines.map(l => l.split('\t').map(c => c.trim()));
  let nameIdx=0,catIdx=-1,qtyIdx=-1,parIdx=-1,unitIdx=-1,costIdx=-1,supplierIdx=-1;
  const headers  = rows[0].map(h => h.toLowerCase());
  const startRow = headers.some(h => ['name','item','product','category','qty','quantity','unit','cost','par','supplier'].includes(h)) ? 1 : 0;
  if (startRow === 1) {
    headers.forEach((h,i) => {
      if (['name','item','product','description'].some(k=>h.includes(k))) nameIdx=i;
      if (['cat','category','type'].some(k=>h.includes(k))) catIdx=i;
      if (['qty','quantity','on hand','count'].some(k=>h.includes(k))) qtyIdx=i;
      if (['par','min','minimum','reorder'].some(k=>h.includes(k))) parIdx=i;
      if (['unit','uom','measure'].some(k=>h.includes(k))) unitIdx=i;
      if (['cost','price','rate'].some(k=>h.includes(k))) costIdx=i;
      if (['supplier','vendor','distributor'].some(k=>h.includes(k))) supplierIdx=i;
    });
  }
  const items = rows.slice(startRow).map(r => ({
    name:r[nameIdx]||'',category:catIdx>=0?(r[catIdx]||''):'',
    qty:qtyIdx>=0?(parseFloat(r[qtyIdx])||0):0,
    par_level:parIdx>=0?(parseFloat(r[parIdx])||0):0,
    unit:unitIdx>=0?(r[unitIdx]||'units'):'units',
    cost_per_unit:costIdx>=0?(parseFloat(r[costIdx])||0):0,
    supplier:supplierIdx>=0?(r[supplierIdx]||''):''
  })).filter(i=>i.name);
  if (!items.length) {
    document.getElementById('bulk-preview').innerHTML='<div style="color:var(--red);font-size:13px">Could not parse items. Make sure you copied cells including headers.</div>';
    document.getElementById('bulk-preview-wrap').style.display='block'; return;
  }
  let html=`<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Found <strong style="color:var(--olive)">${items.length} items</strong> — review before importing:</div>`;
  html+=`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Category</th><th>Qty</th><th>Unit</th><th>Par</th><th>Cost/Unit</th><th>Supplier</th></tr></thead><tbody>`;
  items.forEach((item,i) => {
    html+=`<tr>
      <td><input value="${item.name}" onchange="updateBulkItem(${i},'name',this.value)" style="padding:4px 6px;font-size:12px"></td>
      <td><input value="${item.category}" onchange="updateBulkItem(${i},'category',this.value)" style="padding:4px 6px;font-size:12px"></td>
      <td><input type="number" value="${item.qty}" onchange="updateBulkItem(${i},'qty',this.value)" style="padding:4px 6px;font-size:12px;width:60px"></td>
      <td><input value="${item.unit}" onchange="updateBulkItem(${i},'unit',this.value)" style="padding:4px 6px;font-size:12px;width:60px"></td>
      <td><input type="number" value="${item.par_level}" onchange="updateBulkItem(${i},'par_level',this.value)" style="padding:4px 6px;font-size:12px;width:60px"></td>
      <td><input type="number" step="0.01" value="${item.cost_per_unit}" onchange="updateBulkItem(${i},'cost_per_unit',this.value)" style="padding:4px 6px;font-size:12px;width:70px"></td>
      <td><input value="${item.supplier}" onchange="updateBulkItem(${i},'supplier',this.value)" style="padding:4px 6px;font-size:12px"></td>
    </tr>`;
  });
  html+='</tbody></table></div>';
  window._bulkItems=items;
  document.getElementById('bulk-preview').innerHTML=html;
  document.getElementById('bulk-preview-wrap').style.display='block';
  const btn=document.getElementById('bulk-import-btn');
  btn.style.display='inline-flex'; btn.textContent='Import '+items.length+' Items';
}

function updateBulkItem(idx,field,value) {
  if (!window._bulkItems) return;
  window._bulkItems[idx][field]=['qty','par_level','cost_per_unit'].includes(field)?parseFloat(value)||0:value;
}

async function confirmBulkImport() {
  const items = window._bulkItems;
  const section = document.getElementById('bulk-section').value;
  if (!items?.length) return;
  const btn = document.getElementById('bulk-import-btn');
  btn.textContent = 'Importing...'; btn.disabled = true;

  // Load existing items to check for duplicates by name
  const { data: existing } = await sb.from('inventory').select('id, name')
    .eq('restaurant_id', currentRestaurantId).eq('section', section);

  // Lookup map: lowercase name → id
  const existingMap = {};
  (existing || []).forEach(e => { existingMap[e.name.toLowerCase().trim()] = e.id; });

  let inserted = 0, updated = 0;
  for (const item of items) {
    if (!item.name) continue;
    const key = item.name.toLowerCase().trim();
    const existingId = existingMap[key];
    if (existingId) {
      // Update existing — only overwrite fields that have real values
      const update = { updated_at: new Date().toISOString() };
      if (item.category)          update.category        = item.category;
      if (item.unit)              update.unit            = item.unit;
      if (item.qty > 0)           update.qty             = item.qty;
      if (item.par_level > 0)     update.par_level       = item.par_level;
      if (item.cost_per_unit > 0) update.cost_per_unit   = item.cost_per_unit;
      if (item.supplier)          update.supplier        = item.supplier;
      await sb.from('inventory').update(update).eq('id', existingId);
      updated++;
    } else {
      // Insert new item
      await sb.from('inventory').insert({
        ...item, section,
        restaurant_id: currentRestaurantId,
        updated_at: new Date().toISOString()
      });
      inserted++;
    }
  }

  clearInvCache();
  showToast();
  closeModal('bulk-modal');
  renderInv(section);
  window._bulkItems = null;
  btn.textContent = 'Import Items'; btn.disabled = false;
  alert(`Done!\n\n✅ ${inserted} new item${inserted!==1?'s':''} added\n🔄 ${updated} existing item${updated!==1?'s':''} updated`);
}

// ─── WEEKLY COUNT SHEET ────────────────────────────────────────────
// ─── ORDER REQUEST (BOH/Bar manager fills in what they need) ──────────
async function openCountSheet(section) {
  if (!currentRestaurantId) return;
  document.getElementById('count-section').value = section;
  const label = section === 'kitchen' ? 'Kitchen' : section === 'bar' ? 'Bar' : 'Misc';
  document.getElementById('count-section-title').textContent = label + ' — Order Request';

  const {data} = await sb.from('inventory').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .eq('section', section).order('category').order('name');
  const items = data || [];
  if (!items.length) { alert('No items in this section yet.'); return; }

  // Load any saved draft for this section
  const draft = await loadDraftOrder(section);
  const draftMap = {};
  if (draft?.items) draft.items.forEach(i => { draftMap[i.name] = i; });

  const groups = {};
  items.forEach(item => {
    const cat = item.category || 'Uncategorized';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });

  const UNITS = ['oz','lbs','kg','g','gallons','qt','cups','cases','bottles','units','ea'];

  let html = `<div style="display:flex;gap:8px;margin-bottom:14px">
    <input id="oreq-search" type="text" placeholder="Search items..."
      oninput="filterOrderRequest(this.value)"
      style="flex:1;background:rgba(255,255,255,0.04);border:1px solid var(--border2);border-radius:2px;color:var(--ivory);font-family:var(--sans);font-size:13px;font-weight:300;padding:10px 14px;outline:none">
  </div>`;

  if (draft) {
    html += `<div style="font-size:11px;font-weight:300;color:var(--olive);margin-bottom:14px;padding:10px 14px;border-radius:2px;border:1px solid rgba(118,105,87,0.3);background:rgba(118,105,87,0.08)">
      📋 Draft order restored — ${draft.items.length} item${draft.items.length!==1?'s':''} saved. Continue where you left off.
    </div>`;
  }

  html += `<div style="font-size:11px;font-weight:300;color:var(--muted);margin-bottom:16px;line-height:1.6;background:rgba(255,255,255,0.03);padding:10px 14px;border-radius:2px;border:1px solid var(--border)">
    Check the items you need and enter the quantity. Use <strong style="color:var(--ivory)">Save Draft</strong> to pause and come back later.
  </div>`;

  Object.entries(groups).forEach(([cat, catItems]) => {
    html += `<div class="count-category"><div class="count-cat-header">${cat}</div>`;
    catItems.forEach(item => {
      const u = item.unit || 'units';
      const saved = draftMap[item.name];
      const savedQty = saved?.qty || '';
      const savedUnit = saved?.unit || u;
      const isChecked = saved?.checked || (savedQty > 0);
      const opacity = isChecked ? '1' : '0.5';
      const unitOpts = UNITS.map(x => `<option value="${x}"${x===savedUnit?' selected':''}>${x}</option>`).join('');
      html += `<div class="count-row" id="oreq-${item.id}" style="opacity:${opacity};transition:opacity .15s">
        <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0">
          <input type="checkbox" class="req-check" data-id="${item.id}"
            style="width:20px;height:20px;min-width:20px;cursor:pointer;accent-color:var(--olive);margin:0;flex-shrink:0"
            ${isChecked?'checked':''} onchange="toggleReqRow(this)">
          <div class="count-item-info" style="min-width:0">
            <div class="count-item-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
            <div class="count-item-meta">${u}${item.supplier ? ' · ' + item.supplier : ''}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <input type="number" class="req-qty" data-id="${item.id}" data-name="${item.name}"
            data-supplier="${item.supplier||'No Supplier Assigned'}"
            value="${savedQty}" placeholder="Qty" min="0" step="0.01"
            oninput="toggleReqRowByQty(this)"
            style="width:80px;text-align:center;font-size:20px;font-weight:200;padding:8px 6px;border-radius:2px;background:rgba(255,255,255,0.04);border:1px solid var(--border2);color:var(--ivory);font-family:var(--sans);outline:none">
          <select class="req-unit" style="background:rgba(255,255,255,0.04);border:1px solid var(--border2);border-radius:2px;color:var(--ivory);font-family:var(--sans);font-size:12px;font-weight:300;padding:8px 6px;outline:none;cursor:pointer;width:80px">${unitOpts}</select>
        </div>
      </div>`;
    });
    html += '</div>';
  });

  document.getElementById('count-body').innerHTML = html;
  document.getElementById('count-date').textContent =
    new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  const btn = document.getElementById('submit-count-btn');
  btn.textContent = 'Submit Order Request';
  btn.disabled = false;
  btn.onclick = submitCount;
  openModal('count-modal');
}

function toggleReqRow(cb) {
  const row = document.getElementById('oreq-' + cb.dataset.id);
  row.style.opacity = cb.checked ? '1' : '0.5';
  if (cb.checked) row.querySelector('.req-qty').focus();
  else row.querySelector('.req-qty').value = '';
}

function toggleReqRowByQty(input) {
  const row = input.closest('.count-row');
  const cb = row.querySelector('.req-check');
  const hasVal = parseFloat(input.value) > 0;
  if (cb) { cb.checked = hasVal; row.style.opacity = hasVal ? '1' : '0.5'; }
}

function filterOrderRequest(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('.count-row[id^="oreq-"]').forEach(row => {
    const name = row.querySelector('.count-item-name')?.textContent.toLowerCase() || '';
    const meta = row.querySelector('.count-item-meta')?.textContent.toLowerCase() || '';
    row.style.display = (!q || name.includes(q) || meta.includes(q)) ? '' : 'none';
  });
  // Show/hide category headers based on visible items
  document.querySelectorAll('.count-category').forEach(cat => {
    const visible = [...cat.querySelectorAll('.count-row')].some(r => r.style.display !== 'none');
    cat.style.display = visible ? '' : 'none';
  });
}

function highlightCountRow(input) {}  // kept for compatibility

async function submitCount() {
  const rows = document.querySelectorAll('.count-row[id^="oreq-"]');
  const section = document.getElementById('count-section').value;
  const requested = [];
  rows.forEach(row => {
    const cb = row.querySelector('.req-check');
    const qtyInput = row.querySelector('.req-qty');
    const qty = parseFloat(qtyInput?.value);
    const unit = row.querySelector('.req-unit')?.value || 'units';
    const name = qtyInput?.dataset.name || '';
    const supplier = qtyInput?.dataset.supplier || 'No Supplier Assigned';
    if (cb?.checked && qty > 0) requested.push({ name, qty, unit, supplier });
  });
  if (!requested.length) { alert('Please check at least one item and enter a quantity.'); return; }

  // Save submitted order to history
  const label = section === 'kitchen' ? 'Kitchen' : section === 'bar' ? 'Bar' : 'Misc';
  await sb.from('orders').insert({
    restaurant_id: currentRestaurantId,
    section,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    items: requested
  });
  // Clear any draft for this section
  await sb.from('orders').delete()
    .eq('restaurant_id', currentRestaurantId)
    .eq('section', section)
    .eq('status', 'draft');

  closeModal('count-modal');
  setTimeout(() => showOrderRequestReport(requested, section), 200);
}

async function saveDraftOrder() {
  const rows = document.querySelectorAll('.count-row[id^="oreq-"]');
  const section = document.getElementById('count-section').value;
  const items = [];
  rows.forEach(row => {
    const cb = row.querySelector('.req-check');
    const qtyInput = row.querySelector('.req-qty');
    const qty = parseFloat(qtyInput?.value);
    const unit = row.querySelector('.req-unit')?.value || 'units';
    const name = qtyInput?.dataset.name || '';
    const supplier = qtyInput?.dataset.supplier || '';
    if (cb?.checked || (qty > 0)) items.push({
      name, qty: qty || 0, unit, supplier,
      checked: cb?.checked || false
    });
  });
  // Upsert draft
  await sb.from('orders').delete()
    .eq('restaurant_id', currentRestaurantId)
    .eq('section', section).eq('status', 'draft');
  if (items.length) {
    await sb.from('orders').insert({
      restaurant_id: currentRestaurantId,
      section, status: 'draft', items
    });
  }
  showToast();
  closeModal('count-modal');
}

async function loadDraftOrder(section) {
  const { data } = await sb.from('orders').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .eq('section', section).eq('status', 'draft')
    .order('created_at', { ascending: false }).limit(1);
  return data?.[0] || null;
}

function showOrderRequestReport(items, section) {
  const label = section === 'kitchen' ? 'Kitchen' : section === 'bar' ? 'Bar' : 'Misc';
  const date = new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});

  // Group by supplier
  const bySupplier = {};
  items.forEach(item => {
    const sup = item.supplier || 'No Supplier Assigned';
    if (!bySupplier[sup]) bySupplier[sup] = [];
    bySupplier[sup].push(item);
  });

  const thStyle = `text-align:left;padding:8px 10px;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);border-bottom:1px solid var(--border)`;
  const tdBase = `padding:11px 10px;border-bottom:1px solid rgba(255,255,255,0.03);font-weight:300;color:var(--ivory)`;

  let html = `<div style="font-size:11px;color:var(--muted);margin-bottom:20px;letter-spacing:0.5px">${label} · ${date} · ${items.length} item${items.length!==1?'s':''} requested</div>`;

  // ── SECTION 1: By Supplier ─────────────────────────────────────────
  html += `<div style="font-size:10px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--olive);margin-bottom:12px">By Supplier</div>`;

  Object.entries(bySupplier).forEach(([supplier, sitems]) => {
    html += `<div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:2px;padding:16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:13px;font-weight:400;color:var(--ivory);letter-spacing:0.5px;text-transform:uppercase">${supplier}</div>
        <div style="font-size:10px;font-weight:300;color:var(--muted)">${sitems.length} item${sitems.length!==1?'s':''}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr>
          <th style="${thStyle}">Item</th>
          <th style="${thStyle};text-align:center">Qty</th>
          <th style="${thStyle}">Unit</th>
        </tr></thead>
        <tbody>`;
    sitems.forEach(item => {
      html += `<tr>
        <td style="${tdBase}">${item.name}</td>
        <td style="${tdBase};text-align:center;font-size:18px;font-weight:200">${item.qty}</td>
        <td style="${tdBase};color:var(--muted)">${item.unit}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  });

  // ── SECTION 2: Full Summary (for confirmation on delivery) ─────────
  html += `<div style="font-size:10px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--olive);margin:24px 0 12px">Full Order Summary</div>`;
  html += `<div style="font-size:11px;font-weight:300;color:var(--muted);margin-bottom:12px">Use this list to confirm everything arrived when the order is received.</div>`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr>
      <th style="${thStyle}">Item</th>
      <th style="${thStyle};text-align:center">Qty</th>
      <th style="${thStyle}">Unit</th>
      <th style="${thStyle}">Supplier</th>
      <th style="${thStyle};text-align:center">✓</th>
    </tr></thead><tbody>`;
  items.forEach(item => {
    html += `<tr>
      <td style="${tdBase}">${item.name}</td>
      <td style="${tdBase};text-align:center;font-size:18px;font-weight:200">${item.qty}</td>
      <td style="${tdBase};color:var(--muted)">${item.unit}</td>
      <td style="${tdBase};color:var(--muted)">${item.supplier||'—'}</td>
      <td style="${tdBase};text-align:center">
        <input type="checkbox" style="width:16px;height:16px;cursor:pointer;accent-color:var(--olive)">
      </td>
    </tr>`;
  });
  html += `</tbody></table>`;

  // ── Print button ───────────────────────────────────────────────────
  html += `<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end">
    <button onclick="printOrderRequest()" class="btn btn-ghost btn-sm">🖨 Print / Save PDF</button>
  </div>`;

  document.getElementById('order-body').innerHTML = html;
  document.getElementById('order-date-label').textContent = `${label} · ${date}`;
  openModal('order-modal');
}

function printOrderRequest() {
  const content = document.getElementById('order-body').innerHTML;
  const date = document.getElementById('order-date-label').textContent;
  const rest = document.getElementById('restaurant-select')?.options[document.getElementById('restaurant-select')?.selectedIndex]?.text || 'Restaurant';
  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Order Request — ${rest}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:32px;color:#1a1a1a;max-width:800px;margin:0 auto}
    h1{font-size:18px;letter-spacing:2px;text-transform:uppercase;font-weight:400;margin-bottom:4px}
    .sub{font-size:12px;color:#666;margin-bottom:24px}
    .section-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:2px;color:#766957;margin:24px 0 10px}
    .supplier-block{border:1px solid #eee;padding:16px;margin-bottom:16px;page-break-inside:avoid}
    .supplier-name{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;padding:7px 8px;font-size:10px;font-weight:600;text-transform:uppercase;color:#666;border-bottom:2px solid #ddd}
    th.center,td.center{text-align:center}
    td{padding:9px 8px;border-bottom:1px solid #eee;font-weight:300}
    input[type=checkbox]{width:14px;height:14px}
    @media print{button{display:none}}
  </style></head><body>
  <h1>${rest}</h1>
  <div class="sub">Order Request · ${date}</div>
  ${content}
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

// ─── ORDER RECEIVED (supplier-first workflow) ──────────────────────
async function openOrderReceived(section) {
  if (!currentRestaurantId) return;
  document.getElementById('count-section').value = section;
  const label = section === 'kitchen' ? 'Kitchen' : section === 'bar' ? 'Bar' : 'Misc';
  document.getElementById('count-section-title').textContent = label + ' — Order Received';

  // Load all inventory items for this section
  const { data } = await sb.from('inventory').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .eq('section', section).order('name');
  const items = data || [];
  if (!items.length) { alert('No items in this section yet.'); return; }

  // Get unique suppliers
  const suppliers = [...new Set(items.map(i => i.supplier).filter(Boolean))].sort();
  suppliers.push('No Supplier Assigned');

  const UNITS = ['oz','lbs','kg','g','gallons','qt','cups','cases','bottles','units','ea'];

  let html = `
    <div style="margin-bottom:16px">
      <label style="font-size:9px;font-weight:400;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:6px;display:block">Filter by Supplier</label>
      <select id="orec-supplier-filter" onchange="filterOrderReceivedBySupplier()"
        style="width:100%;background:rgba(255,255,255,0.04);border:1px solid var(--border2);border-radius:2px;color:var(--ivory);font-family:var(--sans);font-size:13px;font-weight:300;padding:10px 12px;outline:none;cursor:pointer">
        <option value="">— All suppliers —</option>
        ${suppliers.map(s => `<option value="${s}">${s}</option>`).join('')}
      </select>
    </div>
    <div style="font-size:11px;font-weight:300;color:var(--muted);margin-bottom:16px;line-height:1.6;background:rgba(255,255,255,0.03);padding:10px 14px;border-radius:2px;border:1px solid var(--border)">
      Select a supplier to filter items. Check each item received, enter quantity and price paid. Prices update automatically in food cost calculations.
    </div>`;

  // Render all items grouped by supplier
  const grouped = {};
  items.forEach(item => {
    const sup = item.supplier || 'No Supplier Assigned';
    if (!grouped[sup]) grouped[sup] = [];
    grouped[sup].push(item);
  });

  Object.entries(grouped).forEach(([supplier, sitems]) => {
    html += `<div class="orec-supplier-group" data-supplier="${supplier}" style="margin-bottom:20px">
      <div style="font-size:10px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--olive);padding:6px 0;border-bottom:1px solid var(--border);margin-bottom:8px">${supplier}</div>`;
    sitems.forEach(item => {
      const u = item.unit || 'units';
      const unitOpts = UNITS.map(x => `<option value="${x}"${x===u?' selected':''}>${x}</option>`).join('');
      html += `<div class="count-row" id="orec-${item.id}" style="opacity:0.45;transition:opacity .15s;flex-wrap:wrap;gap:8px;padding:10px 6px">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:180px">
          <input type="checkbox" class="rec-check" data-id="${item.id}"
            style="width:20px;height:20px;min-width:20px;cursor:pointer;accent-color:var(--olive);margin:0;flex-shrink:0"
            onchange="toggleRecRow(this)">
          <div class="count-item-info">
            <div class="count-item-name">${item.name}</div>
            <div class="count-item-meta">Current: ${item.qty} ${u} · Last cost: $${(item.cost_per_unit||0).toFixed(2)}/${u}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <input type="number" class="rec-qty" data-id="${item.id}" data-current="${item.qty}"
            placeholder="Qty" min="0" step="0.01"
            oninput="toggleRecRowByQty(this)"
            style="width:70px;text-align:center;font-size:16px;font-weight:200;padding:8px 4px;border-radius:2px;background:rgba(255,255,255,0.04);border:1px solid var(--border2);color:var(--ivory);font-family:var(--sans);outline:none">
          <select class="rec-unit" style="background:rgba(255,255,255,0.04);border:1px solid var(--border2);border-radius:2px;color:var(--ivory);font-family:var(--sans);font-size:11px;padding:8px 4px;outline:none;cursor:pointer;width:68px">${unitOpts}</select>
          <div style="display:flex;align-items:center;gap:3px">
            <span style="font-size:12px;color:var(--muted)">$</span>
            <input type="number" class="rec-price" placeholder="$/unit" min="0" step="0.01"
              value="${item.cost_per_unit||''}"
              style="width:74px;text-align:center;font-size:13px;font-weight:300;padding:8px 4px;border-radius:2px;background:rgba(255,255,255,0.04);border:1px solid var(--border2);color:var(--ivory);font-family:var(--sans);outline:none">
          </div>
        </div>
      </div>`;
    });
    html += `</div>`;
  });

  document.getElementById('count-body').innerHTML = html;
  document.getElementById('count-date').textContent =
    new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  const btn = document.getElementById('submit-count-btn');
  btn.textContent = 'Save Order Received';
  btn.disabled = false;
  btn.onclick = submitOrderReceived;
  openModal('count-modal');
}

function filterOrderReceivedBySupplier() {
  const val = document.getElementById('orec-supplier-filter')?.value || '';
  document.querySelectorAll('.orec-supplier-group').forEach(group => {
    group.style.display = (!val || group.dataset.supplier === val) ? '' : 'none';
  });
}

function toggleRecRow(cb) {
  const row = document.getElementById('orec-' + cb.dataset.id);
  row.style.opacity = cb.checked ? '1' : '0.45';
  if (cb.checked) row.querySelector('.rec-qty').focus();
}

function toggleRecRowByQty(input) {
  const row = input.closest('.count-row');
  const cb = row.querySelector('.rec-check');
  const hasVal = parseFloat(input.value) > 0;
  if (cb) { cb.checked = hasVal; row.style.opacity = hasVal ? '1' : '0.45'; }
}

async function submitOrderReceived() {
  const rows = document.querySelectorAll('.count-row[id^="orec-"]');
  const section = document.getElementById('count-section').value;
  const updates = [];
  rows.forEach(row => {
    const cb = row.querySelector('.rec-check');
    if (!cb?.checked) return;
    const id          = cb.dataset.id;
    const qtyReceived = parseFloat(row.querySelector('.rec-qty')?.value) || 0;
    const currentQty  = parseFloat(row.querySelector('.rec-qty')?.dataset.current) || 0;
    const unit        = row.querySelector('.rec-unit')?.value || 'units';
    const newPrice    = parseFloat(row.querySelector('.rec-price')?.value);
    const newQty      = currentQty + qtyReceived;
    const update      = { qty: newQty, unit, updated_at: new Date().toISOString() };
    if (!isNaN(newPrice) && newPrice > 0) update.cost_per_unit = newPrice;
    updates.push({ id, ...update });
  });
  if (!updates.length) { alert('Please check at least one item that was received.'); return; }
  const btn = document.getElementById('submit-count-btn');
  btn.textContent = 'Saving...'; btn.disabled = true;

  await Promise.all(updates.map(u => {
    const { id, ...fields } = u;
    return sb.from('inventory').update(fields).eq('id', id);
  }));

  // Clear inv cache so food cost calculator uses new prices
  clearInvCache();

  showToast();
  closeModal('count-modal');
  renderInv(section);
  btn.onclick = submitCount;

  const priceUpdates = updates.filter(u => u.cost_per_unit).length;
  const msg = `Order saved! ${updates.length} item${updates.length!==1?'s':''} updated.` +
    (priceUpdates ? `
${priceUpdates} price${priceUpdates!==1?'s':''} updated — food cost calculator now reflects new costs.` : '');
  alert(msg);
}
// ─── LINKED INGREDIENT PICKER ──────────────────────────────────────
let _invCache=null;
async function loadInvCache() {
  if (!currentRestaurantId) return [];
  if (_invCache) return _invCache;
  const {data}=await sb.from('inventory').select('id,name,unit,cost_per_unit,category,supplier').eq('restaurant_id',currentRestaurantId).order('name');
  _invCache=data||[]; return _invCache;
}
function clearInvCache(){_invCache=null;}

function fcAddRow(name='',qty=1,unit='',cost=0,invId='') {
  const row=document.createElement('div');
  row.className='ing-row-build';
  row.innerHTML=`
    <div style="position:relative;flex:2">
      <input class="ing-name-input" placeholder="Search inventory..." value="${name}"
        oninput="ingSearchInput(this)" onfocus="ingSearchInput(this)"
        onblur="setTimeout(()=>closeIngDropdown(this),200)"
        data-inv-id="${invId}" style="width:100%">
      <div class="ing-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg3);border:1px solid var(--border2);border-radius:2px;z-index:50;max-height:160px;overflow-y:auto"></div>
    </div>
    <input type="number" class="ing-qty" value="${qty}" min="0" step="0.01" oninput="fcCalc()" style="flex:0 0 70px">
    <input class="ing-unit" value="${unit}" placeholder="unit" style="flex:0 0 70px">
    <input type="number" class="ing-cost" step="0.01" value="${cost}" min="0" oninput="fcCalc()" placeholder="$/unit" style="flex:0 0 80px">
    <button onclick="this.closest('.ing-row-build').remove();fcCalc()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;line-height:1;flex:0 0 24px">×</button>`;
  document.getElementById('fc-rows').appendChild(row);
  fcCalc();
}

async function ingSearchInput(input) {
  const val=input.value.toLowerCase().trim();
  const inv=await loadInvCache();
  const drop=input.nextElementSibling;
  if (!val){drop.style.display='none';return;}
  const matches=inv.filter(i=>i.name.toLowerCase().includes(val)).slice(0,8);
  if (!matches.length){drop.style.display='none';return;}
  drop.innerHTML=matches.map(i=>`<div class="ing-drop-item" onmousedown="selectIngItem(this)"
    data-id="${i.id}" data-name="${i.name}" data-unit="${i.unit}" data-cost="${i.cost_per_unit||0}">
    <span style="font-size:13px;font-weight:300;color:var(--ivory)">${i.name}</span>
    <span style="font-size:11px;color:var(--muted);float:right">$${(i.cost_per_unit||0).toFixed(2)}/${i.unit}</span>
  </div>`).join('');
  drop.style.display='block';
}

function selectIngItem(item) {
  const row=item.closest('.ing-row-build');
  row.querySelector('.ing-name-input').value=item.dataset.name;
  row.querySelector('.ing-name-input').dataset.invId=item.dataset.id;
  row.querySelector('.ing-unit').value=item.dataset.unit;
  row.querySelector('.ing-cost').value=parseFloat(item.dataset.cost).toFixed(2);
  item.closest('.ing-dropdown').style.display='none';
  fcCalc();
}

function closeIngDropdown(input) {
  const drop=input.nextElementSibling;
  if (drop) drop.style.display='none';
}

function fcCalc() {
  const rows=document.querySelectorAll('.ing-row-build');
  let raw=0;
  rows.forEach(r=>{
    const qty=parseFloat(r.querySelector('.ing-qty')?.value)||0;
    const cost=parseFloat(r.querySelector('.ing-cost')?.value)||0;
    raw+=qty*cost;
  });
  const wastePct=(parseFloat(document.getElementById('fc-waste')?.value)||0)/100;
  const waste=raw*wastePct;
  const total=raw+waste+0.5;
  const target=parseInt(document.getElementById('fc-target')?.value)||28;
  document.getElementById('fc-target-lbl').textContent=target+'%';
  const suggested=total/(target/100);
  document.getElementById('fc-raw').textContent='$'+raw.toFixed(2);
  document.getElementById('fc-waste-cost').textContent='$'+waste.toFixed(2);
  document.getElementById('fc-total').textContent='$'+total.toFixed(2);
  document.getElementById('fc-price').textContent='$'+suggested.toFixed(2);
  document.getElementById('fc-gp').textContent='$'+(suggested-total).toFixed(2);
  const pctEl=document.getElementById('fc-actual-pct');
  pctEl.textContent=target+'%';
  pctEl.className=target<=25?'cost-good':target<=32?'cost-ok':'cost-bad';
}

async function fcSaveAsRecipe() {
  const name=document.getElementById('fc-dish').value.trim();
  if (!name) return alert('Enter a dish name first.');
  const total=parseFloat(document.getElementById('fc-total').textContent.replace('$',''))||0;
  const price=parseFloat(document.getElementById('fc-price').textContent.replace('$',''))||0;
  const rows=document.querySelectorAll('.ing-row-build');
  const ings=[];
  rows.forEach(r=>{
    const n=r.querySelector('.ing-name-input')?.value;
    const qty=r.querySelector('.ing-qty')?.value;
    const unit=r.querySelector('.ing-unit')?.value;
    const cost=r.querySelector('.ing-cost')?.value;
    if (n) ings.push(`${qty} ${unit} ${n} @ $${cost}/unit`);
  });
  await sb.from('recipes').insert({
    restaurant_id:currentRestaurantId,name,category:'Main',
    serves:parseInt(document.getElementById('fc-serves')?.value)||1,
    plate_cost:parseFloat(total.toFixed(2)),
    menu_price:parseFloat(price.toFixed(2)),
    ingredients:ings.join('\n'),method:''
  });
  showToast(); alert('Recipe saved to Recipe Book!');
}
