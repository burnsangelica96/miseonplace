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
  const items=window._bulkItems; const section=document.getElementById('bulk-section').value;
  if (!items||!items.length) return;
  const btn=document.getElementById('bulk-import-btn');
  btn.textContent='Importing...'; btn.disabled=true;
  const rows=items.map(item=>({...item,restaurant_id:currentRestaurantId,section,updated_at:new Date().toISOString()}));
  const {error}=await sb.from('inventory').insert(rows);
  if (error){alert('Import error: '+error.message);btn.textContent='Import Items';btn.disabled=false;return;}
  showToast(); closeModal('bulk-modal'); renderInv(section); window._bulkItems=null;
}

// ─── WEEKLY COUNT SHEET ────────────────────────────────────────────
async function openCountSheet(section) {
  if (!currentRestaurantId) return;
  document.getElementById('count-section').value=section;
  document.getElementById('count-section-title').textContent=section.charAt(0).toUpperCase()+section.slice(1)+' — Weekly Count';
  const {data}=await sb.from('inventory').select('*').eq('restaurant_id',currentRestaurantId).eq('section',section).order('category').order('name');
  const items=data||[];
  if (!items.length){alert('No items in this section yet. Add items first.');return;}
  const groups={};
  items.forEach(item=>{const cat=item.category||'Uncategorized';if(!groups[cat])groups[cat]=[];groups[cat].push(item);});
  let html='';
  Object.entries(groups).forEach(([cat,catItems])=>{
    html+=`<div class="count-category"><div class="count-cat-header">${cat}</div>`;
    catItems.forEach(item=>{html+=`<div class="count-row">
      <div class="count-item-info">
        <div class="count-item-name">${item.name}</div>
        <div class="count-item-meta">${item.unit} · Par: ${item.par_level}${item.supplier?' · '+item.supplier:''}</div>
      </div>
      <div class="count-input-wrap">
        <input type="number" class="count-input" data-id="${item.id}" data-par="${item.par_level}" data-unit="${item.unit}" data-name="${item.name}" data-supplier="${item.supplier||''}" data-cost="${item.cost_per_unit||0}" placeholder="0" min="0" step="0.01" oninput="highlightCountRow(this)">
        <span class="count-unit-label">${item.unit}</span>
      </div>
    </div>`;});
    html+='</div>';
  });
  document.getElementById('count-body').innerHTML=html;
  document.getElementById('count-date').textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  document.getElementById('submit-count-btn').textContent='Submit Count & Generate Order';
  document.getElementById('submit-count-btn').disabled=false;
  openModal('count-modal');
}

function highlightCountRow(input) {
  const val=parseFloat(input.value)||0,par=parseFloat(input.dataset.par)||0;
  const row=input.closest('.count-row');
  row.classList.remove('count-low','count-ok','count-watch');
  if (!par) return;
  const r=val/par;
  if (r<=0.2) row.classList.add('count-low');
  else if (r<=0.5) row.classList.add('count-watch');
  else row.classList.add('count-ok');
}

async function submitCount() {
  const inputs=document.querySelectorAll('.count-input');
  const section=document.getElementById('count-section').value;
  const updates=[],orderItems=[];
  inputs.forEach(input=>{
    const qty=parseFloat(input.value);
    if (isNaN(qty)) return;
    const par=parseFloat(input.dataset.par)||0;
    updates.push({id:input.dataset.id,qty,updated_at:new Date().toISOString()});
    if (par>0&&qty<par) orderItems.push({name:input.dataset.name,unit:input.dataset.unit,supplier:input.dataset.supplier,cost:parseFloat(input.dataset.cost)||0,have:qty,par,need:Math.ceil(par-qty)});
  });
  if (!updates.length){alert('Please enter at least one quantity.');return;}
  const btn=document.getElementById('submit-count-btn');
  btn.textContent='Saving...'; btn.disabled=true;
  await Promise.all(updates.map(u=>sb.from('inventory').update({qty:u.qty,updated_at:u.updated_at}).eq('id',u.id)));
  showToast(); closeModal('count-modal'); renderInv(section);
  if (orderItems.length>0) setTimeout(()=>openOrderSheet(orderItems),300);
  else alert('Count saved! All items are above par — no orders needed.');
}

