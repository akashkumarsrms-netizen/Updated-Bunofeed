/**
 * ============================================================
 *  BUNOFEED — Google Apps Script Backend
 *  File: google-apps-script.js
 *
 *  INSTRUCTIONS:
 *  1. Open your Google Sheet
 *  2. Click Extensions → Apps Script
 *  3. Delete everything in the editor
 *  4. Paste this entire file
 *  5. Save (Ctrl+S), then Deploy → New Deployment
 *     → Type: Web App
 *     → Execute as: Me
 *     → Who has access: Anyone
 *  6. Copy the Web App URL → paste into checkout.js as SHEETS_WEBHOOK_URL
 *
 *  GMAIL SETUP (for email notifications):
 *  - No setup needed — GmailApp uses your Google account automatically
 *  - Make sure the Google account running this script has Gmail
 * ============================================================
 */

// ── CONFIG ──────────────────────────────────────────────────
const SHEET_NAME   = 'Orders';          // Tab name in your Google Sheet
const SECRET_TOKEN = 'BUNOFEED_8fj39fj3jFJ38fjj38r8f_2026';
const SENDER_EMAIL = Session.getActiveUser().getEmail(); // Your Gmail (auto-detected)
const BRAND_NAME   = 'Bunofeed';
const BRAND_EMAIL  = 'bunofeedhelpdesk@gmail.com'; // Support email shown to customers
const BRAND_LOGO   = 'https://i.ibb.co/5W7myd6t/Brand-logo-2.png';
// ────────────────────────────────────────────────────────────


/**
 * Handles POST requests from the website.
 * Entry point for all order submissions.
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.token !== SECRET_TOKEN) {
  return respond({
    success: false,
    error: 'Unauthorised'
  });
}
    const action = data.action;

    if (action === 'saveOrder') {
      return saveOrder(data.order);
    } else if (action === 'updatePayment') {
      return updatePaymentStatus(data.orderId, data.paymentId, data.razorpayOrderId, data.status);
    } else {
      return respond({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

/**
 * Handles GET requests — used for CORS preflight / health check.
 */
function doGet(e) {
  return respond({ success: true, message: 'Bunofeed Order API is running.' });
}


// ── SAVE ORDER ───────────────────────────────────────────────

/**
 * Saves a new order row to Google Sheets.
 * Called BEFORE payment — status starts as "Pending".
 */
function saveOrder(order) {
  const sheet = getOrCreateSheet();

  // Check for duplicate Order ID (anti-duplicate protection)
  const existing = findRowByOrderId(sheet, order.orderId);
  if (existing !== -1) {
    return respond({ success: true, message: 'Duplicate — order already exists.', duplicate: true });
  }

  const now = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

  // Row columns (must match the header row exactly)
  const row = [
    order.orderId,           // A: Order ID
    dateStr,                 // B: Date & Time
    order.customerName,      // C: Customer Name
    order.phone,             // D: Phone Number
    order.email || '',       // E: Email
    order.address,           // F: Address
    order.pincode,           // G: Pincode
    order.productId,         // H: Product ID
    order.productName,       // I: Product Name
    order.quantity,          // J: Quantity
    order.productPrice,      // K: Product Price (₹)
    order.totalAmount,       // L: Total Amount (₹)
    '',                      // M: Razorpay Payment ID (filled on success)
    '',                      // N: Razorpay Order ID (filled on success)
    'Pending',               // O: Payment Status
    '',                      // P: Email Sent
    '',                      // Q: Email Error
  ];

  sheet.appendRow(row);

  // Auto-resize columns for readability
  try { sheet.autoResizeColumns(1, 17); } catch (_) {}

  return respond({ success: true, message: 'Order saved successfully.' });
}


// ── UPDATE PAYMENT STATUS ────────────────────────────────────

/**
 * Updates payment status after Razorpay callback.
 * Also triggers customer email notification on success.
 */
function updatePaymentStatus(orderId, paymentId, razorpayOrderId, status) {
  const sheet = getOrCreateSheet();
  const rowIndex = findRowByOrderId(sheet, orderId);

  if (rowIndex === -1) {
    return respond({ success: false, error: 'Order not found: ' + orderId });
  }

  // Update columns M (Payment ID), N (Razorpay Order ID), O (Status)
  sheet.getRange(rowIndex, 13).setValue(paymentId || '');
  sheet.getRange(rowIndex, 14).setValue(razorpayOrderId || '');
  sheet.getRange(rowIndex, 15).setValue(status); // 'Paid' or 'Failed'

  // Send email notification only on successful payment
  if (status === 'Paid') {
    const orderData = getOrderData(sheet, rowIndex);
    const emailResult = sendOrderConfirmationEmail(orderData);

    // Update email status columns P & Q
    sheet.getRange(rowIndex, 16).setValue(emailResult.sent ? 'Sent' : 'Failed');
    sheet.getRange(rowIndex, 17).setValue(emailResult.error || '');
  }

  return respond({ success: true, message: 'Payment status updated to: ' + status });
}


