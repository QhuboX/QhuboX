/* ================================================================
   QhuboX Ecosystem OS — script.js
   Handles: Clock · Weather · Gadgets · Windows · Dock · Start Menu
   Crypto Search (real-time) · Solana live price · Wallet/Chat modal
   Wallpaper switcher · Notification popup · App URL routing
================================================================ */

'use strict';

/* ────────────────────────────────────────────
   APP REGISTRY — URLs from provided icon-grid
──────────────────────────────────────────── */
const APPS = [
  { id: 'QhronoX Protocol', icon: '🕐', color: '#7b2ff7', img: 'icons/QhronoX.png',
    url: 'http://localhost:3000',
    desc: 'The financial engine of $QHUBX. Staking & Governance — asset management and real governance, allowing the community to validate and steer the protocol\'s direction.',
    category: 'DeFi' },
  { id: 'Qhubox Wallet', icon: '💳', color: '#00d2ff', img: 'icons/exchang.png',
    url: null, /* opens wallet/chat modal */
    desc: 'Extreme security. Advanced authentication and personal PIN systems for total asset protection on the Solana Network.',
    category: 'Finance' },
  { id: 'QhuboX Chat', icon: '💬', color: '#28ca41', img: 'icons/staking.png',
    url: null, /* opens wallet/chat modal */
    desc: 'P2P Wallet-to-Wallet communication. Encrypted text, voice, and video calls. No SIM cards, no external agents, no trace.',
    category: 'Social' },
  { id: 'QhuboX Terminal', icon: '⌨️', color: '#8888bb', img: 'icons/icon.png',
    url: 'http://localhost:3001',
    desc: 'Advanced Trading — SPL token trading with a focus on Responsible Trading. Built-in tracking and developer verification systems to trade based on data, not luck.',
    category: 'Dev Tools' },
  { id: 'sAIgnalX', icon: '📊', color: '#00d2ff', img: 'icons/analytics.png',
    url: 'sAIgnalX/sAIgnalX.html',
    desc: 'Real-time AI-generated trading signals. Precise information exactly when the market moves.',
    category: 'Analytics' },
  { id: 'Sollower', icon: '🌿', color: '#28ca41', img: 'icons/Dao.png',
    url: 'http://localhost:5174/',
    desc: 'Social FI — Interact, promote, and monetize. A system where earning rewards for attention and crowdfunding are part of the same network.',
    category: 'Social' },
  { id: 'Burnow', icon: '🔥', color: '#ff7b00', img: 'icons/Gem.png',
    url: 'Burn/QHUBX_Incinerator.html',
    desc: 'Tokenomic incineration system designed to increase the intrinsic value of $QHUBX through strategic supply reduction.',
    category: 'DeFi' },
  { id: 'Pebbles', icon: '🫧', color: '#aa66ff', img: 'icons/bubble.png',
    url: 'pebbles.html',
    desc: '24/7 Market Monitor. Total surveillance over liquidity and network movements.',
    category: 'Analytics' },
  { id: 'NeuroQhuboX', icon: '🧠', color: '#ff6b9d', img: 'media/neuro.png',
    url: 'NeuroQhuboX.html',
    desc: 'Technology with a human purpose. Cognitive development support for individuals with ADHD through adaptive interfaces.',
    category: 'AI' },
  { id: 'DEV Turing', icon: '🤖', color: '#64b4ff', img: 'icons/ml.png',
    url: 'http://127.0.0.1:7860',
    desc: 'Instant Creation. Generate games, apps, and websites on the fly with automated development tools.',
    category: 'Dev Tools' },
  { id: 'Kiaraap', icon: '💜', color: '#9966ff', img: 'icons/wallet.png',
    url: 'Kiaraap/KIARA.html',
    desc: 'The Crypto Investment Notebook. Strategic portfolio organization for investors who demand order.',
    category: 'Finance' },
  { id: 'Royal Titanium', icon: '👑', color: '#ffd700', img: 'icons/pilot.png',
    url: 'http://127.0.0.1:5500/SoluckU.html',
    desc: 'Gaming & Entertainment — Integrated fun. Betting systems and games backed by the internal economy, transforming leisure into real value.',
    category: 'Gaming' },
  { id: 'Green Player', icon: '🟢', color: '#22d3ee', img: 'icons/Green.png',
    url: '',
    desc: 'Green Player — part of the QhuboX ecosystem.',
    category: 'Media' },
  { id: 'QhuboX Project', icon: '📁', color: '#8899cc', img: 'assets/logo.png',
    url: null, /* opens info window */
    desc: 'Project workspace hub — files, tasks, and collaboration across the QhuboX ecosystem.',
    category: 'Productivity' },
  { id: 'AI Assistant', icon: '✦', color: '#7b2ff7', img: 'assets/logo.png',
    url: null, /* opens AI modal */
    desc: 'Embedded AI assistant powered by QhuboX Labs. Available directly in your OS.',
    category: 'AI' },
];

const PINNED_APPS = ['QhronoX Protocol','Qhubox Wallet','QhuboX Chat','QhuboX Terminal','sAIgnalX','Sollower','Burnow','Kiaraap'];
const RECENT_APPS = ['DEV Turing','Pebbles','NeuroQhuboX','Royal Titanium'];
const WEATHER_KEY = 'eb33fd55bee0402dad142135252408';

/* ────────────────────────────────────────────
   UTILITY
──────────────────────────────────────────── */
const el  = (id) => document.getElementById(id);
const pad = (n)  => String(n).padStart(2, '0');

function appByID(id) {
  return APPS.find(a => a.id === id) || { id, icon: '📱', color: '#7b2ff7', img: '', url: null, desc: 'QhuboX application.', category: 'App' };
}

function fmtLargeNum(n) {
  if (!n || isNaN(n)) return '—';
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'M';
  return '$' + n.toLocaleString();
}

