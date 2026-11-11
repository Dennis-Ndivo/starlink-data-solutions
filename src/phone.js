// Accepts 07XXXXXXXX, 01XXXXXXXX and 2547XXXXXXXX. Returns the 254 form, or null.
// 01 numbers become 2541XXXXXXXX, which is their correct international form.
function normalisePhone(input) {
  const phone = String(input ?? '').replace(/[\s-]/g, '').replace(/^\+/, '');

  if (/^0[17]\d{8}$/.test(phone)) return `254${phone.slice(1)}`;
  if (/^2547\d{8}$/.test(phone)) return phone;
  return null;
}

module.exports = { normalisePhone };
