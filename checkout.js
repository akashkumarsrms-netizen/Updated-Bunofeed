/**
 * ============================================================
 *  BUNOFEED — Checkout Module  (checkout.js)
 *
 *  Responsibilities:
 *  ① Show a customer details form BEFORE Razorpay
 *  ② Validate all fields (name, phone, email, address, pincode)
 *  ③ Generate a unique Order ID
 *  ④ Save order to Google Sheets (status: Pending) — even if payment fails
 *  ⑤ Open Razorpay with pre-filled customer data
 *  ⑥ On success → update Sheet (status: Paid) → redirect to success page
 *  ⑦ On failure → update Sheet (status: Failed)
 *  ⑧ Anti-duplicate: disable Buy button while processing
 *
 *  SETUP:
 *  1. Deploy google-apps-script.js as a Google Apps Script Web App
 *  2. Paste your Web App URL below as SHEETS_WEBHOOK_URL
 *  3. Load this file AFTER products.js and before / with script.js
 * ============================================================
 */

// ── ✏️  CONFIGURE THIS ───────────────────────────────────────
// Paste your Google Apps Script Web App URL here.
// Get it from: Google Sheet → Extensions → Apps Script → Deploy → Web App URL
const SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwlCY41mAwdMzsbfd7M7zn4vULPCG5PoRKPRSXM3zDqZRe0JRgC_BtnKC7s9q1G58W6CQ/exec';
// ────────────────────────────────────────────────────────────


// ── MODULE STATE ─────────────────────────────────────────────
let _checkoutProduct  = null;   // Product being purchased
let _checkoutQty      = 1;      // Quantity selected
let _checkoutGrand    = 0;      // Grand total (product + shipping)
let _checkoutShipping = 0;      // Shipping amount
let _pendingOrderId   = null;   // Order ID generated for this session
let _isProcessing     = false;  // Prevents duplicate submissions


// ── ORDER ID GENERATOR ───────────────────────────────────────
/**
 * Generates a unique, human-readable Order ID.
 * Format: BF-YYYYMMDD-XXXX  (e.g., BF-20260510-A3K7)
 */
