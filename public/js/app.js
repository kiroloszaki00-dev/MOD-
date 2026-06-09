async function fetchProducts(){
  const res = await fetch('/api/products');
  return res.json();
}

function el(tag, props={}, children=[]) { const e=document.createElement(tag); Object.entries(props).forEach(([k,v])=>{ if(k==='text') e.textContent=v; else e.setAttribute(k,v)}); children.forEach(c=>e.appendChild(c)); return e }

async function renderIndex(){
  const products = await fetchProducts();
  const main = document.getElementById('products');
  const grid = el('div',{class:'grid'});
  products.forEach(p=>{
    const card = el('div',{class:'card'});
    const img = el('img',{src:p.image||'/css/placeholder.png',alt:p.name});
    card.appendChild(img);
    card.appendChild(el('h3',{text:p.name}));
    card.appendChild(el('p',{text:`$${p.price.toFixed(2)}`}));
    const view = el('a',{href:`/product.html?id=${p.id}`,text:'View'});
    card.appendChild(view);
    grid.appendChild(card);
  });
  main.appendChild(grid);
}

async function renderProduct(){
  const q = new URLSearchParams(location.search);
  const id = q.get('id');
  if(!id) return document.getElementById('product').textContent='Missing id';
  const res = await fetch('/api/products/' + id);
  if(!res.ok) return document.getElementById('product').textContent='Product not found';
  const p = await res.json();
  const main = document.getElementById('product');
  const img = document.createElement('img'); img.src = p.image || '/css/placeholder.png'; img.style.maxWidth='360px';
  main.appendChild(img);
  main.appendChild(el('h2',{text:p.name}));
  main.appendChild(el('p',{text:`$${p.price.toFixed(2)}`}));
  main.appendChild(el('p',{text:p.description}));
  main.appendChild(el('p',{text:'Sizes: ' + (p.sizes||[]).join(', ')}));
  main.appendChild(el('pre',{text:p.specs}));
  const buy = el('button',{text:'Buy with Card'});
  buy.addEventListener('click', async ()=>{
    buy.disabled = true; buy.textContent = 'Redirecting...';
    const r = await fetch('/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:id,quantity:1})});
    const j = await r.json();
    if(j.url) location.href = j.url; else { buy.disabled=false; buy.textContent='Buy with Card'; alert(JSON.stringify(j)); }
  });
  main.appendChild(buy);
}

document.addEventListener('DOMContentLoaded', ()=>{
  if(document.getElementById('products')) renderIndex();
  if(document.getElementById('product')) renderProduct();
});
