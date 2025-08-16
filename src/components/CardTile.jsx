// Fichier: components/CardTile.jsx
import React from 'react';
import ManaCost from './ManaCost.jsx';

export default function CardTile({ card, onOpen, qty, owned, isWinCon, isGameChanger }) {
  return (
    <button className="relative glass-strong rounded-lg p-2 flex gap-3 text-left hover:bg-white/15" onClick={() => onOpen(card, owned)}>
      {qty ? <span className="badge">x{qty}</span> : null}
      {card.small ? (
        <img src={card.small} alt={card.name} className="w-12 h-16 object-cover rounded" />
      ) : (
        <div className="w-12 h-16 glass-strong rounded" />
      )}
      <div className="min-w-0">
        <div className="truncate font-medium flex items-center gap-1.5">
          <span className="truncate">{card.name}</span>
          {/* Icônes pour Win Con et Game Changer */}
          {isWinCon && <span className="text-red-400" title="Win Condition">★</span>}
          {isGameChanger && <span className="text-orange-400" title="Game Changer">♦</span>}
          {owned && (
            <span style={{ color: 'limegreen', fontWeight: 'bold' }} title="Carte présente dans votre collection">✓</span>
          )}
        </div>
        {card.mana_cost && <div className="text-xs muted"><ManaCost cost={card.mana_cost} /></div>}
      </div>
    </button>
  );
}
