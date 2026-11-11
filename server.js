const path = require('path');
const crypto = require('crypto');
const express = require('express');

const config = require('./src/config');
const db = require('./src/db');
const { bundles, findBundle } = require('./src/bundles');
const { normalisePhone } = require('./src/phone');
const { sendStkPush, queryStkStatus, describeResult } = require('./src/mpesa');

const DEMO_PAYMENT_MS = 5000;
const STATUS_CHECK_INTERVAL_MS = 5000;

const recentlyChecked = new Set();

// Finds cancelled or ignored prompts even if the callback is slow or never arrives.
// It only ever records failures: a query carries no receipt, so success waits for the callback.
function checkPromptStatus(order) {
  if (config.demoMode || order.status !== 'pending' || !order.checkout_request_id) return;
  if (recentlyChecked.has(order.id)) return;

  recentlyChecked.add(order.id);
  setTimeout(() => recentlyChecked.delete(order.id), STATUS_CHECK_INTERVAL_MS);

  queryStkStatus(order.checkout_request_id)
    .then((result) => {
      if (result && result.code !== '0') {
        db.markFailed(order.id, describeResult(result.code, result.description));
      }
    })
    .catch((error) => console.warn(`Status check failed for order ${order.id}:`, error.message));
}

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/bundles', (req, res) => {
  res.json({
    bundles,
    demo: config.demoMode,
    demoTill: config.demoMode ? config.mpesa.till : undefined,
  });
});

app.post('/api/pay', async (req, res) => {
  const { name, phone: rawPhone, bundleId } = req.body || {};

  const customerName = typeof name === 'string' ? name.trim() : '';
  if (customerName.length < 2 || customerName.length > 60) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }

  const phone = normalisePhone(rawPhone);
  if (!phone) {
    return res.status(400).json({ error: 'Enter a valid Kenyan number, like 0712345678.' });
  }

  const bundle = findBundle(bundleId);
  if (!bundle) {
    return res.status(400).json({ error: 'That bundle is not available.' });
  }

  // This endpoint is public. Without this check anyone could flood a phone with prompts.
  if (db.hasRecentPending(phone)) {
    return res.status(429).json({ error: 'A prompt was just sent to this number. Check your phone or try again in a minute.' });
  }

  const orderId = db.createOrder({ name: customerName, phone, bundle: bundle.name, amount: bundle.price });
  const reply = { orderId, phone, bundle: bundle.name, amount: bundle.price };

  if (config.demoMode) {
    setTimeout(() => {
      const receipt = `DEMO${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      db.markPaid(orderId, receipt);
    }, DEMO_PAYMENT_MS);
    return res.status(201).json(reply);
  }

  try {
    const checkoutRequestId = await sendStkPush({ phone, amount: bundle.price });
    db.saveCheckoutId(orderId, checkoutRequestId);
    return res.status(201).json(reply);
  } catch (error) {
    console.error(`STK push failed for order ${orderId}:`, error.message);
    db.markFailed(orderId, error.message);
    return res.status(502).json({ error: 'We could not reach M-PESA. No money was taken. Please try again.' });
  }
});

app.post('/api/mpesa/callback', (req, res) => {
  // Safaricom only needs to know the callback arrived, whatever the payment result was.
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  const callback = req.body?.Body?.stkCallback;
  if (!callback?.CheckoutRequestID) {
    console.warn('Ignored M-PESA callback with no CheckoutRequestID');
    return;
  }

  const order = db.getOrderByCheckoutId(callback.CheckoutRequestID);
  if (!order) {
    console.warn(`M-PESA callback for unknown CheckoutRequestID ${callback.CheckoutRequestID}`);
    return;
  }

  if (callback.ResultCode !== 0) {
    db.markFailed(order.id, describeResult(callback.ResultCode, callback.ResultDesc));
    return;
  }

  const items = callback.CallbackMetadata?.Item || [];
  const valueOf = (itemName) => items.find((item) => item.Name === itemName)?.Value;
  const receipt = valueOf('MpesaReceiptNumber');
  const paidAmount = Number(valueOf('Amount'));

  if (!receipt) {
    console.error(`Order ${order.id}: M-PESA reported success without a receipt`);
    db.markFailed(order.id, 'M-PESA did not return a receipt for this payment.');
    return;
  }
  if (paidAmount !== order.amount) {
    console.error(`Order ${order.id}: paid ${paidAmount}, expected ${order.amount}, receipt ${receipt}`);
    db.markFailed(order.id, 'The amount paid did not match this bundle.');
    return;
  }

  db.markPaid(order.id, String(receipt));
});

app.get('/api/orders/:id', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  checkPromptStatus(order);

  res.json({
    id: order.id,
    status: order.status,
    receipt: order.mpesa_receipt,
    reason: order.failure_reason,
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  console.error(error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(config.port, (error) => {
  // Express 5 passes listen failures, such as a port already in use, to this callback.
  if (error) {
    console.error(`Could not start on port ${config.port}: ${error.message}`);
    process.exit(1);
  }
  const mode = config.demoMode ? 'DEMO mode, no money is charged' : `LIVE mode, Daraja ${config.mpesa.env}`;
  console.log(`Running at http://localhost:${config.port} (${mode})`);
});
