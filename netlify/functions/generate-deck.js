// Fichier: netlify/functions/generate-deck.js

// On utilise 'node-fetch' pour faire des appels API depuis Node.js
// Il faudra l'installer
import fetch from 'node-fetch';

// Le handler est la fonction principale que Netlify va exécuter
export const handler = async (event) => {
  // 1. On récupère les paramètres envoyés par le frontend
  const {
    commander,
    colorIdentity,
    budget,
    mechanics,
    ownedCards, // On va envoyer une liste de cartes possédées
    targetLands
  } = JSON.parse(event.body);

  const apiKey = process.env.GEMINI_API_KEY;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

  // 2. On construit le "Prompt", notre instruction pour l'IA
  // C'est la partie la plus importante !
  const prompt = `
    Tu es un expert mondialement reconnu dans la construction de decks pour le format Commander de Magic: The Gathering.
    Ta mission est de construire le meilleur deck possible en respectant les contraintes suivantes.

    **Contraintes strictes :**
    - Commandant(s) : ${commander}
    - Identité couleur : ${colorIdentity}
    - Le deck doit contenir exactement 100 cartes, commandant inclus.
    - Le format de sortie doit être UNIQUEMENT un objet JSON valide, sans aucun texte avant ou après.

    **Orientations et préférences :**
    - Budget approximatif : ${budget} EUR. Ne choisis pas de cartes excessivement chères si des alternatives moins coûteuses et efficaces existent.
    - Thèmes/Mécaniques à privilégier : ${mechanics.join(', ') || 'Aucune préférence particulière'}.
    - Nombre de terrains cibles : Environ ${targetLands}. Assure-toi que la base de mana est solide, avec des terrains non-basiques pertinents si le budget le permet.
    - Équilibre du deck : Le deck doit avoir une bonne courbe de mana, suffisamment de pioche (draw), d'accélération de mana (ramp), et de gestion des menaces (removal).

    **Cartes possédées (optionnel) :**
    Si possible, essaie d'inclure des cartes de cette liste si elles sont pertinentes pour la stratégie :
    ${ownedCards.slice(0, 100).join(', ')}

    **Format de sortie (JSON uniquement) :**
    Réponds avec un objet JSON qui a la structure suivante : { "commanders": ["Nom de la carte"], "spells": ["Nom de la carte", ...], "lands": ["Nom de la carte", ...] }.
    Ne mets pas les quantités, juste les noms des cartes. Les "spells" incluent créatures, artefacts, etc.
  `;

  try {
    // 3. On appelle l'API Gemini
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

    if (!response.ok) {
      throw new Error(`Erreur API Gemini: ${response.statusText}`);
    }

    const data = await response.json();

    // 4. On renvoie la réponse de l'IA au frontend
    // La réponse JSON de Gemini est dans `data.candidates[0].content.parts[0].text`
    return {
      statusCode: 200,
      body: data.candidates[0].content.parts[0].text,
    };

  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
