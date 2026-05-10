# Bunofeed — Order System Setup Guide
## Checkout Form + Google Sheets + Email Notifications

---

## 📦 What Was Built

| File | Purpose |
|---|---|
| `checkout.js` | Customer details form modal + validation + Sheets integration |
| `google-apps-script.js` | Backend (runs inside Google Sheets) — saves orders, sends emails |
| `script.js` | Updated — Buy Now now opens checkout form first |
| `index.html` | Updated — loads `checkout.js` |
| `order-success.html` | Updated — shows Order ID and customer name |

**Flow:**
```
Buy Now → Checkout Form → Validate → Save to Sheets (Pending)
       → Razorpay opens → Payment Success → Update Sheets (Paid) + Send Email → Success Page
                                         → Payment Failed → Update Sheets (Failed) → Re-open form
```

---

## 🔧 STEP 1 — Set Up Google Sheets Backend

### 1.1 Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet
2. Name it something like **Bunofeed Orders**
3. Leave it blank — the script will create the header row automatically

### 1.2 Open Apps Script

1. In your Sheet, click **Extensions → Apps Script**
2. Delete all the default code in the editor
3. Open `google-apps-script.js` (from this package) and **paste the entire content**
4. Press **Ctrl+S** to save
5. Name the project (top left): `Bunofeed Order System`

### 1.3 Deploy as Web App

1. Click **Deploy → New Deployment**
2. Click ⚙️ gear icon → select **Web App**
3. Set:
   - **Description**: `Bunofeed Order API v1`
   - **Execute as**: `Me` (your Google account)
   - **Who has access**: `Anyone`
4. Click **Deploy**
5. **Copy the Web App URL** — it looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

### 1.4 Authorise Permissions

On first deployment, Google will ask for permissions:
- Click **Review permissions**
- Choose your Google account
- Click **Advanced → Go to Bunofeed Order System (unsafe)**
  *(This is normal for self-deployed scripts — your own code)*
- Click **Allow**

---

## 🔧 STEP 2 — Connect Your Website

### 2.1 Paste the Web App URL into checkout.js

Open `checkout.js` and find line ~17:

```javascript
const SHEETS_WEBHOOK_URL = 'PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';
```

Replace with your URL:

```javascript
const SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/YOUR_ID/exec';
```

### 2.2 Update Script Loading Order in index.html and shop.html

Make sure your HTML files load scripts in this exact order:

```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script src="products.js"></script>
<script src="checkout.js"></script>
<script src="script.js"></script>
```

> ⚠️ **shop.html also needs this update!** The Buy Now button in shop.html still uses the old `triggerRazorpay()` function. To update it, find the `triggerRazorpay` function in shop.html's inline `<script>` and replace the `buyBtn.addEventListener('click', ...)` handler to call `window.openCheckout(...)` instead — same pattern as the updated script.js.

---

## 🔧 STEP 3 — Verify Your Google Sheet

After your first test order, your Google Sheet should have:

| Order ID | Date & Time | Customer Name | Phone | Email | Address | Pincode | Product ID | Product Name | Qty | Price | Total | Razorpay Payment ID | Razorpay Order ID | Payment Status | Email Sent | Email Error |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BF-20260510-A3K7 | 10/05/2026 14:32:00 | Test User | 9876543210 | test@gmail.com | 123 Test St... | 110001 | creamy-pb | Dark Chocolate PB | 1 | 299 | 299 | pay_XXXXX | — | Paid | Sent | — |

---

## 📧 Email Notifications

Emails are sent automatically after successful payment using **GmailApp** — completely free, no external service required.

**What the customer receives:**
- ✅ Branded HTML email with your logo
- Order ID, product, quantity, amount paid
- Delivery address confirmation
- Payment ID for reference
- Support contact details

**Email is triggered only when:**
- Payment status becomes `Paid`
- `updatePayment` action is called with `status: 'Paid'`

**Email is skipped if:**
- Customer didn't provide an email (email is optional)
- Invalid email format

**Notification status in Sheet:**
- Column P: `Sent` or `Failed`
- Column Q: Error message if failed (with auto-retry once)

---

## 🔒 Security Guide

### How Secure Is This Setup?

| Aspect | Status | Notes |
|---|---|---|
| Razorpay Key in frontend | ⚠️ Exposed | Your **publishable key** is visible in source — this is expected and safe |
| Customer data in transit | ✅ Encrypted | HTTPS on Netlify/Vercel + Razorpay's own SSL |
| Payment processing | ✅ Secure | Razorpay handles all card/UPI data — you never touch it |
| Google Sheets access | ✅ Auth required | Only your Google account can open the Sheet |
| Apps Script endpoint | ⚠️ Public POST | Anyone can POST to your endpoint (see mitigations below) |
| Server-side verification | ❌ Not implemented | See upgrade path below |

