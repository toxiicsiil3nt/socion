// test.js — the questionnaire. Each confirmed answer assembles one module
// of the structure; the result is produced only by the real backend
// (POST /api/type -> Claude + master_scoring_prompt.md -> validated JSON).

import { createStructure } from './structure.js';

const STORE_KEY = 'socion.test.v1';
const $ = id => document.getElementById(id);
const desktop = () => window.matchMedia('(min-width: 900px)').matches;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const structure = createStructure($('structure'), { draggable: true, seed: 11 });
function frameFor(screen) {
  if (desktop()) {
    structure.setFrame(screen === 'intro' ? { x: 0.42, y: 0, scale: 0.95 } : { x: 0.5, y: 0.02, scale: 0.85 });
  } else {
    structure.setFrame({ x: 0, y: screen === 'intro' ? 0.5 : 0.56, scale: screen === 'intro' ? 0.66 : 0.6 });
  }
}

let questions = [];
let minAnswered = 5;
let state = { answers: {}, skipped: {}, step: -1 };

function load() {
  try { const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); if (s && s.answers) state = { answers: {}, skipped: {}, step: -1, ...s }; } catch (_) {}
}
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {} }, 250);
}
function clearSaved() { try { localStorage.removeItem(STORE_KEY); } catch (_) {} }

const answered = q => (state.answers[q.id] || '').trim().length > 0;
const answeredCount = () => questions.filter(answered).length;
const pad = n => String(n).padStart(2, '0');

function syncStructure() {
  structure.setAssembled(questions.map(answered));
}

function show(id) {
  ['intro', 'question', 'complete', 'analyzing', 'error'].forEach(s => { $(s).hidden = s !== id; });
  const el = $(id);
  el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
  $('progress').hidden = id === 'intro';
  frameFor(id === 'intro' ? 'intro' : 'question');
}

function renderNodes() {
  const nodes = $('nodes');
  if (!nodes.children.length) questions.forEach(() => { const n = document.createElement('span'); n.className = 'node'; nodes.appendChild(n); });
  [...nodes.children].forEach((n, i) => {
    const q = questions[i];
    n.classList.toggle('done', answered(q));
    n.classList.toggle('skipped', !answered(q) && !!state.skipped[q.id]);
    n.classList.toggle('current', i === state.step);
  });
  const shown = state.step >= 0 && state.step < questions.length ? state.step + 1 : answeredCount();
  $('counter').innerHTML = `<b>${pad(shown)}</b> / ${pad(questions.length)}`;
  $('counter').setAttribute('aria-label', `Question ${shown} of ${questions.length}, ${answeredCount()} answered`);
}

function meter(text) {
  const n = text.trim().length;
  const fill = $('meter-fill');
  fill.style.width = Math.min(100, (n / 220) * 100) + '%';
  fill.classList.toggle('good', n >= 40);
  $('meter').classList.toggle('on', n > 0);
  $('meter-text').textContent = n === 0 ? '' : n < 40 ? 'A sentence or two more will help the reading.' : n < 140 ? 'Good. Add more if there’s more to say.' : 'Plenty to work with.';
}