/* ────────────────────────────────────────────
   CLOCK — live tick every second
──────────────────────────────────────────── */
const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function tickClock() {
  const now  = new Date();
  const h    = pad(now.getHours());
  const m    = pad(now.getMinutes());
  const time = `${h}:${m}`;
  const date = `${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  const day  = DAYS[now.getDay()].toUpperCase();
  const tbDate = `${MONTHS[now.getMonth()]} ${now.getDate()}`;

  if (el('gClockTime')) el('gClockTime').textContent = time;
  if (el('gClockDate')) el('gClockDate').textContent = date;
  if (el('gClockDay'))  el('gClockDay').textContent  = day;
  if (el('tbTime'))     el('tbTime').textContent = time;
  if (el('tbDate'))     el('tbDate').textContent = tbDate;
}

tickClock();
setInterval(tickClock, 1000);

/* ────────────────────────────────────────────
   WEATHER — via IP geolocation + WeatherAPI
──────────────────────────────────────────── */
(function loadWeather() {
  fetch('https://ipapi.co/json/')
    .then(r => r.json())
    .then(loc => {
      if (el('gwLoc')) el('gwLoc').textContent = `📍 ${loc.city || loc.country_name || 'Unknown'}`;
      const lat = loc.latitude;
      const lon = loc.longitude;
      return fetch(`https://api.weatherapi.com/v1/current.json?key=${WEATHER_KEY}&q=${lat},${lon}&lang=en`);
    })
    .then(r => r.json())
    .then(data => {
      const c = data.current;
      if (el('gwTemp'))     el('gwTemp').textContent     = `${Math.round(c.temp_c)}°C`;
      if (el('gwDesc'))     el('gwDesc').textContent     = c.condition.text;
      if (el('gwHumidity')) el('gwHumidity').textContent = `${c.humidity}%`;
      if (el('gwWind'))     el('gwWind').textContent     = `${Math.round(c.wind_kph)} km/h`;
      if (el('gwFeels'))    el('gwFeels').textContent    = `${Math.round(c.feelslike_c)}°C`;
    })
    .catch(() => {
      if (el('gwTemp')) el('gwTemp').textContent = '--°';
      if (el('gwDesc')) el('gwDesc').textContent = 'Unavailable';
    });
})();

/* ────────────────────────────────────────────
   SOLANA LIVE PRICE — CoinGecko (no key)
──────────────────────────────────────────── */
let solPriceHistory = [];

function buildSolSparkline(bars, containerId) {
  const container = el(containerId);
  if (!container) return;
  container.innerHTML = '';
  const max = Math.max(...bars, 1);
  bars.forEach(v => {
    const bar = document.createElement('div');
    bar.className = 'sol-bar';
    bar.style.height = `${(v / max) * 100}%`;
    container.appendChild(bar);
  });
}

