// frontend/src/services/deviceUtils.js
// Multi-layer anti-abuse: canvas fingerprint + IP + VPN detection

const VIEWED_KEY = 'slw_adviews';

// ── Canvas + hardware fingerprint ─────────────────────────────
export function generateDeviceFingerprint() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillStyle = '#f0f';
  ctx.fillText('Sollower🔐', 2, 2);
  ctx.fillStyle = 'rgba(0,200,100,0.8)';
  ctx.fillRect(10, 5, 80, 20);

  const fp = {
    canvas: canvas.toDataURL(),
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    lang: navigator.language,
    ua: navigator.userAgent,
    cores: navigator.hardwareConcurrency || 0,
    mem: navigator.deviceMemory || 0,
    touch: navigator.maxTouchPoints,
    platform: navigator.platform,
    plugins: Array.from(navigator.plugins || []).map(p => p.name).join(','),
    vendor: navigator.vendor,
  };

  const str = JSON.stringify(fp);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return `fp_${Math.abs(h).toString(36)}_${str.length}`;
}

// ── Fetch public IP via multiple services ─────────────────────
let _cachedIP = null;
export async function getPublicIP() {
  if (_cachedIP) return _cachedIP;
  const services = [
    'https://api64.ipify.org?format=json',
    'https://api.my-ip.io/ip.json',
  ];
  for (const url of services) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      _cachedIP = d.ip || d.IP;
      if (_cachedIP) return _cachedIP;
    } catch { continue; }
  }
  return null;
}

// ── VPN / Proxy detection via ipapi ──────────────────────────
let _vpnCache = {};
export async function detectVPN(ip) {
  if (!ip) return false;
  if (_vpnCache[ip] !== undefined) return _vpnCache[ip];
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    // hosting/datacenter IPs are likely VPN/proxy
    const suspicious = !!(d.org && /hosting|vpn|proxy|tor|datacenter|cloud|server/i.test(d.org));
    _vpnCache[ip] = suspicious;
    return suspicious;
  } catch {
    return false; // if can't check, allow
  }
}

// ── Has this user already viewed this ad? ────────────────────
export function hasViewedAd(adId) {
  const fp = generateDeviceFingerprint();
  const store = JSON.parse(localStorage.getItem(VIEWED_KEY) || '{}');
  return !!(store[adId]?.fps?.includes(fp));
}

// ── Register ad view (called AFTER reward confirmed) ─────────
export async function registerAdView(adId) {
  const fp = generateDeviceFingerprint();
  const ip = await getPublicIP();
  const store = JSON.parse(localStorage.getItem(VIEWED_KEY) || '{}');
  if (!store[adId]) store[adId] = { fps: [], ips: [], ts: [] };
  if (!store[adId].fps.includes(fp)) store[adId].fps.push(fp);
  if (ip && !store[adId].ips.includes(ip)) store[adId].ips.push(ip);
  store[adId].ts.push(Date.now());
  localStorage.setItem(VIEWED_KEY, JSON.stringify(store));
}

// ── Full eligibility check (fingerprint + IP + VPN) ──────────
export async function checkAdEligibility(adId) {
  const fp = generateDeviceFingerprint();
  const store = JSON.parse(localStorage.getItem(VIEWED_KEY) || '{}');
  const record = store[adId];

  // Already viewed by this device
  if (record?.fps?.includes(fp)) {
    return { eligible: false, reason: 'already_viewed' };
  }

  // Check IP
  const ip = await getPublicIP();
  if (ip && record?.ips?.includes(ip)) {
    return { eligible: false, reason: 'ip_already_used' };
  }

  // VPN / proxy check
  if (ip) {
    const isVPN = await detectVPN(ip);
    if (isVPN) {
      return { eligible: false, reason: 'vpn_detected' };
    }
  }

  return { eligible: true, fp, ip };
}

export function getAdViewStats(adId) {
  const store = JSON.parse(localStorage.getItem(VIEWED_KEY) || '{}');
  return { totalViews: store[adId]?.fps?.length || 0 };
}