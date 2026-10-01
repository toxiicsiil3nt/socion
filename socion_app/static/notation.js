// notation.js — Socion's geometric element notation, shared between the
// landing page and the report page. Kept as a single source of truth so the
// visual language never drifts between marketing and product.
//
// square = Logic, circle = Sensing, triangle = Intuition, notch = Ethics.
// black/filled = extraverted, white/outline = introverted.

var SHAPES = {
  square:   '<rect x="3" y="3" width="18" height="18"/>',
  circle:   '<circle cx="12" cy="12" r="9"/>',
  triangle: '<polygon points="12,3 21,19.5 3,19.5"/>',
  notch:    '<polygon points="3,3 13,3 13,11 21,11 21,21 3,21"/>'
};

function mark(shape, black, size) {
  size = size || 24;
  var body = SHAPES[shape];
  var style = black ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="2"';
  body = body.replace(/\/>/, style + '/>');
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true">' + body + '</svg>';
}

var ELEMENTS = [
  { code: 'Ne', shape: 'triangle', black: true,  name: 'Ext. Intuition' },
  { code: 'Ni', shape: 'triangle', black: false, name: 'Int. Intuition' },
  { code: 'Se', shape: 'circle',   black: true,  name: 'Ext. Sensing' },
  { code: 'Si', shape: 'circle',   black: false, name: 'Int. Sensing' },
  { code: 'Te', shape: 'square',   black: true,  name: 'Ext. Logic' },
  { code: 'Ti', shape: 'square',   black: false, name: 'Int. Logic' },
  { code: 'Fe', shape: 'notch',    black: true,  name: 'Ext. Ethics' },
  { code: 'Fi', shape: 'notch',    black: false, name: 'Int. Ethics' }
];

var BY_CODE = {};
ELEMENTS.forEach(function (e) { BY_CODE[e.code] = e; });

function elementMark(code, size) {
  var e = BY_CODE[code];
  if (!e) return '';
  return mark(e.shape, e.black, size);
}

// Block display order + labels, matching master_scoring_prompt.md's schema
// (model_a_blocks.{ego_block, superego_block, superid_block, id_block}).
var BLOCK_DEFS = [
  { key: 'ego_block',      name: 'Ego',       slots: ['base', 'creative'],
    note: 'Confident, unforced. No borrowed standard behind it.' },
  { key: 'superego_block', name: 'Super-Ego', slots: ['role', 'vulnerable'],
    note: 'Felt obligation. Tried, never quite satisfied.' },
  { key: 'superid_block',  name: 'Super-Id',  slots: ['suggestive', 'mobilizing'],
    note: 'Wanted from someone else. Blame lands outward when it’s missing.' },
  { key: 'id_block',       name: 'Id',        slots: ['ignoring', 'demonstrative'],
    note: 'Used competently, without pride or examination.' }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SHAPES: SHAPES, mark: mark, ELEMENTS: ELEMENTS, BY_CODE: BY_CODE, elementMark: elementMark, BLOCK_DEFS: BLOCK_DEFS };
}
