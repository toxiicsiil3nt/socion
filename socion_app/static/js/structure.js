// structure.js — Socion's information structure: one reusable 3D object.
//
// Eight modules sit at the corners of a cube ("the structure"). They start
// scattered and dim, assemble one at a time, connect along the cube's
// edges, and can finally reorganize into a Model A arrangement (4 blocks x
// 2 positions) where each module becomes its element's notation glyph:
// filled = extraverted, outline = introverted, exactly as in the 2D notation.
//
// The same engine drives the homepage hero, the questionnaire, and the
// result reveal, so the visitor sees one object evolve across the product.
// It is an abstract visual metaphor for information processing, not a map
// of the brain.

import * as THREE from '/static/vendor/three.module.min.js';
import { ELEMENTS, BLOCKS } from './theory.js';

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ffffff';
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function stub() {
  const noop = () => {};
  return {
    supported: false, setProgress: noop, setState: noop, resolveModelA: noop, setFrame: noop,
    setPointer: noop, pulse: noop, project: () => null, onFrame: noop, setActive: noop, dispose: noop,
  };
}

function glyphShape(kind, size) {
  const s = new THREE.Shape();
  const P = (x, y) => [(x - 12) / 24 * size, -(y - 12) / 24 * size];
  if (kind === 'circle') { s.absarc(0, 0, size * 9 / 24, 0, Math.PI * 2, false); return s; }
  const pts = {
    square: [[3, 3], [21, 3], [21, 21], [3, 21]],
    triangle: [[12, 3], [21, 19.5], [3, 19.5]],
    notch: [[3, 3], [13, 3], [13, 11], [21, 11], [21, 21], [3, 21]],
  }[kind];
  pts.forEach(([x, y], i) => { const [a, b] = P(x, y); i ? s.lineTo(a, b) : s.moveTo(a, b); });
  s.closePath();
  return s;
}

