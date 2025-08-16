// Fichier: components/CardModal.jsx
import React from 'react';
import ManaCost from './ManaCost.jsx';

export default function CardModal({ open, card, owned, onClose }) {
  if (!open || !card) return null;
  const price = (Number(card.prices?.eur) || Number(card.prices?.eur_foil) || 0).toFixed(2);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      {/* Les classes bg-[#111] et border ont été remplacées par modal-content */}
      <div className="modal-content rounded-2xl max-w-3xl w-full grid md:grid-cols-2 gap-4 p-4" onClick={(e) => e.stopPropagation()}>
        {card.image && <img src={card.image} alt={card.name} className="w-full rounded-lg object-cover" />}
        <div className="space-y-2 min-w-0">
          <h4 className="text-xl font-semibold flex items-center gap-2">
            {card.name}
            {owned && (<span style={{ color: 'limegreen', fontWeight: 'bold' }} title="Carte présente dans votre collection">✓</span>)}
          </h4>
          {card.mana_cost && <div className="text-sm"><ManaCost cost={card.mana_cost} /></div>}
          {card.oracle_en && <div className="text-sm whitespace-pre-line">{card.oracle_en}</div>}
          <div className="text-sm muted">Prix estimé: {price}€</div>
          {card.scryfall_uri && <a href={card.scryfall_uri} target="_blank" rel="noreferrer" className="btn inline-flex">Voir sur Scryfall</a>}
        </div>
      </div>
    </div>
  );
}
