// netlify/functions/generate-deck.js
import OpenAI from "openai";

// ------- CORS (dev cross-origin: localhost -> netlify.app) -------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------- Utils ----------
function ciToArray(ciString = "") {
  return (ciString || "")
    .split("")
    .map((c) => c.toUpperCase())
    .filter((c) => ["W", "U", "B", "R", "G"].includes(c));
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

async function fetchNonBasicLands({ colorIdentity, count }) {
  const ci = (colorIdentity || "").toLowerCase();
  const q = [
    "t:land", "-is:basic", "legal:commander", "game:paper",
    ci ? `ci<=${ci}` : ""
  ].filter(Boolean).join(" ");

  const url = "https://api.scryfall.com/cards/search?q=" +
              encodeURIComponent(q) +
              "&unique=cards&order=edhrec";

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Scryfall lands HTTP ${r.status}`);
  const json = await r.json();
  const names = (json?.data || []).map((c) => c?.name).filter(Boolean);
  return names.slice(0, count);
}

function buildBasicLands({ colorIdentity, basicCount }) {
  const map = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
  const colors = ciToArray(colorIdentity);
  const basics = [];
  if (colors.length === 0) { for (let i=0;i<basicCount;i++) basics.push("Wastes"); return basics; }
  const perColor = Math.floor(basicCount / colors.length);
  let rem = basicCount % colors.length;
  for (const c of colors) {
    for (let i=0;i<perColor;i++) basics.push(map[c]);
    if (rem > 0) { basics.push(map[c]); rem--; }
  }
  return basics;
}

function pickLandTargets(targetLands, colorIdentity) {
  const colors = ciToArray(colorIdentity).length;
  let lands = Number.isFinite(targetLands) ? targetLands : 37;
  lands = clamp(lands, 34, 42);
  let nonBasic = Math.round(lands * (colors <= 1 ? 0.30 : colors === 2 ? 0.65 : colors === 3 ? 0.75 : 0.80));
  if (colors <= 1) nonBasic = clamp(nonBasic, 6, lands - 10);
  else if (colors === 2) nonBasic = clamp(nonBasic, 16, lands - 10);
  else if (colors >= 3) nonBasic = clamp(nonBasic, 22, lands - 8);
  const basic = Math.max(0, lands - nonBasic);
  return { lands, nonBasic, basic };
}

// ---------- Handler ----------
export const handler = async (event) => {
  const DEBUG = process.env.DEBUG_FUNCTION === "1";

  // Pré-vol CORS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...CORS }, body: "" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: { ...CORS }, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const USE_MOCK = process.env.USE_MOCK === "1";

    let payload;
    try { payload = JSON.parse(event.body || "{}"); }
    catch {
      return { statusCode: 400, headers: { ...CORS }, body: JSON.stringify({ error: "Corps JSON invalide." }) };
    }

    const {
      commander,
      colorIdentity,
      budget = 0,
      mechanics = [],
      ownedCards = [],
      targetLands
    } = payload;

    if (!commander || typeof commander !== "string") {
      return { statusCode: 400, headers: { ...CORS }, body: JSON.stringify({ error: "Paramètre 'commander' requis." }) };
    }

    const { lands, nonBasic, basic } = pickLandTargets(targetLands, colorIdentity);
    // Si tu ajoutes Partner plus tard, remplace p
