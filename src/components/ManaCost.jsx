// Fichier: components/ManaCost.jsx
import React from 'react';

// Fonction pour "tokeniser" le coût en mana. Ex: "{2}{W}{U}" -> ["2", "W", "U"]
const tokenizeMana = (cost) => (cost ? (cost.match(/\{[^}]+\}/g) || []).map(x => x.slice(1, -1)) : []);

// Fonction pour formater un token pour l'URL de l'image Scryfall
// Ex: "U/R" -> "UR", "G/P" -> "GP", "2/W" -> "2W"
const formatTokenForSvg = (token) => {
    return token.toUpperCase().replace('/', '');
};

export default function ManaCost({ cost }) {
  const tokens = tokenizeMana(cost);

  if (!tokens.length) {
    return null;
  }

  return (
    // Le style a été ajusté pour un meilleur alignement vertical des images
    <span className="mana" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', height: '18px' }}>
      {tokens.map((token, index) => {
        const svgSymbol = formatTokenForSvg(token);
        const svgUrl = `https://svgs.scryfall.io/card-symbols/${svgSymbol}.svg`;

        return (
          <img
            key={index}
            src={svgUrl}
            alt={`{${token}}`}
            title={`{${token}}`}
            style={{ width: '18px', height: '18px' }}
          />
        );
      })}
    </span>
  );
}