function generateOrderId() {
  const now   = new Date();
  const date  = now.getFullYear().toString() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0');
  const rand  = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BF-${date}-${rand}`;
}


// ── INJECT CHECKOUT MODAL HTML ───────────────────────────────
/**
 * Injects the checkout modal and its CSS into the page once.
 * Called automatically on DOMContentLoaded.
 */
function injectCheckoutModal() {
  if (document.getElementById('bf-checkout-overlay')) return; // Already injected

  // ── Styles ─────────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = 'bf-checkout-styles';
  style.textContent = `
    /* ── Overlay ── */
    #bf-checkout-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.60);
      z-index: 9999;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }
    #bf-checkout-overlay.open { display: flex; }

    /* ── Modal card ── */
    #bf-checkout-modal {
      background: #fff;
      border-radius: 20px;
      width: 100%;
      max-width: 520px;
      max-height: 96vh;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      box-shadow: 0 24px 64px rgba(107, 45, 14, 0.22);
      animation: bfSlideIn 0.28s ease;
    }
    @keyframes bfSlideIn {
      from { opacity: 0; transform: translateY(20px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)    scale(1); }
    }

    /* ── Modal header ── */
    .bf-checkout-header {
      background: linear-gradient(135deg, #6B2D0E 0%, #8B4513 100%);
      padding: 1.4rem 1.6rem 1.2rem;
      border-radius: 20px 20px 0 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .bf-checkout-header h2 {
      color: #fff;
      font-family: 'Montserrat', sans-serif;
      font-size: 1.15rem;
      font-weight: 800;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .bf-checkout-close {
      background: rgba(255,255,255,0.15);
      border: none;
      border-radius: 50%;
      width: 34px;
      height: 34px;
      color: #fff;
      font-size: 1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
      flex-shrink: 0;
    }
    .bf-checkout-close:hover { background: rgba(255,255,255,0.25); }

    /* ── Order summary strip ── */
    .bf-order-summary {
      background: #faf6f2;
      border-bottom: 1.5px solid #f0e8e0;
      padding: 0.9rem 1.6rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .bf-order-summary .bf-os-product {
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      font-size: 0.92rem;
      color: #2c1a0e;
    }
    .bf-order-summary .bf-os-meta {
      font-size: 0.8rem;
      color: #7a6254;
      margin-top: 2px;
    }
    .bf-order-summary .bf-os-total {
      font-family: 'Montserrat', sans-serif;
      font-weight: 800;
      font-size: 1.15rem;
      color: #FF6B00;
      white-space: nowrap;
    }

    /* ── Form body ── */
    .bf-checkout-body {
      padding: 1.5rem 1.6rem 1.8rem;
    }
    .bf-form-row {
      margin-bottom: 1.1rem;
    }
    .bf-form-row label {
      display: block;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.82rem;
      font-weight: 700;
      color: #2c1a0e;
      margin-bottom: 0.45rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .bf-form-row label .bf-req {
      color: #FF6B00;
      margin-left: 2px;
    }
    .bf-form-row label .bf-optional {
      color: #aaa;
      font-weight: 400;
      font-size: 0.75rem;
      text-transform: none;
      letter-spacing: 0;
      margin-left: 4px;
    }
    .bf-form-row input,
    .bf-form-row textarea {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 2px solid #e0d4cc;
      border-radius: 10px;
      font-size: 0.95rem;
      font-family: 'Open Sans', sans-serif;
      color: #2c1a0e;
      background: #fff;
      transition: border-color 0.2s, box-shadow 0.2s;
      box-sizing: border-box;
      -webkit-appearance: none;
      outline: none;
    }
    .bf-form-row input:focus,
    .bf-form-row textarea:focus {
      border-color: #FF6B00;
      box-shadow: 0 0 0 3px rgba(255, 107, 0, 0.12);
    }
    .bf-form-row input.bf-error,
    .bf-form-row textarea.bf-error {
      border-color: #dc3545;
      box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.10);
    }
    .bf-form-row input.bf-valid,
    .bf-form-row textarea.bf-valid {
      border-color: #28a745;
    }
    .bf-form-row textarea {
      resize: vertical;
      min-height: 80px;
      line-height: 1.5;
    }
    .bf-field-error {
      display: none;
      color: #dc3545;
      font-size: 0.79rem;
      font-weight: 600;
      margin-top: 0.35rem;
      padding-left: 2px;
    }
    .bf-field-error.visible { display: block; }

    /* ── Two-column row ── */
    .bf-form-2col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    /* ── Shipping info line ── */
    .bf-shipping-note {
      font-size: 0.82rem;
      color: #7a6254;
      background: rgba(40, 167, 69, 0.08);
      border: 1px solid rgba(40, 167, 69, 0.2);
      border-radius: 8px;
      padding: 0.6rem 0.9rem;
      margin-bottom: 1.2rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .bf-shipping-note i { color: #28a745; }

    /* ── Submit button ── */
    .bf-checkout-submit {
      width: 100%;
      padding: 0.95rem;
      background: linear-gradient(135deg, #FF6B00, #e55d00);
      color: #fff;
      border: none;
      border-radius: 12px;
      font-family: 'Montserrat', sans-serif;
      font-size: 1rem;
      font-weight: 800;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      letter-spacing: 0.02em;
      -webkit-appearance: none;
    }
    .bf-checkout-submit:hover:not(:disabled) {
      opacity: 0.92;
      transform: translateY(-1px);
    }
    .bf-checkout-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    .bf-spinner {
      width: 18px; height: 18px;
      border: 2.5px solid rgba(255,255,255,0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: bfSpin 0.7s linear infinite;
      display: none;
    }
    @keyframes bfSpin { to { transform: rotate(360deg); } }
    .bf-checkout-submit.loading .bf-spinner { display: block; }
    .bf-checkout-submit.loading .bf-btn-text { display: none; }

    /* ── Global error / status messages ── */
    #bf-form-status {
      display: none;
      padding: 0.8rem 1rem;
      border-radius: 8px;
      font-size: 0.88rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }
    #bf-form-status.error   { background: #fde8e8; color: #c0392b; border: 1px solid #f5c6cb; display: block; }
    #bf-form-status.info    { background: #e8f4fd; color: #1a6fa0; border: 1px solid #bee5eb; display: block; }
    #bf-form-status.success { background: #e8fde8; color: #1a7a2a; border: 1px solid #c3e6cb; display: block; }

    /* ── Security badge ── */
    .bf-security-note {
      text-align: center;
      font-size: 0.78rem;
      color: #aaa;
      margin-top: 0.9rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
    }
    .bf-security-note i { color: #28a745; }

    /* ── Mobile ── */
    @media (max-width: 480px) {
      #bf-checkout-modal { border-radius: 16px 16px 0 0; max-height: 100vh; }
      #bf-checkout-overlay { align-items: flex-end; padding: 0; }
      .bf-form-2col { grid-template-columns: 1fr; gap: 0; }
      .bf-checkout-body { padding: 1.2rem 1.1rem 1.5rem; }
    }
  `;
  document.head.appendChild(style);

  // ── Modal HTML ──────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'bf-checkout-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'bf-checkout-title');
  overlay.innerHTML = `
    <div id="bf-checkout-modal">

      <!-- Header -->
      <div class="bf-checkout-header">
        <h2 id="bf-checkout-title">
          <i class="fas fa-shopping-bag" aria-hidden="true"></i>
          Delivery Details
        </h2>
        <button class="bf-checkout-close" id="bf-checkout-close" aria-label="Close checkout">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Order summary -->
      <div class="bf-order-summary">
        <div>
          <div class="bf-os-product" id="bf-os-product">—</div>
          <div class="bf-os-meta" id="bf-os-meta">—</div>
        </div>
        <div class="bf-os-total" id="bf-os-total">₹0</div>
      </div>

      <!-- Form body -->
      <div class="bf-checkout-body">

        <!-- Status message -->
        <div id="bf-form-status" role="alert"></div>

        <form id="bf-checkout-form" novalidate autocomplete="on">

          <!-- Full Name -->
          <div class="bf-form-row">
            <label for="bf-name">Full Name <span class="bf-req">*</span></label>
            <input type="text" id="bf-name" name="name"
                   autocomplete="name"
                   placeholder="Your full name"
                   maxlength="100"/>
            <span class="bf-field-error" id="bf-name-err">Please enter your full name.</span>
          </div>

          <!-- Phone + Email -->
          <div class="bf-form-2col">
            <div class="bf-form-row">
              <label for="bf-phone">Mobile Number <span class="bf-req">*</span></label>
              <input type="tel" id="bf-phone" name="phone"
                     autocomplete="tel"
                     placeholder="10-digit mobile"
                     maxlength="10"
                     inputmode="numeric"/>
              <span class="bf-field-error" id="bf-phone-err">Enter a valid 10-digit Indian mobile number.</span>
            </div>
            <div class="bf-form-row">
              <label for="bf-email">Email <span class="bf-optional">(optional)</span></label>
              <input type="email" id="bf-email" name="email"
                     autocomplete="email"
                     placeholder="your@email.com"/>
              <span class="bf-field-error" id="bf-email-err">Please enter a valid email address.</span>
            </div>
          </div>

          <!-- Address -->
          <div class="bf-form-row">
            <label for="bf-address">Full Delivery Address <span class="bf-req">*</span></label>
            <textarea id="bf-address" name="address"
                      autocomplete="street-address"
                      placeholder="House no., Street, Area, City, State"
                      rows="3"></textarea>
            <span class="bf-field-error" id="bf-address-err">Please enter your complete delivery address.</span>
          </div>

          <!-- Pincode -->
          <div class="bf-form-row" style="max-width:180px">
            <label for="bf-pincode">Pincode <span class="bf-req">*</span></label>
            <input type="text" id="bf-pincode" name="pincode"
                   autocomplete="postal-code"
                   placeholder="6-digit pincode"
                   maxlength="6"
                   inputmode="numeric"/>
            <span class="bf-field-error" id="bf-pincode-err">Enter a valid 6-digit pincode.</span>
          </div>

          <!-- Shipping note (injected dynamically) -->
          <div id="bf-shipping-note-row"></div>

          <!-- Submit -->
          <button type="submit" class="bf-checkout-submit" id="bf-checkout-submit">
            <div class="bf-spinner" aria-hidden="true"></div>
            <span class="bf-btn-text">
              <i class="fas fa-lock" aria-hidden="true"></i>
              Proceed to Pay
            </span>
          </button>

          <!-- Security line -->
          <div class="bf-security-note">
            <i class="fas fa-shield-alt"></i>
            Secured by Razorpay. Your data is encrypted and never stored on our servers.
          </div>

        </form>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ── Event listeners ─────────────────────────────────────────

  // Close button
  document.getElementById('bf-checkout-close').addEventListener('click', closeCheckout);

  // Click outside modal
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeCheckout();
  });

  // ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeCheckout();
  });

  // Phone: allow only digits
  document.getElementById('bf-phone').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').substring(0, 10);
  });

  // Pincode: allow only digits
  document.getElementById('bf-pincode').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').substring(0, 6);
  });

  // Inline validation on blur
  document.getElementById('bf-name').addEventListener('blur',    () => validateField('name'));
  document.getElementById('bf-phone').addEventListener('blur',   () => validateField('phone'));
  document.getElementById('bf-email').addEventListener('blur',   () => validateField('email'));
  document.getElementById('bf-address').addEventListener('blur', () => validateField('address'));
  document.getElementById('bf-pincode').addEventListener('blur', () => validateField('pincode'));

  // Form submit
  document.getElementById('bf-checkout-form').addEventListener('submit', handleCheckoutSubmit);
}


