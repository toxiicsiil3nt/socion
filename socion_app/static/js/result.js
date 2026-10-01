// result.js — renders a validated Socion report. Every per-person statement
// on this page comes from the report JSON returned by /api/report; the rest
// is the static meaning of each Model A position (theory.js).

import { createStructure, modelALayout } from './structure.js';
import { ELEMENTS, BLOCKS, SLOT_LABELS, SLOT_MEANING, TYPES, DUALS, glyph, escapeHTML as esc } from './theory.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reportId = params.get('id') || (() => { try { return localStorage.getItem('socion.lastReport'); } catch (_) { return null; } })();
const revealMode = params.get('reveal') === '1' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const desktop = () => window.matchMedia('(min-width: 900px)').matches;

const structure = createStructure($('structure'), { seed: 11 });
structure.setState('complete');
function frame() {
  // the Model A lattice is narrower than the cube, so fit a smaller radius on narrow screens
  structure.setFrame(desktop() ? { x: 0.4, y: 0, scale: 1, fit: 2.55 } : { x: 0, y: 0.34, scale: 0.8, fit: 2.0 });
}
frame();
window.addEventListener('resize', frame);
if (window.matchMedia('(pointer: fine)').matches) {
  window.addEventListener('pointermove', e => structure.setPointer((e.clientX / innerWidth * 2 - 1) * 0.5, (e.clientY / innerHeight * 2 - 1) * 0.5), { passive: true });
}

let current = null;   // last /api/report payload
let config = { payments_configured: false, dev_mode: false };
let pollTimer = 0;

// ---------------- projected Model A labels
const labelEls = [];
function buildLabels(layout) {
  const host = $('labels');
  host.innerHTML = '';
  labelEls.length = 0;
  layout.forEach((slot, k) => {
    const block = BLOCKS[Math.floor(k / 2)];
    const slotName = block.slots[k % 2];
    const el = document.createElement('div');
    const left = k % 2 === 0;
    el.className = 'mlabel' + (k < 2 ? ' ego' : '') + (slot ? '' : ' is-locked');
    const blk = left ? `<span class="blk">${block.name}</span>` : '';
    const code = slot ? `<b>${slot.code}</b>` : '<b>—</b>';
    el.innerHTML = left ? `${blk}<span>${SLOT_LABELS[slotName]}</span>${code}` : `${code}<span>${SLOT_LABELS[slotName]}</span>`;
    el.dataset.side = left ? 'left' : 'right';
    host.appendChild(el);
    labelEls.push(el);
  });
}
structure.onFrame(() => {
  if (!labelEls.length) return;
  labelEls.forEach((el, k) => {
    const p = structure.project(k);
    if (!p) return;
    const off = p.r + (desktop() ? 18 : 10);
    const w = el.offsetWidth;
    let x = el.dataset.side === 'left' ? p.x - off - w : p.x + off;
    x = Math.max(6, Math.min(innerWidth - w - 6, x));
    el.style.transform = `translate(${x.toFixed(1)}px, ${(p.y - 8).toFixed(1)}px)`;
  });
});

// recede the 3D stage once the reader scrolls into the report
function onScroll() {
  const past = window.scrollY > innerHeight * 0.55;
  $('stage').classList.toggle('receded', past);
  $('labels').classList.toggle('receded', past);
}
window.addEventListener('scroll', onScroll, { passive: true });

// ---------------- helpers
const pct = v => (typeof v === 'number' ? Math.round(v) : null);
function meterLine(label, value) {
  const v = pct(value);
  if (v === null) return `<div class="meterline">${esc(label)} <b>insufficient evidence</b></div>`;
  return `<div class="meterline">${esc(label)} <span class="bar"><i style="width:${v}%"></i></span> <b>${v} / 100</b></div>`;
}
function quotes(el) {
  return (el?.evidence_quotes || []).filter(Boolean).slice(0, 2).map(q => `<blockquote class="quote">“${esc(q)}”</blockquote>`).join('');
}
function scores(el) {
  if (!el) return '';
  const f = v => (typeof v === 'number' ? Math.round(v) : 'n/a');
  return `<div class="scores"><span>Natural use <b>${f(el.ego_quality)}</b></span><span>Obligation-toned <b>${f(el.superego_quality)}</b></span><span>Confidence <b>${f(el.confidence)}</b></span></div>`;
}
function slotCard(code, slot, el) {
  const E = ELEMENTS[code];
  return `<article class="card">
    <div class="card-head">${glyph(code)}<div><div class="slot">${SLOT_LABELS[slot]}</div><h3>${code} <span class="plain">${esc(E.name)} · ${esc(E.plain)}</span></h3></div></div>
    <p class="meaning">${esc(SLOT_MEANING[slot](E.plain))}</p>
    <p>${esc(E.what)}</p>
    ${quotes(el)}
    ${scores(el)}
  </article>`;
}