// ── EMAIL NOTIFICATION ───────────────────────────────────────

/**
 * Sends a branded HTML order confirmation email to the customer.
 * Uses GmailApp (free, no 3rd-party service needed).
 */
function sendOrderConfirmationEmail(order) {
  // Skip if no customer email provided
  if (!order.email || !order.email.includes('@')) {
    return { sent: false, error: 'No valid email address provided.' };
  }

  try {
    const subject = `✅ Order Confirmed! #${order.orderId} — ${BRAND_NAME}`;
    const htmlBody = buildEmailTemplate(order);

    GmailApp.sendEmail(order.email, subject, '', {
      htmlBody: htmlBody,
      name: BRAND_NAME,
      replyTo: BRAND_EMAIL,
    });

    return { sent: true };
  } catch (err) {
    // Retry once after a 2-second delay
    Utilities.sleep(2000);
    try {
      GmailApp.sendEmail(order.email, `✅ Order Confirmed! #${order.orderId} — ${BRAND_NAME}`, '', {
        htmlBody: buildEmailTemplate(order),
        name: BRAND_NAME,
        replyTo: BRAND_EMAIL,
      });
      return { sent: true };
    } catch (retryErr) {
      return { sent: false, error: retryErr.message };
    }
  }
}


/**
 * Builds the branded HTML email template.
 */
