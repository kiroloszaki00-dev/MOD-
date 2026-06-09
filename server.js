const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const cors = require('cors');

const app = express();
app.use(cors());
// capture raw body for webhook signature verification while still parsing JSON
app.use(bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf } }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper to persist orders/events
const ORDERS_FILE = path.join(__dirname, 'orders.json');
async function readOrders() {
  try {
    const raw = await fs.readFile(ORDERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { events: [] };
  }
}
async function writeOrders(data) {
  await fs.writeFile(ORDERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const DATA_FILE = path.join(__dirname, 'products.json');

const upload = multer({ dest: path.join(__dirname, 'public', 'uploads/') });

const nodemailer = require('nodemailer');

async function sendOrderEmail(event, sessionDetails) {
  const to = process.env.NOTIFY_EMAIL || 'coffeeod09@gmail.com';
  const id = event.data?.object?.id || sessionDetails?.id || 'unknown';
  const subject = `New order: ${id}`;

  // Build a friendly email body with available details
  let lines = [];
  lines.push(`Event type: ${event.type}`);
  lines.push(`Order id: ${id}`);
  if (sessionDetails) {
    if (sessionDetails.customer_details) {
      const c = sessionDetails.customer_details;
      lines.push('Customer: ' + [c.name, c.email, c.phone].filter(Boolean).join(' | '));
    }
    if (sessionDetails.amount_total != null) {
      lines.push(`Amount: ${(sessionDetails.amount_total/100).toFixed(2)} ${sessionDetails.currency || 'USD'}`);
    }
    if (sessionDetails.payment_status) lines.push(`Payment status: ${sessionDetails.payment_status}`);
  }

  // Line items
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

  if (sessionDetails && sessionDetails.line_items && sessionDetails.line_items.data) {
    lines.push('\nItems:');
    // attempt to include product images by matching description to our product catalog
    const catalog = await readProducts();
    sessionDetails.line_items.data.forEach(li => {
      const name = li.description || (li.price && li.price.product) || 'item';
      let imgHtml = '';
      try {
        const match = (catalog.products || []).find(p => p.name === name || String(p.id) === String(name));
        if (match && match.image) {
          const imgUrl = match.image.startsWith('http') ? match.image : baseUrl.replace(/\/$/, '') + match.image;
          imgHtml = `<br/><img src="${imgUrl}" style="max-width:120px;display:block;margin-top:6px;"/>`;
        }
      } catch (e) { /* ignore */ }
      lines.push(`- ${name} x ${li.quantity} — ${(li.amount_total/100 || li.price?.unit_amount/100 || 0).toFixed(2)}`);
      if (imgHtml) lines.push(imgHtml);
    });
  } else if (event.data?.object?.display_items || event.data?.object?.line_items) {
    lines.push('\nItems (from event):');
    const items = event.data.object.display_items || event.data.object.line_items || [];
    items.forEach(it => {
      lines.push(`- ${it.description || it.price?.product || 'item'} x ${it.quantity || it.qty || 1}`);
    });
  } else {
    lines.push('\nDetails:\n' + JSON.stringify(event.data?.object || event, null, 2));
  }

  const text = lines.join('\n');

  // Build a simple HTML version of the email
  let htmlLines = [];
  htmlLines.push('<h2>New Order</h2>');
  htmlLines.push(`<p><strong>Event:</strong> ${event.type}</p>`);
  htmlLines.push(`<p><strong>Order id:</strong> ${id}</p>`);
  if (sessionDetails) {
    if (sessionDetails.customer_details) {
      const c = sessionDetails.customer_details;
      htmlLines.push(`<p><strong>Customer:</strong> ${[c.name, c.email, c.phone].filter(Boolean).join(' | ')}</p>`);
    }
    if (sessionDetails.amount_total != null) {
      htmlLines.push(`<p><strong>Amount:</strong> ${(sessionDetails.amount_total/100).toFixed(2)} ${sessionDetails.currency || 'USD'}</p>`);
    }
    if (sessionDetails.payment_status) htmlLines.push(`<p><strong>Payment status:</strong> ${sessionDetails.payment_status}</p>`);
  }

  if (sessionDetails && sessionDetails.line_items && sessionDetails.line_items.data) {
    htmlLines.push('<h3>Items</h3>');
    htmlLines.push('<ul>');
    const catalog = await readProducts();
    sessionDetails.line_items.data.forEach(li => {
      const name = li.description || (li.price && li.price.product) || 'item';
      let imgTag = '';
      try {
        const match = (catalog.products || []).find(p => p.name === name || String(p.id) === String(name));
        if (match && match.image) {
          const imgUrl = match.image.startsWith('http') ? match.image : baseUrl.replace(/\/$/, '') + match.image;
          imgTag = `<div><img src="${imgUrl}" style="max-width:120px;display:block;margin:6px 0;"/></div>`;
        }
      } catch (e) { /* ignore */ }
      htmlLines.push(`<li>${name} x ${li.quantity} — ${(li.amount_total/100 || li.price?.unit_amount/100 || 0).toFixed(2)}${imgTag}</li>`);
    });
    htmlLines.push('</ul>');
  }

  if (htmlLines.length === 0) htmlLines.push('<pre>' + (JSON.stringify(event.data?.object || event, null, 2)) + '</pre>');
  const html = htmlLines.join('\n');

  let transporter = null;
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    // create ethereal test account if no SMTP configured
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
  }

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'no-reply@women-shop.local',
    to,
    subject,
    text,
    html
  });

  if (nodemailer.getTestMessageUrl && info) {
    const url = nodemailer.getTestMessageUrl(info);
    if (url) console.log('Preview email URL:', url);
  }
}

