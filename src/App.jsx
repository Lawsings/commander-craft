// Fichier: src/App.jsx (Nettoyé)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw, Shuffle, Copy, Download, Upload, Settings2, Info, Sparkles, Trash2, Sun, Moon } from "lucide-react";
import './index.css';
import {
  MECHANIC_TAGS, RE, sleep, ciMask, identityToQuery, nameOf, oracle,
  isCommanderLegal, getCI, priceEUR,
  sf, bundleCard, bundleByName, primaryTypeLabel, parseCollectionFile,
  fetchCommanderDeckCount, WIN_CONDITIONS, GAME_CHANGERS
} from './utils.js';
import { useCommanderResolution } from './hooks.js';
import CommanderAutocomplete from './components/CommanderAutocomplete.jsx';
import FileDrop from './components/FileDrop.jsx';
import Progress from './components/Progress.jsx';
import CardTile from './components/CardTile.jsx';
import CardModal from './components/CardModal.jsx';

const GenerationModal = ({ progress }) => (
  <div className="generation-modal-overlay">
    <div className="generation-modal-content">
      <h3 className="text-lg font-medium">Construction de votre deck...</h3>
      <p className="text-sm muted mt-2">{progress.step} ({progress.percent}%)</p>
      <div className="generation-progress-bar-bg">
        <div className="generation-progress-bar-fill" style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  </div>
);