function buildEmailTemplate(order) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Order Confirmation</title>
  <style>
    body { margin:0; padding:0; background:#f5f0eb; font-family:'Segoe UI',Arial,sans-serif; }
    .wrapper { max-width:600px; margin:0 auto; background:#f5f0eb; padding:24px 16px; }
    .card { background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(107,45,14,0.10); }
    .header { background:linear-gradient(135deg,#6B2D0E 0%,#8B4513 100%); padding:32px 32px 24px; text-align:center; }
    .header img { height:60px; width:auto; display:block; margin:0 auto 16px; }
    .header h1 { color:#ffffff; margin:0; font-size:22px; font-weight:700; letter-spacing:0.02em; }
    .header p { color:rgba(255,255,255,0.75); margin:6px 0 0; font-size:14px; }
    .success-badge { background:#28a745; color:#fff; border-radius:50px; display:inline-block; padding:6px 20px; font-size:13px; font-weight:700; margin-top:12px; letter-spacing:0.04em; }
    .body { padding:32px; }
    .greeting { font-size:17px; color:#2c1a0e; font-weight:600; margin-bottom:8px; }
    .sub-text { font-size:14px; color:#7a6254; line-height:1.6; margin-bottom:24px; }
    .order-box { background:#faf6f2; border:1.5px solid #f0e8e0; border-radius:12px; overflow:hidden; margin-bottom:24px; }
    .order-box-header { background:#6B2D0E; color:#fff; padding:12px 20px; font-size:13px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; }
    .order-row { display:flex; justify-content:space-between; align-items:center; padding:12px 20px; border-bottom:1px solid #f0e8e0; }
    .order-row:last-child { border-bottom:none; }
    .order-row .label { font-size:13px; color:#7a6254; font-weight:500; }
    .order-row .value { font-size:13px; color:#2c1a0e; font-weight:700; text-align:right; max-width:55%; word-break:break-word; }
    .order-row .value.green { color:#28a745; }
    .order-row .value.orange { color:#FF6B00; }
    .divider { border:none; border-top:1.5px solid #f0e8e0; margin:24px 0; }
    .thank-box { background:linear-gradient(135deg,rgba(255,107,0,0.07),rgba(107,45,14,0.05)); border:1.5px solid rgba(255,107,0,0.2); border-radius:12px; padding:20px 24px; text-align:center; margin-bottom:24px; }
    .thank-box h3 { color:#6B2D0E; margin:0 0 8px; font-size:16px; font-weight:700; }
    .thank-box p { color:#7a6254; margin:0; font-size:13px; line-height:1.6; }
    .support-box { background:#f5f0eb; border-radius:10px; padding:16px 20px; margin-bottom:8px; }
    .support-box p { margin:0; font-size:13px; color:#7a6254; line-height:1.7; }
    .support-box a { color:#FF6B00; font-weight:600; text-decoration:none; }
    .footer { background:#6B2D0E; padding:20px 32px; text-align:center; }
    .footer p { color:rgba(255,255,255,0.6); font-size:12px; margin:4px 0; line-height:1.6; }
    .footer a { color:rgba(255,255,255,0.85); text-decoration:none; }
    @media(max-width:480px){
      .body { padding:20px 16px; }
      .order-row { flex-direction:column; align-items:flex-start; gap:4px; }
      .order-row .value { text-align:left; max-width:100%; }
    }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="card">

    <!-- Header -->
    <div class="header">
      <img src="${BRAND_LOGO}" alt="${BRAND_NAME} Logo"/>
      <h1>Order Confirmed! 🎉</h1>
      <p>Thank you for your purchase</p>
      <span class="success-badge">✔ PAYMENT SUCCESSFUL</span>
    </div>

    <!-- Body -->
    <div class="body">
      <p class="greeting">Hi ${order.customerName || 'Valued Customer'},</p>
      <p class="sub-text">
        Great news! Your order has been confirmed and is being processed.
        We'll notify you once it's shipped. Expected delivery: 3–7 business days.
      </p>

      <!-- Order Details -->
      <div class="order-box">
        <div class="order-box-header">📦 Order Details</div>
        <div class="order-row">
          <span class="label">Order ID</span>
          <span class="value orange">${order.orderId}</span>
        </div>
        <div class="order-row">
          <span class="label">Date &amp; Time</span>
          <span class="value">${order.dateTime}</span>
        </div>
        <div class="order-row">
          <span class="label">Product</span>
          <span class="value">${order.productName}</span>
        </div>
        <div class="order-row">
          <span class="label">Quantity</span>
          <span class="value">${order.quantity}</span>
        </div>
        <div class="order-row">
          <span class="label">Amount Paid</span>
          <span class="value green">₹${order.totalAmount}</span>
        </div>
        <div class="order-row">
          <span class="label">Payment Status</span>
          <span class="value green">✅ Paid</span>
        </div>
        <div class="order-row">
          <span class="label">Payment ID</span>
          <span class="value">${order.paymentId || 'N/A'}</span>
        </div>
      </div>

      <!-- Delivery Address -->
      <div class="order-box">
        <div class="order-box-header">🏠 Delivery Address</div>
        <div class="order-row">
          <span class="label">Name</span>
          <span class="value">${order.customerName}</span>
        </div>
        <div class="order-row">
          <span class="label">Address</span>
          <span class="value">${order.address}</span>
        </div>
        <div class="order-row">
          <span class="label">Pincode</span>
          <span class="value">${order.pincode}</span>
        </div>
        <div class="order-row">
          <span class="label">Phone</span>
          <span class="value">${order.phone}</span>
        </div>
      </div>

      <hr class="divider"/>

      <!-- Thank you note -->
      <div class="thank-box">
        <h3>💚 Thank You for Choosing ${BRAND_NAME}!</h3>
        <p>
          We're passionate about clean, honest nutrition.
          Your support helps us continue doing what we love.
          We hope you enjoy your order!
        </p>
      </div>

      <!-- Support -->
      <div class="support-box">
        <p>
          <strong>Need help?</strong> We're here for you!<br/>
          📧 Email: <a href="mailto:${BRAND_EMAIL}">${BRAND_EMAIL}</a><br/>
          ⏰ We respond within 24 hours.<br/>
          For returns or issues, email us within 48 hours of delivery with photos.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>© 2026 ${BRAND_NAME}. All rights reserved.</p>
      <p>Bareilly, UP, India</p>
      <p>
        <a href="https://bunofeed.com/terms.html">Terms of Service</a> &nbsp;|&nbsp;
        <a href="https://bunofeed.com/privacy.html">Privacy Policy</a>
      </p>
      <p style="margin-top:8px;font-size:11px;">
        You received this email because you placed an order on ${BRAND_NAME}.
      </p>
    </div>

  </div>
</div>
</body>
</html>`;
}


// ── HELPERS ──────────────────────────────────────────────────

/**
 * Gets the Orders sheet, creating it with headers if it doesn't exist.
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Create header row
    const headers = [
      'Order ID', 'Date & Time', 'Customer Name', 'Phone Number', 'Email',
      'Address', 'Pincode', 'Product ID', 'Product Name', 'Quantity',
      'Product Price (₹)', 'Total Amount (₹)', 'Razorpay Payment ID',
      'Razorpay Order ID', 'Payment Status', 'Email Sent', 'Email Error'
    ];
    sheet.appendRow(headers);

    // Style the header row
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#6B2D0E');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(11);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Finds a row index by Order ID. Returns -1 if not found.
 */
function findRowByOrderId(sheet, orderId) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === orderId) return i + 1; // +1 for 1-based row index
  }
  return -1;
}

/**
 * Reads all order data from a specific row into an object.
 */
function getOrderData(sheet, rowIndex) {
  const row = sheet.getRange(rowIndex, 1, 1, 17).getValues()[0];
  return {
    orderId:      row[0],
    dateTime:     row[1],
    customerName: row[2],
    phone:        row[3],
    email:        row[4],
    address:      row[5],
    pincode:      row[6],
    productId:    row[7],
    productName:  row[8],
    quantity:     row[9],
    productPrice: row[10],
    totalAmount:  row[11],
    paymentId:    row[12],
  };
}

/**
 * Returns a JSON response with CORS headers.
 */
function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
