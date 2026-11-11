require('dotenv').config({ quiet: true });

const env = (name) => (process.env[name] || '').trim();

const demoMode = env('DEMO_MODE').toLowerCase() !== 'false';

const config = {
  demoMode,
  port: Number(env('PORT')) || 3000,
  mpesa: {
    env: env('MPESA_ENV') || 'sandbox',
    consumerKey: env('MPESA_CONSUMER_KEY'),
    consumerSecret: env('MPESA_CONSUMER_SECRET'),
    passkey: env('MPESA_PASSKEY'),
    shortcode: env('MPESA_SHORTCODE'),
    till: env('MPESA_TILL') || (demoMode ? '1234' : ''),
    callbackBaseUrl: env('CALLBACK_BASE_URL').replace(/\/+$/, ''),
  },
};

// Live mode must fail at startup, not on a customer's first payment.
if (!demoMode) {
  const required = [
    'MPESA_CONSUMER_KEY',
    'MPESA_CONSUMER_SECRET',
    'MPESA_PASSKEY',
    'MPESA_SHORTCODE',
    'MPESA_TILL',
    'CALLBACK_BASE_URL',
  ];
  const problems = required.filter((name) => !env(name)).map((name) => `${name} is empty`);

  if (!['sandbox', 'production'].includes(config.mpesa.env)) {
    problems.push('MPESA_ENV must be sandbox or production');
  }
  if (config.mpesa.callbackBaseUrl && !config.mpesa.callbackBaseUrl.startsWith('https://')) {
    problems.push('CALLBACK_BASE_URL must start with https://');
  }
  if (config.mpesa.env === 'production' && config.mpesa.till === '1234') {
    problems.push('MPESA_TILL is still the demo till 1234');
  }

  if (problems.length) {
    console.error('Cannot start with DEMO_MODE=false:');
    problems.forEach((problem) => console.error(`  - ${problem}`));
    process.exit(1);
  }
}

module.exports = config;