export default function App() {
  // THEME
  const initialTheme = useMemo(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
      return 'dark';
    } catch { return 'dark'; }
  }, []);
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { }
  }, [theme]);

  // UI state
  const [error, setError] = useState("");
  const [deck, setDeck] = useState(null);
  const [commanderMode, setCommanderMode] = useState("random");
  const [chosenCommander, setChosenCommander] = useState("");
  const [desiredCI, setDesiredCI] = useState("");
  const [targetLands, setTargetLands] = useState(37);
  const [deckBudget, setDeckBudget] = useState(50);
  const [mechanics, setMechanics] = useState([]);
  const [limitNotice, setLimitNotice] = useState("");
  const [targets, setTargets] = useState({ ramp: { min: 10, max: 12 }, draw: { min: 9, max: 12 }, removal: { min: 8, max: 10 }, wraths: { min: 3, max: 5 } });
  const [ownedMap, setOwnedMap] = useState(new Map());
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalCard, setModalCard] = useState(null);
  const [modalOwned, setModalOwned] = useState(false);
  const [commandersExtraInfo, setCommandersExtraInfo] = useState({});
  const [specialCards, setSpecialCards] = useState({ winCons: new Set(), gameChangers: new Set() });
  const [generationProgress, setGenerationProgress] = useState({ active: false, step: '', percent: 0 });

  const commanderSectionRef = useRef(null);
  const IDENTITY_COLOR_ORDER = ['W', 'B', 'U', 'G', 'R'];

  const selectedCommanderCard = useCommanderResolution(commanderMode, chosenCommander, setDesiredCI, setError);
  const toggleMechanic = (key) => setMechanics(prev => prev.includes(key) ? prev.filter(k => k !== key) : (prev.length >= 3 ? (setLimitNotice("Maximum 3 mécaniques à la fois"), setTimeout(() => setLimitNotice(""), 1500), prev) : [...prev, key]));

  const countCats = (cards) => cards.reduce((a, c) => ({ ramp: a.ramp + (RE.RAMP.test(oracle(c)) ? 1 : 0), draw: a.draw + (RE.DRAW.test(oracle(c)) ? 1 : 0), removal: a.removal + (RE.REMOVAL.test(oracle(c)) ? 1 : 0), wraths: a.wraths + (RE.WRATHS.test(oracle(c)) ? 1 : 0) }), { ramp: 0, draw: 0, removal: 0, wraths: 0 });
  const pickCommander = async (ci) => { if (commanderMode === 'select' && selectedCommanderCard) return selectedCommanderCard; const q = ["legal:commander", "is:commander", "game:paper", "-is:funny", ci ? identityToQuery(ci) : "", "(type:\"legendary creature\" or (type:planeswalker and o:\"can be your commander\") or type:background)"].filter(Boolean).join(" "); for (let i = 0; i < 6; i++) { const c = await sf.random(q); if (!isCommanderLegal(c)) continue; if (oracle(c).includes("companion")) continue; return c; } throw new Error("Impossible de trouver un commandant aléatoire conforme."); };
  async function buildLandCards(landsMap) { const out = []; for (const [n, q] of Object.entries(landsMap)) { try { const b = await bundleByName(n); out.push({ ...b, qty: q }); } catch { out.push({ name: n, qty: q, image: "", small: "", oracle_en: "", mana_cost: "", cmc: 0, prices: {}, scryfall_uri: "" }); } await sleep(60); } return out; }
  const identifySpecialCards = (cards) => {
    const winCons = new Set();
    const gameChangers = new Set();
    cards.forEach(card => {
      const cardName = nameOf(card).toLowerCase();
      if (WIN_CONDITIONS.has(cardName)) winCons.add(nameOf(card));
      if (GAME_CHANGERS.has(cardName) || RE.WRATHS.test(oracle(card))) gameChangers.add(nameOf(card));
    });
    setSpecialCards({ winCons, gameChangers });
  };

  const generate = async () => {
    setError("");
    setDeck(null);
    setCommandersExtraInfo({});
    setSpecialCards({ winCons: new Set(), gameChangers: new Set() });
    setGenerationProgress({ active: true, step: 'Initialisation...', percent: 0 });

    let finalCommanderCard;
    try {
      setGenerationProgress({ active: true, step: 'Sélection du commandant...', percent: 10 });
      finalCommanderCard = (commanderMode === 'select' && selectedCommanderCard) ? selectedCommanderCard : await pickCommander(desiredCI);
    } catch (e) {
      setError(e.message || String(e));
      setGenerationProgress({ active: false, step: '', percent: 0 });
      return;
    }

    const finalCommanderName = nameOf(finalCommanderCard);
    const finalCI = getCI(finalCommanderCard);

    setGenerationProgress({ active: true, step: 'Envoi de la requête à l\'IA...', percent: 25 });

    try {
      const response = await fetch('/.netlify/functions/generate-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commander: finalCommanderName,
          colorIdentity: finalCI,
          budget: Number(deckBudget) || 0,
          mechanics: mechanics,
          ownedCards: Array.from(ownedMap.keys()),
          targetLands: targetLands,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Réponse invalide du serveur.' }));
        throw new Error(err.error || 'La génération du deck a échoué.');
      }

      const aiDeck = await response.json();
      setGenerationProgress({ active: true, step: 'Récupération des données des cartes...', percent: 75 });

      const allNames = [...new Set([...aiDeck.commanders, ...aiDeck.spells, ...aiDeck.lands])];
      const cardObjects = await Promise.all(allNames.map(name => sf.namedExact(name.split('//')[0].trim()).catch(() => null)));
      const validCards = cardObjects.filter(Boolean);

      const commandersFull = validCards.filter(c => aiDeck.commanders.includes(nameOf(c)));
      const nonlandCardsRaw = validCards.filter(c => aiDeck.spells.includes(nameOf(c)));
      const landCardsRaw = validCards.filter(c => aiDeck.lands.includes(nameOf(c)));

      const landsMap = landCardsRaw.reduce((acc, l) => {
          const name = nameOf(l);
          acc[name] = (acc[name] || 0) + 1;
          return acc;
      }, {});

      const spent = validCards.reduce((total, card) => total + priceEUR(card), 0);
      identifySpecialCards(validCards);

      fetchCommanderDeckCount(finalCommanderName).then(deckCount => {
        if(deckCount) setCommandersExtraInfo({ [finalCommanderName]: { deckCount } });
      });

      setGenerationProgress({ active: true, step: 'Finalisation...', percent: 100 });
      await sleep(500);

      setDeck({
        colorIdentity: finalCI,
        commanders: commandersFull.map(nameOf),
        commandersFull: commandersFull.map(bundleCard),
        nonlands: nonlandCardsRaw.reduce((acc, c) => ({...acc, [nameOf(c)]: 1 }), {}),
        nonlandCards: nonlandCardsRaw.map(bundleCard),
        lands: landsMap,
        landCards: await buildLandCards(landsMap),
        budget: Number(deckBudget) || 0,
        spent: Number(spent.toFixed(2)),
        balanceTargets: targets,
        balanceCounts: countCats(nonlandCardsRaw)
      });

    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setGenerationProgress({ active: false, step: '', percent: 0 });
    }
  };

  useEffect(() => {
    if (deck) commanderSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [deck]);

  const download = (filename, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); };
  const exportTxt = () => { if (deck) { const lines = [...deck.commanders.map(c => `1 ${c}`), ...Object.entries(deck.nonlands).map(([n, q]) => `${q} ${n}`), ...Object.entries(deck.lands).map(([n, q]) => `${q} ${n}`)]; download("commander-deck.txt", lines.join("\n")); } };
  const exportJson = () => { if (deck) download("commander-deck.json", JSON.stringify(deck, null, 2)); };
  const copyList = () => { if (!deck) return; const lines = [`// CI: ${deck.colorIdentity || "(Colorless)"} • Budget: ${deck.budget || 0}€ • Coût estimé: ${deck.spent || 0}€`, ...deck.commanders.map(c => `1 ${c} // Commander`), ...Object.entries(deck.nonlands).map(([n, q]) => `${q} ${n}`), ...Object.entries(deck.lands).map(([n, q]) => `${q} ${n}`)]; navigator.clipboard.writeText(lines.join("\n")); };

  const handleCollectionFile = async (f) => { if (!f) return; const parsed = await parseCollectionFile(f); const entry = { id: `${Date.now()}-${Math.random()}`, name: f.name, map: parsed }; setUploadedFiles(prev => { const next = [...prev, entry]; const merged = new Map(); for (const file of next) { for (const [k, q] of file.map) { merged.set(k, (merged.get(k) || 0) + q); } } setOwnedMap(merged); return next; }); };
  const removeUploadedFile = (id) => setUploadedFiles(prev => { const next = prev.filter(x => x.id !== id); const merged = new Map(); for (const file of next) { for (const [k, q] of file.map) { merged.set(k, (merged.get(k) || 0) + q); } } setOwnedMap(merged); return next; });
  const clearCollection = () => { setOwnedMap(new Map()); setUploadedFiles([]); };

  const deckSize = useMemo(() => { if (!deck) return 0; return (deck.commanders?.length || 0) + Object.values(deck?.nonlands || {}).reduce((a, b) => a + b, 0) + Object.values(deck?.lands || {}).reduce((a, b) => a + b, 0); }, [deck]);
  const nonlandsByType = useMemo(() => { if (!deck?.nonlandCards) return {}; const groups = {}; for (const c of deck.nonlandCards) { const k = primaryTypeLabel(c.type_line); (groups[k] ||= []).push(c); } const order = ["Créatures", "Artefacts", "Enchantements", "Éphémères", "Rituels", "Planeswalkers", "Batailles", "Autres"]; const sorted = {}; for (const k of order) { if (groups[k]) sorted[k] = groups[k]; } return sorted; }, [deck]);
  const isOwned = (cardName) => ownedMap.has((cardName || "").toLowerCase());
  const stats = useMemo(() => {
    if (!deck) return null;
    const own = new Map(ownedMap);
    let ownedCount = 0;
    const countOwned = (name, qty) => { const k = name.toLowerCase(); const have = own.get(k) || 0; const used = Math.min(have, qty); if (used > 0) own.set(k, have - used); return used; };
    (deck.commanders || []).forEach(n => ownedCount += countOwned(n, 1));
    Object.entries(deck.nonlands || {}).forEach(([n, q]) => ownedCount += countOwned(n, q));
    Object.entries(deck.lands || {}).forEach(([n, q]) => ownedCount += countOwned(n, q));
    const total = deckSize;
    const ownedPct = total ? Math.round((ownedCount / total) * 100) : 0;
    const cmcCards = [...(deck.commandersFull || []), ...(deck.nonlandCards || [])];
    const avgCmc = cmcCards.length ? (cmcCards.reduce((a, c) => a + (Number(c.cmc) || 0), 0) / cmcCards.length) : 0;
    return { ownedCount, ownedPct, avgCmc: Number(avgCmc.toFixed(2)), typeCounts: Object.fromEntries(Object.entries(nonlandsByType).map(([k, arr]) => [k, arr.length])) };
  }, [deck, ownedMap, deckSize, nonlandsByType]);

  // Le reste du composant JSX reste identique...
  return (
    <div className="min-h-screen">
      {/* ... */}
    </div>
  );
}