// ---------------- reveal
function renderReveal(report) {
  const code = report.sociotype_placement;
  const ego = report.model_a_blocks?.ego_block || {};
  if (code === 'INDETERMINATE') {
    $('reveal-eyebrow').textContent = 'Your reading';
    $('type-code').textContent = '?';
    $('type-name').textContent = 'Your answers didn’t settle on a single type.';
    $('type-sub').textContent = 'The engine refuses to force a result it can’t support. Your strongest channels are shown below; longer answers usually resolve it.';
  } else {
    const T = TYPES[code];
    $('type-code').textContent = code;
    $('type-name').textContent = T.name;
    $('type-sub').textContent = `Classical nickname: ${T.nick}`;
  }
  $('notation').innerHTML = [['Base', ego.base], ['Creative', ego.creative]].filter(([, c]) => c)
    .map(([l, c]) => `<div class="pair">${glyph(c)}<span>${l} <b>${c}</b></span></div>`).join('');
  document.title = code && code !== 'INDETERMINATE' ? `Socion — ${code}` : 'Socion — Your Reading';
}

function revealSequence(payload) {
  const layout = modelALayout(payload.report.model_a_blocks);
  renderReveal(payload.report);
  const status = $('reveal-status');
  const go = () => {
    status.textContent = 'Reorganizing into Model A';
    structure.resolveModelA(layout, { stagger: revealMode ? 0.11 : 0 });
    buildLabels(layout);
    setTimeout(() => { $('labels').classList.add('on'); status.textContent = ''; $('reveal').classList.add('shown'); }, revealMode ? 1500 : 50);
  };
  if (revealMode) setTimeout(go, 900); else go();
}

// ---------------- report body
function evidenceChain(report) {
  const ch = report.evidence_chain;
  if (!ch || !ch.quote) return '';
  const E = ELEMENTS[ch.element];
  const code = report.sociotype_placement;
  return `<section>
    <div class="sec-head"><span class="label signal">How it was read</span><h2>From your words to your type</h2>
      <p>This is one real line of evidence, followed step by step. Every placement in your reading is built the same way.</p></div>
    <div class="chain armed" id="chain">
      <div class="link answer"><span class="k">Your answer</span><span class="v">“${esc(ch.quote)}”</span></div>
      <div class="link"><span class="k">Linguistic pattern</span><span class="v">${esc(ch.pattern[0].toUpperCase() + ch.pattern.slice(1))}</span></div>
      <div class="link"><span class="k">Information element</span><span class="v">${glyph(ch.element)}${ch.element} · ${esc(E.name)} <span style="color:var(--ink-dim)">(${esc(E.plain)})</span></span></div>
      <div class="link"><span class="k">Model A</span><span class="v">Ego block, Base position: your most natural channel</span></div>
      <div class="link type"><span class="k">Type</span><span class="v">${code === 'INDETERMINATE' ? '—' : esc(code)}</span></div>
    </div>
  </section>`;
}

function egoSection(report) {
  const ego = report.model_a_blocks.ego_block;
  const els = report.elements || {};
  return `<section>
    <div class="sec-head"><span class="label signal">Ego block</span><h2>Where you're strongest</h2>
      <p>The two channels you lead with. You use them confidently, without borrowing anyone's standard.</p>
      ${meterLine('Overall confidence', report.overall_confidence)}</div>
    <div class="cards">${slotCard(ego.base, 'base', els[ego.base])}${slotCard(ego.creative, 'creative', els[ego.creative])}</div>
  </section>`;
}

