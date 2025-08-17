// Fichier: netlify/functions/generate-deck.js (Version finale avec "Blueprint")

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Configuration serveur incorrecte: clé API manquante." }),
    };
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

  const params = JSON.parse(event.body);

  // ==================================================================
  // PROMPT FINAL AVEC BLUEPRINT STRICT
  // ==================================================================
  // On calcule le nombre de sorts à trouver
  const nonLandSlots = 99 - params.targetLands;

  const prompt = `
    Tu es un expert en construction de decks pour le format Commander de Magic: The Gathering.
    Ta mission est de construire un deck en suivant un "blueprint" (modèle) extrêmement strict.

    **RÈGLES ABSOLUES ET NON NÉGOCIABLES :**
    1.  **TOTAL DE CARTES** : Le deck final DOIT contenir EXACTEMENT 100 cartes.
    2.  **COMMANDANT** : Le commandant est "${params.commander}". Il compte comme 1 carte.
    3.  **SINGLETON** : Toutes les cartes, sauf les terrains de base, DOIVENT être en un seul exemplaire.
    4.  **IDENTITÉ COULEUR** : Toutes les cartes DOIVENT respecter l'identité couleur de "${params.colorIdentity}".

    ---

    **BLUEPRINT DU DECK À SUIVRE À LA LETTRE :**

    Tu DOIS sélectionner un total de **${nonLandSlots} sorts** et **${params.targetLands} terrains**.

    **1. Terrains (${params.targetLands} cartes) :**
    - Choisis **10** terrains non-basiques pertinents pour la stratégie et le budget.
    - Remplis les **${params.targetLands - 10}** places restantes avec des terrains de base (Plains, Island, Swamp, Mountain, Forest) appropriés pour l'identité couleur.

    **2. Sorts (${nonLandSlots} cartes) :**
    Tu DOIS respecter la répartition suivante. Le total de ces catégories doit faire exactement ${nonLandSlots}.
    - **Créatures : 25 cartes.** Choisis des créatures qui synergisent avec le commandant et la stratégie.
    - **Accélération de Mana (Ramp) : 10 cartes.** (Ex: Sol Ring, artefacts de mana, sorts de recherche de terrain).
    - **Pioche (Draw) : 10 cartes.** (Ex: Rhystic Study, sorts pour piocher, créatures faisant piocher).
    - **Gestion des menaces (Removal) : 10 cartes.** (Ex: Swords to Plowshares, sorts pour détruire/exiler des permanents).
    - **Nettoyages de table (Board Wipes) : 4 cartes.** (Ex: Wrath of God, Blasphemous Act).
    - **"Slots Flexibles" : ${nonLandSlots - (25 + 10 + 10 + 10 + 4)} cartes.** Utilise ces places pour des cartes qui renforcent les thèmes/mécaniques de "${params.mechanics.join(', ') || 'la stratégie générale'}", des tuteurs, ou des cartes uniques.

    ---

    **VÉRIFICATION FINALE AVANT DE RÉPONDRE :**
    - Le total (1 commandant + ${params.targetLands} terrains + ${nonLandSlots} sorts) est-il 100 ?
    - As-tu exactement 25 créatures ?
    - La base de mana est-elle correcte avec ${params.targetLands - 10} terrains de base ?

    **FORMAT DE SORTIE (JSON STRICT) :**
    Réponds UNIQUEMENT avec un objet JSON valide. La structure doit être :
    { "commanders": ["${params.commander}"], "spells": ["Nom de carte", ...], "lands": ["Nom de carte", "Plains", "Island", ...] }
  `;
  // ==================================================================

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            response_mime_type: "application/json",
        },
        // On ajoute un safety setting pour être moins restrictif
        safetySettings: [
            { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
        ]
      }),
    });

    const responseBody = await response.json();

    if (!response.ok) {
      const errorMsg = responseBody?.error?.message || `Erreur API Gemini: ${response.statusText}`;
      throw new Error(errorMsg);
    }

    const generatedText = responseBody?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      // Si la réponse est vide, c'est souvent à cause d'un blocage de sécurité malgré tout.
      if (responseBody?.candidates?.[0]?.finishReason === 'SAFETY') {
          throw new Error("La génération a été bloquée par les filtres de sécurité de l'IA. Essayez un commandant ou des mécaniques différentes.");
      }
      throw new Error("L'IA n'a pas pu générer de deck. Essayez de modifier les paramètres.");
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: generatedText,
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
