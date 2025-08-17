// Fichier: netlify/functions/generate-deck.js (Version finale avec votre analyse experte)

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
  // INTÉGRATION DE VOTRE ANALYSE EXPERTE DANS LE PROMPT
  // ==================================================================

  // 1. Déterminer le nombre de couleurs
  const colorCount = params.colorIdentity.length;
  let landBlueprint;

  // 2. Créer le "Blueprint" de la base de mana dynamiquement
  const totalLands = params.targetLands;
  if (colorCount <= 1) {
    const baseLands = Math.round(totalLands * 0.85); // 85% terrains de base
    const nonBaseLands = totalLands - baseLands;
    landBlueprint = `
    - **Base de Mana (Monocolore) : ${totalLands} terrains**
    - Choisis **${nonBaseLands}** terrains non-basiques "utilitaires" (ex: Tour du Reliquaire, Nykthos).
    - Remplis les **${baseLands}** places restantes avec le terrain de base approprié.`;
  } else if (colorCount === 2) {
    const baseLands = Math.round(totalLands * 0.50); // 50% terrains de base
    const nonBaseLands = totalLands - baseLands;
    landBlueprint = `
    - **Base de Mana (Bicolore) : ${totalLands} terrains**
    - Choisis **${nonBaseLands}** terrains non-basiques qui produisent les deux couleurs (bi-lands, etc.).
    - Remplis les **${baseLands}** places restantes avec une répartition équilibrée de terrains de base.`;
  } else if (colorCount === 3) {
    const baseLands = Math.round(totalLands * 0.33); // 33% terrains de base
    const nonBaseLands = totalLands - baseLands;
    landBlueprint = `
    - **Base de Mana (Tricolore) : ${totalLands} terrains**
    - Choisis **${nonBaseLands}** terrains non-basiques qui produisent plusieurs couleurs (triomes, shock lands, etc.).
    - Remplis les **${baseLands}** places restantes avec une petite répartition de chaque terrain de base (environ ${Math.floor(baseLands / 3)} de chaque).`;
  } else { // 4 ou 5 couleurs
    const baseLands = Math.round(totalLands * 0.15); // 15% terrains de base
    const nonBaseLands = totalLands - baseLands;
    landBlueprint = `
    - **Base de Mana (4-5 Couleurs) : ${totalLands} terrains**
    - La base de mana doit être composée presque exclusivement de **${nonBaseLands}** terrains non-basiques produisant plusieurs couleurs.
    - N'inclus qu'un ou deux terrains de base de chaque couleur, pour un total de **${baseLands}** terrains de base.`;
  }

  const nonLandSlots = 99 - totalLands;
  const creatureSlots = Math.round(nonLandSlots * 0.45); // ~30% du deck total
  const interactionSlots = Math.round(nonLandSlots * 0.30); // ~20% du deck
  const rampDrawSlots = Math.round(nonLandSlots * 0.30); // ~20% du deck

  const prompt = `
    Tu es un expert en construction de decks pour le format Commander de Magic: The Gathering, et tu dois suivre un plan de construction très précis basé sur une analyse professionnelle.

    **RÈGLES ABSOLUES :**
    1.  **TOTAL DE CARTES** : Exactement 100.
    2.  **COMMANDANT** : "${params.commander}" doit être dans la liste "commanders".
    3.  **SINGLETON** : Un seul exemplaire de chaque carte, sauf les terrains de base.
    4.  **IDENTITÉ COULEUR** : Respecter l'identité de "${params.colorIdentity}".

    ---

    **PLAN DE CONSTRUCTION DU DECK :**

    **PARTIE 1 : LA BASE DE MANA (${totalLands} terrains)**
    Tu dois suivre ces instructions à la lettre :
    ${landBlueprint}

    **PARTIE 2 : LES SORTS (${nonLandSlots} sorts)**
    Tu dois respecter la répartition suivante :
    - **Créatures (${creatureSlots} cartes) :** Choisis des créatures synergiques.
    - **Accélération & Pioche (~${rampDrawSlots} cartes) :** Vise environ 10-12 cartes pour l'accélération de mana (Ramp) et 10-12 pour la pioche (Draw).
    - **Interaction (~${interactionSlots} cartes) :** Vise environ 8-10 cartes de gestion ciblée (Removal) et 3-5 nettoyages de table (Board Wipes).
    - Le reste des places doit être utilisé pour des cartes qui supportent les thèmes/mécaniques de "${params.mechanics.join(', ') || 'la stratégie générale'}".

    ---

    **VÉRIFICATION FINALE AVANT DE RÉPONDRE :**
    - Le total des cartes est-il 100 ?
    - La base de mana correspond-elle au plan pour un deck à ${colorCount} couleur(s) ?
    - La répartition des sorts est-elle respectée ?

    **FORMAT DE SORTIE (JSON STRICT) :**
    Réponds UNIQUEMENT avec un objet JSON. La structure doit être :
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
