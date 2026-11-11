const POLL_INTERVAL_MS = 2000;
const POLL_LIMIT_MS = 90000;

const $ = (id) => document.getElementById(id);
const modal = $('pay-modal');

let selected = null;
let cards = [];
let pollRun = 0;
let currentView = 'form';

function span(className, text) {
  const node = document.createElement('span');
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function priceTag(amount) {
  const price = span('price', amount);
  const unit = document.createElement('small');
  unit.textContent = 'KSH';
  price.append(' ', unit);
  return price;
}

function split(...children) {
  const row = span('split');
  row.append(...children);
  return row;
}

function cardFor(bundle, className, children) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `card ${className}`;
  card.dataset.id = bundle.id;
  card.setAttribute('aria-pressed', 'false');
  card.append(...children);
  card.addEventListener('click', () => {
    select(bundle);
    $('pay-card').scrollIntoView({ block: 'start' });
  });
  cards.push(card);
  return card;
}

function hotCard(bundle) {
  return cardFor(bundle, 'card-hot', [
    span('tag', 'HOT DEAL'),
    span('title', bundle.name),
    split(priceTag(bundle.price), span('card-cta', 'Tap to Select')),
  ]);
}

function valueCard(bundle) {
  const details = span();
  details.append(span('title', bundle.name), span('meta', `${bundle.validity} Validity · High Speed`));

  const bar = span('speed-bar');
  bar.append(span(), span(), span(), span(), span());

  const speed = span('speed');
  speed.append(span('speed-label', 'Speed Tier'), span('speed-text', '5G Ultra (Up to 150 Mbps)'), bar);

  return cardFor(bundle, 'card-value', [
    span('tag', 'BEST VALUE'),
    split(details, priceTag(bundle.price)),
    speed,
    span('card-button', 'Select Plan'),
  ]);
}

function dailyCard(bundle) {
  const top = span('eyebrow-row');
  top.append(span('eyebrow', 'DAILY PASS'), span('instant', 'Instant'));
  return cardFor(bundle, 'card-daily', [top, split(span('title', bundle.name), priceTag(bundle.price))]);
}

function smallCard(bundle) {
  return cardFor(bundle, 'card-small', [
    span('validity', bundle.validity),
    span('title', bundle.size || bundle.name),
    priceTag(bundle.price),
  ]);
}

function render(bundles) {
  const inGroup = (group) => bundles.filter((bundle) => bundle.group === group);

  $('featured').append(
    ...inGroup('hot').map(hotCard),
    ...inGroup('value').map(valueCard),
    ...inGroup('daily').map(dailyCard)
  );
  ['data', 'talk', 'sms'].forEach((group) => {
    $(`group-${group}`).append(...inGroup(group).map(smallCard));
  });
}

function select(bundle) {
  selected = bundle;
  $('selected-name').textContent = bundle.name;
  $('selected-price').textContent = bundle.price;
  $('selected-validity').textContent = `Valid for ${bundle.validity}`;
  $('pay-price').textContent = bundle.price;
  $('pay-bundle').textContent = bundle.name;
  cards.forEach((card) => card.setAttribute('aria-pressed', String(card.dataset.id === bundle.id)));
}

function showView(view) {
  currentView = view;
  modal.querySelectorAll('[data-view]').forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });
}

function setFieldError(id, message) {
  const input = $(id);
  const error = $(`${id}-error`);
  error.textContent = message || '';
  error.hidden = !message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function setFormError(message) {
  $('form-error').textContent = message || '';
  $('form-error').hidden = !message;
}

// Kept in step with normalisePhone on the server, which has the final say.
function isValidPhone(value) {
  const phone = value.replace(/[\s-]/g, '').replace(/^\+/, '');
  return /^0[17]\d{8}$/.test(phone) || /^2547\d{8}$/.test(phone);
}

function openForm() {
  $('modal-summary').textContent = `${selected.name}, ${selected.price} KSH`;
  setFormError('');
  showView('form');
}

function showFailure(message) {
  $('failure-reason').textContent = message;
  showView('failed');
}

function showSuccess(payment, receipt) {
  $('r-bundle').textContent = payment.bundle;
  $('r-amount').textContent = `${payment.amount} KSH`;
  $('r-phone').textContent = payment.phone;
  $('r-receipt').textContent = receipt;
  showView('success');
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollOrder(payment) {
  const run = ++pollRun;
  const deadline = Date.now() + POLL_LIMIT_MS;

  while (run === pollRun) {
    await wait(POLL_INTERVAL_MS);
    if (run !== pollRun) return;

    let order = null;
    try {
      const response = await fetch(`/api/orders/${payment.orderId}`, { cache: 'no-store' });
      if (response.ok) order = await response.json();
    } catch {
      // A dropped connection is not a failed payment. Keep checking until the deadline.
    }

    if (order?.status === 'paid') return showSuccess(payment, order.receipt);
    if (order?.status === 'failed') return showFailure(order.reason || 'M-PESA could not complete this payment.');

    if (Date.now() > deadline) {
      return showFailure('We have not had a confirmation from M-PESA yet. If money left your account, please do not pay again.');
    }
  }
}

async function submitPayment(event) {
  event.preventDefault();

  const name = $('name').value.trim();
  const phone = $('phone').value.trim();
  const nameMessage = name.length < 2 ? 'Please enter your name.' : '';
  const phoneMessage = isValidPhone(phone) ? '' : 'Use 07XXXXXXXX, 01XXXXXXXX or 2547XXXXXXXX.';

  setFieldError('name', nameMessage);
  setFieldError('phone', phoneMessage);
  setFormError('');
  if (nameMessage || phoneMessage) return $(nameMessage ? 'name' : 'phone').focus();

  const button = $('submit-pay');
  button.disabled = true;

  try {
    const response = await fetch('/api/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, bundleId: selected.id }),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setFormError(body.error || 'Something went wrong. Please try again.');
      return;
    }

    $('waiting-summary').textContent = `${body.amount} KSH for ${body.bundle}`;
    showView('waiting');
    pollOrder(body);
  } catch {
    setFormError('No connection. Check your internet and try again.');
  } finally {
    button.disabled = false;
  }
}

async function start() {
  try {
    const response = await fetch('/api/bundles');
    if (!response.ok) throw new Error('Bad response');
    const { bundles, demo, demoTill } = await response.json();

    render(bundles);
    select(bundles[0]);

    if (demo) {
      $('demo-note').textContent = `Demo mode — no money is charged — Till ${demoTill}`;
      $('demo-note').hidden = false;
    }
  } catch {
    $('load-error').hidden = false;
    $('open-pay').disabled = true;
  }
}

$('open-pay').addEventListener('click', () => {
  openForm();
  modal.showModal();
});
$('pay-form').addEventListener('submit', submitPayment);
$('try-again').addEventListener('click', openForm);
$('reload').addEventListener('click', () => location.reload());

modal.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => modal.close());
});

// While we wait on M-PESA the customer should not lose the result by pressing Esc.
modal.addEventListener('cancel', (event) => {
  if (currentView === 'waiting') event.preventDefault();
});

start();
