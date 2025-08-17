// Fichier: netlify/functions/generate-deck.js (Version avec Prompt Renforcé)

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
  // PROMPT AMÉLIORÉ
  // ==================================================================
  const prompt = `
    Tu es un expert en construction de decks pour le format Commander de Magic: The Gathering. Ta mission est de construire un deck légal, cohérent et optimisé en suivant des règles extrêmement strictes.

    **RÈGLES ABSOLUES ET NON NÉGOCIABLES :**
    1.  **TOTAL DE CARTES** : Le deck final DOIT contenir EXACTEMENT 100 cartes au total. Pas 99, pas 101. Exactement 100.
    2.  **INCLUSION DU COMMANDANT** : Le commandant fourni, "${params.commander}", DOIT être inclus dans la liste "commanders" de ta réponse. Il compte comme 1 carte sur les 100.
    3.  **SINGLETON** : Toutes les cartes, à l'exception des terrains de base (Plains, Island, Swamp, Mountain, Forest), doivent être en un seul exemplaire.
    4.  **IDENTITÉ COULEUR** : Toutes les cartes du deck DOIVENT respecter l'identité couleur de "${params.colorIdentity}".

    **DIRECTIVES DE CONSTRUCTION :**
    - **Commandant** : ${params.commander}
    - **Budget** : Approximativement ${params.budget} EUR. Évite les cartes très chères si des alternatives efficaces existent.
    - **Thèmes/Mécaniques** : Privilégier ${params.mechanics.join(', ') || 'une stratégie générale cohérente avec le commandant'}.
    - **BASE DE MANA** :
        - Vise un total d'environ **${params.targetLands} terrains**.
        - Limite le nombre de terrains **non-basiques** à un maximum de 10 à 15, surtout pour les budgets serrés, afin de garantir la consistance des couleurs. Le reste doit être des terrains de base.
    - **Équilibre du deck** : Assure une bonne courbe de mana, environ 10+ cartes pour l'accélération (ramp), 10+ cartes pour la pioche (draw), et 8-10 cartes pour la gestion des menaces (removal).

    **VÉRIFICATION FINALE AVANT DE RÉPONDRE :**
    - Le total des cartes (commanders + spells + lands) est-il EXACTEMENT 100 ?
    - Le commandant "${params.commander}" est-il bien dans la liste "commanders" ?
    - L'identité couleur est-elle respectée pour chaque carte ?

    **FORMAT DE SORTIE (JSON STRICT) :**
    Réponds UNIQUEMENT avec un objet JSON valide, sans texte ou formatage markdown avant ou après. La structure doit être :
    { "commanders": ["${params.commander}"], "spells": ["Nom de carte", ...], "lands": ["Nom de carte", ...] }
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
