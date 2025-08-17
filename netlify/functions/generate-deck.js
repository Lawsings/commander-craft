// Fichier: netlify/functions/generate-deck.js (Version de débogage pour la clé API)

export const handler = async (event) => {
  // On ne fait aucun import pour l'instant pour être sûr que ça ne plante pas.

  const apiKey = process.env.GEMINI_API_KEY;

  // On crée un message de statut basé sur la présence de la clé.
  const status = {
    message: "Résultat du test de la variable d'environnement GEMINI_API_KEY.",
    cleApiEstTrouvee: !!apiKey, // sera true ou false
    previewDeLaCle: apiKey ? `${apiKey.substring(0, 4)}...${apiKey.slice(-4)}` : "Non définie"
  };

  // On renvoie un statut 200 (succès) avec les informations de débogage.
  // De cette façon, ça ne plantera pas et vous verrez ce message.
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(status),
  };
};
