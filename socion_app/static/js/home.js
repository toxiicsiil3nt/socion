// home.js — the homepage as one continuous narrative over a single
// persistent structure. Each section sets the structure's state; the
// "hidden structure" section assembles it with scroll; the channel wheel
// and type constellation are explorable.

import { createStructure } from './structure.js';
import { ELEMENTS, WHEEL_ORDER, TYPES, DUALS, SLOT_MEANING, glyph, glyphSVG, escapeHTML as esc } from './theory.js';

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
// GSAP drives the scroll choreography, but the page must still work (static,
// explorable) if it fails to load.
const hasGsap = !!(gsap && ScrollTrigger);
if (hasGsap) {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
}
const $$ = sel => Array.from(document.querySelectorAll(sel));
function onView(el, cb, { once = true, margin = '0px 0px -25% 0px' } = {}) {
  const target = typeof el === 'string' ? document.querySelector(el) : el;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { cb(); if (once) io.disconnect(); } }), { rootMargin: margin });
  io.observe(target);
}

const $ = id => document.getElementById(id);
const isMobile = () => window.matchMedia('(max-width: 899px)').matches;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || !hasGsap;
const finePointer = window.matchMedia('(pointer: fine)').matches;

const stage = $('stage');
const structure = createStructure($('structure'), { seed: 3 });

// ---------------------------------------------------------------- scenes
const SCENES = {
  hero:      { opacity: 1,    d: { x: 0.4,  y: 0.1,  scale: 0.95 }, m: { x: 0, y: 0.48, scale: 0.7 }, state: 'incomplete', progress: 3 },
  pattern:   { opacity: 0.05, d: { x: 0.1,  y: 0,    scale: 1.35 }, m: { x: 0, y: 0.1,  scale: 1 } },
  structure: { opacity: 1,    d: { x: 0.38, y: 0,    scale: 0.9 },  m: { x: 0, y: 0.45, scale: 0.66 } },
  channels:  { opacity: 0,    d: { x: -0.2, y: 0,    scale: 1.5 },  m: { x: 0, y: 0,    scale: 1 } },
  types:     { opacity: 0,    d: { x: 0.2,  y: 0,    scale: 1.5 },  m: { x: 0, y: 0,    scale: 1 } },
  method:    { opacity: 0,    d: { x: 0,    y: 0,    scale: 1.5 },  m: { x: 0, y: 0,    scale: 1 } },
  cta:       { opacity: 1,    d: { x: 0.46, y: 0.22, scale: 0.78 }, m: { x: 0, y: 0.5,  scale: 0.62 }, state: 'complete' },
};
let currentScene = 'hero';
let pauseTimer = 0;
function setScene(name) {
  const s = SCENES[name];
  if (!s) return;
  currentScene = name;
  stage.style.opacity = s.opacity;
  clearTimeout(pauseTimer);
  // stop rendering entirely once the structure has faded out
  if (s.opacity === 0) pauseTimer = setTimeout(() => structure.setActive(false), 1000);
  else structure.setActive(true);
  structure.setFrame(isMobile() ? s.m : s.d);
  if (s.state) structure.setState(s.state);
  if (s.progress != null) structure.setProgress(s.progress);
}
setScene('hero');

if (finePointer) {
  window.addEventListener('pointermove', e => structure.setPointer(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1), { passive: true });
}

// ---------------------------------------------------------------- 01 the pattern
const frags = $$('#pgrid .frag span');
const late = $$('#pgrid [data-late]');
const spines = [$('spineA'), $('spineB')];
function placeSpines() {
  const grid = $('pgrid');
  const a = grid.querySelector('.pcol-head.a'), b = grid.querySelector('.pcol-head.b');
  spines[0].style.left = (a.offsetLeft - 16) + 'px';
  spines[1].style.left = (b.offsetLeft - 16) + 'px';
}
placeSpines();
function seededPair(i) { const s = Math.sin(i * 91.7 + 13.1) * 43758.5453; const t = Math.sin(i * 17.3 + 4.7) * 23421.631; return [s - Math.floor(s), t - Math.floor(t)]; }
const scatter = (i, axis) => {
  const [r1, r2] = seededPair(i);
  const w = innerWidth, h = innerHeight, m = isMobile();
  // scatter across and below the grid, never up into the caption
  if (axis === 'x') return (r1 - 0.5) * w * (m ? 0.36 : 0.62);
  if (axis === 'y') return (r2 - 0.3) * h * (m ? 0.32 : 0.42);
  return (r1 - r2) * 26;
};

