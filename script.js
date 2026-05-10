/**
 * ============================================================
 *  BUNOFEED — Main Script (script.js)
 *  - Reads data from products.js (window.BUNOFEED_DATA)
 *  - Renders products dynamically on homepage
 *  - Full product modal with Buy Now (Razorpay) on homepage
 *  - Shows/hides campaign banner
 *  - Mobile nav, scroll reveal, active links
 * ============================================================
 */

document.addEventListener('DOMContentLoaded', () => {

  const D = window.BUNOFEED_DATA;
  if (!D) { console.error('BUNOFEED_DATA not found. Is products.js loaded?'); return; }

  /* ----------------------------------------------------------
     CAMPAIGN BANNER
  ---------------------------------------------------------- */
  const banner = document.getElementById('campaign-banner');
  if (banner && D.campaign && D.campaign.active) {
    const expired = D.campaign.expiryDate && new Date() > new Date(D.campaign.expiryDate);
    if (!expired) {
      banner.style.display = 'block';
      banner.style.background = D.campaign.bgColor || '#FF6B00';
      banner.style.color      = D.campaign.textColor || '#fff';

      let html = `<span>${D.campaign.text}</span>`;
      if (D.campaign.link && D.campaign.linkText) {
        html += `<a href="${D.campaign.link}" target="_blank" rel="noopener noreferrer" style="color:${D.campaign.textColor||'#fff'}">${D.campaign.linkText}</a>`;
      }
      html += `<button id="banner-close" style="color:${D.campaign.textColor||'#fff'}" aria-label="Close banner">✕</button>`;
      banner.innerHTML = html;

      document.getElementById('banner-close').addEventListener('click', () => {
        banner.style.display = 'none';
      });
    }
  }

  /* ----------------------------------------------------------
     HERO SECTION — dynamic text + image
  ---------------------------------------------------------- */
  if (D.hero) {
    const h = D.hero;
    const sub   = document.getElementById('hero-sub');
    const title = document.getElementById('hero-title');
    const desc  = document.getElementById('hero-desc');
    if (sub)   sub.textContent   = h.subtitle;
    if (title) title.innerHTML   = `${h.title}<br/><span class="hero-highlight">${h.titleHighlight}</span>`;
    if (desc)  desc.textContent  = h.description;

    const cta = document.getElementById('hero-cta');
    if (cta) {
      cta.textContent = h.ctaText;
      cta.href = h.ctaLink;
    }

    if (h.image) {
      const wrap = document.querySelector('.hero-img-wrap');
      if (wrap) {
        wrap.innerHTML = `<img class="hero-photo" src="${h.image}" alt="Bunofeed Hero" loading="eager"/>`;
        document.querySelector('.hero-image').style.display = 'flex';
      }
    }
  }

  /* ----------------------------------------------------------
     SALE helpers
  ---------------------------------------------------------- */
  const saleActive  = D.sale && D.sale.active && (!D.sale.endDate || new Date() <= new Date(D.sale.endDate));
  const discountPct = saleActive ? (D.sale.discountPercent || 0) : 0;
  function salePrice(p) {
    return saleActive && discountPct > 0 ? Math.round(p * (1 - discountPct / 100)) : null;
  }

  /* ----------------------------------------------------------
     RENDER BEST-SELLER CARDS (homepage)
  ---------------------------------------------------------- */
  const grid = document.getElementById('products-grid');
  if (grid && D.products) {
    grid.innerHTML = '';

    D.products.filter(p => p.visible !== false && p.bestSeller === true).forEach(product => {
      const sp = salePrice(product.price);

      let badgeHTML = '';
      if (product.badge) {
        const cls = product.badgeType === 'new' ? ' new' : product.badgeType === 'limited' ? ' limited' : '';
        badgeHTML = `<div class="product-badge${cls}">${product.badge}</div>`;
      }
      if (saleActive) {
        badgeHTML += `<div class="sale-ribbon">${D.sale.label || 'SALE'} ${discountPct}% OFF</div>`;
      }

      const imgHTML = product.image
        ? `<img class="product-photo" src="${product.image}" alt="${product.name}" loading="lazy"/>`
        : `<span class="product-emoji">${product.emoji || '🥜'}</span>`;

      let priceHTML = '';
      if (sp) {
        priceHTML = `
          <div class="product-price">
            <div class="product-weight">${product.weight || ''}</div>
            <div class="price-sale">
              <span class="price-current">₹${sp}</span>
              <span class="price-old">₹${product.price}</span>
            </div>
          </div>`;
      } else {
        priceHTML = `
          <div class="product-price">
            <div class="product-weight">${product.weight || ''}</div>
            <div class="price-original">₹${product.price}</div>
          </div>`;
      }

      const card = document.createElement('div');
      card.className = 'product-card reveal';
      card.dataset.id = product.id;
      card.innerHTML = `
        ${badgeHTML}
        <div class="product-img ${product.bgClass || ''}">${imgHTML}</div>
        <div class="product-info">
          <h3>${product.name}</h3>
          <p>${product.description}</p>
          <div class="product-footer">
            ${priceHTML}
            <div class="product-card-btns">
              <button class="btn-view-detail view-detail-btn" data-id="${product.id}">View Details</button>
              <button class="btn-buy buy-now-btn" data-id="${product.id}">Buy Now</button>
            </div>
          </div>
        </div>`;

      grid.appendChild(card);
    });

    /* Wire up card clicks and buttons */
    grid.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-buy') && !e.target.closest('.btn-view-detail')) {
          openModal(card.dataset.id);
        }
      });
    });
    grid.querySelectorAll('.view-detail-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openModal(btn.dataset.id); });
    });
    grid.querySelectorAll('.buy-now-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openModal(btn.dataset.id, true); });
    });

    initReveal();
  }

  /* ----------------------------------------------------------
     SCROLL REVEAL ANIMATION
  ---------------------------------------------------------- */
  function initReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          observer.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }

  document.querySelectorAll('.product-card, .why-stat-card, .feature-item').forEach(el => {
    el.classList.add('reveal');
  });
  initReveal();

  /* ----------------------------------------------------------
     PRODUCT MODAL (same as shop.html) injected into index.html
  ---------------------------------------------------------- */
  /* Inject modal HTML if not already present */
  if (!document.getElementById('home-modal-overlay')) {
    const modalHTML = `
    <style>
      .home-modal-overlay {
        display:none;position:fixed;inset:0;
        background:rgba(0,0,0,.55);z-index:2000;
        align-items:center;justify-content:center;
        padding:1rem;
        backdrop-filter:blur(4px);
        -webkit-backdrop-filter:blur(4px);
      }
      .home-modal-overlay.open { display:flex; }
      .home-modal {
        background:#fff;border-radius:20px;
        max-width:860px;width:100%;
        max-height:92vh;overflow-y:auto;
        -webkit-overflow-scrolling:touch;
        box-shadow:0 24px 64px rgba(0,0,0,.25);
        display:grid;grid-template-columns:1fr 1fr;
        animation:hModalIn .28s ease;
        position:relative;
      }
      @keyframes hModalIn {
        from{opacity:0;transform:scale(.95) translateY(12px)}
        to  {opacity:1;transform:scale(1) translateY(0)}
      }
      .home-modal-img-side {
        display:flex;flex-direction:column;align-items:stretch;
        font-size:7rem;border-radius:20px 0 0 20px;
        min-height:320px;overflow:hidden;
      }
      .home-modal-main-wrap {
        flex:1;width:100%;
        display:flex;align-items:center;justify-content:center;
        min-height:260px;overflow:hidden;
      }
      .home-modal-img-side img {
  display:block;
  width:100%;height:100%;
  max-width:100%;max-height:100%;
  object-fit:contain;padding:20px;
  pointer-events:none;
}
      /* Thumbnail strip */
      .home-modal-thumbs {
        width:100%;display:flex;gap:8px;padding:10px 12px;
        overflow-x:auto;background:rgba(0,0,0,.12);
        scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.3) transparent;
        flex-shrink:0;
      }
      .home-modal-thumbs::-webkit-scrollbar { height:4px; }
      .home-modal-thumbs::-webkit-scrollbar-thumb { background:rgba(255,255,255,.35);border-radius:4px; }
      .home-modal-thumbs:empty { display:none; }
      .home-modal-thumb {
        width:56px;height:56px;border-radius:8px;overflow:hidden;flex-shrink:0;
        border:2px solid transparent;cursor:pointer;
        transition:border-color .18s,transform .18s;background:#fff;
      }
      .home-modal-thumb:hover { transform:scale(1.05); }
      .home-modal-thumb.active { border-color:#FF6B00;box-shadow:0 0 0 1px #FF6B00; }
      .home-modal-thumb img { width:100%;height:100%;object-fit:contain;padding:4px; }
      .home-modal-body {
        padding:2.2rem 2rem;display:flex;flex-direction:column;gap:1rem;
        overflow-y:auto;
      }
      .home-modal-close {
        position:absolute;top:1rem;right:1rem;
        width:36px;height:36px;border-radius:50%;
        background:rgba(0,0,0,.18);border:none;cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        font-size:1rem;color:#fff;transition:.2s;z-index:10;
      }
      .home-modal-close:hover { background:rgba(0,0,0,.35); }
      .home-modal-badge-row { display:flex;gap:.5rem;flex-wrap:wrap; }
      .home-modal-badge {
        font-family:'Montserrat',sans-serif;font-weight:700;font-size:.72rem;
        padding:4px 12px;border-radius:50px;
      }
      .home-modal-badge.bestseller { background:#6B2D0E;color:#fff; }
      .home-modal-badge.new        { background:#28a745;color:#fff; }
      .home-modal-badge.limited    { background:#dc3545;color:#fff; }
      .home-modal-badge.sale       { background:#FF6B00;color:#fff; }
      .home-modal-name {
        font-family:'Montserrat',sans-serif;font-size:1.5rem;font-weight:800;
        color:#1a1a1a;line-height:1.2;
      }
      .home-modal-tagline { font-size:.97rem;color:#FF6B00;font-weight:600; }
      .home-modal-desc { color:#666;font-size:.93rem;line-height:1.75; }
      .home-modal-features { display:flex;flex-wrap:wrap;gap:.5rem; }
      .home-modal-chip {
        background:rgba(255,107,0,.1);color:#6B2D0E;
        font-size:.78rem;font-family:'Montserrat',sans-serif;font-weight:600;
        padding:5px 12px;border-radius:50px;
      }
      .home-modal-price-row {
        display:flex;align-items:center;gap:1rem;flex-wrap:wrap;
        padding:.8rem 0;border-top:1px solid #f0e8e0;border-bottom:1px solid #f0e8e0;
      }
      .home-modal-price-main {
        font-family:'Montserrat',sans-serif;font-size:1.7rem;font-weight:800;color:#6B2D0E;
      }
      .home-modal-price-sale { color:#FF6B00; }
      .home-modal-price-old  { font-size:.95rem;color:#666;text-decoration:line-through;font-weight:500; }
      .home-modal-weight-tag {
        background:#FFF8F3;padding:5px 14px;border-radius:50px;
        font-size:.8rem;font-weight:600;color:#666;font-family:'Montserrat',sans-serif;
      }
      .home-modal-qty-row { display:flex;align-items:center;gap:1rem;flex-wrap:wrap; }
      .home-qty-label { font-family:'Montserrat',sans-serif;font-weight:700;font-size:.85rem;color:#1a1a1a; }
      .home-qty-control {
        display:flex;align-items:center;border:2px solid #e0d4cc;border-radius:50px;overflow:hidden;
      }
      .home-qty-btn {
        width:36px;height:36px;background:none;border:none;cursor:pointer;
        font-size:1.1rem;font-weight:700;color:#1a1a1a;transition:.2s;
        display:flex;align-items:center;justify-content:center;
      }
      .home-qty-btn:hover { background:#FFF8F3; }
      .home-qty-num { min-width:32px;text-align:center;font-family:'Montserrat',sans-serif;font-weight:700;font-size:.95rem; }
      .home-modal-actions { display:flex;gap:.8rem;flex-wrap:wrap; }
      .home-modal-actions .btn { flex:1;min-width:130px;justify-content:center; }
      .home-modal-accordion { margin-top:.5rem; }
      .home-acc-item { border-top:1px solid #f0e8e0; }
      .home-acc-head {
        display:flex;align-items:center;justify-content:space-between;
        padding:.85rem 0;cursor:pointer;
        font-family:'Montserrat',sans-serif;font-weight:700;font-size:.88rem;color:#1a1a1a;
        background:none;border:none;width:100%;text-align:left;
      }
      .home-acc-head i { transition:transform .2s;color:#FF6B00; }
      .home-acc-head.open i { transform:rotate(180deg); }
      .home-acc-body { display:none;padding:.5rem 0 1rem;color:#666;font-size:.88rem;line-height:1.7; white-space:pre-line; }
      .home-acc-body.open { display:block; }
      @media(max-width:768px){
        .home-modal{grid-template-columns:1fr;max-height:95vh;}
        .home-modal-img-side{min-height:auto;border-radius:20px 20px 0 0;}
        .home-modal-main-wrap{min-height:200px;}
        .home-modal-body{padding:1.5rem 1.2rem;}
        .home-modal-name{font-size:1.25rem;}
      }
    </style>
    <div class="home-modal-overlay" id="home-modal-overlay" role="dialog" aria-modal="true">
      <div class="home-modal" id="home-modal-box">
        <button class="home-modal-close" id="home-modal-close" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
        <div class="home-modal-img-side peanut-bg" id="home-modal-img-side">
          <div class="home-modal-main-wrap" id="home-modal-main-wrap">
            <span id="home-modal-emoji">🥜</span>
          </div>
          <div class="home-modal-thumbs" id="home-modal-thumbs"></div>
        </div>
        <div class="home-modal-body">
          <div class="home-modal-badge-row" id="home-modal-badges"></div>
          <h2 class="home-modal-name" id="home-modal-name">Product Name</h2>
          <p class="home-modal-tagline" id="home-modal-tagline"></p>
          <p class="home-modal-desc" id="home-modal-desc"></p>
          <div class="home-modal-features" id="home-modal-features"></div>
          <div class="home-modal-price-row">
            <span class="home-modal-price-main" id="home-modal-price"></span>
            <span class="home-modal-price-old"  id="home-modal-price-old" style="display:none"></span>
            <span class="home-modal-weight-tag" id="home-modal-weight"></span>
          </div>
          <div class="home-modal-qty-row">
            <span class="home-qty-label">Quantity:</span>
            <div class="home-qty-control">
              <button class="home-qty-btn" id="home-qty-minus" aria-label="Decrease">−</button>
              <span   class="home-qty-num"  id="home-qty-num">1</span>
              <button class="home-qty-btn" id="home-qty-plus"  aria-label="Increase">+</button>
            </div>
            <span style="font-size:.85rem;color:#666" id="home-modal-subtotal"></span>
          </div>
          <div class="home-modal-actions">
            <button class="btn btn-primary" id="home-modal-buy-btn">
              <i class="fas fa-bolt"></i> Buy Now
            </button>
            <a href="shop.html" class="btn btn-brown">
              <i class="fas fa-store"></i> View All Products
            </a>
          </div>
          <div class="home-modal-accordion" id="home-modal-accordion"></div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  /* Modal state */
  let currentProduct = null;
  let _lastProduct   = null;  // Persists after modal close for checkout handoff
  let qty = 1;

  function openModal(id, focusBuy) {
    const product = (D.products || []).find(p => p.id === id);
    if (!product) return;
    currentProduct = product;
    _lastProduct   = product;  // Persist for checkout handoff
    qty = 1;

    const sp = salePrice(product.price);
    const displayPrice = sp || product.price;

    // Image side — gallery support
    const imgSide  = document.getElementById('home-modal-img-side');
    const mainWrap = document.getElementById('home-modal-main-wrap');
    const thumbsEl = document.getElementById('home-modal-thumbs');
    imgSide.className = `home-modal-img-side ${product.bgClass || 'peanut-bg'}`;

    // Build images array: prefer product.images[], fallback to product.image, fallback to emoji
    const allImages = (product.images && product.images.filter(u => u && u.trim()))
      || (product.image ? [product.image] : []);

    function setMainImg(src) {
      mainWrap.innerHTML = src
        ? `<img src="${src}" alt="${product.name}"/>`
        : `<span style="font-size:7rem;line-height:1">${product.emoji || '🥜'}</span>`;
    }

    function buildHomeThumbs(images, activeIdx) {
      thumbsEl.innerHTML = '';
      if (images.length <= 1) return;
      images.forEach((src, i) => {
        const t = document.createElement('div');
        t.className = 'home-modal-thumb' + (i === activeIdx ? ' active' : '');
        t.innerHTML = `<img src="${src}" alt="Product image ${i+1}" loading="lazy"/>`;
        t.addEventListener('click', () => {
          setMainImg(src);
          thumbsEl.querySelectorAll('.home-modal-thumb').forEach(el => el.classList.remove('active'));
          t.classList.add('active');
        });
        thumbsEl.appendChild(t);
      });
    }

    setMainImg(allImages[0] || null);
    buildHomeThumbs(allImages, 0);

    // Badges
    let badgesHTML = '';
    if (product.badge) {
      badgesHTML += `<span class="home-modal-badge ${product.badgeType || ''}">${product.badge}</span>`;
    }
    if (saleActive) badgesHTML += `<span class="home-modal-badge sale">${D.sale.label || 'SALE'} ${discountPct}% OFF</span>`;
    document.getElementById('home-modal-badges').innerHTML = badgesHTML;

    document.getElementById('home-modal-name').textContent    = product.name;
    document.getElementById('home-modal-tagline').textContent = product.tagline || '';
    document.getElementById('home-modal-desc').textContent    = product.description;
    document.getElementById('home-modal-weight').textContent  = product.weight || '';

    // Features
    document.getElementById('home-modal-features').innerHTML =
      (product.features || []).map(f => `<span class="home-modal-chip">${f}</span>`).join('');

    // Price
    const priceEl    = document.getElementById('home-modal-price');
    const priceOldEl = document.getElementById('home-modal-price-old');
    if (sp) {
      priceEl.textContent = `₹${sp}`;
      priceEl.classList.add('home-modal-price-sale');
      priceOldEl.textContent = `₹${product.price}`;
      priceOldEl.style.display = 'inline';
    } else {
      priceEl.textContent = `₹${product.price}`;
      priceEl.classList.remove('home-modal-price-sale');
      priceOldEl.style.display = 'none';
    }

    // Qty & subtotal
    document.getElementById('home-qty-num').textContent        = qty;
    document.getElementById('home-modal-subtotal').textContent = `Total: ₹${displayPrice * qty}`;

    // Accordion — using synced fields
    const accordionData = [
      { title: 'Ingredients',   body: product.ingredients  || product.description || 'See product label for full ingredient list.' },
      { title: 'Key Benefits',  body: product.keyBenefits  || (product.features || []).join(' • ') || 'See product label for full details.' },
      { title: 'Storage Info',  body: product.storageInfo  || 'Store in a cool, dry place. Keep lid tightly closed after opening. Consume within 3 months of opening.' },
      { title: 'Allergen Info', body: product.allergenInfo || 'May contain traces of nuts and soy. Always read the full label before consumption if you have allergies.' },
    ];
    document.getElementById('home-modal-accordion').innerHTML = accordionData.map((a, i) => `
      <div class="home-acc-item">
        <button class="home-acc-head" data-hacc="${i}">
          ${a.title} <i class="fas fa-chevron-down"></i>
        </button>
        <div class="home-acc-body" data-hacc-body="${i}">${a.body}</div>
      </div>`).join('');

    document.querySelectorAll('.home-acc-head').forEach(head => {
      head.addEventListener('click', () => {
        const idx  = head.dataset.hacc;
        const body = document.querySelector(`.home-acc-body[data-hacc-body="${idx}"]`);
        const open = head.classList.toggle('open');
        body.classList.toggle('open', open);
      });
    });

    document.getElementById('home-modal-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';

    if (focusBuy) {
      setTimeout(() => document.getElementById('home-modal-buy-btn').focus(), 100);
    }
  }

  /* Qty controls */
  document.addEventListener('click', (e) => {
    if (e.target.id === 'home-qty-minus' || e.target.closest('#home-qty-minus')) {
      if (qty > 1) { qty--; updateHomeSubtotal(); }
    }
    if (e.target.id === 'home-qty-plus' || e.target.closest('#home-qty-plus')) {
      qty++; updateHomeSubtotal();
    }
  });
  function updateHomeSubtotal() {
    if (!currentProduct) return;
    const sp = salePrice(currentProduct.price);
    const price = sp || currentProduct.price;
    document.getElementById('home-qty-num').textContent        = qty;
    document.getElementById('home-modal-subtotal').textContent = `Total: ₹${price * qty}`;
  }

  /* Close modal */
  function closeHomeModal() {
    document.getElementById('home-modal-overlay').classList.remove('open');
    document.body.style.overflow = '';
    currentProduct = null;
  }
  document.addEventListener('click', (e) => {
    if (e.target.id === 'home-modal-close' || e.target.closest('#home-modal-close')) closeHomeModal();
    if (e.target.id === 'home-modal-overlay') closeHomeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHomeModal(); });

  /* Buy Now — Opens checkout form first, then Razorpay */
  document.addEventListener('click', (e) => {
    if (e.target.id === 'home-modal-buy-btn' || e.target.closest('#home-modal-buy-btn')) {
      if (!currentProduct) return;
      const sp       = salePrice(currentProduct.price);
      const unit     = sp || currentProduct.price;
      const total    = unit * qty;
      const shipping = D.shipping && total < D.shipping.freeShippingAbove ? D.shipping.shippingCharge : 0;
      const grand    = total + shipping;

      // Capture references before closing modal
      const productSnap = currentProduct;
      const qtySnap     = qty;

      // Close product modal, then open checkout
      closeHomeModal();
      if (typeof window.openCheckout === 'function') {
        window.openCheckout(productSnap, qtySnap, grand, shipping);
      } else {
        console.error('[Bunofeed] checkout.js not loaded. Add <script src="checkout.js"></script> before script.js');
      }
    }
  });

  /* ----------------------------------------------------------
     MOBILE NAVIGATION
  ---------------------------------------------------------- */
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      hamburger.classList.toggle('active', open);
      hamburger.setAttribute('aria-expanded', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        hamburger.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
    document.addEventListener('click', (e) => {
      if (navLinks.classList.contains('open') &&
          !navLinks.contains(e.target) &&
          !hamburger.contains(e.target)) {
        navLinks.classList.remove('open');
        hamburger.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }

  /* ----------------------------------------------------------
     ACTIVE NAV LINK
  ---------------------------------------------------------- */
  const sections    = document.querySelectorAll('section[id]');
  const navLinkEls  = document.querySelectorAll('a.nav-link');
  const sectionObs  = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinkEls.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -50% 0px' });
  sections.forEach(s => sectionObs.observe(s));

  /* ----------------------------------------------------------
     SOCIAL LINKS
  ---------------------------------------------------------- */
  if (D.brand) {
    const b = D.brand;
    document.querySelectorAll('[data-social]').forEach(el => {
      const key = el.getAttribute('data-social');
      if (b[key]) el.href = b[key];
    });
    document.querySelectorAll('[data-email]').forEach(el => {
      el.href = `mailto:${b.email}`;
      if (!el.textContent.trim() || el.textContent.includes('bunofeed')) el.textContent = b.email;
    });
    document.querySelectorAll('[data-feedback-link]').forEach(el => {
      el.href = b.feedbackFormUrl;
    });
  }

});
