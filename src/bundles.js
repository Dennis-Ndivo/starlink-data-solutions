// The single source of truth for what is sold and at what price.
// `group` places a bundle on the page. `size` is the short label on grid cards.
// The first bundle is the one selected when the page opens.
const bundles = [
  { id: 'hot-4h', name: '4 Hours Unlimited', price: 45, validity: '4 Hours', group: 'hot' },
  { id: 'value-24gb', name: '24 GB', price: 215, validity: '30 Days', group: 'value' },
  { id: 'daily-4gb', name: '1 Day / 4 GB', price: 77, validity: '1 Day', group: 'daily' },

  { id: 'data-3d-6gb', name: '3 Days 6 GB', size: '6 GB', price: 105, validity: '3 Days', group: 'data' },
  { id: 'data-7d-9gb', name: '7 Days 9 GB', size: '9 GB', price: 125, validity: '7 Days', group: 'data' },
  { id: 'data-14d-12gb', name: '14 Days 12 GB', size: '12 GB', price: 166, validity: '14 Days', group: 'data' },
  { id: 'data-21d-16gb', name: '21 Days 16 GB', size: '16 GB', price: 188, validity: '21 Days', group: 'data' },

  { id: 'talk-45', name: '45 Mins', price: 20, validity: '3 Hours', group: 'talk' },
  { id: 'talk-120', name: '120 Mins', price: 55, validity: '24 Hours', group: 'talk' },

  { id: 'sms-200', name: '200 SMS', price: 10, validity: '1 Day', group: 'sms' },
  { id: 'sms-1000', name: '1000 SMS', price: 30, validity: '1 Week', group: 'sms' },
];

const findBundle = (id) => bundles.find((bundle) => bundle.id === id);

module.exports = { bundles, findBundle };