### Razorpay Key Safety

Your Razorpay **Key ID** (starts with `rzp_live_...`) is a **publishable key** — it is safe to have in frontend JavaScript. It can only be used to *create* payment requests, not to access your account or withdraw money.

**Your Razorpay Secret Key** (if you have one) must **never** go in frontend code. In this setup you don't need the secret key for the basic flow.

**Best practices:**
- ✅ Keep your Razorpay Secret Key only on a server (not applicable here — static site)
- ✅ Enable Razorpay's webhook signature verification if you add a server later
- ✅ Set allowed domains in Razorpay Dashboard → Settings → Website/App domain whitelist

### Hardening the Google Apps Script Endpoint

Since the Apps Script URL is public (`Anyone` access), add a shared secret token:

**In google-apps-script.js**, add at the top:
```javascript
const SECRET_TOKEN = 'your-random-secret-string-here';
```

**In doPost()**, add before processing:
```javascript
if (data.token !== SECRET_TOKEN) {
  return respond({ success: false, error: 'Unauthorised' });
}
```

**In checkout.js**, add to both fetch bodies:
```javascript
body: JSON.stringify({ action: '...', token: 'your-random-secret-string-here', ... })
```

> Generate a random token at: [randomkeygen.com](https://randomkeygen.com) or just use any long random string.

### Production Security Checklist

- [ ] Enable HTTPS (automatic on Netlify/Vercel/GitHub Pages)
- [ ] Set your domain in Razorpay Dashboard → Settings → Allowed Domains
- [ ] Add the secret token to Apps Script (above)
- [ ] Set up Razorpay webhook for server-side payment verification (optional but recommended for high volume)
- [ ] Review your Google Sheet sharing settings — only you should have edit access
- [ ] Test with Razorpay test mode before going live
- [ ] Review your Privacy Policy — it already covers the data you're now collecting ✅

### What This Setup CANNOT Do (Limitations)

- ❌ **Server-side payment signature verification** — a determined attacker could fake a "success" and skip payment. For most small e-commerce sites this risk is very low (they'd get no actual goods shipped), but for digital goods you'd want a server.
- ❌ **Rate limiting** — the Apps Script endpoint has no rate limiting (Google limits to 30 requests/sec by default)
- ❌ **Inventory management** — no stock tracking

**Upgrade Path (if you grow):** Add a simple Node.js/Express server on Render.com (free tier) or a Supabase Edge Function to verify Razorpay signatures. Happy to help build this when you're ready.

---

## 🚀 Deployment Instructions

### Netlify / Vercel / GitHub Pages / Hostinger Static

Just upload all your files as-is. This is a fully static setup — no server required.

**Files to upload:**
```
index.html
shop.html
products.js
script.js
checkout.js       ← NEW
style.css
legal.css
order-success.html
privacy.html
terms.html
admin.html
```

> Do NOT upload `google-apps-script.js` to your static host — it only goes inside Google Apps Script.

### Netlify Drag-and-Drop (Easiest)
1. Go to [netlify.com](https://netlify.com) → New site → Deploy manually
2. Drag your folder → Done. Instant HTTPS ✅

---

## 🧪 Testing

### Test Mode
1. In Razorpay Dashboard → go to Test Mode
2. Use test card: `4111 1111 1111 1111`, CVV: `123`, Expiry: any future date
3. UPI test ID: `success@razorpay`

### Full Test Flow
1. Click Buy Now on a product
2. Fill in the checkout form
3. Try submitting with invalid data — errors should show
4. Fill correctly → click "Proceed to Pay"
5. Check your Google Sheet — a row with status `Pending` should appear
6. Complete payment in Razorpay
7. Sheet row should update to `Paid` and `Email Sent`
8. Check customer email inbox for confirmation
9. Verify redirect to `order-success.html` with correct details

---

## ❓ Troubleshooting

| Problem | Fix |
|---|---|
| Orders not appearing in Sheet | Re-deploy the Apps Script after any changes. Click Deploy → Manage Deployments → Edit |
| "Script not authorized" | Run the script manually once from Apps Script editor to trigger the permission dialog |
| Emails not sending | Make sure the Google account running the script has Gmail. Check Apps Script execution logs (View → Executions) |
| CORS error in console | This is expected with `no-cors` mode — it's not an error. Data is still sent. |
| Checkout form not appearing | Make sure `checkout.js` is loaded before `script.js` in your HTML |
| Shop.html Buy Now still goes direct to Razorpay | You need to manually update the `buyBtn` handler in shop.html's inline script (see Step 2.2) |

---

*Built for Bunofeed — May 2026*
