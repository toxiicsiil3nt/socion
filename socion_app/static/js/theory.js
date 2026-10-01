// theory.js — the classical (Aušra) Model A vocabulary Socion renders with.
// This is static theory metadata: what each element and position MEANS in
// the model. It never contains claims about a specific person; per-person
// content always comes from the validated report JSON.

export const SHAPES = {
  square:   '<rect x="3" y="3" width="18" height="18"/>',
  circle:   '<circle cx="12" cy="12" r="9"/>',
  triangle: '<polygon points="12,3 21,19.5 3,19.5"/>',
  notch:    '<polygon points="3,3 13,3 13,11 21,11 21,21 3,21"/>',
};

// Filled = extraverted (outward), outline = introverted (inward).
export const ELEMENTS = {
  Ne: { code: 'Ne', shape: 'triangle', filled: true,  name: 'Extraverted Intuition', plain: 'Possibility',
        what: 'What something or someone could become. Hidden potential, alternatives, the essence underneath.',
        human: 'You see the business inside a friend’s hobby before they do.',
        technical: 'Intuition of possibilities: the internal potential of objects and people, latent capabilities, the range of what could be.',
        talk: 'jumps to possibilities, tangents and what-ifs' },
  Ni: { code: 'Ni', shape: 'triangle', filled: false, name: 'Introverted Intuition', plain: 'Time',
        what: 'Where things are heading. Timing, trends, the sense of when.',
        human: 'You feel that now is the wrong moment, even when everything looks ready.',
        technical: 'Intuition of time: development of processes over time, foresight, the felt course of events.',
        talk: 'talks about where things are heading and whether the timing is right' },
  Se: { code: 'Se', shape: 'circle',   filled: true,  name: 'Extraverted Sensing',   plain: 'Force',
        what: 'Presence, pressure and territory. What can be taken, held or defended right now.',
        human: 'In a standoff you know instantly who is going to back down.',
        technical: 'Sensing of force: volitional pressure, mobilization, control over space and resources.',
        talk: 'speaks directly, pushes, and sets terms' },
  Si: { code: 'Si', shape: 'circle',   filled: false, name: 'Introverted Sensing',   plain: 'Comfort',
        what: 'How things feel. Physical ease, sensation, harmony of the immediate surroundings.',
        human: 'You know the room is too cold and the chair is wrong, and exactly how to fix both.',
        technical: 'Sensing of sensations: bodily state, comfort, aesthetic harmony of the physical environment.',
        talk: 'talks about how things feel and the texture of experience' },
  Te: { code: 'Te', shape: 'square',   filled: true,  name: 'Extraverted Logic',     plain: 'Efficiency',
        what: 'How things work and whether they work. Facts, methods, results.',
        human: 'You spot the faster way to do a task before anyone asks.',
        technical: 'Logic of actions: the external, measurable workings of processes — expedience, efficiency, factual accuracy.',
        talk: 'talks in facts, methods and outcomes' },
  Ti: { code: 'Ti', shape: 'square',   filled: false, name: 'Introverted Logic',     plain: 'Structure',
        what: 'Whether things fit together. Categories, rules, consistency.',
        human: 'A contradiction in an argument bothers you even when the conclusion suits you.',
        technical: 'Logic of relations: the static structure between things — hierarchy, classification, logical consistency.',
        talk: 'talks in definitions and whether things are consistent' },
  Fe: { code: 'Fe', shape: 'notch',    filled: true,  name: 'Extraverted Ethics',    plain: 'Mood',
        what: 'The emotional temperature of a room, and how to change it.',
        human: 'You can tell a meeting has gone flat, and you know how to lift it.',
        technical: 'Ethics of emotions: outward expression and transmission of emotional states and excitement.',
        talk: 'uses expressive tone and reads and shifts the mood' },
  Fi: { code: 'Fi', shape: 'notch',    filled: false, name: 'Introverted Ethics',    plain: 'Bonds',
        what: 'Closeness, distance and loyalty. Where people stand with each other.',
        human: 'You sense who is drifting away from you long before anything is said.',
        technical: 'Ethics of relations: attraction and repulsion between people, moral attitudes, the state of relationships.',
        talk: 'talks about people and where they stand with each other' },
};

// Wheel order: intuition top, logic right, sensing bottom, ethics left, so
// the axes across the centre are intuition<->sensing and logic<->ethics.
export const WHEEL_ORDER = ['Ne', 'Ni', 'Te', 'Ti', 'Si', 'Se', 'Fi', 'Fe'];

export const BLOCKS = [
  { key: 'ego_block',      name: 'Ego',       slots: ['base', 'creative'],
    summary: 'Confident and unforced. You use these without needing anyone’s permission.' },
  { key: 'superego_block', name: 'Super-Ego', slots: ['role', 'vulnerable'],
    summary: 'Felt obligation. Tried, rarely satisfying, sensitive to criticism.' },
  { key: 'superid_block',  name: 'Super-Id',  slots: ['suggestive', 'mobilizing'],
    summary: 'What you want from other people, and feel relief receiving.' },
  { key: 'id_block',       name: 'Id',        slots: ['ignoring', 'demonstrative'],
    summary: 'Capable but unvalued. Used without pride or examination.' },
];

