// Motor común de las escenas de kolog: sonido (Web Audio), dibujo del kolog y utilidades de animación.
// El audio solo puede arrancar tras un toque del usuario (regla de los navegadores móviles):
// por eso cada escena empieza con «toca el arbusto / la roca».

const Kolog = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  const buffers = {};
  const files = { yajaja: 'yajaja.mp3', frase: 'frase.mp3', tesoro: 'tesoro.mp3' };
  const base = new URL('.', document.currentScript.src);

  // Las voces se descargan nada más abrir la página; se decodifican cuando hay contexto de audio.
  const raw = Object.fromEntries(Object.entries(files).map(([k, f]) =>
    [k, fetch(new URL(f, base)).then(r => r.arrayBuffer()).catch(() => null)]));

  async function unlock() {
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') await ctx.resume();
    // iOS: un sonido vacío dentro del toque deja el audio desbloqueado para el resto de la escena.
    const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start();
    await Promise.all(Object.entries(raw).map(async ([k, p]) => {
      if (buffers[k]) return;
      const data = await p;
      if (data) buffers[k] = await new Promise((ok, ko) => ctx.decodeAudioData(data.slice(0), ok, ko)).catch(() => null);
    }));
  }

  function voice(name, gain = 1) {
    if (!ctx || !buffers[name]) return 0;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffers[name]; g.gain.value = gain;
    src.connect(g).connect(ctx.destination); src.start();
    return buffers[name].duration;
  }

  function noise(seconds) {
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b; return s;
  }

  function env(g, t, peak, attack, release) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  const sfx = {
    // Hojas agitándose: ruido filtrado con ráfagas irregulares.
    rustle(seconds = 0.9) {
      if (!ctx) return;
      const t = ctx.currentTime, n = noise(seconds), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.8;
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 9; i++) {
        const at = t + (i / 9) * seconds;
        g.gain.exponentialRampToValueAtTime(0.28 + Math.random() * 0.25, at + 0.03);
        g.gain.exponentialRampToValueAtTime(0.03, at + seconds / 9);
      }
      g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      n.connect(f).connect(g).connect(ctx.destination); n.start(t); n.stop(t + seconds);
    },
    // Golpe sordo de roca.
    thud() {
      if (!ctx) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
      env(g, t, 0.7, 0.005, 0.35); o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.4);
      const n = noise(0.3), f = ctx.createBiquadFilter(), gn = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 900; env(gn, t, 0.35, 0.005, 0.25);
      n.connect(f).connect(gn).connect(ctx.destination); n.start(t);
    },
    // «Pop» de salida.
    pop() {
      if (!ctx) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(1400, t + 0.12);
      env(g, t, 0.35, 0.01, 0.16); o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.2);
    },
    // Destellos: arpegio pentatónico propio, cada vez distinto.
    sparkle(count = 6) {
      if (!ctx) return;
      const scale = [1318.5, 1568, 1760, 2093, 2349, 2637, 3136];
      for (let i = 0; i < count; i++) {
        const t = ctx.currentTime + i * 0.07, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = scale[Math.floor(Math.random() * scale.length)];
        env(g, t, 0.12, 0.005, 0.5); o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.6);
      }
    },
    // Hoja-hélice girando.
    whirr(seconds = 1.6) {
      if (!ctx) return;
      const t = ctx.currentTime, n = noise(seconds), f = ctx.createBiquadFilter(), g = ctx.createGain();
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.2;
      g.gain.value = 0.12; lfo.frequency.value = 18; depth.gain.value = 0.1;
      lfo.connect(depth).connect(g.gain);
      g.gain.setTargetAtTime(0, t + seconds - 0.3, 0.12);
      n.connect(f).connect(g).connect(ctx.destination);
      n.start(t); lfo.start(t); n.stop(t + seconds); lfo.stop(t + seconds);
    },
  };

  // Kolog dibujado a mano (original): cuerpo de corteza, máscara de hoja con dos ojos y boca redonda.
  function korok({ mask = '#8cc04a', vein = '#5e8f2c', body = '#8a5a33', bark = '#6b4226', hat = 'sprout', id = 'k' } = {}) {
    const hatSvg = hat === 'propeller'
      ? `<g id="${id}-prop" class="leaf-bit" style="transform-origin:50% 50%">
           <line x1="0" y1="-60" x2="0" y2="-104" stroke="${bark}" stroke-width="4" stroke-linecap="round"/>
           <path d="M0 -104 C 18 -118 52 -114 66 -104 C 50 -96 18 -94 0 -104 Z" fill="${mask}" stroke="${vein}" stroke-width="2"/>
           <path d="M0 -104 C -18 -118 -52 -114 -66 -104 C -50 -96 -18 -94 0 -104 Z" fill="${mask}" stroke="${vein}" stroke-width="2"/>
           <circle cx="0" cy="-104" r="4" fill="${bark}"/>
         </g>`
      : `<path d="M2 -62 Q -6 -84 8 -98" fill="none" stroke="${vein}" stroke-width="4" stroke-linecap="round"/>
         <path d="M8 -98 C 22 -112 40 -104 38 -92 C 28 -88 14 -90 8 -98 Z" fill="${mask}" stroke="${vein}" stroke-width="2"/>
         <path d="M2 -78 C -12 -90 -28 -84 -26 -74 C -18 -70 -6 -72 2 -78 Z" fill="${mask}" stroke="${vein}" stroke-width="2"/>`;
    return `
    <g id="${id}" transform="scale(1.35)">
      <path d="M-10 42 L-13 72 M10 42 L13 72" stroke="${bark}" stroke-width="6" stroke-linecap="round"/>
      <path d="M-19 72 L-7 72 M7 72 L19 72" stroke="${bark}" stroke-width="5" stroke-linecap="round"/>
      <path d="M-22 18 Q -40 12 -50 -4" fill="none" stroke="${bark}" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="-52" cy="-8" rx="6" ry="9" transform="rotate(-30 -52 -8)" fill="${mask}"/>
      <g id="${id}-arm" class="leaf-bit" style="transform-origin:0% 100%">
        <path d="M22 18 Q 40 10 48 -8" fill="none" stroke="${bark}" stroke-width="5" stroke-linecap="round"/>
        <ellipse cx="50" cy="-12" rx="6" ry="9" transform="rotate(25 50 -12)" fill="${mask}"/>
      </g>
      <ellipse cx="0" cy="22" rx="27" ry="25" fill="${body}"/>
      <path d="M-12 8 q 3 14 -2 30 M2 4 q -3 16 1 34 M14 10 q 2 12 -2 26" fill="none" stroke="${bark}" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
      ${hatSvg}
      <path d="M0 -72 C 40 -64 48 -20 31 4 C 20 18 -20 18 -31 4 C -48 -20 -40 -64 0 -72 Z" fill="${mask}" stroke="${vein}" stroke-width="2.5"/>
      <path d="M0 -68 L0 12 M0 -40 L -22 -54 M0 -40 L 22 -54 M0 -18 L -26 -28 M0 -18 L 26 -28" stroke="${vein}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
      <g id="${id}-eyes">
        <circle cx="-13" cy="-30" r="7" fill="#1d1a12"/><circle cx="13" cy="-30" r="7" fill="#1d1a12"/>
        <circle cx="-11" cy="-32" r="2" fill="#fff"/><circle cx="15" cy="-32" r="2" fill="#fff"/>
      </g>
      <ellipse id="${id}-mouth" class="leaf-bit" cx="0" cy="-8" rx="4.5" ry="5.5" fill="#1d1a12"/>
    </g>`;
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const anim = (el, frames, opts) => el.animate(frames, { fill: 'forwards', easing: 'ease-out', ...opts }).finished;

  // Lluvia de hojitas o polvo desde un punto de la escena (coordenadas del viewBox).
  function burst(svg, x, y, { colors, count = 14, spread = 140, rise = 120, shape = 'leaf' }) {
    const ns = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < count; i++) {
      const el = document.createElementNS(ns, shape === 'leaf' ? 'ellipse' : 'circle');
      if (shape === 'leaf') { el.setAttribute('rx', 5); el.setAttribute('ry', 9); } else el.setAttribute('r', 4 + Math.random() * 7);
      el.setAttribute('cx', x); el.setAttribute('cy', y);
      el.setAttribute('fill', colors[i % colors.length]);
      el.classList.add('leaf-bit');
      svg.appendChild(el);
      const dx = (Math.random() - 0.5) * spread * 2, dy = -rise * (0.5 + Math.random());
      anim(el, [
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${dx * 0.6}px,${dy}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px,${dy + rise * 1.3}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ], { duration: 1300 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.4,1)' }).then(() => el.remove());
    }
  }

  // Bocadillo con efecto máquina de escribir.
  async function say(bubble, text, after = '') {
    bubble.innerHTML = '';
    bubble.classList.add('show');
    const span = document.createElement('span');
    bubble.appendChild(span);
    for (const ch of text) { span.textContent += ch; await wait(ch === ' ' ? 30 : 45); }
    if (after) { const s = document.createElement('small'); s.textContent = after; bubble.appendChild(s); }
  }

  // Boca que se abre y cierra mientras habla.
  function talk(mouth, seconds) {
    return anim(mouth, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.7)' }, { transform: 'scaleY(.8)' }, { transform: 'scaleY(1.5)' }, { transform: 'scaleY(1)' }],
      { duration: 360, iterations: Math.max(1, Math.round(seconds / 0.36)), easing: 'linear' });
  }

  return { unlock, voice, sfx, korok, wait, anim, burst, say, talk };
})();
