// Fichier: netlify/functions/generate-deck.js (Version finale et native)

// On n'a plus besoin de "import fetch from 'node-fetch';" !

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

  const prompt = `
    Tu es un expert mondialement reconnu dans la construction de decks pour le format Commander de Magic: The Gathering.
    Ta mission est de construire le meilleur deck possible en respectant les contraintes suivantes.

    **Contraintes strictes :**
    - Commandant(s) : ${params.commander}
    - Identité couleur : ${params.colorIdentity}
    - Le deck doit contenir exactement 100 cartes, commandant inclus.
    - Le format de sortie doit être UNIQUEMENT un objet JSON valide, sans aucun texte avant ou après, ni formatage markdown.

    **Orientations et préférences :**
    - Budget approximatif : ${params.budget} EUR. Ne choisis pas de cartes excessivement chères si des alternatives moins coûteuses et efficaces existent.
    - Thèmes/Mécaniques à privilégier : ${params.mechanics.join(', ') || 'Aucune préférence particulière'}.
    - Nombre de terrains cibles : Environ ${params.targetLands}. Assure-toi que la base de mana est solide, avec des terrains non-basiques pertinents si le budget le permet.
    - Équilibre du deck : Le deck doit avoir une bonne courbe de mana, suffisamment de pioche (draw), d'accélération de mana (ramp), et de gestion des menaces (removal).

    **Cartes possédées (optionnel) :**
    Si possible, essaie d'inclure des cartes de cette liste si elles sont pertinentes pour la stratégie :
    ${(params.ownedCards || []).slice(0, 100).join(', ')}

    **Format de sortie (JSON uniquement) :**
    Réponds avec un objet JSON qui a la structure suivante : { "commanders": ["Nom de la carte"], "spells": ["Nom de la carte", ...], "lands": ["Nom de la carte", ...] }.
    Ne mets pas les quantités, juste les noms des cartes. Les "spells" incluent créatures, artefacts, etc.
  `;

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
      console.error("Réponse d'erreur de l'API Gemini:", JSON.stringify(responseBody, null, 2));
      const errorMsg = responseBody?.error?.message || `Erreur API Gemini: ${response.statusText}`;
      throw new Error(errorMsg);
    }

    const generatedText = responseBody?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      console.error("La réponse de Gemini est invalide ou vide. Réponse complète:", JSON.stringify(responseBody, null, 2));
      throw new Error("L'IA n'a pas pu générer de deck. Essayez de modifier les paramètres (cela peut être dû à un filtre de sécurité).");
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: generatedText,
    };

  } catch (error) {
    console.error("Erreur dans le bloc try/catch principal:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
