// netlify/functions/random-commander.js
exports.handler = async (event) => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  // Pré-vol CORS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  try {
    const DEFAULT_Q =
      'legal:commander is:commander game:paper -is:funny (type:"legendary creature" or (type:planeswalker and o:"can be your commander") or type:background)';

    const q =
      (event.queryStringParameters && event.queryStringParameters.q) ||
      DEFAULT_Q;

    const url =
      "https://api.scryfall.com/cards/random?q=" + encodeURIComponent(q);

    const resp = await fetch(url);
    const body = await resp.text(); // on renvoie tel quel (JSON texte)

    return {
      statusCode: resp.status,
      headers: { "Content-Type": "application/json", ...CORS },
      body,
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({
        error: "PROXY_FAILED",
        message: e.message || String(e),
      }),
    };
  }
};