function autogrow(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

function renderQuestion() {
  const q = questions[state.step];
  $('qlabel').textContent = `Question ${pad(state.step + 1)}`;
  $('prompt').textContent = q.prompt.replace(/\*/g, '');
  const ta = $('answer');
  ta.value = state.answers[q.id] || '';
  autogrow(ta);
  meter(ta.value);
  $('next').disabled = !ta.value.trim();
  const skippedCount = questions.filter(x => state.skipped[x.id] && !answered(x)).length;
  const canSkip = !answered(q) && (skippedCount + (state.skipped[q.id] ? 0 : 1)) <= questions.length - minAnswered;
  $('skip').hidden = !canSkip;
  renderNodes();
  if (desktop()) setTimeout(() => ta.focus({ preventScroll: true }), 60);
}

function goTo(step) {
  state.step = step;
  save();
  if (step < 0) { show('intro'); renderIntro(); return; }
  if (step >= questions.length) { renderComplete(); show('complete'); renderNodes(); return; }
  show('question');
  renderQuestion();
}

function advance() {
  const q = questions[state.step];
  const text = $('answer').value.trim();
  if (!text) return;
  const wasAnswered = answered(q);
  state.answers[q.id] = $('answer').value;
  delete state.skipped[q.id];
  syncStructure();
  if (!wasAnswered) structure.pulse();
  goTo(state.step + 1);
}

function renderComplete() {
  const n = answeredCount();
  const total = questions.length;
  $('complete-count').textContent = `${pad(n)} / ${pad(total)}`;
  const title = $('complete-title');
  if (n === total) {
    title.innerHTML = 'The structure is complete.<span class="dim">Now we analyze it.</span>';
    $('complete-text').textContent = 'Your answers go to Socion’s typing engine, which reads how you wrote, not what you claimed. It usually takes under a minute.';
    structure.setState('complete');
  } else {
    title.innerHTML = 'The structure is ready.<span class="dim">Now we analyze it.</span>';
    $('complete-text').textContent = `${total - n} piece${total - n === 1 ? ' is' : 's are'} still open. The reading works with what you’ve written, but every answer you add gives it more to go on.`;
  }
  $('analyze').disabled = n < minAnswered;
}

function renderIntro() {
  const n = answeredCount();
  const actions = $('intro-actions');
  actions.innerHTML = '';
  if (n > 0) {
    const cont = document.createElement('button');
    cont.className = 'btn primary';
    cont.innerHTML = `Continue · ${pad(n)} / ${pad(questions.length)} <span class="arrow">→</span>`;
    cont.onclick = () => { const first = questions.findIndex(q => !answered(q) && !state.skipped[q.id]); goTo(first === -1 ? questions.length : first); };
    const restart = document.createElement('button');
    restart.className = 'btn ghost';
    restart.textContent = 'Start over';
    restart.onclick = () => { state = { answers: {}, skipped: {}, step: -1 }; clearSaved(); syncStructure(); structure.setState('incomplete'); renderIntro(); };
    actions.append(cont, restart);
  } else {
    const begin = document.createElement('button');
    begin.className = 'btn primary';
    begin.innerHTML = 'Begin <span class="arrow">→</span>';
    begin.onclick = () => goTo(0);
    actions.append(begin);
  }
}

let stageTimer = 0;
function runStages() {
  const items = [...$('stages').children];
  let i = 0;
  const paint = () => items.forEach((li, k) => { li.classList.toggle('active', k === i); li.classList.toggle('past', k < i); });
  paint();
  stageTimer = setInterval(() => { if (i < items.length - 1) { i++; paint(); } }, 3200);
}

async function analyze() {
  show('analyzing');
  structure.setState('analyzing');
  runStages();
  const payload = { answers: questions.map(q => ({ id: q.id, answer: state.answers[q.id] || '' })).filter(a => a.answer.trim()) };
  try {
    const res = await fetch('/api/type', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    let body = null;
    try { body = await res.json(); } catch (_) {}
    if (!res.ok || !body || !body.report_id) throw new Error((body && body.detail) || `The server returned ${res.status}.`);
    clearInterval(stageTimer);
    try { localStorage.setItem('socion.lastReport', body.report_id); } catch (_) {}
    clearSaved();
    structure.setState('complete');
    setTimeout(() => { location.href = `/result?id=${encodeURIComponent(body.report_id)}&reveal=1`; }, reduceMotion ? 0 : 450);
  } catch (err) {
    clearInterval(stageTimer);
    structure.setState(answeredCount() === questions.length ? 'complete' : 'incomplete');
    syncStructure();
    $('error-msg').textContent = err.message || 'Something went wrong.';
    show('error');
  }
}

// ---------------- wiring
const ta = $('answer');
ta.addEventListener('input', () => {
  const q = questions[state.step];
  state.answers[q.id] = ta.value;
  if (!ta.value.trim()) delete state.answers[q.id];
  autogrow(ta);
  meter(ta.value);
  $('next').disabled = !ta.value.trim();
  save();
  // live-sync only removals; additions assemble on confirm so the gesture means something
  if (!ta.value.trim()) { syncStructure(); renderNodes(); }
});
ta.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); advance(); } });
ta.addEventListener('focus', () => { if (!desktop()) document.body.classList.add('typing'); });
ta.addEventListener('blur', () => document.body.classList.remove('typing'));

$('next').addEventListener('click', advance);
$('back').addEventListener('click', () => goTo(state.step - 1));
$('skip').addEventListener('click', () => { state.skipped[questions[state.step].id] = true; goTo(state.step + 1); });
$('analyze').addEventListener('click', analyze);
$('review').addEventListener('click', () => goTo(0));
$('retry').addEventListener('click', analyze);
$('error-review').addEventListener('click', () => goTo(0));

if (window.matchMedia('(pointer: fine)').matches) {
  window.addEventListener('pointermove', e => structure.setPointer(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1), { passive: true });
}
window.addEventListener('resize', () => frameFor($('intro').hidden ? 'question' : 'intro'));

(async function init() {
  load();
  frameFor('intro');
  try {
    const res = await fetch('/api/questions');
    const data = await res.json();
    questions = data.questions;
    minAnswered = data.min_answered || 5;
  } catch (_) {
    $('error-msg').textContent = 'Couldn’t load the questions. Check your connection and reload.';
    show('error');
    return;
  }
  syncStructure();
  renderIntro();
  if (state.step >= 0 && answeredCount() > 0) renderIntro();
  state.step = -1;
})();
