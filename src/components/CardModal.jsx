// Fichier: components/CardModal.jsx
import React from 'react';
import ManaCost from './ManaCost.jsx';

export default function CardModal({ open, card, owned, onClose }) {
  if (!open || !card) return null;
  const price = (Number(card.prices?.eur) || Number(card.prices?.eur_foil) || 0).toFixed(2);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="modal-content rounded-2xl max-w-3xl w-full p-4 relative" onClick={(e) => e.stopPropagation()}>
        {/* BOUTON FERMER */}
        <button
          onClick={onClose}
          className="modal-close-btn"
          aria-label="Fermer la modale"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        {/* Conteneur de la grille */}
        <div className="modal-grid-container">
          {card.image && (
            <div className="modal-image-container">
              <img src={card.image} alt={card.name} className="w-full rounded-lg object-cover" />
            </div>
          )}
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
    </div>
  );
}
