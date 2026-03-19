// ─── BULK IMPORT ───────────────────────────────────────────────────
function openBulkImport(section) {
  document.getElementById('bulk-section').value = section;
  document.getElementById('bulk-section-label').textContent =
    section.charAt(0).toUpperCase() + section.slice(1);
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
  const rows = lines.map(l => l.split('\t').map(c => c.trim()));
  let nameIdx=0,catIdx=-1,qtyIdx=-1,parIdx=-1,unitIdx=-1,costIdx=-1,supplierIdx=-1;
  const headers = rows[0].map(h => h.toLowerCase());
  const startRow = headers.some(h =>
    ['name','item','product','category','qty','quantity','unit','cost','par','supplier'].includes(h)
  ) ? 1 : 0;
  if (startRow === 1) {
    headers.forEach((h, i) => {
      if (['name','item','product','description'].some(k => h.includes(k))) nameIdx = i;
      if (['cat','category','type'].some(k => h.includes(k))) catIdx = i;
      if (['qty','quantity','on hand','count'].some(k => h.includes(k))) qtyIdx = i;
      if (['par','min','minimum','reorder'].some(k => h.includes(k))) parIdx = i;
      if (['unit','uom','measure'].some(k => h.includes(k))) unitIdx = i;
      if (['cost','price','rate'].some(k => h.includes(k))) costIdx = i;
      if (['supplier','vendor','distributor'].some(k => h.includes(k))) supplierIdx = i;
    });
  }
  const items = rows.slice(startRow).map(r => ({
    name: r[nameIdx] || '',
    category: catIdx >= 0 ? (r[catIdx] || '') : '',
    qty: qtyIdx >= 0 ? (parseFloat(r[qtyIdx]) || 0) : 0,
    par_level: parIdx >= 0 ? (parseFloat(r[parIdx]) || 0) : 0,
    unit: unitIdx >= 0 ? (r[unitIdx] || 'units') : 'units',
    cost_per_unit: costIdx >= 0 ? (parseFloat(r[costIdx]) || 0) : 0,
    supplier: supplierIdx >= 0 ? (r[supplierIdx] || '') : ''
  })).filter(i => i.name);
  if (!items.length) {
    document.getElementById('bulk-preview').innerHTML =
      '<div style="color:var(--red);font-size:13px">Could not parse items. Make sure you copied cells including headers.</div>';
    document.getElementById('bulk-preview-wrap').style.display = 'block';
    return;
  }
  let html = `<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Found <strong style="color:var(--amber)">${items.length} items</strong> — review before importing:</div>`;
  html += `<div class="table-wrap"><table>
    <thead><tr><th>Name</th><th>Category</th><th>Qty</th><th>Unit</th><th>Par</th><th>Cost/Unit</th><th>Supplier</th></tr></thead><tbody>`;
  items.forEach((item, i) => {
    html += `<tr>
      <td><input value="${item.name}" onchange="updateBulkItem(${i},'name',this.value)" style="padding:4px 6px;font-size:12px"></td>
      <td><input value="${item.category}" onchange="updateBulkItem(${i},'category',this.value)" style="padding:4px 6px;font-size:12px"></td>
      <td><input type="number" value="${item.qty}" onchange="updateBulkItem(${i},'qty',this.value)" style="padding:4px 6px;font-size:12px;width:60px"></td>
      <td><input value="${item.unit}" onchange="updateBulkItem(${i},'unit',this.value)" style="padding:4px 6px;font-size:12px;width:60px"></td>
      <td><input type="number" value="${item.par_level}" onchange="updateBulkItem(${i},'par_level',this.value)" style="padding:4px 6px;font-size:12px;width:60px"></td>
      <td><input type="number" step="0.01" value="${item.cost_per_unit}" onchange="updateBulkItem(${i},'cost_per_unit',this.value)" style="padding:4px 6px;font-size:12px;width:70px"></td>
      <td><input value="${item.supplier}" onchange="updateBulkItem(${i},'supplier',this.value)" style="padding:4px 6px;font-size:12px"></td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  window._bulkItems = items;
  document.getElementById('bulk-preview').innerHTML = html;
  document.getElementById('bulk-preview-wrap').style.display = 'block';
  const btn = document.getElementById('bulk-import-btn');
  btn.style.display = 'inline-flex';
  btn.textContent = 'Import ' + items.length + ' Items';
}

function updateBulkItem(idx, field, value) {
  if (!window._bulkItems) return;
  window._bulkItems[idx][field] = ['qty','par_level','cost_per_unit'].includes(field)
    ? parseFloat(value) || 0 : value;
}

async function confirmBulkImport() {
  const items = window._bulkItems;
  const section = document.getElementById('bulk-section').value;
  if (!items || !items.length) return;
  const btn = document.getElementById('bulk-import-btn');
  btn.textContent = 'Importing...'; btn.disabled = true;
  const rows = items.map(item => ({
    ...item, restaurant_id: currentRestaurantId, section,
    updated_at: new Date().toISOString()
  }));
  const { error } = await sb.from('inventory').insert(rows);
  if (error) { alert('Import error: ' + error.message); btn.textContent = 'Import Items'; btn.disabled = false; return; }
  showToast();
  closeModal('bulk-modal');
  renderInv(section);
  window._bulkItems = null;
}

// ─── WEEKLY COUNT SHEET ────────────────────────────────────────────
async function openCountSheet(section) {
  if (!currentRestaurantId) return;
  document.getElementById('count-section').value = section;
  document.getElementById('count-section-title').textContent =
    section.charAt(0).toUpperCase() + section.slice(1) + ' — Weekly Count';
  const { data } = await sb.from('inventory').select('*')
    .eq('restaurant_id', currentRestaurantId)
    .eq('section', section).order('category').order('name');
  const items = data || [];
  if (!items.length) { alert('No items in this section yet. Add items first.'); return; }
  const groups = {};
  items.forEach(item => {
    const cat = item.category || 'Uncategorized';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });
  let html = '';
  Object.entries(groups).forEach(([cat, catItems]) => {
    html += `<div class="count-category"><div class="count-cat-header">${cat}</div>`;
    catItems.forEach(item => {
      html += `<div class="count-row">
        <div class="count-item-info">
          <div class="count-item-name">${item.name}</div>
          <div class="count-item-meta">${item.unit} · Par: ${item.par_level}</div>
        </div>
        <div class="count-input-wrap">
          <input type="number" class="count-input" data-id="${item.id}"
            data-par="${item.par_level}" data-unit="${item.unit}"
            data-name="${item.name}" data-supplier="${item.supplier || ''}"
            data-cost="${item.cost_per_unit || 0}"
            placeholder="0" min="0" step="0.01" oninput="highlightCountRow(this)">
          <span class="count-unit-label">${item.unit}</span>
        </div>
      </div>`;
    });
    html += '</div>';
  });
  document.getElementById('count-body').innerHTML = html;
  document.getElementById('count-date').textContent =
    new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  document.getElementById('submit-count-btn').textContent = 'Submit Count & Generate Order';
  document.getElementById('submit-count-btn').disabled = false;
  openModal('count-modal');
}

function highlightCountRow(input) {
  const val = parseFloat(input.value) || 0;
  const par = parseFloat(input.dataset.par) || 0;
  const row = input.closest('.count-row');
  row.classList.remove('count-low','count-ok','count-watch');
  if (!par) return;
  const ratio = val / par;
  if (ratio <= 0.2) row.classList.add('count-low');
  else if (ratio <= 0.5) row.classList.add('count-watch');
  else row.classList.add('count-ok');
}

async function submitCount() {
  const inputs = document.querySelectorAll('.count-input');
  const section = document.getElementById('count-section').value;
  const updates = [], orderItems = [];
  inputs.forEach(input => {
    const qty = parseFloat(input.value);
    if (isNaN(qty)) return;
    const par = parseFloat(input.dataset.par) || 0;
    updates.push({ id: input.dataset.id, qty, updated_at: new Date().toISOString() });
    if (par > 0 && qty < par) {
      orderItems.push({
        name: input.dataset.name, unit: input.dataset.unit,
        supplier: input.dataset.supplier, cost: parseFloat(input.dataset.cost) || 0,
        have: qty, par, need: Math.ceil(par - qty)
      });
    }
  });
  if (!updates.length) { alert('Please enter at least one quantity.'); return; }
  const btn = document.getElementById('submit-count-btn');
  btn.textContent = 'Saving...'; btn.disabled = true;
  await Promise.all(updates.map(u =>
    sb.from('inventory').update({ qty: u.qty, updated_at: u.updated_at }).eq('id', u.id)
  ));
  showToast();
  closeModal('count-modal');
  renderInv(section);
  if (orderItems.length > 0) {
    setTimeout(() => openOrderSheet(orderItems), 300);
  } else {
    alert('Count saved! All items are above par — no orders needed.');
  }
}

// ─── ORDER SHEET ───────────────────────────────────────────────────
function openOrderSheet(items) {
  const bySupplier = {};
  items.forEach(item => {
    const sup = item.supplier || 'No Supplier Assigned';
    if (!bySupplier[sup]) bySupplier[sup] = [];
    bySupplier[sup].push(item);
  });
  const date = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  let html = `<div style="font-size:12px;color:var(--muted);margin-bottom:16px">Generated ${date} · ${items.length} item${items.length!==1?'s':''} below par</div>`;
  let grandTotal = 0;
  Object.entries(bySupplier).forEach(([supplier, sitems]) => {
    const supplierTotal = sitems.reduce((s,i) => s + i.need * i.cost, 0);
    grandTotal += supplierTotal;
    html += `<div class="order-supplier-block">
      <div class="order-supplier-header">
        <div>
          <div class="order-supplier-name">${supplier}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${sitems.length} item${sitems.length!==1?'s':''} to order</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:600;color:var(--amber)">${supplierTotal>0?'$'+supplierTotal.toFixed(2):'—'}</div>
          <div style="font-size:11px;color:var(--muted)">est. cost</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
        <thead><tr>
          <th style="text-align:left;padding:6px 8px;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border)">Item</th>
          <th style="text-align:center;padding:6px 8px;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border)">Have</th>
          <th style="text-align:center;padding:6px 8px;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border)">Par</th>
          <th style="text-align:center;padding:6px 8px;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border)">Order Qty</th>
          <th style="text-align:right;padding:6px 8px;font-size:10px;font-weight:600;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border)">Est. Cost</th>
        </tr></thead>
        <tbody>`;
    sitems.forEach(item => {
      const estCost = item.need * item.cost;
      html += `<tr>
        <td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.04)"><strong>${item.name}</strong></td>
        <td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.04);text-align:center;color:var(--red)">${item.have} ${item.unit}</td>
        <td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.04);text-align:center;color:var(--muted)">${item.par} ${item.unit}</td>
        <td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.04);text-align:center">
          <input type="number" value="${item.need}" min="0" step="1"
            style="width:70px;text-align:center;padding:4px 6px;font-size:13px"
            onchange="updateOrderQty(this,${item.cost})">
          <span style="font-size:11px;color:var(--muted);margin-left:3px">${item.unit}</span>
        </td>
        <td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.04);text-align:right;color:var(--amber)" class="order-line-cost">
          ${item.cost>0?'$'+estCost.toFixed(2):'—'}
        </td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  });
  html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-top:1px solid var(--border2);margin-top:8px">
    <span style="font-size:14px;font-weight:600">Total Estimated Order</span>
    <span style="font-family:var(--serif);font-size:20px;color:var(--amber);font-weight:600" id="order-grand-total">$${grandTotal.toFixed(2)}</span>
  </div>`;
  document.getElementById('order-body').innerHTML = html;
  document.getElementById('order-date-label').textContent = date;
  openModal('order-modal');
}

function updateOrderQty(input, costPerUnit) {
  const qty = parseFloat(input.value) || 0;
  const cell = input.closest('tr').querySelector('.order-line-cost');
  if (cell) cell.textContent = costPerUnit > 0 ? '$' + (qty * costPerUnit).toFixed(2) : '—';
  let total = 0;
  document.querySelectorAll('.order-line-cost').forEach(c => {
    total += parseFloat(c.textContent.replace('$','')) || 0;
  });
  const el = document.getElementById('order-grand-total');
  if (el) el.textContent = '$' + total.toFixed(2);
}

function printOrderSheet() {
  const content = document.getElementById('order-body').innerHTML;
  const date = document.getElementById('order-date-label').textContent;
  const rest = restaurants?.find(r => r.id === currentRestaurantId)?.name || 'Restaurant';
  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <title>Order Sheet — ${rest}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;color:#1a1a1a;max-width:800px;margin:0 auto}
      h1{font-size:22px;margin-bottom:4px}
      .sub{font-size:13px;color:#666;margin-bottom:24px}
      .order-supplier-block{margin-bottom:28px;page-break-inside:avoid}
      .order-supplier-header{display:flex;justify-content:space-between;background:#f5f5f0;padding:10px 14px;border-radius:6px;margin-bottom:8px}
      .order-supplier-name{font-size:15px;font-weight:700}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{text-align:left;padding:7px 8px;font-size:10px;font-weight:700;text-transform:uppercase;color:#666;border-bottom:2px solid #ddd}
      td{padding:8px;border-bottom:1px solid #eee}
      input{border:1px solid #ccc;border-radius:4px;padding:3px 6px;width:60px;text-align:center}
      @media print{input{border:none}}
    </style></head><body>
    <h1>Purchase Order — ${rest}</h1>
    <div class="sub">${date}</div>
    ${content}
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}
