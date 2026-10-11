// Sivun oma QR-lukija (direct.html): koodi luetaan samassa välilehdessä, joten
// järjestelmäkameran avaamia uusia välilehtiä ei tarvita. Android-Chromessa
// BarcodeDetector, muualla (iPhone) vendor/jsQR.js, joka ladataan vasta tarvittaessa.
// Sivuvaikutus: kun kameran lupa on annettu, selain näyttää oikeat IPv6-osoitteet
// mDNS-nimien sijaan.

const INTERVAL_MS = 200;

let jsqr = null;
function loadJsQR() {
  jsqr ??= new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = new URL('./vendor/jsQR.js', import.meta.url).href;
    s.onload = () => ok(window.jsQR);
    s.onerror = () => bad(new Error('QR-lukijaa ei voitu ladata'));
    document.head.append(s);
  });
  return jsqr;
}

async function qrDetector() {
  if ('BarcodeDetector' in window) {
    try {
      if ((await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
        const d = new BarcodeDetector({ formats: ['qr_code'] });
        return async (video) => (await d.detect(video))[0]?.rawValue ?? null;
      }
    } catch { /* jsQR */ }
  }
  const decode = await loadJsQR();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return decode(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

/**
 * Lukee QR-koodeja `video`-elementin kuvasta ja kutsuu `onCode(teksti)` jokaisesta
 * uudesta koodista. Palauttaa { start(), stop() }; start heittää, jos kameraa ei saa.
 */
export function createScanner(video, onCode) {
  let stream = null;
  let timer = null;
  let last = '';

  async function start() {
    stop();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    await video.play().catch(() => {});
    const detect = await qrDetector();
    last = '';
    const tick = async () => {
      if (!stream) return;
      try {
        const text = video.readyState >= 2 ? await detect(video) : null;
        if (text && text !== last) { last = text; onCode(text); }
      } catch { /* seuraava kehys */ }
      if (stream) timer = setTimeout(tick, INTERVAL_MS);
    };
    tick();
  }

  function stop() {
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  }

  return { start, stop };
}