if (!reduce) {
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '#pattern', start: 'top top', end: () => '+=' + Math.round(innerHeight * (isMobile() ? 1.4 : 1.9)),
      pin: true, scrub: 0.7, anticipatePin: 1, invalidateOnRefresh: true, onRefresh: placeSpines,
    },
  });
  tl.fromTo(frags,
      { x: i => scatter(i, 'x'), y: i => scatter(i, 'y'), rotation: i => scatter(i, 'r'), opacity: 0.45 },
      { x: 0, y: 0, rotation: 0, opacity: 1, ease: 'power2.inOut', duration: 1, stagger: { each: 0.025, from: 'random' } }, 0.18)
    .to('#cap1', { opacity: 0, duration: 0.08 }, 0.12)
    .fromTo('#cap2', { opacity: 0 }, { opacity: 1, duration: 0.08 }, 0.2)
    .to('#cap2', { opacity: 0, duration: 0.08 }, 1.1)
    .fromTo(late, { opacity: 0 }, { opacity: 1, duration: 0.25, stagger: 0.02 }, 1.05)
    .fromTo('#cap3', { opacity: 0 }, { opacity: 1, duration: 0.1 }, 1.18)
    .fromTo(spines, { scaleY: 0 }, { scaleY: 1, duration: 0.35, ease: 'power2.out' }, 1.25)
    .to({}, { duration: 0.35 });
} else {
  $('cap1').style.opacity = 0; $('cap2').style.opacity = 0; $('cap3').style.opacity = 1;
  spines.forEach(s => { s.style.transform = 'none'; });
}

// ---------------------------------------------------------------- 02 hidden structure
const beats = $$('.beat');
function paintStructure(p) {
  const n = Math.min(8, 3 + p * 5.6);
  structure.setProgress(n);
  beats.forEach((b, i) => b.classList.toggle('on', p > [0.02, 0.32, 0.62][i]));
  $('connected').innerHTML = `<b>${String(Math.floor(n)).padStart(2, '0')}</b> / 08 kinds of information connected`;
}
if (!reduce) {
  ScrollTrigger.create({
    trigger: '#hidden', start: 'top top', end: () => '+=' + Math.round(innerHeight * (isMobile() ? 1.5 : 2.1)),
    pin: true, scrub: true, anticipatePin: 1,
    onUpdate: self => { if (currentScene === 'structure') paintStructure(self.progress); },
    onEnter: () => setScene('structure'), onEnterBack: () => setScene('structure'),
    onLeave: () => paintStructure(1),
  });
} else {
  onView('#hidden', () => paintStructure(1));
}

// ---------------------------------------------------------------- scene switching
document.querySelectorAll('[data-scene]').forEach(sec => {
  if (hasGsap) {
    ScrollTrigger.create({
      trigger: sec, start: 'top 55%', end: 'bottom 45%',
      onToggle: self => { if (self.isActive) setScene(sec.dataset.scene); },
    });
  } else {
    onView(sec, () => setScene(sec.dataset.scene), { once: false, margin: '-45% 0px -45% 0px' });
  }
});

