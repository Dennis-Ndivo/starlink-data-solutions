const config = require('./config');

const { mpesa } = config;
const BASE_URL = mpesa.env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
const REQUEST_TIMEOUT_MS = 20000;

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

  const credentials = Buffer.from(`${mpesa.consumerKey}:${mpesa.consumerSecret}`).toString('base64');
  const response = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Daraja OAuth failed with HTTP ${response.status}`);

  const body = await response.json();
  cachedToken = body.access_token;
  // Daraja tokens last an hour. Renew well before that.
  cachedTokenExpiry = Date.now() + 50 * 60 * 1000;
  return cachedToken;
}

// Daraja expects YYYYMMDDHHmmss in Kenyan time, wherever this server runs.
function nairobiTimestamp() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000)
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14);
}

function stkCredentials() {
  const timestamp = nairobiTimestamp();
  const password = Buffer.from(`${mpesa.shortcode}${mpesa.passkey}${timestamp}`).toString('base64');
  return { timestamp, password };
}

async function sendStkPush({ phone, amount }) {
  const token = await getToken();
  const { timestamp, password } = stkCredentials();

  const response = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: mpesa.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerBuyGoodsOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: mpesa.till,
      PhoneNumber: phone,
      CallBackURL: `${mpesa.callbackBaseUrl}/api/mpesa/callback`,
      AccountReference: 'DataBundle',
      TransactionDesc: 'Data bundle',
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ResponseCode !== '0' || !body.CheckoutRequestID) {
    throw new Error(body.errorMessage || body.ResponseDescription || `STK push failed with HTTP ${response.status}`);
  }
  return body.CheckoutRequestID;
}

// Asks Daraja how a prompt ended. Returns { code, description } once it has ended,
// or null while the customer is still deciding. Daraja answers with an HTTP error
// during that time, so an unsuccessful response here is not a failed payment.
async function queryStkStatus(checkoutRequestId) {
  const token = await getToken();
  const { timestamp, password } = stkCredentials();

  const response = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: mpesa.shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ResponseCode !== '0' || body.ResultCode === undefined) return null;

  const code = String(body.ResultCode);
  if (code === STILL_PROCESSING_CODE) return null;
  return { code, description: body.ResultDesc };
}

const STILL_PROCESSING_CODE = '4999';

const FRIENDLY_RESULTS = {
  1: 'Your M-PESA balance is too low for this bundle.',
  1032: 'You cancelled the M-PESA prompt.',
  1037: 'The M-PESA prompt timed out before it was approved.',
  2001: 'The M-PESA PIN entered was incorrect.',
};

const describeResult = (code, description) =>
  FRIENDLY_RESULTS[code] || description || 'M-PESA could not complete this payment.';

module.exports = { sendStkPush, queryStkStatus, describeResult };