function whySection(report, paid) {
  const ego = report.model_a_blocks.ego_block;
  const els = report.elements || {};
  const line = (code, slot) => {
    const el = els[code], E = ELEMENTS[code];
    if (!el) return '';
    const n = typeof el.ego_quality === 'number' ? Math.round(el.ego_quality) : null;
    const o = typeof el.superego_quality === 'number' ? Math.round(el.superego_quality) : null;
    return `<p><strong>${code} (${esc(E.plain)})</strong> scored ${n ?? 'n/a'}/100 for natural, self-directed use and ${o ?? 'n/a'}/100 for obligation-toned use, which places it in your Ego as ${SLOT_LABELS[slot].toLowerCase()}.</p>`;
  };
  const summary = paid && report.reasoning_summary ? `<p>${esc(report.reasoning_summary)}</p>` : '';
  return `<section>
    <div class="sec-head"><span class="label signal">Why this result</span><h2>What tipped it</h2></div>
    <div class="why">
      <p>The engine compares how you talk about each kind of information: fluently and on your own terms, or as a rule you feel you should follow. The difference decides where each channel sits.</p>
      ${line(ego.base, 'base')}${line(ego.creative, 'creative')}
      ${summary}
    </div>
  </section>`;
}

function lockedSection() {
  const lockedBlocks = BLOCKS.slice(1).map(b => `<div class="locked"><div class="blkname">${b.name}</div><div class="slots"><span>?</span><span>?</span></div><p>${esc(b.summary)}</p></div>`).join('');
  const v = config.dev_mode;
  return `<section id="upgrade">
    <div class="sec-head"><span class="label signal">The rest of your structure</span><h2>Six more positions</h2>
      <p>Your reading already placed all eight channels. These three blocks are where you feel obligation, what you need from other people, and what you do without noticing.</p></div>
    <div class="locked-grid">${lockedBlocks}</div>
    <div class="upgrade">
      <div class="offer main">
        <span class="label">Full report</span>
        <div class="price">$40</div>
        <ul>
          <li>All four Model A blocks, with the language each placement came from</li>
          <li>Strengths, and the areas that feel like effort or pressure</li>
          <li>How you tend to communicate, and where misunderstandings start</li>
          <li>What you need from other people, and the type that tends to supply it</li>
          <li>A confidence score for each channel, and where the reading is uncertain</li>
        </ul>
        <div class="row"><button class="btn primary" data-buy="paid">Unlock the full report <span class="arrow">→</span></button></div>
        <p class="fine">One-time payment. No subscription.</p>
      </div>
      <div class="offer">
        <span class="label">Verified reading</span>
        <div class="price">$100</div>
        <p style="color:var(--ink-dim)">Everything in the full report, plus an adversarial second pass: a separate review attacks your first reading for bias, misread tone and cherry-picked evidence, and a third pass resolves each challenge.</p>
        <div class="stagesmini"><span>Typist</span><span class="sep">→</span><span>Skeptic</span><span class="sep">→</span><span>Synthesizer</span></div>
        <div class="row"><button class="btn" data-buy="verified">Get the verified reading</button></div>
      </div>
    </div>
    <p class="pay-msg" id="pay-msg"></p>
  </section>`;
}

const BLOCK_TITLES = {
  superego_block: ['Difficult areas', 'Where effort is required, and where criticism lands hardest.'],
  superid_block: ['What you need from others', 'Channels you want supplied by other people, and feel relief receiving.'],
  id_block: ['Background abilities', 'Channels you handle competently but don’t value much.'],
};

function fullBlocks(report) {
  const els = report.elements || {};
  return BLOCKS.slice(1).map(b => {
    const blk = report.model_a_blocks[b.key];
    const [title, sub] = BLOCK_TITLES[b.key];
    return `<section class="blocksec">
      <div class="sec-head"><span class="label signal">${b.name}</span><h2>${title}</h2><p>${sub}</p></div>
      <div class="cards">${b.slots.map(s => slotCard(blk[s], s, els[blk[s]])).join('')}</div>
    </section>`;
  }).join('');
}

function communication(report) {
  const { ego_block: ego, superego_block: se } = report.model_a_blocks;
  const B = ELEMENTS[ego.base], C = ELEMENTS[ego.creative], V = ELEMENTS[se.vulnerable];
  return `<section>
    <div class="sec-head"><span class="label signal">Communication</span><h2>How you come across</h2></div>
    <div class="lines">
      <p>With <strong>${ego.base}</strong> as your base, you tend to lead conversations by ${esc(B.talk)}. Your creative <strong>${ego.creative}</strong> shows up as the way you get there: someone who ${esc(C.talk)}.</p>
      <p>Your vulnerable position is <strong>${se.vulnerable} (${esc(V.plain)})</strong>. Conversations that press on it, especially with someone who ${esc(V.talk)}, are where misunderstandings and defensiveness usually start.</p>
    </div>
  </section>`;
}