export const SLOT_LABELS = {
  base: 'Base', creative: 'Creative', role: 'Role', vulnerable: 'Vulnerable',
  suggestive: 'Suggestive', mobilizing: 'Mobilizing', ignoring: 'Ignoring', demonstrative: 'Demonstrative',
};

// What each Model A position means, applied to an element. These describe
// the position in the model, not a claim invented about the person.
export const SLOT_MEANING = {
  base:          p => `${p} is your home ground. You rely on it confidently and rarely need anyone’s permission to trust it.`,
  creative:      p => `${p} is the tool you use to put your base to work: flexible, applied, always in service of something.`,
  role:          p => `${p} is something you can perform when the situation demands it, but it costs effort and never quite feels like yours.`,
  vulnerable:    p => `${p} is your most sensitive point. Pressure here feels personal, and you would rather it didn’t come up at all.`,
  suggestive:    p => `${p} is what you most want from other people. When someone supplies it well, it feels like relief.`,
  mobilizing:    p => `${p} is something you want to get better at and work on with real interest, though it rarely feels settled.`,
  ignoring:      p => `${p} you understand well, but tend to set aside as beside the point.`,
  demonstrative: p => `${p} you use with ease, almost playfully, without counting it as a strength.`,
};

export const TYPES = {
  ILE: { pair: ['Ne', 'Ti'], name: 'Intuitive-Logical Extravert', nick: 'Don Quixote', quadra: 'Alpha' },
  SEI: { pair: ['Si', 'Fe'], name: 'Sensory-Ethical Introvert',   nick: 'Dumas',       quadra: 'Alpha' },
  ESE: { pair: ['Fe', 'Si'], name: 'Ethical-Sensory Extravert',   nick: 'Hugo',        quadra: 'Alpha' },
  LII: { pair: ['Ti', 'Ne'], name: 'Logical-Intuitive Introvert', nick: 'Robespierre', quadra: 'Alpha' },
  EIE: { pair: ['Fe', 'Ni'], name: 'Ethical-Intuitive Extravert', nick: 'Hamlet',      quadra: 'Beta' },
  LSI: { pair: ['Ti', 'Se'], name: 'Logical-Sensory Introvert',   nick: 'Gorky',       quadra: 'Beta' },
  SLE: { pair: ['Se', 'Ti'], name: 'Sensory-Logical Extravert',   nick: 'Zhukov',      quadra: 'Beta' },
  IEI: { pair: ['Ni', 'Fe'], name: 'Intuitive-Ethical Introvert', nick: 'Yesenin',     quadra: 'Beta' },
  SEE: { pair: ['Se', 'Fi'], name: 'Sensory-Ethical Extravert',   nick: 'Napoleon',    quadra: 'Gamma' },
  ILI: { pair: ['Ni', 'Te'], name: 'Intuitive-Logical Introvert', nick: 'Balzac',      quadra: 'Gamma' },
  LIE: { pair: ['Te', 'Ni'], name: 'Logical-Intuitive Extravert', nick: 'Jack London', quadra: 'Gamma' },
  ESI: { pair: ['Fi', 'Se'], name: 'Ethical-Sensory Introvert',   nick: 'Dreiser',     quadra: 'Gamma' },
  LSE: { pair: ['Te', 'Si'], name: 'Logical-Sensory Extravert',   nick: 'Stirlitz',    quadra: 'Delta' },
  EII: { pair: ['Fi', 'Ne'], name: 'Ethical-Intuitive Introvert', nick: 'Dostoevsky',  quadra: 'Delta' },
  IEE: { pair: ['Ne', 'Fi'], name: 'Intuitive-Ethical Extravert', nick: 'Huxley',      quadra: 'Delta' },
  SLI: { pair: ['Si', 'Te'], name: 'Sensory-Logical Introvert',   nick: 'Gabin',       quadra: 'Delta' },
};

// Duality: each type's Ego is its dual's Super-Id (Aušra, 1980).
export const DUALS = {
  ILE: 'SEI', SEI: 'ILE', ESE: 'LII', LII: 'ESE', EIE: 'LSI', LSI: 'EIE', SLE: 'IEI', IEI: 'SLE',
  SEE: 'ILI', ILI: 'SEE', LIE: 'ESI', ESI: 'LIE', LSE: 'EII', EII: 'LSE', IEE: 'SLI', SLI: 'IEE',
};

export function glyphSVG(code, { size = null, stroke = 2 } = {}) {
  const e = ELEMENTS[code];
  if (!e) return '';
  const style = e.filled
    ? 'fill="currentColor" stroke="none"'
    : `fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linejoin="miter"`;
  const body = SHAPES[e.shape].replace(/\/>$/, ` ${style}/>`);
  const dims = size ? ` width="${size}" height="${size}"` : '';
  return `<svg viewBox="0 0 24 24"${dims} aria-hidden="true">${body}</svg>`;
}

export function glyph(code, cls = '') {
  return `<span class="glyph ${cls}" aria-hidden="true">${glyphSVG(code)}</span>`;
}

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