function fetchSolanaPrice() {
  fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true')
    .then(r => r.json())
    .then(data => {
      const sol = data.solana;
      if (!sol) return;

      const price  = sol.usd;
      const change = sol.usd_24h_change;
      const vol    = sol.usd_24h_vol;

      if (el('solPrice'))  el('solPrice').textContent  = `$${price.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
      if (el('solChange')) {
        el('solChange').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
        el('solChange').className   = 'sol-change' + (change < 0 ? ' neg' : '');
      }
      if (el('solVol')) el('solVol').textContent = fmtLargeNum(vol);

      // Build sparkline history
      solPriceHistory.push(price);
      if (solPriceHistory.length > 14) solPriceHistory.shift();
      if (solPriceHistory.length >= 2) {
        buildSolSparkline(solPriceHistory, 'solSparkline');
      }
    })
    .catch(() => {
      // Fallback: show static sparkline
      if (solPriceHistory.length === 0) {
        buildSolSparkline([45,60,52,70,65,78,72,88,80,92,85,95], 'solSparkline');
        if (el('solPrice'))  el('solPrice').textContent  = 'Unavail.';
        if (el('solChange')) el('solChange').textContent = '—';
      }
    });
}

fetchSolanaPrice();
setInterval(fetchSolanaPrice, 30000); // refresh every 30s

/* ────────────────────────────────────────────
   CRYPTO SEARCH — CoinGecko search API
──────────────────────────────────────────── */
let cryptoSearchTimeout = null;
let currentCryptoId     = null;
let cryptoRefreshTimer  = null;

const spInput   = el('spInput');
const spResults = el('spResults');

function showCryptoSpinner() {
  if (spResults) spResults.innerHTML = `<div class="sp-loading">Searching...</div>`;
}

function buildCryptoResultItem(coin) {
  const item = document.createElement('div');
  item.className = 'sp-item';
  item.innerHTML = `
    <span class="sp-item-icon">${coin.thumb ? `<img src="${coin.thumb}" width="20" height="20" style="border-radius:50%;object-fit:cover" onerror="this.outerHTML='💰'">` : '💰'}</span>
    <span class="sp-item-name">${coin.name}</span>
    <span class="sp-item-ticker">${(coin.symbol||'').toUpperCase()}</span>
  `;
  item.addEventListener('click', () => {
    closeSpotlight();
    loadCryptoGadget(coin.id, coin.name, coin.symbol, coin.thumb);
  });
  return item;
}

function searchCrypto(query) {
  if (!query || query.length < 1) {
    if (spResults) spResults.innerHTML = '';
    return;
  }
  showCryptoSpinner();
  fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`)
    .then(r => r.json())
    .then(data => {
      if (!spResults) return;
      spResults.innerHTML = '';
      const coins = (data.coins || []).slice(0, 10);
      if (!coins.length) {
        spResults.innerHTML = `<div class="sp-loading">No results for "${query}"</div>`;
        return;
      }
      coins.forEach(coin => spResults.appendChild(buildCryptoResultItem(coin)));
    })
    .catch(() => {
      if (spResults) spResults.innerHTML = `<div class="sp-loading">Search unavailable</div>`;
    });
}

if (spInput) {
  spInput.addEventListener('input', () => {
    clearTimeout(cryptoSearchTimeout);
    const q = spInput.value.trim();
    if (!q) { if (spResults) spResults.innerHTML = ''; return; }
    cryptoSearchTimeout = setTimeout(() => searchCrypto(q), 350);
  });
}

/* ── Load token data into gadget ── */
function loadCryptoGadget(coinId, name, symbol, thumb) {
  currentCryptoId = coinId;
  const gadget = el('gadgetCryptoResult');
  if (!gadget) return;

  // Show immediately with loading state
  gadget.style.display = 'block';
  if (el('crName'))   el('crName').textContent   = name;
  if (el('crLabel'))  el('crLabel').textContent  = (symbol || '').toUpperCase();
  if (el('crIcon'))   el('crIcon').textContent   = (symbol || '?').toUpperCase().slice(0, 4);
  if (el('crPrice'))  el('crPrice').textContent  = '$...';
  if (el('crChange')) el('crChange').textContent = '...';

  fetchCryptoGadgetData(coinId);

  // Auto-refresh every 30s
  clearInterval(cryptoRefreshTimer);
  cryptoRefreshTimer = setInterval(() => {
    if (currentCryptoId === coinId) fetchCryptoGadgetData(coinId);
  }, 30000);
}

function fetchCryptoGadgetData(coinId) {
  fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinId}&sparkline=true`)
    .then(r => r.json())
    .then(data => {
      if (!data || !data[0]) return;
      const c = data[0];

      const price  = c.current_price;
      const change = c.price_change_percentage_24h;
      const mcap   = c.market_cap;
      const vol    = c.total_volume;
      const high   = c.high_24h;
      const low    = c.low_24h;
      const spark  = c.sparkline_in_7d && c.sparkline_in_7d.price;

      if (el('crPrice'))  el('crPrice').textContent  = `$${price >= 1 ? price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : price.toPrecision(4)}`;
      if (el('crChange')) {
        el('crChange').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
        el('crChange').className   = 'sol-change' + (change < 0 ? ' neg' : '');
      }
      if (el('crMcap'))  el('crMcap').textContent  = fmtLargeNum(mcap);
      if (el('crVol'))   el('crVol').textContent   = fmtLargeNum(vol);
      if (el('crHigh'))  el('crHigh').textContent  = high ? `$${high >= 1 ? high.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : high.toPrecision(4)}` : '—';
      if (el('crLow'))   el('crLow').textContent   = low  ? `$${low >= 1 ? low.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : low.toPrecision(4)}` : '—';

      if (spark && spark.length) {
        // Sample last 14 points
        const step = Math.floor(spark.length / 14);
        const pts  = [];
        for (let i = 0; i < 14; i++) pts.push(spark[Math.min(i * step, spark.length - 1)]);
        buildSolSparkline(pts, 'crSparkline');
      }
    })
    .catch(() => {
      if (el('crPrice')) el('crPrice').textContent = 'Unavail.';
    });
}

// Close crypto gadget
el('crCloseBtn')?.addEventListener('click', () => {
  const gadget = el('gadgetCryptoResult');
  if (gadget) gadget.style.display = 'none';
  currentCryptoId = null;
  clearInterval(cryptoRefreshTimer);
});

/* ────────────────────────────────────────────
   START MENU POPULATION
──────────────────────────────────────────── */
function buildStartMenu() {
  populateSmGrid('smPinnedGrid', PINNED_APPS);
  populateSmGrid('smRecentGrid', RECENT_APPS);
}

function populateSmGrid(containerId, appIds) {
  const container = el(containerId);
  if (!container) return;
  container.innerHTML = '';

  appIds.forEach(id => {
    const app  = appByID(id);
    const cell = document.createElement('div');
    cell.className = 'sm-app';

    // Use image if available, else icon emoji
    const iconHTML = app.img
      ? `<img src="${app.img}" width="26" height="26" style="border-radius:7px;object-fit:cover" onerror="this.outerHTML='<span style=\\'font-size:22px\\'>${app.icon}</span>'">`
      : `<span style="font-size:22px">${app.icon}</span>`;

    cell.innerHTML = `
      ${iconHTML}
      <div class="sm-app-name">${id.replace('QhuboX ','').replace('Qhubox ','')}</div>
    `;
    cell.addEventListener('click', () => {
      closeStartMenu();
      openAppWindow(id);
    });
    container.appendChild(cell);
  });
}

buildStartMenu();

// Start menu search filter
el('smSearchInput')?.addEventListener('input', function() {
  const q = this.value.toLowerCase().trim();
  if (!q) {
    populateSmGrid('smPinnedGrid', PINNED_APPS);
    populateSmGrid('smRecentGrid', RECENT_APPS);
    const labels = el('startMenu').querySelectorAll('.sm-section-title');
    labels.forEach(l => l.style.display = '');
    if (el('smRecentGrid')) el('smRecentGrid').style.display = '';
    return;
  }
  const matches = APPS.filter(a => a.id.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)).map(a => a.id);
  populateSmGrid('smPinnedGrid', matches.slice(0, 8));
  const recentLabel = el('startMenu').querySelectorAll('.sm-section-title')[1];
  if (recentLabel) recentLabel.style.display = 'none';
  if (el('smRecentGrid')) el('smRecentGrid').style.display = 'none';
});

// Terms modal via start menu
el('smTermsBtn')?.addEventListener('click', (e) => {
  e.preventDefault();
  closeStartMenu();
  openInfoModal('Terms & Conditions',
    `<p style="color:var(--text-2);font-size:12px;line-height:1.7">
      By using QhuboX Ecosystem OS you agree to our terms of service. All applications are provided as-is.
      QhuboX is a decentralized ecosystem built on the Solana Network. Use responsibly.
      For full terms visit <a href="https://qhubox.io/terms" target="_blank" style="color:var(--accent-cyan)">qhubox.io/terms</a>.
    </p>`
  );
});

/* ────────────────────────────────────────────
   CRYPTO SPOTLIGHT
──────────────────────────────────────────── */
function toggleSpotlight() {
  const sp = el('spotlight');
  const isOpen = sp.classList.contains('open');
  closeStartMenu();
  if (isOpen) {
    closeSpotlight();
  } else {
    sp.classList.add('open');
    sp.setAttribute('aria-hidden', 'false');
    if (spInput) { spInput.value = ''; spInput.focus(); }
    if (spResults) spResults.innerHTML = '';
  }
}

function closeSpotlight() {
  const sp = el('spotlight');
  sp.classList.remove('open');
  sp.setAttribute('aria-hidden', 'true');
}

el('searchBarBtn')?.addEventListener('click', toggleSpotlight);
el('searchBarBtn')?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggleSpotlight(); });

/* ────────────────────────────────────────────
   APP WINDOW — open, close, minimize, expand
──────────────────────────────────────────── */
/* ════════════════════════════════════════════════
   MULTI-WINDOW MANAGER
   — Multiple independent floating windows
   — Draggable by titlebar
   — ▢ toggles fullscreen ↔ windowed (draggable)
   — _ minimizes (hides), click dock/icon restores
   — ✕ closes & removes from DOM
════════════════════════════════════════════════ */

const WM = {
  layer:    null,   // #windowsLayer element
  windows:  {},     // { appId: osWindow element }
  zCounter: 610,    // z-index counter

  init() {
    this.layer = el('windowsLayer');
  },

  /* Bring window to front */
  focus(win) {
    this.zCounter++;
    win.style.zIndex = this.zCounter;
    document.querySelectorAll('.os-window').forEach(w => w.classList.remove('os-focused'));
    win.classList.add('os-focused');
  },

  /* Center a windowed (non-fullscreen) window, offset per instance */
  centerWindow(win, index = 0) {
    const layer  = this.layer;
    const lw     = layer.clientWidth;
    const lh     = layer.clientHeight;
    const ww     = win.offsetWidth;
    const wh     = win.offsetHeight;
    const offset = (index % 6) * 28;
    const left   = Math.max(0, Math.floor((lw - ww) / 2) + offset);
    const top    = Math.max(0, Math.floor((lh - wh) / 2) + offset - 20);
    win.style.left = left + 'px';
    win.style.top  = top  + 'px';
  },

  /* Make a window draggable by its titlebar */
  makeDraggable(win, titlebar) {
    let ox = 0, oy = 0, startX = 0, startY = 0;
    let dragging = false;

    const onMove = (e) => {
      if (!dragging) return;
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = cx - startX;
      const dy = cy - startY;

      const layer = WM.layer;
      const lw = layer.clientWidth;
      const lh = layer.clientHeight;
      const ww = win.offsetWidth;
      const wh = win.offsetHeight;

      let newLeft = ox + dx;
      let newTop  = oy + dy;

      // Clamp inside layer bounds
      newLeft = Math.max(0, Math.min(lw - ww, newLeft));
      newTop  = Math.max(0, Math.min(lh - 38, newTop));

      win.style.left = newLeft + 'px';
      win.style.top  = newTop  + 'px';
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend',  onUp);
      titlebar.style.cursor = 'grab';
    };

    const onDown = (e) => {
      // Don't drag when clicking buttons or links inside titlebar
      if (e.target.closest('button, a')) return;
      // Don't drag when fullscreen
      if (win.classList.contains('os-fullscreen')) return;

      dragging = true;
      startX = e.touches ? e.touches[0].clientX : e.clientX;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      ox = win.offsetLeft;
      oy = win.offsetTop;
      titlebar.style.cursor = 'grabbing';
      WM.focus(win);

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
      document.addEventListener('touchmove', onMove, { passive: true });
      document.addEventListener('touchend',  onUp);
    };

    titlebar.addEventListener('mousedown',  onDown);
    titlebar.addEventListener('touchstart', onDown, { passive: true });
  },

  /* Build an os-window element */
  buildWindow(appId, titlebarHTML, bodyHTML, isPadded, url) {
    const win = document.createElement('div');
    win.className   = 'os-window';
    win.dataset.app = appId;

    win.innerHTML = `
      <div class="os-titlebar">
        ${titlebarHTML}
        <button class="win-action-btn wab-min"   title="Minimizar (_)">_</button>
        <button class="win-action-btn wab-max"   title="Contraer / Expandir (▢)">▢</button>
        <button class="win-action-btn wab-close" title="Cerrar (✕)">✕</button>
      </div>
      <div class="os-win-body${isPadded ? ' padded' : ''}">
        ${bodyHTML}
      </div>
      <div class="os-resize-handle"></div>
    `;

    /* Button wiring */
    const titlebar  = win.querySelector('.os-titlebar');
    const body      = win.querySelector('.os-win-body');
    const btnMin    = win.querySelector('.wab-min');
    const btnMax    = win.querySelector('.wab-max');
    const btnClose  = win.querySelector('.wab-close');

    // ✕ — remove window entirely
    btnClose.addEventListener('click', () => {
      win.style.animation = 'osWinClose 0.15s ease forwards';
      setTimeout(() => {
        win.remove();
        delete WM.windows[appId];
      }, 140);
    });

    // _ — toggle minimize (hide/show)
    btnMin.addEventListener('click', () => {
      win.classList.toggle('os-minimized');
    });

    // ▢ — toggle fullscreen ↔ windowed
    let savedPos = null;
    btnMax.addEventListener('click', () => {
      if (win.classList.contains('os-fullscreen')) {
        // Restore windowed
        win.classList.remove('os-fullscreen');
        if (savedPos) {
          win.style.left   = savedPos.left;
          win.style.top    = savedPos.top;
          win.style.width  = savedPos.width;
          win.style.height = savedPos.height;
        }
      } else {
        // Save current position/size then go fullscreen
        savedPos = {
          left:   win.style.left,
          top:    win.style.top,
          width:  win.style.width,
          height: win.style.height,
        };
        win.classList.add('os-fullscreen');
      }
      WM.focus(win);
    });

    // Focus on click anywhere in window
    win.addEventListener('mousedown', () => WM.focus(win));

    // Draggable
    this.makeDraggable(win, titlebar);

    // Resize handle (bottom-right)
    this.makeResizable(win, win.querySelector('.os-resize-handle'));

    return win;
  },

  /* Simple corner resize */
  makeResizable(win, handle) {
    if (!handle) return;
    let startX, startY, startW, startH;

    handle.addEventListener('mousedown', (e) => {
      if (win.classList.contains('os-fullscreen')) return;
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startY = e.clientY;
      startW = win.offsetWidth;
      startH = win.offsetHeight;
      WM.focus(win);

      const onMove = (ev) => {
        const nw = Math.max(320, startW + (ev.clientX - startX));
        const nh = Math.max(200, startH + (ev.clientY - startY));
        win.style.width  = nw + 'px';
        win.style.height = nh + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  },

  /* Open or restore a window */
  open(appId, titlebarHTML, bodyHTML, isPadded, url) {
    // If already open, just focus/restore it
    if (this.windows[appId]) {
      const existing = this.windows[appId];
      existing.classList.remove('os-minimized');
      this.focus(existing);
      return;
    }

    const win = this.buildWindow(appId, titlebarHTML, bodyHTML, isPadded, url);
    this.layer.appendChild(win);
    this.windows[appId] = win;

    // Position: windowed by default, centered with slight offset
    const idx = Object.keys(this.windows).length - 1;
    requestAnimationFrame(() => {
      this.centerWindow(win, idx);
      this.focus(win);
    });
  },
};

/* Close-animation keyframe injected once */
const _closeKF = document.createElement('style');
_closeKF.textContent = `@keyframes osWinClose { to { opacity:0; transform:scale(0.93) translateY(6px); } }`;
document.head.appendChild(_closeKF);

/* ── openAppWindow — main entry point ──────── */
function openAppWindow(appId) {
  if (appId === 'AI Assistant')    { toggleAIWindow(true); return; }
  if (appId === 'Qhubox Wallet' || appId === 'QhuboX Chat') { openWalletChatModal(appId); return; }

  const app = appByID(appId);

  if (app.url) {
    // URL app — iframe window
    const tbHTML   = `<a class="win-open-tab" href="${app.url}" target="_blank" rel="noopener">Open in Tab ↗</a>`;
    const bodyHTML = `<iframe class="win-iframe" src="${app.url}" title="${appId}" allow="clipboard-write; microphone; camera"></iframe>`;
    WM.open(appId, tbHTML, bodyHTML, false, app.url);
  } else {
    // Info window
    openInfoWindow(appId, app);
  }
}

/* Info window content builder */
function buildInfoContent(appId, app) {
  const iconHTML = app.img
    ? `<img src="${app.img}" style="width:100%;height:100%;object-fit:cover;border-radius:14px" onerror="this.outerHTML='${app.icon}'">`
    : app.icon;

  const otherApps = APPS.filter(a => a.id !== appId && a.url !== null).slice(0, 8);
  const isProject = appId === 'QhuboX Project';

  const extraContent = isProject ? `
    <div style="margin-bottom:20px">
      <div class="win-section-title">🚀 Core Applications</div>
      ${[
        { name:'QhuboX Terminal', sub:'Advanced Trading', desc:'SPL token trading with a focus on Responsible Trading. Built-in tracking and developer verification systems to trade based on data, not luck.' },
        { name:'QhronoX Protocol', sub:'Staking & Governance', desc:'The financial engine of $QHUBX. Asset management and real governance, allowing the community to validate and steer the protocol\'s direction.' },
        { name:'Royal Titanium', sub:'Gaming & Entertainment', desc:'Integrated fun. Betting systems and games backed by the internal economy, transforming leisure into real value.' },
      ].map(a=>`<div class="win-info-card"><div class="win-info-card-title">${a.name} — ${a.sub}</div><div class="win-info-card-body">${a.desc}</div></div>`).join('')}
    </div>
    <div style="margin-bottom:20px">
      <div class="win-section-title">🧠 Intelligence & Social FI</div>
      ${[
        { name:'sAIgnalX', desc:'Real-time AI-generated trading signals. Precise information exactly when the market moves.' },
        { name:'Sollower', desc:'Interact, promote, and monetize. A system where earning rewards for attention and crowdfunding are part of the same network.' },
        { name:'Kiaraap', desc:'The Crypto Investment Notebook. Strategic portfolio organization for investors who demand order.' },
        { name:'DEV Turing', desc:'Instant Creation. Generate games, apps, and websites on the fly with automated development tools.' },
        { name:'NeuroQhuboX', desc:'Technology with a human purpose. Cognitive development support for individuals with ADHD through adaptive interfaces.' },
        { name:'Pebbles', desc:'24/7 Market Monitor. Total surveillance over liquidity and network movements.' },
        { name:'AI Assistant (Augusta)', desc:'The Resident Expert. An AI assistant trained in the entire QhuboX environment and the global crypto landscape.' },
      ].map(a=>`<div class="win-info-card"><div class="win-info-card-title">${a.name}</div><div class="win-info-card-body">${a.desc}</div></div>`).join('')}
    </div>
    <div style="margin-bottom:20px">
      <div class="win-section-title">🔐 Security & Sustainable Value</div>
      ${[
        { name:'Burnow', desc:'Tokenomic incineration system designed to increase the intrinsic value of $QHUBX through strategic supply reduction.' },
        { name:'QhuboX Wallet', desc:'Extreme security. Advanced authentication and personal PIN systems for total asset protection on the Solana Network.' },
        { name:'QhuboX Chat', desc:'P2P Wallet-to-Wallet communication. Encrypted text, voice, and video calls. No SIM cards, no external agents, no trace.' },
      ].map(a=>`<div class="win-info-card"><div class="win-info-card-title">${a.name}</div><div class="win-info-card-body">${a.desc}</div></div>`).join('')}
    </div>
    <div style="margin-bottom:20px">
      <div class="win-section-title">🛠 Total Integration</div>
      <div class="win-info-card"><div class="win-info-card-body">QhuboX is not a collection of parts; it is a complete organism. We have taken the complexity of blockchain, AI, and social finance and packaged them into a single, seamless solution. Everything you need. One single ecosystem. QhuboX.</div></div>
    </div>` : `
    <div style="margin-bottom:20px">
      <div class="win-section-title">About</div>
      <div class="win-info-card">
        <div class="win-info-card-title">QhuboX Ecosystem · ${app.category}</div>
        <div class="win-info-card-body">${app.desc} This app is part of the QhuboX decentralized ecosystem, built on the Solana network.</div>
      </div>
    </div>`;

  const bodyHTML = `
    <div class="win-app-header">
      <div class="win-app-icon" style="background:linear-gradient(135deg,${app.color}33,${app.color}11);border-color:${app.color}30">${iconHTML}</div>
      <div><div class="win-app-name">${appId}</div><div class="win-app-desc">${app.desc}</div></div>
    </div>
    ${extraContent}
    <div>
      <div class="win-section-title">All Apps</div>
      <div class="win-apps-grid">
        ${otherApps.map(a=>`
          <div class="win-app-cell" onclick="openAppWindow('${a.id}')">
            <div class="win-app-cell-icon" style="background:linear-gradient(135deg,${a.color}33,${a.color}11);border-color:${a.color}22">
              ${a.img?`<img src="${a.img}" style="width:100%;height:100%;object-fit:cover" onerror="this.outerHTML='${a.icon}'">`:a.icon}
            </div>
            <div class="win-app-cell-name">${a.id}</div>
          </div>`).join('')}
      </div>
    </div>`;

  return bodyHTML;
}

function openInfoWindow(appId, app) {
  const bodyHTML = buildInfoContent(appId, app);
  WM.open(appId, '', bodyHTML, true, null);
}

/* Terms modal */
function openInfoModal(title, bodyHTML) {
  WM.open('__terms__', '', `<div style="padding:4px 0">${bodyHTML}</div>`, true, null);
}

/* Legacy stubs — keep references working */
function closeWindow() {
  // Close the topmost focused window
  const focused = document.querySelector('.os-window.os-focused');
  if (focused) focused.querySelector('.wab-close')?.click();
}
function showWindow() { /* no-op — replaced by WM.open */ }

/* ────────────────────────────────────────────
   AI WINDOW
──────────────────────────────────────────── */
function toggleAIWindow(forceOpen) {
  const win = el('aiWindow');
  if (!win) return;
  if (forceOpen !== undefined) {
    if (forceOpen) win.classList.remove('hidden');
    else           win.classList.add('hidden');
  } else {
    win.classList.toggle('hidden');
  }
}

el('aiCloseBtn')?.addEventListener('click', () => toggleAIWindow(false));
el('aiDockBtn')?.addEventListener('click',  () => toggleAIWindow());

/* ────────────────────────────────────────────
   WALLET / CHAT MODAL (identical to AI window)
──────────────────────────────────────────── */
function openWalletChatModal(appId) {
  const win   = el('walletChatWindow');
  const iframe = el('walletChatIframe');
  const title  = el('walletChatTitle');
  if (!win) return;

  if (appId === 'QhuboX Chat') {
    if (title)  title.textContent = '💬 QhuboX Chat';
    if (iframe) iframe.src = 'http://localhost:5173/';
  } else {
    if (title)  title.textContent = '💳 QhuboX Wallet';
    if (iframe) iframe.src = 'http://localhost:5173/';
  }
  win.classList.remove('hidden');
}

el('walletChatCloseBtn')?.addEventListener('click', () => {
  el('walletChatWindow')?.classList.add('hidden');
});

// Wallet & Chat dock buttons
el('walletDockBtn')?.addEventListener('click', () => {
  closeStartMenu(); closeSpotlight();
  openWalletChatModal('Qhubox Wallet');
});
el('chatDockBtn')?.addEventListener('click', () => {
  closeStartMenu(); closeSpotlight();
  openWalletChatModal('QhuboX Chat');
});

/* ────────────────────────────────────────────
   START MENU
──────────────────────────────────────────── */
function toggleStartMenu() {
  const menu = el('startMenu');
  const isOpen = menu.classList.contains('open');
  closeSpotlight();
  if (isOpen) {
    closeStartMenu();
  } else {
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    el('smSearchInput')?.focus();
  }
}

function closeStartMenu() {
  const menu = el('startMenu');
  menu.classList.remove('open');
  menu.setAttribute('aria-hidden', 'true');
}

el('startBtn')?.addEventListener('click', toggleStartMenu);

/* ────────────────────────────────────────────
   DOCK ITEMS — URL routing
──────────────────────────────────────────── */
document.querySelectorAll('.dock-item').forEach(item => {
  // AI, Wallet, Chat handled separately above
  if (item.id === 'aiDockBtn' || item.id === 'walletDockBtn' || item.id === 'chatDockBtn') return;

  const appId  = item.dataset.app;
  const url    = item.dataset.url;
  if (!appId) return;

  // Badge injection
  const badge = item.dataset.badge;
  if (badge) {
    const b = document.createElement('div');
    b.className = 'dock-badge';
    b.textContent = badge;
    item.appendChild(b);
  }

  item.addEventListener('click', () => {
    closeStartMenu();
    closeSpotlight();
    item.classList.add('launching');
    setTimeout(() => item.classList.remove('launching'), 900);
    // openAppWindow handles URL routing through WM
    openAppWindow(appId);
  });
});

/* ────────────────────────────────────────────
   DESKTOP ICONS
──────────────────────────────────────────── */
document.querySelectorAll('.desktop-icon').forEach(icon => {
  const appId = icon.dataset.app;
  if (!appId) return;

  icon.addEventListener('click', () => {
    document.querySelectorAll('.desktop-icon.selected').forEach(i => i.classList.remove('selected'));
    icon.classList.add('selected');
    openAppWindow(appId);
  });
});

// Deselect on desktop click
el('desktop')?.addEventListener('click', function(e) {
  if (!e.target.closest('.desktop-icon') && !e.target.closest('.os-window') &&
      !e.target.closest('#taskbar') && !e.target.closest('.gadget') &&
      !e.target.closest('#windowsLayer')) {
    document.querySelectorAll('.desktop-icon.selected').forEach(i => i.classList.remove('selected'));
  }
});

/* ────────────────────────────────────────────
   GLOBAL OUTSIDE CLICK
──────────────────────────────────────────── */
document.addEventListener('click', function(e) {
  if (!e.target.closest('#startMenu') && !e.target.closest('#startBtn')) closeStartMenu();
  if (!e.target.closest('#spotlight') && !e.target.closest('#searchBarBtn')) closeSpotlight();
  if (!e.target.closest('#wallpaperPanel') && !e.target.closest('#wallpaperBtn')) {
    const wp = el('wallpaperPanel');
    if (wp) wp.style.display = 'none';
  }
});

/* ────────────────────────────────────────────
   KEYBOARD SHORTCUTS
──────────────────────────────────────────── */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeWindow();
    closeStartMenu();
    closeSpotlight();
    toggleAIWindow(false);
    el('walletChatWindow')?.classList.add('hidden');
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === ' ' || e.key === 'k')) {
    e.preventDefault();
    toggleSpotlight();
  }
});

/* ────────────────────────────────────────────
   WALLPAPER SWITCHER
──────────────────────────────────────────── */
el('wallpaperBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const wp = el('wallpaperPanel');
  if (!wp) return;
  wp.style.display = wp.style.display === 'none' || !wp.style.display ? 'block' : 'none';
});

document.querySelectorAll('.wp-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const n = opt.dataset.wp;
    const desktop = el('desktop');
    if (!desktop) return;
    desktop.classList.remove('wp-2','wp-3','wp-img-1','wp-img-2','wp-img-3');
    if (n === '2') desktop.classList.add('wp-2');
    if (n === '3') desktop.classList.add('wp-3');
    // wp-1 is default (no class)

    document.querySelectorAll('.wp-opt').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');

    // Close panel
    el('wallpaperPanel').style.display = 'none';
  });
});

/* ════════════════════════════════════════════════
   SOCIAL FEED — X (@QhuboX) + Discord (QhuboX)
   Source: RSSHub public instance (free, no key)
   CORS proxy: allorigins.win (free)
   Auto-refresh every 5 min, badge on new posts
════════════════════════════════════════════════ */

const FEED = {
  /* ─── Config ─── */
  RSSHUB:    'https://rsshub.app',
  PROXY:     'https://api.allorigins.win/get?url=',
  REFRESH_MS: 5 * 60 * 1000,   // 5 minutes
  MAX_ITEMS:  30,
  LS_KEY:    'qhubox_feed_seen', // localStorage key for read tracking

  sources: [
    {
      id:    'x',
      name:  '𝕏 Twitter',
      /* RSSHub Twitter user timeline */
      rss:   'https://rsshub.app/twitter/user/QhuboX',
      /* fallback: nitter public instance */
      rssAlt:'https://nitter.net/QhuboX/rss',
      icon:  '𝕏',
      color: '#e7e9ea',
      link:  'https://x.com/QhuboX',
    },
    {
      id:    'discord',
      name:  'Discord',
      /* RSSHub Discord channel — replace CHANNEL_ID with your public announcement channel ID */
      rss:   'https://rsshub.app/discord/channel/CHANNEL_ID',
      icon:  '💬',
      color: '#7b8ef7',
      link:  'https://discord.gg/qhubox',
    },
  ],

  /* ─── System messages ─── */
  systemMessages: [
    {
      id:   'sys-001',
      icon: '✦',
      src:  'system',
      srcName: 'System',
      text: 'Hello, welcome to the QhuboX Ecosystem.',
      link: '#',
      date: new Date('2026-01-01'),
      ts:   'Pinned',
      pinned: true,
    },
    {
      id:   'sys-002',
      icon: '✦',
      src:  'system',
      srcName: 'System',
      text: 'An innovative ecosystem created to support users\' daily actions — intuitive, accessible, and essential decentralized applications driving real mass adoption on-chain.',
      link: '#',
      date: new Date('2026-01-01'),
      ts:   'Pinned',
      pinned: true,
    },
    {
      id:   'sys-003',
      icon: '✦',
      src:  'system',
      srcName: 'System',
      text: 'Discover the ecosystem that redefines how decentralized applications reach everyone, everywhere.',
      link: '#',
      date: new Date('2026-01-01'),
      ts:   'Pinned',
      pinned: true,
    },
    {
      id:   'sys-004',
      icon: '✦',
      src:  'system',
      srcName: 'System',
      text: 'Join us and the Solana Network to drive the global growth of the ecosystem.',
      link: 'https://qhubox.io',
      date: new Date('2026-01-01'),
      ts:   'Pinned',
      pinned: true,
    },
  ],
  items:      [],   // all fetched items merged & sorted
  activeTab:  'all',
  seenIds:    new Set(),
  timer:      null,

  /* ─── Init ─── */
  init() {
    // Load already-seen IDs from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem(this.LS_KEY) || '[]');
      this.seenIds = new Set(saved);
    } catch { this.seenIds = new Set(); }

    this.bindUI();
    this.fetchAll();
    this.timer = setInterval(() => this.fetchAll(), this.REFRESH_MS);
  },

  /* ─── UI binding ─── */
  bindUI() {
    // Tabs
    document.querySelectorAll('.notif-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.notif-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.dataset.src;
        this.render();
      });
    });

    // Mark all read
    el('notifMarkAllRead')?.addEventListener('click', () => {
      this.items.forEach(i => this.seenIds.add(i.id));
      this.saveSeenIds();
      this.updateBadge();
      this.render();
    });

    // Refresh button
    el('notifRefreshBtn')?.addEventListener('click', () => {
      const btn = el('notifRefreshBtn');
      btn?.classList.add('spinning');
      this.fetchAll().then(() => btn?.classList.remove('spinning'));
    });
  },

  /* ─── Fetch all sources ─── */
  async fetchAll() {
    const results = await Promise.allSettled(
      this.sources.map(src => this.fetchSource(src))
    );

    let newItems = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value.length) {
        newItems = newItems.concat(r.value);
      }
    });

    if (newItems.length) {
      // Merge with existing, dedup by id, sort newest first
      const merged = [...newItems, ...this.items];
      const seen   = new Set();
      this.items   = merged
        .filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; })
        .sort((a, b) => b.date - a.date)
        .slice(0, this.MAX_ITEMS);

      this.updateBadge();
      this.render();
    }

    // Update timestamp
    const now = new Date();
    const ts  = `Updated ${now.getHours()}:${pad(now.getMinutes())}`;
    if (el('notifLastUpdate')) el('notifLastUpdate').textContent = ts;
  },

  /* ─── Fetch single source via RSS ─── */
  async fetchSource(src) {
    const items = [];

    // Try primary RSS URL, then alternate
    const urls = [src.rss, src.rssAlt].filter(Boolean);
    let xml = null;

    for (const rssUrl of urls) {
      try {
        const proxyUrl = `${this.PROXY}${encodeURIComponent(rssUrl)}`;
        const res  = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
        const json = await res.json();
        if (json.contents && json.contents.length > 50) {
          xml = json.contents;
          break;
        }
      } catch { /* try next */ }
    }

    if (!xml) return items;

    try {
      const parser = new DOMParser();
      const doc    = parser.parseFromString(xml, 'text/xml');
      const entries = [...doc.querySelectorAll('item, entry')].slice(0, 12);

      entries.forEach(entry => {
        const title   = entry.querySelector('title')?.textContent?.trim()      || '';
        const link    = entry.querySelector('link')?.textContent?.trim()
                     || entry.querySelector('link')?.getAttribute('href')       || src.link;
        const desc    = entry.querySelector('description, summary, content')?.textContent?.trim() || title;
        const pubDate = entry.querySelector('pubDate, published, updated')?.textContent?.trim() || '';
        const id      = entry.querySelector('guid, id')?.textContent?.trim()   || link || title;

        const dateObj = pubDate ? new Date(pubDate) : new Date();
        const text    = this.stripHTML(desc || title).slice(0, 220);

        items.push({
          id:     id,
          src:    src.id,
          srcName:src.name,
          icon:   src.icon,
          color:  src.color,
          text:   text || title,
          link:   link,
          date:   dateObj,
          ts:     this.relTime(dateObj),
        });
      });
    } catch (e) { console.warn('Feed parse error:', src.id, e); }

    return items;
  },

  /* ─── Render feed ─── */
  render() {
    const feed = el('notifFeed');
    if (!feed) return;

    /* System tab — always shows holo-messages */
    if (this.activeTab === 'system') {
      feed.innerHTML = `<div class="notif-system-body">` +
        this.systemMessages.map(m => `
          <div class="holo-message ${m.id === 'sys-001' ? 'holo-first' : ''}">
            ${this.escHTML(m.text)}
          </div>`).join('') +
        `</div>`;
      return;
    }

    /* All tab = social items + system messages mixed; others filter by src */
    let filtered;
    if (this.activeTab === 'all') {
      /* Show social items first, then system messages at bottom */
      filtered = [
        ...this.items,
        ...this.systemMessages,
      ];
    } else {
      filtered = this.items.filter(i => i.src === this.activeTab);
    }

    if (!filtered.length) {
      feed.innerHTML = `
        <div class="notif-error">
          No posts yet.<br>
          <a href="${this.sources.find(s=>s.id===this.activeTab)?.link || 'https://x.com/QhuboX'}" target="_blank" rel="noopener">
            Open ${this.activeTab === 'discord' ? 'Discord' : 'X'} directly ↗
          </a>
        </div>`;
      return;
    }

    feed.innerHTML = filtered.map(item => {
      /* System items rendered as holo-message style inside a link wrapper */
      if (item.src === 'system') {
        return `
          <a class="notif-item notif-item-system"
             href="${item.link}" target="_blank" rel="noopener">
            <div class="notif-item-avatar notif-avatar-system">✦</div>
            <div class="notif-item-body">
              <div class="notif-item-top">
                <span class="notif-item-source src-system">System</span>
                <span class="notif-item-time">${item.ts}</span>
              </div>
              <div class="notif-item-text notif-text-system">${this.escHTML(item.text)}</div>
            </div>
          </a>`;
      }
      /* Regular social item */
      return `
        <a class="notif-item ${this.seenIds.has(item.id) ? '' : 'unread'}"
           href="${item.link}" target="_blank" rel="noopener"
           data-id="${this.escAttr(item.id)}"
           onclick="FEED.markRead('${this.escAttr(item.id)}')">
          <div class="notif-item-avatar">${item.icon}</div>
          <div class="notif-item-body">
            <div class="notif-item-top">
              <span class="notif-item-source src-${item.src}">${item.srcName}</span>
              <span class="notif-item-time">${item.ts}</span>
            </div>
            <div class="notif-item-text">${this.escHTML(item.text)}</div>
          </div>
        </a>`;
    }).join('');
  },

  /* ─── Badge ─── */
  updateBadge() {
    const unread = this.items.filter(i => !this.seenIds.has(i.id)).length;
    const badge  = el('notifBadge');
    const tray   = el('notifTrayBtn');
    if (!badge) return;

    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.style.display = 'flex';
      if (tray) tray.style.color = '#22d3ee';
    } else {
      badge.style.display = 'none';
      if (tray) tray.style.color = '';
    }
  },

  markRead(id) {
    this.seenIds.add(id);
    this.saveSeenIds();
    this.updateBadge();
    // Remove unread dot from clicked item
    document.querySelectorAll(`.notif-item[data-id="${CSS.escape(id)}"]`)
      .forEach(n => n.classList.remove('unread'));
  },

  saveSeenIds() {
    try { localStorage.setItem(this.LS_KEY, JSON.stringify([...this.seenIds].slice(-200))); } catch {}
  },

  /* ─── Helpers ─── */
  stripHTML(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.textContent || d.innerText || '';
  },
  escHTML(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
  escAttr(str) {
    return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;').slice(0,120);
  },
  relTime(date) {
    const diff = Math.floor((Date.now() - date) / 1000);
    if (diff < 60)        return 'now';
    if (diff < 3600)      return `${Math.floor(diff/60)}m`;
    if (diff < 86400)     return `${Math.floor(diff/3600)}h`;
    if (diff < 604800)    return `${Math.floor(diff/86400)}d`;
    return date.toLocaleDateString(undefined, { month:'short', day:'numeric' });
  },
};

/* ── NOTIFICATION TOGGLE ────────────────────────────────── */
const notifTrigger = el('mobile-trigger');
const notifWindow  = el('mobile-window');
const notifTrayBtn = el('notifTrayBtn');

function toggleNotif() {
  if (!notifWindow) return;
  const isHidden = notifWindow.classList.contains('hidden');
  notifWindow.classList.toggle('hidden');

  if (isHidden) {
    // Show loading if no items yet
    if (!FEED.items.length) {
      const feed = el('notifFeed');
      if (feed) feed.innerHTML = `
        <div class="notif-loading">
          <span class="notif-spinner"></span>
          <span>Loading feed...</span>
        </div>`;
      FEED.fetchAll();
    } else {
      FEED.render();
    }
  }
}

notifTrigger?.addEventListener('click',   toggleNotif);
notifTrigger?.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') toggleNotif(); });
notifTrayBtn?.addEventListener('click',   toggleNotif);

document.addEventListener('click', function(e) {
  if (!e.target.closest('#mobile-trigger') &&
      !e.target.closest('#mobile-window') &&
      !e.target.closest('#notifTrayBtn')) {
    notifWindow?.classList.add('hidden');
  }
});

/* ────────────────────────────────────────────
   STARTUP ANIMATION
──────────────────────────────────────────── */
/* Init multi-window manager + social feed */
WM.init();
FEED.init();

(function startupAnimation() {
  const gadgets = document.querySelectorAll('.gadget');
  gadgets.forEach((g, i) => {
    g.style.opacity    = '0';
    g.style.transform  = 'translateY(12px)';
    g.style.transition = 'none';
    setTimeout(() => {
      g.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      g.style.opacity    = '1';
      g.style.transform  = 'translateY(0)';
    }, 200 + i * 120);
  });

  const desktopIcons = document.querySelectorAll('.desktop-icon');
  desktopIcons.forEach((icon, i) => {
    icon.style.opacity    = '0';
    icon.style.transform  = 'scale(0.85)';
    icon.style.transition = 'none';
    setTimeout(() => {
      icon.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      icon.style.opacity    = '1';
      icon.style.transform  = 'scale(1)';
    }, 600 + i * 60);
  });

  const dockItems = document.querySelectorAll('.dock-item');
  dockItems.forEach((item, i) => {
    item.style.opacity    = '0';
    item.style.transform  = 'translateY(20px)';
    item.style.transition = 'none';
    setTimeout(() => {
      item.style.transition = 'opacity 0.4s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
      item.style.opacity    = '1';
      item.style.transform  = 'translateY(0)';
    }, 400 + i * 50);
  });
})();

/* ────────────────────────────────────────────
   VISIBILITY CHANGE — refresh clock on tab focus
──────────────────────────────────────────── */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    tickClock();
    fetchSolanaPrice();
  }
});