// ── OPEN / CLOSE ─────────────────────────────────────────────

/**
 * Opens the checkout modal for a given product.
 * Called from script.js instead of triggerRazorpay().
 */
window.openCheckout = function(product, quantity, grandTotal, shippingAmt) {
  if (_isProcessing) return; // Don't open if already mid-payment

  _checkoutProduct  = product;
  _checkoutQty      = quantity;
  _checkoutGrand    = grandTotal;
  _checkoutShipping = shippingAmt;

  // Update order summary strip
  document.getElementById('bf-os-product').textContent = product.name;
  document.getElementById('bf-os-meta').textContent =
    `Qty: ${quantity} · ${product.weight || ''} · ${shippingAmt > 0 ? `+ ₹${shippingAmt} shipping` : 'Free Shipping'}`;
  document.getElementById('bf-os-total').textContent = `₹${grandTotal}`;

  // Shipping note
  const noteRow = document.getElementById('bf-shipping-note-row');
  if (shippingAmt > 0) {
    noteRow.innerHTML = `
      <div class="bf-shipping-note">
        <i class="fas fa-truck"></i>
        Shipping: ₹${shippingAmt} will be added. Free shipping on orders above ₹${window.BUNOFEED_DATA?.shipping?.freeShippingAbove || 499}.
      </div>`;
  } else {
    noteRow.innerHTML = `
      <div class="bf-shipping-note">
        <i class="fas fa-truck"></i>
        🎉 You've qualified for <strong>Free Shipping!</strong>
      </div>`;
  }

  // Reset form state
  resetCheckoutForm();

  // Show modal
  const overlay = document.getElementById('bf-checkout-overlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Focus first field
  setTimeout(() => document.getElementById('bf-name').focus(), 120);
};

function closeCheckout() {
  if (_isProcessing) return; // Don't close mid-payment
  document.getElementById('bf-checkout-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function resetCheckoutForm() {
  const form = document.getElementById('bf-checkout-form');
  form.reset();

  // Clear all validation states
  ['bf-name', 'bf-phone', 'bf-email', 'bf-address', 'bf-pincode'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('bf-error', 'bf-valid');
  });
  ['bf-name-err', 'bf-phone-err', 'bf-email-err', 'bf-address-err', 'bf-pincode-err'].forEach(id => {
    document.getElementById(id).classList.remove('visible');
  });

  // Clear status message
  const status = document.getElementById('bf-form-status');
  status.className = '';
  status.textContent = '';

  // Reset button
  setSubmitLoading(false);
}


// ── VALIDATION ───────────────────────────────────────────────

/**
 * Validates a single field. Returns true if valid.
 */
function validateField(field) {
  const input = document.getElementById(`bf-${field}`);
  const errEl = document.getElementById(`bf-${field}-err`);
  let valid = true;
  let errorMsg = '';

  const val = input.value.trim();

  switch (field) {
    case 'name':
      if (!val || val.length < 2) {
        valid = false;
        errorMsg = 'Please enter your full name (at least 2 characters).';
      }
      break;

    case 'phone':
      // Indian mobile: 10 digits, starting with 6–9
      if (!/^[6-9]\d{9}$/.test(val)) {
        valid = false;
        errorMsg = 'Enter a valid 10-digit Indian mobile number (starts with 6–9).';
      }
      break;

    case 'email':
      // Email is optional — only validate if provided
      if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        valid = false;
        errorMsg = 'Please enter a valid email address (e.g. you@example.com).';
      }
      break;

    case 'address':
      if (!val || val.length < 10) {
        valid = false;
        errorMsg = 'Please enter your complete delivery address (at least 10 characters).';
      }
      break;

    case 'pincode':
      if (!/^\d{6}$/.test(val)) {
        valid = false;
        errorMsg = 'Enter a valid 6-digit Indian pincode.';
      }
      break;
  }

  if (valid) {
    input.classList.remove('bf-error');
    if (val) input.classList.add('bf-valid'); // Show green tick only if filled
    errEl.classList.remove('visible');
  } else {
    input.classList.remove('bf-valid');
    input.classList.add('bf-error');
    errEl.textContent = errorMsg;
    errEl.classList.add('visible');
  }

  return valid;
}