export function createStructure(canvas, opts = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    canvas.style.display = 'none';
    return stub();
  }
  const mobile = opts.mobile ?? window.matchMedia('(max-width: 720px)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);

  const INK = new THREE.Color(css('--ink'));
  const SIGNAL = new THREE.Color(css('--signal'));
  const FAINT = new THREE.Color(css('--ink-faint'));

  const scene = new THREE.Scene();
  const FOV = 32;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, 11);

  const rig = new THREE.Group();      // framing + pointer tilt
  const machine = new THREE.Group();  // the structure itself
  rig.add(machine);
  scene.add(rig);

  // ---------------- geometry
  const S = 1.25;
  const VERTS = [];
  for (let i = 0; i < 8; i++) VERTS.push(new THREE.Vector3(i & 1 ? S : -S, i & 2 ? S : -S, i & 4 ? S : -S));
  const EDGES = [];
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
    const d = a ^ b;
    if (d === 1 || d === 2 || d === 4) EDGES.push([a, b]);
  }

  const rand = seeded(opts.seed ?? 7);
  const shellGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.46, 0.46, 0.46));
  const fillGeo = new THREE.BoxGeometry(0.26, 0.26, 0.26);

  const modules = VERTS.map((v, i) => {
    const group = new THREE.Group();
    const shellMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.3, depthWrite: false });
    const shell = new THREE.LineSegments(shellGeo, shellMat);
    const fillMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    group.add(shell, fill);
    machine.add(group);

    const dir = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const scattered = v.clone().add(dir.multiplyScalar(1.5 + rand() * 1.3));
    const spin = new THREE.Euler(rand() * 3, rand() * 3, rand() * 3);
    group.position.copy(scattered);
    group.rotation.copy(spin);

    return {
      group, shell, fill, shellMat, fillMat, glyph: null, glyphMats: [],
      home: v.clone(), scattered, spin, phase: rand() * Math.PI * 2,
      assembled: 0, assembledTarget: 0, burst: 0, burstTarget: 0,
      modelMix: 0, modelMixTarget: 0, glyphMix: 0, glyphMixTarget: 0, code: null, modelPos: new THREE.Vector3(), locked: false, emphasis: 0, emphasisTarget: 0,
      startAt: 0, flash: 0,
    };
  });

  // one LineSegments for all 12 cube edges + 8 spokes, coloured per-vertex with alpha
  function lineBuffer(count) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 2 * 4), 4));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    machine.add(lines);
    return lines;
  }
  const edgeLines = lineBuffer(EDGES.length);
  const spokeLines = lineBuffer(8);
  const modelLines = lineBuffer(4 + 2 + 4); // 4 row links, 2 column spines, 4-segment ego frame
  const edgeFlash = new Float32Array(EDGES.length);
  const edgeWasLit = new Array(EDGES.length).fill(false);

  const coreMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.15 });
  const core = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.32)), coreMat);
  machine.add(core);

  // ---------------- state
  let state = 'incomplete';
  let modelAlpha = 0, modelAlphaTarget = 0;
  let frame = { x: 0, y: 0, scale: 1, fit: 2.55 };
  let frameCur = { x: 0, y: 0, scale: 1 };
  let pointer = { x: 0, y: 0 }, pointerCur = { x: 0, y: 0 };
  let spinSpeed = 0.14, spinSpeedCur = 0.14;
  let dragVel = 0;
  let pulseT = 0;
  let active = true;
  let frameCallbacks = [];
  let time = 0;
  let width = 1, height = 1;

  function setProgress(n) {
    modules.forEach((m, i) => { m.assembledTarget = clamp01(n - i); });
  }

  function setAssembled(mask) {
    modules.forEach((m, i) => { m.assembledTarget = mask[i] ? 1 : 0; });
  }

  function setState(next) {
    state = next;
    if (next === 'incomplete') { spinSpeed = 0.14; modelAlphaTarget = 0; modules.forEach(m => { m.burstTarget = 0; m.modelMixTarget = 0; m.emphasisTarget = 0; }); }
    if (next === 'complete') { spinSpeed = 0.2; setProgress(8); modelAlphaTarget = 0; modules.forEach(m => { m.modelMixTarget = 0; m.burstTarget = 0; }); }
    if (next === 'analyzing') { spinSpeed = 0.55; setProgress(8); }
    if (next === 'disassembling') { spinSpeed = 0.4; modules.forEach(m => { m.assembledTarget = 0; m.burstTarget = 1; }); }
  }

  function buildGlyph(m, code) {
    if (m.code === code && (m.glyph || !code)) return;
    if (m.glyph) { m.group.remove(m.glyph); m.glyph = null; m.glyphMats = []; }
    m.code = code || null;
    m.glyphMix = 0;
    if (!code) return;
    const el = ELEMENTS[code];
    const shape = glyphShape(el.shape, 0.62);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false, curveSegments: 40 });
    geo.translate(0, 0, -0.035);
    const g = new THREE.Group();
    if (el.filled) {
      const mat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false });
      g.add(new THREE.Mesh(geo, mat));
      m.glyphMats.push(mat);
    } else {
      const mat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false });
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), mat));
      m.glyphMats.push(mat);
    }
    g.scale.setScalar(0.001);
    m.glyph = g;
    m.group.add(g);
  }

  // layout: [{code|null}] in Model A order: base, creative, role, vulnerable,
  // suggestive, mobilizing, ignoring, demonstrative. null = locked (not
  // included in this tier's data, so not drawn).
  const ROW_Y = [1.7, 0.57, -0.57, -1.7];
  const COL_X = [-0.66, 0.66];
  function resolveModelA(layout, { stagger = 0.09 } = {}) {
    state = 'model';
    spinSpeed = 0;
    setProgress(8);
    const now = time;
    layout.forEach((slot, k) => {
      const m = modules[k];
      const prevCode = m.code;
      m.modelPos.set(COL_X[k % 2], ROW_Y[Math.floor(k / 2)], 0);
      m.locked = !slot || !slot.code;
      buildGlyph(m, slot && slot.code);
      m.startAt = prevCode === (m.code) && m.modelMix > 0.5 ? now : now + k * stagger;
      m.emphasisTarget = k < 2 ? 1 : 0;
    });
    modelAlphaTarget = 1;
    // turn the cube to face the camera by the shortest route
    const y = machine.rotation.y % (Math.PI * 2);
    machine.rotation.y = y > Math.PI ? y - Math.PI * 2 : (y < -Math.PI ? y + Math.PI * 2 : y);
  }

  function setFrame(f) { frame = { ...frame, ...f }; }
  function setPointer(x, y) { pointer.x = x; pointer.y = y; }
  function pulse() { pulseT = 1; }
  function onFrame(cb) { frameCallbacks.push(cb); }
  function setActive(v) { active = v; }

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  // screen position of a module, plus its approximate on-screen radius
  function project(i) {
    const m = modules[i];
    if (!m) return null;
    m.group.getWorldPosition(tmp);
    tmp2.copy(tmp).add(new THREE.Vector3(0.36 * m.group.scale.x * rig.scale.x, 0, 0));
    tmp.project(camera);
    tmp2.project(camera);
    const x = (tmp.x + 1) / 2 * width, y = (1 - tmp.y) / 2 * height;
    return { x, y, r: Math.abs((tmp2.x + 1) / 2 * width - x) };
  }

  // drag to rotate (questionnaire / result, where the canvas is not behind scrolling content)
  if (opts.draggable) {
    let dragging = false, lastX = 0;
    canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; canvas.setPointerCapture?.(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!dragging) return; dragVel = (e.clientX - lastX) * 0.012; lastX = e.clientX; });
    const end = () => { dragging = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ---------------- per-frame update
  const posAttrE = edgeLines.geometry.attributes.position, colAttrE = edgeLines.geometry.attributes.color;
  const posAttrS = spokeLines.geometry.attributes.position, colAttrS = spokeLines.geometry.attributes.color;
  const posAttrM = modelLines.geometry.attributes.position, colAttrM = modelLines.geometry.attributes.color;
  const c = new THREE.Color();

  function setSeg(pos, col, idx, a, b, color, alpha) {
    pos.setXYZ(idx * 2, a.x, a.y, a.z); pos.setXYZ(idx * 2 + 1, b.x, b.y, b.z);
    col.setXYZW(idx * 2, color.r, color.g, color.b, alpha); col.setXYZW(idx * 2 + 1, color.r, color.g, color.b, alpha);
  }

  let last = performance.now();
  let raf = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!active || document.hidden) return;
    time += dt;

    // framing: fit the structure's radius into the viewport, then offset
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const radius = frame.fit;
    const fitZ = Math.max(radius / tanHalf, radius / (tanHalf * camera.aspect)) * 1.08;
    camera.position.z = damp(camera.position.z, fitZ, 4, dt);
    frameCur.x = damp(frameCur.x, frame.x, 3.5, dt);
    frameCur.y = damp(frameCur.y, frame.y, 3.5, dt);
    frameCur.scale = damp(frameCur.scale, frame.scale, 3.5, dt);
    const halfH = tanHalf * camera.position.z, halfW = halfH * camera.aspect;
    rig.position.set(frameCur.x * halfW, frameCur.y * halfH, 0);
    rig.scale.setScalar(frameCur.scale);

    pointerCur.x = damp(pointerCur.x, pointer.x, 3, dt);
    pointerCur.y = damp(pointerCur.y, pointer.y, 3, dt);
    rig.rotation.x = -pointerCur.y * 0.22 + 0.32 * (1 - modelAlpha);
    rig.rotation.y = pointerCur.x * 0.3;

    spinSpeedCur = damp(spinSpeedCur, spinSpeed, 2, dt);
    dragVel *= Math.exp(-3 * dt);
    if (state === 'model') {
      machine.rotation.y = damp(machine.rotation.y, 0, 3, dt) + dragVel * 0.3;
      machine.rotation.x = damp(machine.rotation.x, 0, 3, dt);
    } else {
      machine.rotation.y += spinSpeedCur * dt + dragVel;
      machine.rotation.x = damp(machine.rotation.x, 0.15 * Math.sin(time * 0.2), 1, dt);
    }

    modelAlpha = damp(modelAlpha, modelAlphaTarget, 2.5, dt);
    pulseT = Math.max(0, pulseT - dt * 1.4);

    let assembledSum = 0;
    modules.forEach((m, i) => {
      if (state === 'model' && time >= m.startAt) { m.modelMixTarget = 1; m.glyphMixTarget = m.glyph ? 1 : 0; }
      const prev = m.assembled;
      m.assembled = damp(m.assembled, m.assembledTarget, 5, dt);
      if (prev < 0.95 && m.assembled >= 0.95) m.flash = 1;
      m.flash = Math.max(0, m.flash - dt * 1.6);
      m.burst = damp(m.burst, m.burstTarget, 3, dt);
      m.modelMix = damp(m.modelMix, m.modelMixTarget, 3.2, dt);
      m.emphasis = damp(m.emphasis, m.emphasisTarget, 3, dt);
      m.glyphMix = damp(m.glyphMix, m.glyphMixTarget, 3.4, dt);
      assembledSum += m.assembled;

      const a = ease(clamp01(m.assembled));
      const bob = (1 - a) * Math.sin(time * 0.9 + m.phase) * 0.09;
      tmp.copy(m.scattered).lerp(m.home, a);
      tmp.y += bob;
      if (m.burst > 0.001) tmp.add(m.scattered.clone().sub(m.home).multiplyScalar(m.burst * 0.9));
      const mm = ease(clamp01(m.modelMix));
      tmp.lerp(m.modelPos, mm);
      m.group.position.copy(tmp);

      const spinAmt = (1 - a) * (1 - mm);
      m.group.rotation.set(m.spin.x * spinAmt + time * 0.3 * spinAmt, m.spin.y * spinAmt, m.spin.z * spinAmt);

      const scale = (0.72 + 0.28 * a) * (1 + 0.12 * m.emphasis * mm);
      m.group.scale.setScalar(scale);

      // neutral piece -> element glyph
      const glyphVisible = m.glyph ? clamp01(m.glyphMix) * mm : 0;
      const lockedDim = m.locked ? mm : 0;
      m.shellMat.opacity = (0.22 + 0.62 * a) * (1 - glyphVisible * 0.92) * (1 - lockedDim * 0.55) + m.flash * 0.3;
      m.shellMat.color.copy(INK).lerp(SIGNAL, m.flash * 0.8);
      m.fillMat.opacity = a * 0.85 * (1 - mm);
      m.fill.scale.setScalar(0.4 + 0.6 * a);
      m.fill.visible = m.fillMat.opacity > 0.01;
      m.shell.visible = m.shellMat.opacity > 0.01;
      if (m.glyph) {
        m.glyph.scale.setScalar(Math.max(0.001, glyphVisible));
        m.glyph.rotation.y = (1 - glyphVisible) * 1.6;
        m.glyphMats.forEach(mat => { mat.opacity = glyphVisible; });
      }
    });

    // cube edges: light up when both ends are assembled
    const cubeFade = 1 - modelAlpha;
    EDGES.forEach(([ia, ib], k) => {
      const ma = modules[ia], mb = modules[ib];
      const lit = Math.min(ma.assembled, mb.assembled);
      if (!edgeWasLit[k] && lit > 0.95) { edgeFlash[k] = 1; edgeWasLit[k] = true; }
      if (lit < 0.5) edgeWasLit[k] = false;
      edgeFlash[k] = Math.max(0, edgeFlash[k] - dt * 1.2);
      let alpha = (0.05 + 0.5 * lit) * cubeFade;
      c.copy(INK).lerp(SIGNAL, edgeFlash[k]);
      if (state === 'analyzing') {
        const wave = 0.5 + 0.5 * Math.sin(time * 4.2 - k * 0.85);
        c.lerp(SIGNAL, wave * 0.75);
        alpha = Math.min(1, alpha + wave * 0.3);
      }
      setSeg(posAttrE, colAttrE, k, ma.group.position, mb.group.position, c, alpha);
    });
    posAttrE.needsUpdate = true; colAttrE.needsUpdate = true;

    // spokes from the core
    const origin = new THREE.Vector3();
    modules.forEach((m, k) => {
      const alpha = (0.03 + 0.2 * m.assembled + pulseT * 0.4) * cubeFade;
      c.copy(FAINT).lerp(SIGNAL, pulseT + m.flash * 0.6);
      setSeg(posAttrS, colAttrS, k, origin, m.group.position, c, alpha);
    });
    posAttrS.needsUpdate = true; colAttrS.needsUpdate = true;

    const progress = assembledSum / 8;
    coreMat.opacity = (0.12 + 0.5 * progress + pulseT * 0.4) * cubeFade;
    core.rotation.y += dt * (0.4 + (state === 'analyzing' ? 1.6 : 0));
    core.rotation.x += dt * 0.25;
    core.scale.setScalar(1 + pulseT * 0.6 + (state === 'analyzing' ? 0.15 * Math.sin(time * 6) : 0));

    // Model A lattice: row links, column spines, and a frame around the Ego row
    const ma = modelAlpha;
    const P = k => modules[k].group.position;
    for (let r = 0; r < 4; r++) {
      const isEgo = r === 0;
      c.copy(isEgo ? SIGNAL : INK);
      setSeg(posAttrM, colAttrM, r, P(r * 2), P(r * 2 + 1), c, ma * (isEgo ? 0.9 : 0.28));
    }
    c.copy(INK);
    setSeg(posAttrM, colAttrM, 4, P(0), P(6), c, ma * 0.12);
    setSeg(posAttrM, colAttrM, 5, P(1), P(7), c, ma * 0.12);
    const fx = COL_X[1] + 0.48, fy = 0.42, y0 = ROW_Y[0];
    const corners = [new THREE.Vector3(-fx, y0 + fy, 0), new THREE.Vector3(fx, y0 + fy, 0), new THREE.Vector3(fx, y0 - fy, 0), new THREE.Vector3(-fx, y0 - fy, 0)];
    c.copy(SIGNAL);
    for (let s2 = 0; s2 < 4; s2++) setSeg(posAttrM, colAttrM, 6 + s2, corners[s2], corners[(s2 + 1) % 4], c, ma * 0.55);
    posAttrM.needsUpdate = true; colAttrM.needsUpdate = true;

    renderer.render(scene, camera);
    frameCallbacks.forEach(cb => cb());
  }
  raf = requestAnimationFrame(tick);

  return {
    supported: true,
    setProgress, setAssembled, setState, resolveModelA, setFrame, setPointer, pulse, project, onFrame, setActive,
    get state() { return state; },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); },
  };
}

// Build the 8-slot layout resolveModelA expects from a report's
// model_a_blocks. Blocks missing from the report (locked tiers) become null.
export function modelALayout(blocks) {
  const out = [];
  BLOCKS.forEach(b => b.slots.forEach(slot => {
    const code = blocks?.[b.key]?.[slot];
    out.push(code ? { code, block: b.key, slot } : null);
  }));
  return out;
}
