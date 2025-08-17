// Fichier: netlify/functions/generate-deck.js (Version avec Prompt "Anti-Mana Base Folle")

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
  // PROMPT FINAL AMÉLIORÉ
  // ==================================================================
  const prompt = `
    Tu es un expert en construction de decks pour le format Commander de Magic: The Gathering. Ta mission est de construire un deck légal et jouable en suivant des règles extrêmement strictes.

    **RÈGLES ABSOLUES ET NON NÉGOCIABLES :**
    1.  **TOTAL DE CARTES** : Le deck final DOIT contenir EXACTEMENT 100 cartes au total.
    2.  **INCLUSION DU COMMANDANT** : Le commandant, "${params.commander}", DOIT être dans la liste "commanders".
    3.  **SINGLETON** : Toutes les cartes, à l'exception des terrains de base (Plains, Island, Swamp, Mountain, Forest), doivent être en un seul exemplaire.
    4.  **IDENTITÉ COULEUR** : Toutes les cartes DOIVENT respecter l'identité couleur de "${params.colorIdentity}".

    **DIRECTIVES DE CONSTRUCTION :**
    - **Commandant** : ${params.commander}
    - **Budget** : Approximativement ${params.budget} EUR.
    - **Thèmes/Mécaniques** : Privilégier ${params.mechanics.join(', ') || 'une stratégie générale cohérente avec le commandant'}.
    - **Équilibre** : Assure une bonne courbe de mana, environ 10+ cartes pour l'accélération (ramp), 10+ pour la pioche (draw), et 8-10 pour la gestion (removal).

    **CONSTRUCTION DE LA BASE DE MANA (ACTION LA PLUS IMPORTANTE) :**
    1.  Le nombre total de terrains doit être d'environ **${params.targetLands}**.
    2.  Choisis entre **8 et 12 terrains non-basiques** qui sont pertinents et respectent le budget.
    3.  **Calcule** le nombre de terrains restants. Par exemple, si tu vises 37 terrains et que tu as choisi 10 terrains non-basiques, il te reste 37 - 10 = 27 terrains de base à ajouter.
    4.  **Remplis** les places restantes avec les terrains de base appropriés à l'identité couleur. Par exemple, pour une identité "WUG" (Bant), une répartition de 9 Plains, 9 Island, 9 Forest serait correcte.
    5.  **Assure-toi que ces terrains de base sont bien listés** dans la section "lands" de ta réponse finale.

    **VÉRIFICATION FINALE AVANT DE RÉPONDRE :**
    - Le total des cartes (commanders + spells + lands) est-il EXACTEMENT 100 ?
    - Y a-t-il un nombre suffisant de terrains de base ?

    **FORMAT DE SORTIE (JSON STRICT) :**
    Réponds UNIQUEMENT avec un objet JSON valide, sans texte ou formatage markdown avant ou après. La structure doit être :
    { "commanders": ["${params.commander}"], "spells": ["Nom de carte", ...], "lands": ["Nom de carte", "Plains", "Plains", "Plains", "Island", "Island", "Island", ...] }
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
        }
      }),
    });

    const responseBody = await response.json();

    if (!response.ok) {
      const errorMsg = responseBody?.error?.message || `Erreur API Gemini: ${response.statusText}`;
      throw new Error(errorMsg);
    }

    const generatedText = responseBody?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error("L'IA n'a pas pu générer de deck. Essayez de modifier les paramètres.");
    }

    // Petite correction pour gérer les cas où l'IA renvoie les terrains de base avec des quantités
    // au lieu de les répéter, même si on lui demande de les répéter.
    let deckJson;
    try {
        deckJson = JSON.parse(generatedText);
    } catch (e) {
        throw new Error("L'IA a renvoyé un JSON invalide.");
    }

    const finalLands = [];
    for (const land of deckJson.lands) {
        // Gère les formats comme "10x Forest" ou "10 Forest"
        const match = land.match(/^\s*(\d+)\s*x?\s*(Plains|Island|Swamp|Mountain|Forest)\s*$/i);
        if (match) {
            const count = parseInt(match[1], 10);
            const basicLandName = match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase();
            for (let i = 0; i < count; i++) {
                finalLands.push(basicLandName);
            }
        } else {
            finalLands.push(land);
        }
    }
    deckJson.lands = finalLands;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deckJson),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