/**
 * Validates all required fields. Returns true if all pass.
 */
function validateAllFields() {
  const nameOk    = validateField('name');
  const phoneOk   = validateField('phone');
  const emailOk   = validateField('email');
  const addressOk = validateField('address');
  const pincodeOk = validateField('pincode');
  return nameOk && phoneOk && emailOk && addressOk && pincodeOk;
}


// ── FORM SUBMIT HANDLER ──────────────────────────────────────

async function handleCheckoutSubmit(e) {
  e.preventDefault();

  if (_isProcessing) return;

  // Validate all fields
  if (!validateAllFields()) {
    showFormStatus('error', '⚠️ Please fix the errors above before continuing.');
    // Scroll to first error
    const firstErr = document.querySelector('#bf-checkout-form .bf-error');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Collect customer data
  const customerData = {
    name:    document.getElementById('bf-name').value.trim(),
    phone:   document.getElementById('bf-phone').value.trim(),
    email:   document.getElementById('bf-email').value.trim(),
    address: document.getElementById('bf-address').value.trim(),
    pincode: document.getElementById('bf-pincode').value.trim(),
  };

  // Check Razorpay
  if (typeof Razorpay === 'undefined') {
    showFormStatus('error', '⚠️ Payment gateway not loaded. Please check your internet connection and refresh the page.');
    return;
  }

  const D = window.BUNOFEED_DATA;
  const key = D && D.payment && D.payment.razorpayKeyId;
  if (!key || key.includes('PASTE_YOUR')) {
    showFormStatus('error', '⚠️ Payment gateway is not configured yet. Please contact support.');
    return;
  }

  // Lock the UI
  _isProcessing = true;
  setSubmitLoading(true);
  showFormStatus('info', '🔒 Saving your order and opening payment gateway…');

  // Generate Order ID
  _pendingOrderId = generateOrderId();

  // Save order to Google Sheets (status: Pending)
  // Even if Sheets fails, we still proceed to payment (non-blocking)
  try {
    await saveOrderToSheets({
      orderId:      _pendingOrderId,
      customerName: customerData.name,
      phone:        customerData.phone,
      email:        customerData.email,
      address:      customerData.address,
      pincode:      customerData.pincode,
      productId:    _checkoutProduct.id,
      productName:  _checkoutProduct.name,
      quantity:     _checkoutQty,
      productPrice: _checkoutProduct.price,
      totalAmount:  _checkoutGrand,
    });
  } catch (err) {
    // Log but don't block checkout — order will still be tracked by Razorpay
    console.warn('[Bunofeed] Sheets save failed (non-fatal):', err.message);
  }

  // Close checkout modal, open Razorpay
  document.getElementById('bf-checkout-overlay').classList.remove('open');
  document.body.style.overflow = '';

  openRazorpay(customerData);
}


// ── GOOGLE SHEETS INTEGRATION ────────────────────────────────

/**
 * Sends order data to the Google Apps Script Web App.
 * Wrapped in a timeout to handle slow connections gracefully.
 */
async function saveOrderToSheets(orderData) {
  if (!SHEETS_WEBHOOK_URL || SHEETS_WEBHOOK_URL.includes('PASTE_YOUR')) {
    console.warn('[Bunofeed] Sheets webhook URL not configured. Skipping sheet save.');
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8-second timeout

  try {
    const res = await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors', // Required for Google Apps Script
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveOrder', order: orderData }),
      signal: controller.signal,
      token: 'BUNOFEED_8fj39fj3jFJ38fjj38r8f_2026',
    });
    // Note: with no-cors, we can't read the response body — that's expected
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Updates payment status in Google Sheets after Razorpay callback.
 */
async function updatePaymentInSheets(orderId, paymentId, razorpayOrderId, status) {
  if (!SHEETS_WEBHOOK_URL || SHEETS_WEBHOOK_URL.includes('PASTE_YOUR')) return;

  try {
    await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updatePayment',
        token: 'BUNOFEED_8fj39fj3jFJ38fjj38r8f_2026',
        orderId,
        paymentId,
        razorpayOrderId,
        status,
      }),
    });
  } catch (err) {
    console.warn('[Bunofeed] Payment status update to Sheets failed:', err.message);
  }
}