// ---------------------------------------------------------------- 03 eight channels
const PARTNER = { Ne: 'Ni', Ni: 'Ne', Te: 'Ti', Ti: 'Te', Se: 'Si', Si: 'Se', Fe: 'Fi', Fi: 'Fe' };
const SHAPE_KIND = { square: 'logic', circle: 'sensing', triangle: 'intuition', notch: 'ethics' };
const wheel = $('wheel');
const rays = $('wheel-rays');
const nodePos = {};
WHEEL_ORDER.forEach((code, i) => {
  const a = (-112.5 + i * 45) * Math.PI / 180;
  const x = 50 + 36 * Math.cos(a), y = 50 + 36 * Math.sin(a);
  nodePos[code] = { x, y };
  const btn = document.createElement('button');
  btn.className = 'wnode';
  btn.style.left = x + '%';
  btn.style.top = y + '%';
  btn.dataset.code = code;
  btn.setAttribute('aria-label', `${code}, ${ELEMENTS[code].name}`);
  btn.innerHTML = `${glyph(code)}<span class="c">${code}</span>`;
  wheel.appendChild(btn);
  rays.insertAdjacentHTML('beforeend', `<line class="ray" vector-effect="non-scaling-stroke" data-ray="${code}" x1="50" y1="50" x2="${x}" y2="${y}"/>`);
});
['Ne', 'Te', 'Si', 'Fi'].forEach(c => {
  const a = nodePos[c], b = nodePos[PARTNER[c]];
  rays.insertAdjacentHTML('beforeend', `<line class="pairline" vector-effect="non-scaling-stroke" data-pair="${c}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
});

function selectElement(code) {
  const E = ELEMENTS[code], P = ELEMENTS[PARTNER[code]];
  wheel.querySelectorAll('.wnode').forEach(n => {
    n.classList.toggle('sel', n.dataset.code === code);
    n.classList.toggle('partner', n.dataset.code === PARTNER[code]);
    n.setAttribute('aria-pressed', n.dataset.code === code ? 'true' : 'false');
  });
  rays.querySelectorAll('.ray').forEach(r => r.classList.toggle('on', r.dataset.ray === code));
  rays.querySelectorAll('.pairline').forEach(l => l.classList.toggle('on', l.dataset.pair === code || PARTNER[l.dataset.pair] === code));
  $('wcenter').textContent = E.plain;
  $('panel').innerHTML = `<div class="swap" style="display:grid;gap:22px">
    <div class="ph">${glyph(code)}<div><h3>${code}</h3><div class="nm">${esc(E.name)}</div><span class="plainchip">${esc(E.plain)}</span></div></div>
    <dl>
      <div><dt>What it represents</dt><dd>${esc(E.what)}</dd></div>
      <div><dt>In real life</dt><dd>${esc(E.human)}</dd></div>
      <div><dt>Technical</dt><dd class="dim">${esc(E.technical)}</dd></div>
      <div><dt>Its symbol</dt><dd class="dim">A ${E.filled ? 'filled' : 'outlined'} ${E.shape === 'notch' ? 'notched square' : E.shape}: ${SHAPE_KIND[E.shape]}, facing ${E.filled ? 'outward' : 'inward'}. Its partner ${P.code} is the same kind of information, facing ${P.filled ? 'outward' : 'inward'}.</dd></div>
    </dl></div>`;
}
wheel.addEventListener('click', e => { const n = e.target.closest('.wnode'); if (n) selectElement(n.dataset.code); });
if (finePointer) wheel.addEventListener('pointerover', e => { const n = e.target.closest('.wnode'); if (n) selectElement(n.dataset.code); });
wheel.addEventListener('keydown', e => {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
  const cur = wheel.querySelector('.wnode.sel')?.dataset.code || 'Ne';
  const i = WHEEL_ORDER.indexOf(cur);
  const next = WHEEL_ORDER[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 7)) % 8];
  selectElement(next);
  wheel.querySelector(`[data-code="${next}"]`).focus();
  e.preventDefault();
});
selectElement('Ne');

if (!reduce) {
  gsap.from('.wnode', {
    scrollTrigger: { trigger: '#wheel', start: 'top 75%', once: true },
    x: (i, el) => (0.5 - parseFloat(el.style.left) / 100) * wheel.clientWidth,
    y: (i, el) => (0.5 - parseFloat(el.style.top) / 100) * wheel.clientWidth,
    opacity: 0, scale: 0.4, duration: 1.1, ease: 'power3.out', stagger: 0.06,
    clearProps: 'x,y,scale,opacity',
  });
}

// ---------------------------------------------------------------- 04 sixteen types
const QUADRAS = [['Alpha', ['ILE', 'SEI', 'ESE', 'LII']], ['Beta', ['EIE', 'LSI', 'SLE', 'IEI']], ['Gamma', ['SEE', 'ILI', 'LIE', 'ESI']], ['Delta', ['LSE', 'EII', 'IEE', 'SLI']]];
const con = $('constellation');
QUADRAS.forEach(([q, codes]) => {
  const row = document.createElement('div');
  row.className = 'qrow';
  row.innerHTML = `<span class="qname">${q}</span>` + codes.map(c => {
    const T = TYPES[c];
    return `<button class="tnode" data-code="${c}" aria-label="${c}, ${T.name}"><span class="gl">${glyph(T.pair[0])}${glyph(T.pair[1])}</span><span class="code">${c}</span><span class="nm">${esc(T.name)}</span></button>`;
  }).join('');
  con.appendChild(row);
});
const dualLine = $('dual-line');
let selectedType = 'ILE';
function drawDual(code) {
  const a = con.querySelector(`[data-code="${code}"]`), b = con.querySelector(`[data-code="${DUALS[code]}"]`);
  con.querySelectorAll('.tnode').forEach(n => n.classList.toggle('dual', n === b));
  const r = con.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  dualLine.setAttribute('x1', ra.left + ra.width / 2 - r.left); dualLine.setAttribute('y1', ra.top + ra.height / 2 - r.top);
  dualLine.setAttribute('x2', rb.left + rb.width / 2 - r.left); dualLine.setAttribute('y2', rb.top + rb.height / 2 - r.top);
  dualLine.classList.add('on');
}
function selectType(code) {
  selectedType = code;
  const T = TYPES[code], D = DUALS[code];
  con.querySelectorAll('.tnode').forEach(n => { n.classList.toggle('sel', n.dataset.code === code); n.setAttribute('aria-pressed', n.dataset.code === code ? 'true' : 'false'); });
  drawDual(code);
  const [b, c] = T.pair;
  $('tpanel').innerHTML = `<div class="swap" style="display:grid;gap:20px">
    <span class="meta">Quadra · ${T.quadra}</span>
    <div><div class="code">${code}</div><div class="nm">${esc(T.name)}</div><div class="meta" style="margin-top:8px">Classical nickname · ${esc(T.nick)}</div></div>
    <div class="leads">
      <div class="lead">${glyph(b)}<div><b>Base · ${b} · ${ELEMENTS[b].plain}</b><p>${esc(SLOT_MEANING.base(ELEMENTS[b].plain))}</p></div></div>
      <div class="lead">${glyph(c)}<div><b>Creative · ${c} · ${ELEMENTS[c].plain}</b><p>${esc(SLOT_MEANING.creative(ELEMENTS[c].plain))}</p></div></div>
    </div>
    <p class="sub" style="font-size:.95rem">Dual: <button class="dualbtn" data-code="${D}">${D}</button>, which leads with ${TYPES[D].pair[0]} and ${TYPES[D].pair[1]}, exactly what ${code} looks to other people for.</p>
    <div><a class="btn" href="/test" data-to-test>Find your place in it <span class="arrow">→</span></a></div>
  </div>`;
}
con.addEventListener('click', e => { const n = e.target.closest('.tnode'); if (n) selectType(n.dataset.code); });
$('tpanel').addEventListener('click', e => { const d = e.target.closest('.dualbtn'); if (d) selectType(d.dataset.code); });
if (finePointer) {
  con.addEventListener('pointerover', e => { const n = e.target.closest('.tnode'); if (!n) return; con.querySelectorAll('.tnode').forEach(x => x.classList.toggle('hov', x === n)); drawDual(n.dataset.code); });
  con.addEventListener('pointerleave', () => { con.querySelectorAll('.tnode').forEach(x => x.classList.remove('hov')); drawDual(selectedType); });
}
selectType('ILE');
window.addEventListener('resize', () => drawDual(selectedType));

if (!reduce) {
  gsap.from('#constellation .tnode .glyph', {
    scrollTrigger: { trigger: '#constellation', start: 'top 72%', once: true, onLeave: () => drawDual(selectedType) },
    x: (i, el) => { const r = con.getBoundingClientRect(), g = el.getBoundingClientRect(); return (r.left + r.width / 2) - (g.left + g.width / 2); },
    y: (i, el) => { const r = con.getBoundingClientRect(), g = el.getBoundingClientRect(); return (r.top + r.height / 2) - (g.top + g.height / 2); },
    opacity: 0, scale: 0.3, duration: 1.2, ease: 'power3.out', stagger: { each: 0.012, from: 'random' },
    clearProps: 'x,y,scale,opacity',
  });
}

// ---------------------------------------------------------------- 05 method
document.querySelectorAll('[data-glyph]').forEach(el => { el.innerHTML = glyphSVG(el.dataset.glyph); });
const pick = () => document.querySelectorAll('#likert .opt')[3].classList.add('pick');
const light = () => $('sample').classList.add('lit');
if (!reduce) {
  ScrollTrigger.create({ trigger: '#likert', start: 'top 75%', once: true, onEnter: () => setTimeout(pick, 500) });
  ScrollTrigger.create({ trigger: '#sample', start: 'top 72%', once: true, onEnter: () => setTimeout(light, 300) });
} else { pick(); light(); }

// ---------------------------------------------------------------- transition into the test
const veil = $('veil');
document.addEventListener('click', e => {
  const a = e.target.closest('[data-to-test]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || reduce) return;
  e.preventDefault();
  stage.style.opacity = 1;
  structure.setState('disassembling');
  veil.classList.add('on');
  setTimeout(() => { location.href = a.getAttribute('href'); }, 620);
});
window.addEventListener('pageshow', e => { if (e.persisted) { veil.classList.remove('on'); setScene(currentScene); } });
window.addEventListener('resize', () => setScene(currentScene));
