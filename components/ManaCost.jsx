// Fichier: components/ManaCost.jsx
import React from 'react';

const COLOR_HEX = { W: '#fffcd5', U: '#cce6ff', B: '#d6ccff', R: '#ffd6cc', G: '#d5ffd6', C: '#cccccc', X: '#cccccc', S: '#b9d9ff' };
const isDigit = (s) => /^\d+$/.test(s);
const tokenizeMana = (cost) => (cost ? (cost.match(/\{[^}]+\}/g) || []).map(x => x.slice(1, -1)) : []);
const normalize = (tok) => tok.toUpperCase().replace(/\s+/g, '');
const partsOf = (tok) => normalize(tok).split('/');

function ManaDot({ label, colors }) {
  const bg = colors.length === 1
    ? { backgroundColor: colors[0] }
    : { backgroundImage: `linear-gradient(135deg, ${colors[0]} 0 50%, ${colors[1]} 50% 100%)` };
  const fs = label.length >= 3 ? 8 : 10;
  return (
    <span title={`{${label}}`} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', border: '1px solid #333', fontSize: fs, fontWeight: 800, color: '#000' }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', ...bg }} />
      <span style={{ position: 'relative' }}>{label}</span>
    </span>
  );
}

function colorsForToken(tok) {
  const parts = partsOf(tok);
  if (parts.length === 1) {
    const p = parts[0];
    if (isDigit(p)) return ['#dddddd']; // colorless N
    if (p.endsWith('P')) return [COLOR_HEX[p[0]] || '#eeeeee']; // Phyrexian (e.g., G/P)
    return [COLOR_HEX[p] || '#eeeeee'];
  }
  const colors = parts.filter(x => !isDigit(x) && x !== 'P').map(x => COLOR_HEX[x] || '#eeeeee');
  if (colors.length >= 2) return colors.slice(0, 2);
  if (colors.length === 1) return [colors[0]];
  return ['#dddddd'];
}

export default function ManaCost({ cost }) {
  const toks = tokenizeMana(cost);
  if (!toks.length) return null;
  return (
    <span className="mana">
      {toks.map((t, i) => <ManaDot key={i} label={normalize(t)} colors={colorsForToken(t)} />)}
    </span>
  );
}