// ── RAZORPAY INTEGRATION ─────────────────────────────────────

/**
 * Opens the Razorpay checkout with customer data pre-filled.
 */
function openRazorpay(customerData) {
  const D = window.BUNOFEED_DATA;

  const options = {
    key:      D.payment.razorpayKeyId,
    amount:   _checkoutGrand * 100, // Razorpay expects paise
    currency: D.payment.currency || 'INR',
    name:     D.payment.businessName || 'Bunofeed',
    description: `${_checkoutProduct.name} × ${_checkoutQty}` +
                 `${_checkoutShipping > 0 ? ` + ₹${_checkoutShipping} shipping` : ' (Free Shipping)'}`,
    image: D.payment.logoUrl || '',
    theme: { color: D.payment.themeColor || '#FF6B00' },

    // Pre-fill customer details collected from our form
    prefill: {
      name:    customerData.name,
      email:   customerData.email,
      contact: customerData.phone,
    },

    notes: {
      order_id:     _pendingOrderId,
      product_id:   _checkoutProduct.id,
      product_name: _checkoutProduct.name,
      quantity:     _checkoutQty,
      address:      customerData.address,
      pincode:      customerData.pincode,
    },

    // ── Success handler ──────────────────────────────────────
    handler: async function(response) {
      // Update Sheets: Paid
      await updatePaymentInSheets(
        _pendingOrderId,
        response.razorpay_payment_id,
        response.razorpay_order_id || '',
        'Paid'
      );

      // Redirect to success page
      const params = new URLSearchParams({
        order_id:   _pendingOrderId,
        payment_id: response.razorpay_payment_id,
        product:    _checkoutProduct.name,
        qty:        _checkoutQty,
        total:      _checkoutGrand,
        name:       customerData.name,
      });
      window.location.href = `order-success.html?${params.toString()}`;
    },

    modal: {
      ondismiss: function() {
        // User closed Razorpay modal without paying
        _isProcessing = false;
        setSubmitLoading(false);

        // Re-open checkout form so user can retry
        showFormStatus('info', '⚠️ Payment was cancelled. You can try again below.');
        document.getElementById('bf-checkout-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
      }
    }
  };

  const rzp = new Razorpay(options);

  // ── Failure handler ────────────────────────────────────────
  rzp.on('payment.failed', async function(response) {
    // Update Sheets: Failed
    await updatePaymentInSheets(
      _pendingOrderId,
      response.error.metadata && response.error.metadata.payment_id || '',
      '',
      'Failed'
    );

    _isProcessing = false;
    setSubmitLoading(false);

    // Show error in checkout form
    showFormStatus('error',
      `❌ Payment failed: ${response.error.description || 'Unknown error'}. Please try again.`
    );
    document.getElementById('bf-checkout-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';

    // Generate new Order ID for retry
    _pendingOrderId = generateOrderId();
  });

  rzp.open();
}


// ── UI HELPERS ───────────────────────────────────────────────

function setSubmitLoading(loading) {
  const btn = document.getElementById('bf-checkout-submit');
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
}

function showFormStatus(type, message) {
  const el = document.getElementById('bf-form-status');
  if (!el) return;
  el.className = type;
  el.textContent = message;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', injectCheckoutModal);