function relationships(report) {
  const code = report.sociotype_placement;
  const si = report.model_a_blocks.superid_block;
  const S = ELEMENTS[si.suggestive], M = ELEMENTS[si.mobilizing];
  const dual = code !== 'INDETERMINATE' ? DUALS[code] : null;
  const D = dual ? TYPES[dual] : null;
  return `<section>
    <div class="sec-head"><span class="label signal">Relationships</span><h2>Who completes the structure</h2>
      <p>In Model A, the people who feel easiest to be around tend to lead with exactly what your Super-Id asks for.</p></div>
    <div class="lines">
      <p>You look to others for <strong>${si.suggestive} (${esc(S.plain)})</strong> and, to a lesser degree, <strong>${si.mobilizing} (${esc(M.plain)})</strong>. Someone who supplies these without making a show of it tends to feel like relief rather than effort.</p>
    </div>
    ${D ? `<div class="dual"><div class="code">${dual}</div><div><div class="label">Your dual type</div><div style="font-size:1.05rem">${esc(D.name)}</div><div class="notation" style="margin-top:8px">${D.pair.map(c => `<span class="pair">${glyph(c)}<b>${c}</b></span>`).join('')}</div></div></div>
    <p style="color:var(--ink-dim);max-width:640px">A ${dual} leads with ${D.pair[0]} and ${D.pair[1]}, your Super-Id. Duality describes a fit between information structures, not a guarantee about any particular person.</p>` : ''}
  </section>`;
}

function uncertainty(report) {
  const weak = Object.entries(report.elements || {}).filter(([, e]) => typeof e.confidence !== 'number' || e.confidence < 45 || e.ego_quality === 'insufficient_evidence');
  return `<section>
    <div class="sec-head"><span class="label signal">Limits</span><h2>Where the reading is uncertain</h2></div>
    <div class="lines">${weak.length ? weak.map(([c, e]) => `<p><strong>${c} (${esc(ELEMENTS[c].plain)})</strong>: confidence ${typeof e.confidence === 'number' ? Math.round(e.confidence) : 'n/a'}/100. Your answers gave limited evidence here, so treat this placement as provisional.</p>`).join('') : '<p>No channel fell below the confidence threshold. That does not make the reading certain, only consistent.</p>'}</div>
  </section>`;
}

function verification(payload) {
  const status = payload.verification_status;
  const report = payload.report;
  if (status === 'queued' || status === 'running') {
    return `<section><div class="status-banner"><strong>Verification in progress.</strong> A separate review is attacking your first reading for bias and cherry-picked evidence. This page updates when it finishes.</div></section>`;
  }
  if (status === 'failed') {
    return `<section><div class="status-banner"><strong>The verification pass didn’t complete.</strong> Your full report below is unaffected. Contact support and we will re-run it.</div></section>`;
  }
  if (!report.verified) return '';
  const notes = Object.entries(report.elements || {}).filter(([, e]) => e.verification_note);
  const chip = r => r === 'uphold' ? '<span class="chip upheld">Upheld</span>' : r === 'revise' ? '<span class="chip revised">Revised</span>' : '<span class="chip">Insufficient evidence</span>';
  return `<section>
    <div class="sec-head"><span class="label signal">Verified</span><h2>Your reading was cross-examined</h2>
      <p>After the first typing, a Skeptic pass attacked it for self-flattering bias, misread tone, structural errors and cherry-picked evidence. A Synthesizer then resolved each challenge. These are the results.</p></div>
    <div>${notes.length ? notes.map(([c, e]) => `<div class="vnote">${glyph(c)}<p><b style="color:var(--ink)">${c}</b> — ${esc(e.verification_note.challenge || '')}${typeof e.verification_note.confidence_delta === 'number' ? ` <span style="color:var(--ink-faint)">(confidence ${e.verification_note.confidence_delta > 0 ? '+' : ''}${e.verification_note.confidence_delta})</span>` : ''}</p>${chip(e.verification_note.resolution)}</div>`).join('') : '<p style="color:var(--ink-dim)">The review raised no challenges that changed the reading.</p>'}</div>
  </section>`;
}

