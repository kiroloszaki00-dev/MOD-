async function fetchOrders(){
  const res = await fetch('/api/orders');
  return res.json();
}

async function fetchProducts(){
  const res = await fetch('/api/products');
  return res.json();
}

function el(tag, props={}, children=[]) { const e=document.createElement(tag); Object.entries(props).forEach(([k,v])=>{ if(k==='text') e.textContent=v; else e.setAttribute(k,v)}); children.forEach(c=>e.appendChild(c)); return e }

function makeImg(src){ const img = document.createElement('img'); img.src = src; img.style.maxWidth='80px'; img.style.marginRight='8px'; img.style.display='inline-block'; return img }

let ALL_ORDERS = [];
let PRODUCTS_LOOKUP = {};

function renderOrders(orders){
  const container = document.getElementById('orders');
  container.innerHTML = '';
  if(!orders || orders.length===0) return container.textContent = 'No orders yet.';

  orders.forEach(o=>{
    const card = el('div',{class:'order-card'});
    const meta = el('div',{class:'order-meta'});
    meta.appendChild(el('h3',{text: o.event?.type || 'event'}));
    meta.appendChild(el('p',{text: 'Received: ' + (o.received_at || '')}));
    card.appendChild(meta);

    const ev = o.event || {};
    const obj = ev.data && ev.data.object ? ev.data.object : ev;
    const items = obj.line_items?.data || obj.display_items || obj.line_items || [];

    const itemsDiv = el('div',{class:'order-items'});
    if(items && items.length){
      items.forEach(it => {
        const row = el('div',{class:'order-item'});
        const name = it.description || it.price?.product || it.price?.product_id || it.product || '';
        const qty = it.quantity || it.qty || 1;
        const matched = PRODUCTS_LOOKUP[name] || PRODUCTS_LOOKUP[String(it.price?.product)] || PRODUCTS_LOOKUP[String(it.product)];
        if(matched && matched.image){
          const src = matched.image.startsWith('http') ? matched.image : window.location.origin.replace(/\/$/, '') + matched.image;
          row.appendChild(makeImg(src));
        }
        const info = el('div',{class:'info'});
        info.appendChild(el('div',{text: name || 'item'}));
        info.appendChild(el('div',{text: 'Qty: ' + qty}));
        row.appendChild(info);
        itemsDiv.appendChild(row);
      });
    } else {
      const pre = document.createElement('pre'); pre.textContent = JSON.stringify(o.event, null, 2);
      itemsDiv.appendChild(pre);
    }

    card.appendChild(itemsDiv);
    container.appendChild(card);
  });
}

function applyFilter(q){
  const start = document.getElementById('startDate').value;
  const end = document.getElementById('endDate').value;
  const hasQuery = q && q.trim().length>0;
  const hasDates = start || end;
  if(!hasQuery && !hasDates) return renderOrders(ALL_ORDERS.slice().reverse());
  q = q.toLowerCase();
  const filtered = ALL_ORDERS.filter(o => {
    const ev = o.event || {};
    const obj = ev.data && ev.data.object ? ev.data.object : ev;
    // date filtering
    if(hasDates && o.received_at){
      const t = new Date(o.received_at);
      if(start){ const s = new Date(start + 'T00:00:00'); if(t < s) return false; }
      if(end){ const e = new Date(end + 'T23:59:59'); if(t > e) return false; }
    }
    const id = (obj.id || '').toString().toLowerCase();
    if(hasQuery && id.includes(q)) return true;
    // search in items
    const items = obj.line_items?.data || obj.display_items || obj.line_items || [];
    for(const it of (items||[])){
      const name = (it.description || it.price?.product || it.product || '').toString().toLowerCase();
      if(hasQuery && name.includes(q)) return true;
    }
    // search raw JSON
    if(hasQuery && JSON.stringify(o).toLowerCase().includes(q)) return true;
    return false;
  });
  renderOrders(filtered.slice().reverse());
}

function exportCSV(orders){
  const rows = [];
  rows.push(['received_at','event_type','order_id','items','raw'].join(','));
  orders.forEach(o=>{
    const ev = o.event || {};
    const obj = ev.data && ev.data.object ? ev.data.object : ev;
    const id = obj.id || '';
    const items = obj.line_items?.data || obj.display_items || obj.line_items || [];
    const itemsText = (items||[]).map(it => `${(it.description||it.price?.product||it.product||'item')} x ${it.quantity||it.qty||1}`).join(' | ');
    const raw = JSON.stringify(o.event).replace(/"/g,'""');
    const line = [`"${o.received_at||''}"`,`"${ev.type||''}"`,`"${id}"`,`"${itemsText}"`,`"${raw}"`].join(',');
    rows.push(line);
  });
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `orders-${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', async ()=>{
  const [orders, products] = await Promise.all([fetchOrders(), fetchProducts()]);
  ALL_ORDERS = orders || [];
  PRODUCTS_LOOKUP = {};
  (products || []).forEach(p => { if(p.name) PRODUCTS_LOOKUP[p.name] = p; PRODUCTS_LOOKUP[String(p.id)] = p });
  renderOrders(ALL_ORDERS.slice().reverse());

  const input = document.getElementById('orderFilter');
  const clear = document.getElementById('clearFilter');
  const start = document.getElementById('startDate');
  const end = document.getElementById('endDate');
  const exportBtn = document.getElementById('exportCsv');
  input.addEventListener('input', e => applyFilter(e.target.value));
  clear.addEventListener('click', ()=>{ input.value=''; applyFilter(''); input.focus(); });
  start.addEventListener('change', ()=> applyFilter(input.value));
  end.addEventListener('change', ()=> applyFilter(input.value));
  exportBtn.addEventListener('click', ()=>{
    // export currently visible orders
    const containerOrders = ALL_ORDERS.slice().reverse().filter(o=>{
      // reuse applyFilter logic by checking against current inputs
      const q = input.value || '';
      const startVal = start.value; const endVal = end.value;
      // perform same checks as applyFilter
      if(startVal || endVal){
        if(o.received_at){ const t = new Date(o.received_at); if(startVal){ const s = new Date(startVal+'T00:00:00'); if(t < s) return false } if(endVal){ const e = new Date(endVal+'T23:59:59'); if(t > e) return false } }
      }
      if(!q) return true;
      const ev = o.event || {};
      const obj = ev.data && ev.data.object ? ev.data.object : ev;
      const id = (obj.id || '').toString().toLowerCase();
      if(id.includes(q.toLowerCase())) return true;
      const items = obj.line_items?.data || obj.display_items || obj.line_items || [];
      for(const it of (items||[])){
        const name = (it.description || it.price?.product || it.product || '').toString().toLowerCase();
        if(name.includes(q.toLowerCase())) return true;
      }
      if(JSON.stringify(o).toLowerCase().includes(q.toLowerCase())) return true;
      return false;
    });
    exportCSV(containerOrders);
  });
});