async function readProducts() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { products: [] };
  }
}

async function writeProducts(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

app.get('/api/products', async (req, res) => {
  const data = await readProducts();
  res.json(data.products);
});

app.get('/api/products/:id', async (req, res) => {
  const data = await readProducts();
  const p = data.products.find(x => String(x.id) === String(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

// Return recorded orders/events
app.get('/api/orders', async (req, res) => {
  try {
    const data = await readOrders();
    res.json(data.events || []);
  } catch (err) {
    res.status(500).json({ error: 'Could not read orders' });
  }
});

// Admin: add product (multipart to accept image)
app.post('/api/admin/products', upload.single('image'), async (req, res) => {
  const { name, price, sizes, description, specs, imageUrl } = req.body;
  const data = await readProducts();
  const id = Date.now();
  let image = imageUrl || null;
  if (req.file) {
    // move to uploads with original name
    const dest = path.join(req.file.destination, req.file.originalname);
    await fs.rename(req.file.path, dest);
    image = path.posix.join('/uploads', req.file.originalname);
  }
  const product = {
    id,
    name,
    price: Number(price) || 0,
    sizes: sizes ? sizes.split(',').map(s => s.trim()) : [],
    description: description || '',
    specs: specs || '',
    image
  };
  data.products.push(product);
  await writeProducts(data);
  res.json(product);
});

// Create Stripe checkout session
app.post('/create-checkout-session', async (req, res) => {
  const { productId, quantity } = req.body;
  const data = await readProducts();
  const product = data.products.find(x => String(x.id) === String(productId));
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY) return res.status(500).json({ error: 'Stripe key not configured. Set STRIPE_SECRET_KEY.' });

  const Stripe = require('stripe');
  const stripe = Stripe(STRIPE_KEY);
  const baseUrl = req.headers.origin || `http://localhost:${process.env.PORT || 3000}`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: product.name },
          unit_amount: Math.round(product.price * 100)
        },
        quantity: quantity && quantity > 0 ? quantity : 1
      }
    ],
    success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/product.html?id=${product.id}`
  });

  res.json({ url: session.url });
});

// Stripe webhook endpoint - records received events to orders.json
app.post('/webhook', async (req, res) => {
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const stripe = STRIPE_KEY ? require('stripe')(STRIPE_KEY) : null;
  let event = null;

  if (process.env.STRIPE_WEBHOOK_SECRET && stripe) {
    const sig = req.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    // No webhook secret configured — accept parsed JSON body
    event = req.body;
  }

  // Persist event
  try {
    const data = await readOrders();
    data.events.push({ received_at: new Date().toISOString(), event });
    await writeOrders(data);
  } catch (err) {
    console.error('Failed to write order event', err);
  }

  // Optionally handle specific event types (e.g., checkout.session.completed)
  if (event && event.type === 'checkout.session.completed') {
    console.log('Checkout session completed:', event.id || event.data?.object?.id);
    // Try to enrich with session and line items if Stripe is configured
    let sessionDetails = null;
    try {
      const sessId = event.data?.object?.id;
      if (stripe && sessId) {
        const sess = await stripe.checkout.sessions.retrieve(sessId);
        const line_items = await stripe.checkout.sessions.listLineItems(sessId, { limit: 100 });
        sess.line_items = line_items;
        sessionDetails = sess;
      }
    } catch (err) {
      console.error('Failed to fetch session details from Stripe', err?.message || err);
    }

    try { await sendOrderEmail(event, sessionDetails); } catch (err) { console.error('Failed to send notification email', err); }
  }

  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