function renderReport(payload) {
  const report = payload.report;
  const paid = payload.tier === 'paid' || payload.tier === 'verified';
  let html = '';
  if (payload.tier === 'verified') html += verification(payload);
  html += egoSection(report);
  html += evidenceChain(report);
  html += whySection(report, paid);
  if (paid) {
    html += fullBlocks(report) + communication(report) + relationships(report) + uncertainty(report);
  } else {
    html += lockedSection();
  }
  if (payload.tier === 'paid') {
    html += `<section><div class="upgrade" style="grid-template-columns:1fr"><div class="offer"><span class="label">Verified reading · +$60</span><p style="color:var(--ink-dim)">Put this reading through the adversarial Typist → Skeptic → Synthesizer review.</p><div class="row"><button class="btn" data-buy="verified">Verify this reading</button></div><p class="pay-msg" id="pay-msg"></p></div></div></section>`;
  }
  $('report').innerHTML = html;

  const chain = $('chain');
  if (chain) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { chain.classList.add('in'); io.disconnect(); } }), { threshold: 0.2 });
    io.observe(chain);
  }
  document.querySelectorAll('[data-buy]').forEach(btn => btn.addEventListener('click', () => buy(btn.dataset.buy)));
}

// ---------------- purchase
async function buy(tier) {
  const msg = $('pay-msg');
  if (msg) msg.textContent = '';
  try {
    const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_id: reportId, tier }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.checkout_url) { location.href = body.checkout_url; return; }
    if (msg) msg.textContent = body.detail || 'Checkout is unavailable right now.';
  } catch (_) {
    if (msg) msg.textContent = 'Couldn’t reach checkout. Please try again.';
  }
}

function devBar() {
  if (!config.dev_mode) return;
  const bar = document.createElement('div');
  bar.className = 'devbar';
  bar.innerHTML = 'Dev mode — no payment <button data-g="paid">Grant $40</button><button data-g="verified">Grant $100</button>';
  bar.addEventListener('click', async e => {
    const tier = e.target.dataset.g;
    if (!tier) return;
    await fetch('/api/dev/grant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_id: reportId, tier }) });
    refresh(true);
  });
  document.body.appendChild(bar);
}

// ---------------- data
async function fetchReport() {
  const res = await fetch(`/api/report/${encodeURIComponent(reportId)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || 'We couldn’t load this reading.');
  return body;
}

async function refresh(fromAction = false) {
  const next = await fetchReport();
  const tierChanged = !current || current.tier !== next.tier || current.verification_status !== next.verification_status;
  current = next;
  if (tierChanged) {
    renderReport(next);
    const layout = modelALayout(next.report.model_a_blocks);
    structure.resolveModelA(layout, { stagger: 0.12 });
    buildLabels(layout);
    if (fromAction) window.scrollTo({ top: innerHeight * 0.9, behavior: 'smooth' });
  }
  const pending = next.verification_status === 'queued' || next.verification_status === 'running';
  const awaitingCheckout = params.get('checkout') === 'success' && next.tier === 'free';
  clearTimeout(pollTimer);
  if (pending || awaitingCheckout) pollTimer = setTimeout(() => refresh(), 4000);
}

function fail(message) {
  document.body.innerHTML = `<div class="stage" id="stage"></div><header class="topbar"><a class="wordmark" href="/">SOCI<span>O</span>N</a></header>
  <div class="fail"><div><span class="label signal">Reading unavailable</span><h1 style="font-size:clamp(2.4rem,7vw,4rem)">We couldn't open this reading.</h1><p style="color:var(--ink-dim)">${esc(message)}</p><div class="row"><a class="btn primary" href="/test">Take the test →</a></div></div></div>`;
}

(async function init() {
  if (!reportId) { fail('There is no reading ID in this link.'); return; }
  try {
    config = await fetch('/api/config').then(r => r.json()).catch(() => config);
    const first = await fetchReport();
    current = first;
    revealSequence(first);
    renderReport(first);
    devBar();
    const pending = first.verification_status === 'queued' || first.verification_status === 'running';
    if (pending || (params.get('checkout') === 'success' && first.tier === 'free')) pollTimer = setTimeout(() => refresh(), 4000);
    if (params.get('checkout') === 'cancelled') { const m = $('pay-msg'); if (m) m.textContent = 'Checkout was cancelled. Nothing was charged.'; }
  } catch (err) {
    fail(err.message);
  }
})();
