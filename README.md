# STARLINK DATA SOLUTIONS

A data, talk and SMS bundle site that takes payment by M-PESA STK push. One Express server serves the page and handles payments. Orders are stored in SQLite (`orders.db`).

Requires Node.js 22 or newer.

To change bundles or prices, edit `src/bundles.js`. The page and the payment code both read from it.

## 1. Run in demo mode

No keys and no `.env` file are needed.

```
npm install
npm start
```

Open http://localhost:3000, pick a bundle and pay with any valid Kenyan number. The order becomes paid after 5 seconds with a fake receipt. Safaricom is never contacted and no money moves.

## 2. Test in the Daraja sandbox with ngrok

Safaricom has to reach your computer to report each payment result, and ngrok gives it a public address.

1. Create an account at https://developer.safaricom.co.ke and create an app with M-PESA Express enabled.
2. Copy your settings file. In PowerShell: `Copy-Item .env.example .env`
3. In a second terminal, run `ngrok http 3000` and copy the `https://...` address it shows.
4. Fill in `.env` in your editor. Keep this file private and never commit or share it.

   | Setting | Value |
   | --- | --- |
   | `DEMO_MODE` | `false` |
   | `MPESA_ENV` | `sandbox` |
   | `MPESA_CONSUMER_KEY` | From your Daraja app |
   | `MPESA_CONSUMER_SECRET` | From your Daraja app |
   | `MPESA_PASSKEY` | The sandbox passkey shown on the Daraja M-PESA Express simulator |
   | `MPESA_SHORTCODE` | `174379` |
   | `MPESA_TILL` | `174379` |
   | `CALLBACK_BASE_URL` | Your ngrok `https://...` address |

5. Run `npm start`, open the site through http://localhost:3000 and pay using your own Safaricom number.
6. Approve the prompt on your phone. The sandbox does not move real money.

The ngrok address changes each time you restart ngrok on a free plan. Update `CALLBACK_BASE_URL` and restart the server when it does.

If the prompt arrives but the site keeps waiting, the callback is not reaching you. Open http://localhost:4040 to see what ngrok received.

The sandbox shortcode `174379` is set up as a paybill, so the sandbox may reject the `CustomerBuyGoodsOnline` transaction type. If it does, the terminal shows the message from Daraja. Your real till is the test that counts.

## 3. Switch to production with your real till

1. On the Daraja portal, take your app through **Go Live**. You need your M-PESA organisation portal login with the Business Manager or Administrator role.
2. Safaricom sends you the production passkey and consumer credentials.
3. Deploy this project to a host with HTTPS and a disk that persists between deploys, because `orders.db` holds your orders.
4. Set these on the host, either in a private `.env` or in the host's environment settings:

   | Setting | Value |
   | --- | --- |
   | `DEMO_MODE` | `false` |
   | `MPESA_ENV` | `production` |
   | `MPESA_CONSUMER_KEY` | Production key |
   | `MPESA_CONSUMER_SECRET` | Production secret |
   | `MPESA_PASSKEY` | Production passkey |
   | `MPESA_SHORTCODE` | Your store or head office number |
   | `MPESA_TILL` | Your till number, where the money lands |
   | `CALLBACK_BASE_URL` | Your site, for example `https://yourdomain.co.ke` |
   | `PORT` | As your host requires |

   On a Buy Goods account the store number and the till number are often different. Check both in your M-PESA organisation portal.

5. Start the server. It refuses to start if a setting is missing, and it lists what to fix.
6. Make a real purchase of the cheapest bundle (10 KSH) and confirm the receipt matches your M-PESA message.

## Delivering what customers buy

This project collects payment and records the order. It does **not** load the bundle onto the customer's line. Until you connect a delivery step, every paid order has to be fulfilled by you.

To see the latest orders, run this from the project folder:

```
node -e "console.table(new (require('better-sqlite3'))('orders.db').prepare('SELECT name, phone, bundle, amount, status, mpesa_receipt, created_at FROM orders ORDER BY created_at DESC LIMIT 50').all())"
```

Times are in UTC, three hours behind Kenya.

## Settings

All settings live in `.env`, which is ignored by git along with the database. Nothing secret is sent to the browser. See `.env.example` for the full list.