// ─── ORDER SHEET ───────────────────────────────────────────────────
function openOrderSheet(items) {
  const bySupplier={};
  items.forEach(item=>{const sup=item.supplier||'No Supplier Assigned';if(!bySupplier[sup])bySupplier[sup]=[];bySupplier[sup].push(item);});
  const date=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  let html=`<div style="font-size:11px;color:var(--muted);margin-bottom:16px;letter-spacing:0.5px">Generated ${date} · ${items.length} item${items.length!==1?'s':''} below par</div>`;
  let grandTotal=0;
  Object.entries(bySupplier).forEach(([supplier,sitems])=>{
    const supplierTotal=sitems.reduce((s,i)=>s+i.need*i.cost,0);
    grandTotal+=supplierTotal;
    html+=`<div class="order-supplier-block"><div class="order-supplier-header"><div><div class="order-supplier-name">${supplier}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${sitems.length} item${sitems.length!==1?'s':''} to order</div></div><div style="text-align:right"><div style="font-size:14px;font-weight:400;color:var(--olive2)">${supplierTotal>0?'$'+supplierTotal.toFixed(2):'—'}</div><div style="font-size:10px;color:var(--muted)">est. cost</div></div></div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px"><thead><tr>
      <th style="text-align:left;padding:6px 8px;font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border)">Item</th>
      <th style="text-align:center;padding:6px 8px;font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border)">Have</th>
      <th style="text-align:center;padding:6px 8px;font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border)">Par</th>
      <th style="text-align:center;padding:6px 8px;font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border)">Order Qty</th>
      <th style="text-align:right;padding:6px 8px;font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border)">Est. Cost</th>
    </tr></thead><tbody>`;
    sitems.forEach(item=>{const estCost=item.need*item.cost;html+=`<tr>
      <td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.03);font-weight:300">${item.name}</td>
      <td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center;color:var(--red)">${item.have} ${item.unit}</td>
      <td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center;color:var(--muted)">${item.par} ${item.unit}</td>
      <td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center">
        <input type="number" value="${item.need}" min="0" step="1" style="width:70px;text-align:center;padding:4px 6px;font-size:13px" onchange="updateOrderQty(this,${item.cost})">
        <span style="font-size:11px;color:var(--muted);margin-left:3px">${item.unit}</span>
      </td>
      <td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:right;color:var(--olive2)" class="order-line-cost">${item.cost>0?'$'+estCost.toFixed(2):'—'}</td>
    </tr>`;});
    html+=`</tbody></table></div>`;
  });
  html+=`<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-top:1px solid var(--border2);margin-top:8px"><span style="font-size:11px;font-weight:400;letter-spacing:1px;text-transform:uppercase;color:var(--muted)">Total Estimated Order</span><span style="font-size:22px;font-weight:200;color:var(--olive2)" id="order-grand-total">$${grandTotal.toFixed(2)}</span></div>`;
  document.getElementById('order-body').innerHTML=html;
  document.getElementById('order-date-label').textContent=date;
  openModal('order-modal');
}

function updateOrderQty(input,costPerUnit) {
  const qty=parseFloat(input.value)||0;
  const cell=input.closest('tr').querySelector('.order-line-cost');
  if (cell) cell.textContent=costPerUnit>0?'$'+(qty*costPerUnit).toFixed(2):'—';
  let total=0;
  document.querySelectorAll('.order-line-cost').forEach(c=>{total+=parseFloat(c.textContent.replace('$',''))||0;});
  const el=document.getElementById('order-grand-total');
  if (el) el.textContent='$'+total.toFixed(2);
}

function printOrderSheet() {
  const content=document.getElementById('order-body').innerHTML;
  const date=document.getElementById('order-date-label').textContent;
  const rest=restaurants?.find(r=>r.id===currentRestaurantId)?.name||'Restaurant';
  const win=window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Order Sheet — ${rest}</title>
  <style>body{font-family:Arial,sans-serif;padding:32px;color:#1a1a1a;max-width:800px;margin:0 auto}h1{font-size:18px;letter-spacing:2px;text-transform:uppercase;font-weight:300;margin-bottom:4px}.sub{font-size:12px;color:#666;margin-bottom:24px}.order-supplier-block{margin-bottom:28px;page-break-inside:avoid;border:1px solid #eee;padding:16px}.order-supplier-header{display:flex;justify-content:space-between;margin-bottom:10px}.order-supplier-name{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;padding:7px 8px;font-size:10px;font-weight:600;text-transform:uppercase;color:#666;border-bottom:2px solid #ddd}td{padding:8px;border-bottom:1px solid #eee;font-weight:300}input{border:1px solid #ccc;padding:3px 6px;width:60px;text-align:center}@media print{input{border:none}}</style>
  </head><body><h1>${rest}</h1><div class="sub">Purchase Order · ${date}</div>${content}</body></html>`);
  win.document.close(); win.focus(); setTimeout(()=>win.print(),500);
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
