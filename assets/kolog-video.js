// Página de un kolog en vídeo (render de Blender con sonido).
// El vídeo empieza al tocar (los móviles no dejan sonar nada antes) y el bocadillo sigue a la voz:
// primero la frase común y después la pista propia de cada kolog. Los tiempos salen de
// kolog-videos.json (build_kolog_videos.py). En las páginas de fallo, al acabar suena game-over.mp3 si existe.
// document.currentScript solo existe mientras se carga este archivo: la carpeta se guarda ahora.
const KOLOG_ASSETS = new URL('.', document.currentScript.src);

// opts: {line1, line2, gameOver}; también admite solo el texto de line2 (como en a/ y b/).
function kologVideo(scene, opts) {
  const o = typeof opts === 'string' ? { line2: opts } : (opts || {});
  const line1 = o.line1 || '¡La sorpresa no está aquí!', pista = o.line2 || null, withGameOver = o.gameOver !== false;
  const $ = id => document.getElementById(id);
  const video = $('video'), hint = $('hint'), bubble = $('bubble'), again = $('again');
  const base = KOLOG_ASSETS;
  video.src = new URL(`kolog-${scene}.mp4`, base);
  video.poster = new URL(`kolog-${scene}.jpg`, base);
  let t = { frase_s: Infinity, pista_s: Infinity }, step = 0, started = false;
  fetch(new URL('kolog-videos.json', base)).then(r => r.json()).then(j => { t = j[scene]; }).catch(() => {});

  // Música de game over (archivo del usuario). Si no está, no suena nada.
  const gameOver = withGameOver ? new Audio(new URL('game-over.mp3', base)) : null;
  let gameOverOk = withGameOver;
  if (gameOver) {
    gameOver.preload = 'auto';
    gameOver.addEventListener('error', () => { gameOverOk = false; });
  }

  async function type(el, text) {
    for (const ch of text) { el.textContent += ch; await new Promise(r => setTimeout(r, ch === ' ' ? 28 : 42)); }
  }
  function say() {
    bubble.innerHTML = '';
    bubble.classList.add('show');
    const main = document.createElement('span');
    bubble.appendChild(main);
    type(main, line1);
  }
  function hint2() {
    if (!pista) return;
    const s = document.createElement('small');
    bubble.appendChild(s);
    type(s, pista);
  }
  function sync() {
    if (step === 0 && video.currentTime >= t.frase_s) { step = 1; say(); }
    if (step === 1 && t.pista_s != null && video.currentTime >= t.pista_s) { step = 2; hint2(); }
  }

  function start() {
    if (started) return;
    started = true;
    hint.classList.add('gone');
    video.muted = false;
    video.play().catch(() => { video.muted = true; video.play(); });   // sin sonido antes que nada
    // iOS: el audio que sonará al final se desbloquea ahora, dentro del toque, sin que se oiga.
    if (!withGameOver) return;
    gameOver.muted = true;
    gameOver.play().then(() => { gameOver.pause(); gameOver.currentTime = 0; gameOver.muted = false; }).catch(() => {});
  }

  video.addEventListener('timeupdate', sync);
  video.addEventListener('ended', () => {
    if (step < 1) { step = 1; say(); }
    if (step < 2) { step = 2; hint2(); }
    if (gameOverOk) { gameOver.muted = false; gameOver.currentTime = 0; gameOver.play().catch(() => {}); }
    again.classList.add('show');
  });
  again.addEventListener('click', e => {
    e.stopPropagation();
    if (gameOver) gameOver.pause();
    again.classList.remove('show');
    bubble.classList.remove('show');
    step = 0;
    video.currentTime = 0;
    video.play();
  });
  document.body.addEventListener('click', start);
}
