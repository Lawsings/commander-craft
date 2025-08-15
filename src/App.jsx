import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw, Shuffle, Copy, Download, Upload, Settings2, Info, Sparkles, Trash2, Sun, Moon } from "lucide-react";

/**
 * MTG Commander Deck Generator — v6.6
 *
 * Changes from v6.5 (mobile-only UX earlier) + NEW:
 *  - Functional Dark / Light mode toggle with persistence (localStorage) and system default.
 *  - No desktop layout changes; the toggle is just an extra header action button.
 */

/***************** Theme (Glass) with Dark/Light *****************/
const THEME_CSS = `
  :root{
    --halo:#171717;
    --bg0:#000; --bg1:#0b0b0b; --panel:rgba(255,255,255,.08); --panel-strong:rgba(255,255,255,.12);
    --border:rgba(255,255,255,.18); --text:#fff; --muted:rgba(255,255,255,.65);
    --btn-bg:rgba(255,255,255,.08); --btn-hover-bg:rgba(255,255,255,.16); --btn-active-bg:rgba(255,255,255,.28); --btn-active-ring:rgba(255,255,255,.65);
    --primary:#fff; --primary-text:#111; --warn:#f59e0b;
  }

  /* Light overrides when [data-theme="light"] on <html> */
  [data-theme="light"]{
    --bg0:#ffffff; --bg1:#f7f7f7; --panel:rgba(0,0,0,.04); --panel-strong:rgba(0,0,0,.08);
    --border:rgba(0,0,0,.18); --text:#111; --muted:rgba(0,0,0,.65);
    --btn-bg:rgba(0,0,0,.06); --btn-hover-bg:rgba(0,0,0,.12); --btn-active-bg:rgba(0,0,0,.18); --btn-active-ring:rgba(0,0,0,.55);
    --primary:#111; --primary-text:#fff; --warn:#d97706; --halo:#ffffff;
  }

  html,body,#root{ background: radial-gradient(1200px 1200px at 20% -10%, var(--halo), var(--bg0) 60%), linear-gradient(160deg, var(--bg1), var(--bg0)); color:var(--text); }
  .glass{ background:var(--panel); -webkit-backdrop-filter:saturate(130%) blur(14px); backdrop-filter:saturate(130%) blur(14px); border:1px solid var(--border); border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,.35) inset, 0 20px 40px rgba(0,0,0,.35); }
  .glass-strong{ background:var(--panel-strong); }
  .muted{ color:var(--muted); }
  .btn{ display:inline-flex; align-items:center; gap:8px; background:var(--btn-bg); border:1px solid var(--border); color:var(--text); border-radius:12px; padding:10px 14px; transition:background .15s, filter .15s, box-shadow .15s, transform .04s; }
  .btn:hover{ background:var(--btn-hover-bg); }
  .btn:focus-visible{ outline:none; box-shadow:0 0 0 2px rgba(0,0,0,.6), 0 0 0 3px var(--btn-active-ring); }
  .btn:active{ transform:translateY(1px); }
  .btn.glass-strong{ background:var(--btn-active-bg); border-color:rgba(255,255,255,.5); box-shadow:0 0 0 1px rgba(255,255,255,.35), 0 6px 18px rgba(255,255,255,.12) inset; }
  .btn.glass-strong:hover{ background:rgba(255,255,255,.34); }
  .btn-primary{ display:inline-flex; align-items:center; gap:8px; background:var(--primary); color:var(--primary-text); border:1px solid rgba(0,0,0,.12); border-radius:16px; padding:10px 16px; box-shadow:0 6px 20px rgba(255,255,255,.12); }
  .btn-primary:hover{ filter:brightness(.95); }
  .btn-primary:focus-visible{ outline:none; box-shadow:0 0 0 3px #000, 0 0 0 5px rgba(255,255,255,.85); }
  .input{ background:rgba(255,255,255,.06); border:1px solid var(--border); color:var(--text); border-radius:10px; padding:8px 10px; }
  .input::placeholder{ color:rgba(255,255,255,.45); }
  .list{ background:rgba(0,0,0,.7); border:1px solid var(--border); border-radius:12px; }
  .autocomplete-list{ max-height:228px; overflow-y:auto; }
  .bar-bg{ background:rgba(255,255,255,.08); height:8px; border-radius:999px; overflow:hidden; }
  .bar-fill{ background:linear-gradient(90deg,#fff,rgba(255,255,255,.7)); height:8px; }
  .dropzone{ border:2px dashed rgba(255,255,255,.45); background:rgba(255,255,255,.04); border-radius:16px; padding:22px; text-align:center; cursor:pointer; transition:background .15s, border-color .15s, box-shadow .15s; }
  .dropzone:hover{ background:rgba(255,255,255,.08); }
  .dropzone.drag{ background:rgba(255,255,255,.12); border-color:rgba(255,255,255,.85); box-shadow:0 0 0 3px rgba(255,255,255,.2) inset; }
  .sr-only{ position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  .mana{ display:inline-flex; align-items:center; gap:4px; }
  .badge{ position:absolute; top:4px; right:4px; background:rgba(0,0,0,.7); color:#fff; font-size:11px; padding:2px 6px; border-radius:999px; border:1px solid rgba(255,255,255,.2) }

  /* ===== Mobile-only UX tweaks ===== */
  @media (max-width: 767px){
    .header-wrap{ display:flex; flex-direction:column; align-items:flex-start; gap:12px; }
    .header-actions{ width:100%; display:grid; grid-template-columns: 1fr; gap:8px; }
    .header-actions .btn, .header-actions .btn-primary{ width:100%; justify-content:center; }
    .section-anchor{ scroll-margin-top: 12px; }
  }

  /* Respect reduced motion for the auto-scroll */
  @media (prefers-reduced-motion: reduce){
    .smooth-scroll-disabled{ scroll-behavior: auto !important; }
  }
`;

/***************** Utils & Const *****************/
const COLORS = ["W","U","B","R","G"];
const MECHANIC_TAGS = [
  { key:"blink", label:"Blink / Flicker", matchers:["exile then return","flicker","phase out","enters the battlefield ","blink"] },
  { key:"tokens", label:"Tokens", matchers:["create a token","token"] },
  { key:"sacrifice", label:"Sacrifice", matchers:["sacrifice a","whenever you sacrifice","devour","exploit"] },
  { key:"lifegain", label:"Gain de vie", matchers:["you gain","lifelink","whenever you gain life"] },
  { key:"spellslinger", label:"Spellslinger", matchers:["instant or sorcery","prowess","magecraft","copy target instant","storm"] },
  { key:"+1+1", label:"+1/+1 Counters", matchers:["+1/+1 counter","proliferate","evolve"] },
  { key:"reanimator", label:"Réanimation", matchers:["return target creature card from your graveyard","reanimate","unearth","persist","undying"] },
  { key:"landfall", label:"Landfall / Terrains", matchers:["landfall","whenever a land enters the battlefield under your control","search your library for a land"] },
  { key:"artifacts", label:"Artifacts", matchers:["artifact you control","improvise","affinity for artifacts","create a Treasure"] },
  { key:"enchantress", label:"Enchantements", matchers:["enchantment spell","constellation","aura","enchantress"] },
];
const RE = {
  RAMP: /(add \{|search your library for a land|treasure token)/i,
  DRAW: /(draw a card|draw two cards|whenever you draw a card)/i,
  REMOVAL: /(destroy target|exile target|counter target|fight target)/i,
  WRATHS: /(destroy all creatures|exile all creatures|all creatures get)/i,
};

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const ciMask = (s)=> s.split("").filter(Boolean).sort().join("");
const identityToQuery = (ci)=> `ci<=${(ci||"").toLowerCase()}`;
const nameOf = (c)=> c?.name?.trim?.()||"";
const oracle = (c)=> (c?.oracle_text||"").toLowerCase();
const isCommanderLegal = (c)=> c?.legalities?.commander === "legal";
const getCI = (c)=> ciMask((c?.color_identity||[]).join(""));
const unionCI = (a,b)=> ciMask(Array.from(new Set([...(a||"").split(""), ...(b||"").split("")])).join(""));
const priceEUR = (c)=>{ const e=Number(c?.prices?.eur); const f=Number(c?.prices?.eur_foil); return isNaN(e)?(isNaN(f)?0:f):e; };
const edhrecScore = (c)=>{ const r=Number(c?.edhrec_rank)||0; const cap=100000; return r?Math.max(0,1-Math.min(r,cap)/cap):0; };
const distinctBy = (keyFn)=> (arr)=>{ const s=new Set(); return arr.filter(x=>{ const k=keyFn(x); if(s.has(k)) return false; s.add(k); return true;}); };
const distinctByOracle = distinctBy((c)=> c?.oracle_id||c?.id||nameOf(c));
const distinctByName = distinctBy((c)=> nameOf(c));

/***************** Scryfall API *****************/
const sf = {
  async search(q, opts={}){ const params=new URLSearchParams({q, unique:opts.unique||"cards", order:opts.order||"random"}); const r=await fetch(`https://api.scryfall.com/cards/search?${params}`); if(!r.ok) throw new Error(`Scryfall ${r.status}`); return r.json(); },
  async random(q){ const r=await fetch(`https://api.scryfall.com/cards/random?q=${encodeURIComponent(q)}`); if(!r.ok) throw new Error(`Scryfall ${r.status}`); return r.json(); },
  async namedExact(n){ const r=await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(n)}`); if(!r.ok) throw new Error(`Nom introuvable: ${n}`); return r.json(); },
};

/***************** Mana Cost (colored circles with labels) *****************/
const COLOR_HEX = { W:'#fffcd5', U:'#cce6ff', B:'#d6ccff', R:'#ffd6cc', G:'#d5ffd6', C:'#cccccc', X:'#cccccc', S:'#b9d9ff' };
const isDigit = (s)=> /^\d+$/.test(s);
const tokenizeMana = (cost)=> (cost? (cost.match(/\{[^}]+\}/g)||[]).map(x=>x.slice(1,-1)) : []);
const normalize = (tok)=> tok.toUpperCase().replace(/\s+/g,'');
const partsOf = (tok)=> normalize(tok).split('/');
function ManaDot({label, colors}){
  const bg = colors.length===1
    ? { backgroundColor: colors[0] }
    : { backgroundImage: `linear-gradient(135deg, ${colors[0]} 0 50%, ${colors[1]} 50% 100%)` };
  const fs = label.length>=3 ? 8 : 10;
  return (
    <span title={`{${label}}`} style={{position:'relative',display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:'50%',border:'1px solid #333',fontSize:fs,fontWeight:800,color:'#000'}}>
      <span style={{position:'absolute',inset:0,borderRadius:'50%',...bg}}/>
      <span style={{position:'relative'}}>{label}</span>
    </span>
  );
}
function colorsForToken(tok){
  const parts = partsOf(tok);
  if(parts.length===1){
    const p = parts[0];
    if(isDigit(p)) return ['#dddddd']; // colorless N
    if(p.endsWith('P')) return [COLOR_HEX[p[0]]||'#eeeeee']; // Phyrexian (e.g., G/P)
    return [COLOR_HEX[p]||'#eeeeee'];
  }
  const colors = parts.filter(x=>!isDigit(x) && x!=='P').map(x=> COLOR_HEX[x] || '#eeeeee');
  if(colors.length>=2) return colors.slice(0,2);
  if(colors.length===1) return [colors[0]];
  return ['#dddddd'];
}
function ManaCost({cost}){
  const toks = tokenizeMana(cost);
  if(!toks.length) return null;
  return (
    <span className="mana">
      {toks.map((t,i)=> <ManaDot key={i} label={normalize(t)} colors={colorsForToken(t)}/>)}
    </span>
  );
}

/***************** Hooks *****************/
function useInjectCss(css){
  useEffect(()=>{ const st=document.createElement('style'); st.innerHTML=css; document.head.appendChild(st); return ()=>document.head.removeChild(st); },[css]);
}
function useCommanderResolution(mode, chosen, setCI, setError){
  const [card,setCard]=useState(null);
  useEffect(()=>{ let ok=true; (async()=>{
    if(mode!=="select"||!chosen){ setCard(null); return; }
    try{ const c=await resolveCommanderByAnyName(chosen); if(!ok) return; if(!isCommanderLegal(c)) throw new Error("Commandant illégal en EDH"); setCard(c); setCI(getCI(c)); }
    catch(e){ if(ok){ setCard(null); setError(String(e.message||e)); }}
  })(); return ()=>{ok=false}; },[mode, chosen]);
  return card;
}

/***************** Autocomplete *****************/
async function searchCommandersAnyLang(q){
  const base = `legal:commander (type:\"legendary creature\" or (type:planeswalker and o:\"can be your commander\") or type:background) name:${q}`;
  const [en, fr] = await Promise.all([
    sf.search(`${base} unique:prints order:edhrec`),
    sf.search(`${base} lang:fr unique:prints order:edhrec`)
  ]);
  const pool = distinctByOracle([...(en.data||[]), ...(fr.data||[])]).slice(0, 20);
  return pool.map(card=>({
    id: card.id, oracle_id: card.oracle_id,
    display: card.printed_name || card.name, canonical: card.name, type_line: card.type_line,
    image: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || card.card_faces?.[1]?.image_uris?.small || "",
    raw: card,
  }));
}
function CommanderAutocomplete({ value, onSelect }){
  const [query,setQuery]=useState(value||"");
  const [sugs,setSugs]=useState([]);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const boxRef = useRef(null);
  useEffect(()=>{ function onDoc(e){ if(boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);} document.addEventListener('mousedown', onDoc); return ()=>document.removeEventListener('mousedown', onDoc); },[]);
  useEffect(()=>{ const q=query.trim(); if(q.length<2){ setSugs([]); setOpen(false); return; } const ac=new AbortController(); const run=async()=>{ setLoading(true); try{ const items=await searchCommandersAnyLang(q); setSugs(items); setOpen(true);}catch(e){ if(e.name!=="AbortError"){ setSugs([]); setOpen(false);} } finally{ setLoading(false);} }; const t=setTimeout(run,220); return ()=>{ ac.abort(); clearTimeout(t); }; },[query]);
  return (
    <div className="relative" ref={boxRef}>
      <label className="block mb-1 text-sm muted">Commandant (FR ou EN)</label>
      <input className="w-full input focus:outline-none focus:ring-2 focus:ring-white/50" placeholder="Ex: Etali, tempête primordiale / Etali, Primal Storm" value={query} onChange={e=>{setQuery(e.target.value); setOpen(true);}}/>
      {open && (
        <div className="absolute z-20 mt-2 w-full list shadow-2xl autocomplete-list">
          {loading && <div className="px-3 py-2 text-sm muted">Recherche…</div>}
          {!loading && sugs.length===0 && <div className="px-3 py-2 text-sm muted">Aucun commandant trouvé</div>}
          {!loading && sugs.map(s=> (
            <button key={s.id} className="w-full text-left px-3 py-2 list-item flex items-center gap-3" onClick={()=>{ onSelect(s.display); setQuery(s.display); setOpen(false); }}>
              {s.image ? (<img src={s.image} alt="" className="w-10 h-14 object-cover rounded"/>) : (<div className="w-10 h-14 glass-strong"/>) }
              <div>
                <div>{s.display}</div>
                <div className="text-[11px] muted">{s.type_line}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/***************** Upload (Dropzone) *****************/
function FileDrop({ onFiles }){
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const openPicker = ()=> inputRef.current?.click();
  const handleChange = (e)=> { const files = Array.from(e.target.files||[]); if(files.length) onFiles(files); e.target.value=""; };
  const onDragOver = (e)=>{ e.preventDefault(); setDrag(true); };
  const onDragLeave = (e)=>{ e.preventDefault(); setDrag(false); };
  const onDrop = (e)=>{ e.preventDefault(); setDrag(false); const files = Array.from(e.dataTransfer?.files||[]); if(files.length) onFiles(files); };
  return (
    <div className={`dropzone ${drag? 'drag':''}`} onClick={openPicker} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <div className="flex flex-col items-center gap-2">
        <Upload className="h-6 w-6"/>
        <div className="text-sm font-medium">Cliquer pour choisir des fichiers</div>
        <div className="text-xs muted">… ou dépose-les ici (TXT, CSV/TSV, JSON)</div>
        <button type="button" className="mt-3 btn-primary">Importer ma collection</button>
      </div>
      <input ref={inputRef} type="file" accept=".txt,.csv,.tsv,.tab,.json" className="sr-only" multiple onChange={handleChange}/>
    </div>
  );
}

/***************** UI Bits *****************/
function Progress({label, value, targetMin, targetMax}){ const pct=Math.min(100, Math.round((value/Math.max(1,targetMin))*100)); return (
  <div>
    <div className="flex justify-between text-xs mb-1"><span>{label}</span><span className="muted">{value} / {targetMin}–{targetMax}</span></div>
    <div className="bar-bg"><div className="bar-fill" style={{width:`${pct}%`}}/></div>
  </div>
); }
function CardTile({card, onOpen, qty, owned}){
  return (
    <button className="relative glass-strong rounded-lg p-2 flex gap-3 text-left hover:bg-white/15" onClick={()=>onOpen(card, owned)}>
      {qty ? <span className="badge">x{qty}</span> : null}
      {card.small ? (
        <img src={card.small} alt={card.name} className="w-12 h-16 object-cover rounded"/>
      ) : (
        <div className="w-12 h-16 glass-strong rounded"/>
      )}
      <div className="min-w-0">
        <div className="truncate font-medium flex items-center gap-1">
          <span className="truncate">{card.name}</span>
          {owned && (
            <span style={{ color:'limegreen', fontWeight:'bold' }} title="Carte présente dans votre collection">✓</span>
          )}
        </div>
        {card.mana_cost && <div className="text-xs muted"><ManaCost cost={card.mana_cost}/></div>}
      </div>
    </button>
  );
}
function CardModal({open, card, owned, onClose}){
  if(!open||!card) return null;
  const price = (Number(card.prices?.eur)||Number(card.prices?.eur_foil)||0).toFixed(2);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[#111] border border-white/20 rounded-2xl max-w-3xl w-full grid md:grid-cols-2 gap-4 p-4" onClick={(e)=>e.stopPropagation()}>
        {card.image && <img src={card.image} alt={card.name} className="w-full rounded-lg object-cover" />}
        <div className="space-y-2 min-w-0">
          <h4 className="text-xl font-semibold flex items-center gap-2">
            {card.name}
            {owned && (<span style={{ color:'limegreen', fontWeight:'bold' }} title="Carte présente dans votre collection">✓</span>)}
          </h4>
          {card.mana_cost && <div className="text-sm"><ManaCost cost={card.mana_cost}/></div>}
          {card.oracle_en && <div className="text-sm whitespace-pre-line">{card.oracle_en}</div>}
          <div className="text-sm muted">Prix estimé: {price}€</div>
          {card.scryfall_uri && <a href={card.scryfall_uri} target="_blank" rel="noreferrer" className="btn inline-flex">Voir sur Scryfall</a>}
        </div>
      </div>
    </div>
  );
}

/***************** Cards helpers *****************/
function bundleCard(c){
  const f = c.card_faces||[];
  const face = (i)=> f[i]?.image_uris?.normal || f[i]?.image_uris?.large || f[i]?.image_uris?.small || "";
  return {
    name: nameOf(c),
    type_line: c.type_line || f[0]?.type_line || "",
    image: c.image_uris?.normal || c.image_uris?.large || face(0) || face(1) || "",
    small: c.image_uris?.small || f[0]?.image_uris?.small || f[1]?.image_uris?.small || "",
    oracle_en: c.oracle_text || f.map(x=>x.oracle_text).filter(Boolean).join('\n'),
    mana_cost: c.mana_cost || f.map(x=>x.mana_cost).filter(Boolean).join(' / '),
    cmc: typeof c.cmc==='number'? c.cmc : (Number(c.cmc)||0),
    prices: c.prices || {},
    scryfall_uri: c.scryfall_uri || c.related_uris?.gatherer || ''
  };
}
async function bundleByName(name){ const c = await sf.namedExact(name); return bundleCard(c); }
const primaryTypeLabel = (tl)=>{
  const t=(tl||"").toLowerCase();
  if(t.includes("creature")) return "Créatures";
  if(t.includes("artifact")) return "Artefacts";
  if(t.includes("enchantment")) return "Enchantements";
  if(t.includes("instant")) return "Éphémères";
  if(t.includes("sorcery")) return "Rituels";
  if(t.includes("planeswalker")) return "Planeswalkers";
  if(t.includes("battle")) return "Batailles";
  if(t.includes("land")) return "Terrains";
  return "Autres";
};

/***************** App *****************/
export default function App(){
  useInjectCss(THEME_CSS);

  // THEME: persist + system default; no layout change
  const initialTheme = useMemo(()=>{
    try{
      const saved = localStorage.getItem('theme');
      if(saved==='dark' || saved==='light') return saved;
      if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
      return 'dark';
    }catch{ return 'dark'; }
  },[]);
  const [theme,setTheme] = useState(initialTheme);
  useEffect(()=>{
    document.documentElement.setAttribute('data-theme', theme);
    try{ localStorage.setItem('theme', theme); }catch{}
  },[theme]);

  // UI state
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [deck,setDeck]=useState(null);
  const [commanderMode,setCommanderMode]=useState("random");
  const [chosenCommander,setChosenCommander]=useState("");
  const [allowPartner,setAllowPartner]=useState(true);
  const [allowBackground,setAllowBackground]=useState(true);
  const [desiredCI,setDesiredCI]=useState("");
  const [targetLands,setTargetLands]=useState(37);
  const [deckBudget,setDeckBudget]=useState(0);
  const [mechanics,setMechanics]=useState([]);
  const [limitNotice,setLimitNotice]=useState("");
  const [weightOwned,setWeightOwned]=useState(1.0);
  const [weightEdhrec,setWeightEdhrec]=useState(1.0);
  const [targets,setTargets]=useState({ ramp:{min:10,max:12}, draw:{min:9,max:12}, removal:{min:8,max:10}, wraths:{min:3,max:5} });
  const [ownedMap,setOwnedMap]=useState(new Map());
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalCard, setModalCard] = useState(null);
  const [modalOwned, setModalOwned] = useState(false);

  // NEW: section ref for auto-scroll (mobile only)
  const commanderSectionRef = useRef(null);

  // Commander (resolved when select mode)
  const selectedCommanderCard = useCommanderResolution(commanderMode, chosenCommander, setDesiredCI, setError);
  const toggleMechanic=(key)=> setMechanics(prev=> prev.includes(key)? prev.filter(k=>k!==key) : (prev.length>=3?(setLimitNotice("Maximum 3 mécaniques à la fois"), setTimeout(()=>setLimitNotice(""),1500), prev):[...prev,key]));

  /*********** Generation ***********/
  const mechanicScore=(card)=> mechanics.length? MECHANIC_TAGS.reduce((s,m)=> s + (mechanics.includes(m.key) && m.matchers.some(k=>oracle(card).includes(k.toLowerCase()))?1:0), 0) : 0;
  const sortByPreference=(pool)=>{ const rb=new Map(pool.map(c=>[nameOf(c), Math.random()])); return [...pool].sort((a,b)=>{ const owA=ownedMap.has(nameOf(a).toLowerCase())?1:0, owB=ownedMap.has(nameOf(b).toLowerCase())?1:0; const sa=weightOwned*owA + weightEdhrec*edhrecScore(a) + 0.25*mechanicScore(a); const sb=weightOwned*owB + weightEdhrec*edhrecScore(b) + 0.25*mechanicScore(b); if(sa!==sb) return sb-sa; const pA=priceEUR(a), pB=priceEUR(b); return pA!==pB? pA-pB : rb.get(nameOf(a))-rb.get(nameOf(b)); }); };
  const greedyPickUnique=(sortedPool, need, banned, currentCost, budget)=>{ const picks=[]; const taken=new Set(banned); let cost=currentCost; for(const c of sortedPool){ if(picks.length>=need) break; const n=nameOf(c); if(taken.has(n)) continue; const p=priceEUR(c); if(budget>0 && (cost+p)>budget) continue; picks.push(c); taken.add(n); cost+=p; } return {picks,cost}; };
  const buildManaBase=(ci, basicTarget)=>{ const colors=(ci||"").split(""); const basicsByColor={W:"Plains",U:"Island",B:"Swamp",R:"Mountain",G:"Forest"}; if(colors.length===0) return { Wastes: basicTarget }; const per=Math.floor(basicTarget/colors.length); let rem=basicTarget - per*colors.length; const lands={}; for(const c of colors){ const n=basicsByColor[c]; lands[n]=per+(rem>0?1:0); rem--; } return lands; };
  const countCats=(cards)=> cards.reduce((a,c)=>({ ramp:a.ramp+(RE.RAMP.test(oracle(c))||((c.type_line||'').toLowerCase().includes('artifact')&&oracle(c).includes('add one mana'))?1:0), draw:a.draw+(RE.DRAW.test(oracle(c))?1:0), removal:a.removal+(RE.REMOVAL.test(oracle(c))?1:0), wraths:a.wraths+(RE.WRATHS.test(oracle(c))?1:0)}),{ramp:0,draw:0,removal:0,wraths:0});
  const balanceSpells=(picks, pool, budget, spent)=>{ const TARGETS={ ramp:targets.ramp.min, draw:targets.draw.min, removal:targets.removal.min, wraths:targets.wraths.min }; const byName=new Set(picks.map(nameOf)); const counts=countCats(picks); const sorted=sortByPreference(pool); const fits=(cat,c)=> (cat==='ramp'&&RE.RAMP.test(oracle(c)))||(cat==='draw'&&RE.DRAW.test(oracle(c)))||(cat==='removal'&&RE.REMOVAL.test(oracle(c)))||(cat==='wraths'&&RE.WRATHS.test(oracle(c))); const res=[...picks]; for(const cat of Object.keys(TARGETS)){ if(counts[cat]>=TARGETS[cat]) continue; for(const c of sorted){ const n=nameOf(c); if(byName.has(n)) continue; const p=priceEUR(c); if(budget>0 && (spent+p)>budget) continue; if(!fits(cat,c)) continue; const idx=res.findIndex(x=>!fits(cat,x)); if(idx>=0){ byName.delete(nameOf(res[idx])); res[idx]=c; byName.add(n); counts[cat]++; spent+=p; } if(counts[cat]>=TARGETS[cat]) break; } } return {picks:res,spent,targets:TARGETS,counts}; };
  const pickCommander=async(ci)=>{ if (commanderMode==='select' && selectedCommanderCard) return selectedCommanderCard; const q=["legal:commander","is:commander","game:paper","-is:funny", ci?identityToQuery(ci):"", "(type:\"legendary creature\" or (type:planeswalker and o:\"can be your commander\") or type:background)"].filter(Boolean).join(" "); for(let i=0;i<6;i++){ const c=await sf.random(q); if(!isCommanderLegal(c)) continue; if(oracle(c).includes("companion")) continue; return c; } throw new Error("Impossible de trouver un commandant aléatoire conforme."); };
  const maybeAddPartner=async(primary)=>{ const has=(oracle(primary).includes("partner")||(primary.keywords||[]).some(k=>k.toLowerCase().includes("partner"))); if(!allowPartner||!has) return null; const q=["legal:commander","is:commander","game:paper","-is:funny","(keyword:partner or o:\"Partner with\")"].join(" "); for(let i=0;i<12;i++){ const c=await sf.random(q); if(!isCommanderLegal(c)) continue; if(nameOf(c)===nameOf(primary)) continue; return c; } return null; };
  const maybeAddBackground=async(primary)=>{ const wants=allowBackground && oracle(primary).includes("choose a background"); if(!wants) return null; const q=["legal:commander","type:background","game:paper", identityToQuery(getCI(primary)||"wubrg")].join(" "); for(let i=0;i<10;i++){ const c=await sf.random(q); if(!isCommanderLegal(c)) continue; return c; } return null; };
  const fetchPool=async(ci)=>{ const base=`legal:commander game:paper ${identityToQuery(ci)} -is:funny`; const mech = mechanics.length ? ` (${mechanics.map(k=>{ const tag=MECHANIC_TAGS.find(m=>m.key===k); if(!tag) return ""; const parts=tag.matchers.map(m=>`o:\"${m}\"`).join(" or "); return `(${parts})`; }).join(" or ")})` : ""; const spellsQ=`${base} -type:land -type:background${mech}`; const landsQ =`${base} type:land -type:basic`; const gather=async(q,b,pages=2)=>{ let page=await sf.search(q,{unique:"cards", order:"random"}); b.push(...page.data); for(let i=1;i<pages && page.has_more;i++){ await sleep(100); page=await fetch(page.next_page).then(r=>r.json()); b.push(...page.data);} }; const spells=[], lands=[]; await gather(spellsQ,spells,2); await gather(landsQ,lands,1); return { spells:distinctByName(spells).filter(isCommanderLegal), lands:distinctByName(lands).filter(isCommanderLegal) }; };
  async function buildLandCards(landsMap){ const out=[]; for(const [n,q] of Object.entries(landsMap)){ try{ const b=await bundleByName(n); out.push({...b, qty:q}); } catch { out.push({ name:n, qty:q, image:"", small:"", oracle_en:"", mana_cost:"", cmc:0, prices:{}, scryfall_uri:"" }); } await sleep(60);} return out; }
  const generate=async()=>{ setError(""); setLoading(true); setDeck(null); try{
      const primary = await pickCommander(commanderMode==='random'? desiredCI : getCI(selectedCommanderCard));
      let cmdrs=[primary]; const partner=await maybeAddPartner(primary); const background=await maybeAddBackground(primary); if(partner && background) cmdrs=[primary,partner]; else if(partner) cmdrs=[primary,partner]; else if(background) cmdrs=[primary,background]; let ci=getCI(primary); if(cmdrs.length>1) for(const c of cmdrs) ci=unionCI(ci,getCI(c));
      const pool=await fetchPool(ci);
      const totalBudget=Number(deckBudget)||0; let spent=cmdrs.reduce((s,c)=>s+priceEUR(c),0); if(totalBudget>0 && spent>totalBudget) throw new Error(`Le budget (${totalBudget.toFixed(2)}€) est déjà dépassé par le coût des commandants (${spent.toFixed(2)}€).`);
      const total=100; const landsTarget=Math.max(32, Math.min(40, targetLands)); const spellsTarget=total - cmdrs.length - landsTarget;
      const spellsPref=sortByPreference(pool.spells); const landsPref=sortByPreference(pool.lands);
      const banned=new Set(cmdrs.map(nameOf)); let { picks:pickedSpells, cost:costAfterSpells } = greedyPickUnique(spellsPref, spellsTarget, banned, spent, totalBudget); spent=costAfterSpells;
      const balanced=balanceSpells(pickedSpells, pool.spells, totalBudget, spent); pickedSpells=balanced.picks; spent=balanced.spent;
      const basicsNeeded=Math.max(landsTarget - Math.min(8, landsPref.length), 0); const landsMap=buildManaBase(ci, basicsNeeded); const chosenNonbasics=[]; for(const nb of landsPref){ if(chosenNonbasics.length>=8) break; const p=priceEUR(nb); if(totalBudget>0 && (spent+p)>totalBudget) continue; chosenNonbasics.push(nb); spent+=p; } for(const nb of chosenNonbasics){ landsMap[nameOf(nb)] = (landsMap[nameOf(nb)]||0)+1; }
      const currentCount=cmdrs.length + pickedSpells.length + Object.values(landsMap).reduce((a,b)=>a+b,0); let missing=100-currentCount; const basicsByColor={W:"Plains",U:"Island",B:"Swamp",R:"Mountain",G:"Forest"}; const firstBasic=(ci.split("")[0] && basicsByColor[ci.split("")[0]]) || "Wastes"; while(missing>0){ landsMap[firstBasic]=(landsMap[firstBasic]||0)+1; missing--; }
      const commandersFull = cmdrs.map(bundleCard);
      const nonlandCards = pickedSpells.map(bundleCard);
      const landCards = await buildLandCards(landsMap);
      setDeck({ colorIdentity:ci,
        commanders:cmdrs.map(nameOf), commandersFull,
        nonlands:Object.fromEntries(pickedSpells.map(c=>[nameOf(c),1])),
        nonlandCards,
        lands:landsMap, landCards,
        budget:totalBudget, spent:Number(spent.toFixed(2)), balanceTargets:targets, balanceCounts:countCats(pickedSpells) });
    }catch(e){ setError(e.message||String(e)); } finally{ setLoading(false); } };

  // Auto-scroll to Commander on mobile after generation
  useEffect(()=>{
    if(!deck) return;
    const isSmall = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
    if(!isSmall) return; // desktop unchanged
    const el = commanderSectionRef.current;
    if(!el) return;
    const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!prefersReduced){ el.scrollIntoView({ behavior:'smooth', block:'start' }); } else { el.scrollIntoView(); }
  }, [deck]);

  /******** Exports & Utils ********/
  const download=(filename, text)=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'})); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); };
  const mtgoExport=(deck)=>{ const lines=[]; deck.commanders.forEach(c=>lines.push(`1 ${c}`)); Object.entries(deck.nonlands).forEach(([n,q])=>lines.push(`${q} ${n}`)); Object.entries(deck.lands).forEach(([n,q])=>lines.push(`${q} ${n}`)); return lines.join("\n"); };
  const exportTxt=()=>{ if(deck) download("commander-deck.txt", mtgoExport(deck)); };
  const exportJson=()=>{ if(deck) download("commander-deck.json", JSON.stringify(deck,null,2)); };
  const copyList=()=>{ if(!deck) return; const lines=[`// CI: ${deck.colorIdentity||"(Colorless)"} • Budget: ${deck.budget||0}€ • Coût estimé: ${deck.spent||0}€`, ...deck.commanders.map(c=>`1 ${c} // Commander`), ...Object.entries(deck.nonlands).map(([n,q])=>`${q} ${n}`), ...Object.entries(deck.lands).map(([n,q])=>`${q} ${n}`)]; navigator.clipboard.writeText(lines.join("\n")); };

  /******** Collection (multi-files) ********/
  const handleCollectionFile=async(f)=>{ if(!f) return; const parsed=await parseCollectionFile(f); const entry={ id:`${Date.now()}-${Math.random().toString(16).slice(2)}`, name:f.name, map:parsed }; setUploadedFiles(prev=>{ const next=[...prev,entry]; const merged=new Map(); for(const file of next){ for(const [k,q] of file.map){ merged.set(k,(merged.get(k)||0)+q); } } setOwnedMap(merged); return next; }); };
  const removeUploadedFile=(id)=> setUploadedFiles(prev=>{ const next=prev.filter(x=>x.id!==id); const merged=new Map(); for(const file of next){ for(const [k,q] of file.map){ merged.set(k,(merged.get(k)||0)+q); } } setOwnedMap(merged); return next; });
  const clearCollection=()=>{ setOwnedMap(new Map()); setUploadedFiles([]); };

  // Rebalance
  const reequilibrer=async()=>{ if(!deck) return; try{ setLoading(true); const ci=deck.colorIdentity; const base=`legal:commander game:paper ${identityToQuery(ci)} -is:funny -type:land -type:background`; let page=await sf.search(base,{unique:"cards", order:"edhrec"}); let pool=page.data; if(page.has_more){ const next=await fetch(page.next_page).then(r=>r.json()); pool=pool.concat(next.data||[]);} pool=distinctByName(pool).filter(isCommanderLegal); const currentNames=new Set(Object.keys(deck.nonlands)); const currentObjs=pool.filter(c=> currentNames.has(nameOf(c))); const others=pool.filter(c=> !currentNames.has(nameOf(c))); const totalBudget=deck.budget||0; let spent=0; const balanced=balanceSpells(currentObjs, others, totalBudget, spent); const newNonlands=Object.fromEntries(balanced.picks.map(c=>[nameOf(c),1])); const newNonlandCards=balanced.picks.map(bundleCard); setDeck(prev=>({...prev, nonlands:newNonlands, nonlandCards:newNonlandCards, balanceCounts:balanced.counts, balanceTargets:targets })); } finally { setLoading(false); } };

  const deckSize = useMemo(()=>{ if(!deck) return 0; const cmd=deck.commanders?.length||0; const nl=Object.values(deck?.nonlands||{}).reduce((a,b)=>a+b,0); const ld=Object.values(deck?.lands||{}).reduce((a,b)=>a+b,0); return cmd+nl+ld; },[deck]);

  const nonlandsByType = useMemo(()=>{ if(!deck?.nonlandCards) return {}; const groups = {}; for(const c of deck.nonlandCards){ const k = primaryTypeLabel(c.type_line); (groups[k] ||= []).push(c); } const order = ["Créatures","Artefacts","Enchantements","Éphémères","Rituels","Planeswalkers","Batailles","Autres"]; const sorted = {}; for(const k of order){ if(groups[k]) sorted[k]=groups[k]; } return sorted; },[deck]);

  const isOwned = (cardName)=> ownedMap.has((cardName||"").toLowerCase());

  const stats = useMemo(()=>{
    if(!deck) return null;
    const own = new Map(ownedMap);
    const take = (name, need)=>{ const k=name.toLowerCase(); const have = own.get(k)||0; const used = Math.min(have, need); if(used>0) own.set(k, have-used); return used; };
    let ownedCount=0;
    (deck.commanders||[]).forEach(n=> ownedCount += take(n,1));
    Object.entries(deck.nonlands||{}).forEach(([n,q])=> ownedCount += take(n,q));
    Object.entries(deck.lands||{}).forEach(([n,q])=> ownedCount += take(n,q));

    const total=deckSize;
    const ownedPct = total? Math.round((ownedCount/total)*100) : 0;

    const cmcCards = [...(deck.commandersFull||[]), ...(deck.nonlandCards||[])];
    const cmcVals = cmcCards.map(c=> Number(c.cmc)||0);
    const avgCmc = cmcVals.length? (cmcVals.reduce((a,b)=>a+b,0)/cmcVals.length) : 0;

    const typeCounts = Object.fromEntries(Object.entries(nonlandsByType).map(([k, arr])=> [k, arr.length]));

    return { ownedCount, ownedPct, avgCmc:Number(avgCmc.toFixed(2)), typeCounts };
  },[deck, ownedMap, deckSize, nonlandsByType]);

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* HEADER: mobile fixes via header-wrap/header-actions classes */}
        <header className="header-wrap lg:flex lg:items-center lg:justify-between lg:gap-4">
          <h1 className="text-2xl md:text-4xl font-semibold tracking-tight">MTG Commander Deck Generator — <span className="muted">v6.6</span></h1>
          <div className="header-actions lg:flex lg:gap-2 lg:w-auto">
            {/* THEME TOGGLE */}
            <button className="btn" onClick={()=> setTheme(theme==='dark' ? 'light' : 'dark')} aria-label="Basculer thème">
              {theme==='dark' ? (<><Sun className="h-4 w-4"/><span>Mode clair</span></>) : (<><Moon className="h-4 w-4"/><span>Mode sombre</span></>)}
            </button>
            <button className="btn" onClick={copyList}><Copy className="inline-block h-4 w-4"/>Copier</button>
            <button className="btn" onClick={exportJson}><Download className="inline-block h-4 w-4"/>JSON</button>
            <button className="btn-primary" onClick={exportTxt}><Download className="inline-block h-4 w-4"/>TXT</button>
          </div>
        </header>

        <div className="grid lg:grid-cols-3 gap-8 mt-8">
          {/* Paramètres */}
          <div className="glass p-6 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4"><Settings2 className="h-5 w-5"/><h2 className="font-medium">Paramètres</h2></div>

            {/* Commandant */}
            <div className="space-y-2">
              <span className="muted text-sm">Commandant</span>
              <div className="flex gap-2 flex-wrap">
                <button className={`btn ${commanderMode==='random'?'glass-strong':''}`} onClick={()=>{setCommanderMode('random'); setChosenCommander("");}}>Aléatoire</button>
                <button className={`btn ${commanderMode==='select'?'glass-strong':''}`} onClick={()=>setCommanderMode('select')}>Sélectionner</button>
              </div>
              {commanderMode==='select' && (
                <div className="mt-2">
                  <CommanderAutocomplete value={chosenCommander} onSelect={setChosenCommander} />
                  {selectedCommanderCard && (
                    <p className="text-xs muted mt-1">Sélectionné: <span className="text-card-foreground">{nameOf(selectedCommanderCard)}</span> • Identité: {getCI(selectedCommanderCard)}</p>
                  )}
                </div>
              )}
            </div>

            {/* Identité couleur (masquée si select) */}
            {commanderMode!=='select' && (
              <div className="mt-4">
                <span className="muted text-sm">Identité couleur (optionnel)</span>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {COLORS.map(c=> (
                    <button key={c} className={`btn ${desiredCI.includes(c)?'glass-strong':''}`} onClick={()=>{ const set=new Set(desiredCI.split("")); set.has(c)?set.delete(c):set.add(c); setDesiredCI(ciMask(Array.from(set).join(""))); }}>{c}</button>
                  ))}
                  <button className="btn" onClick={()=>setDesiredCI("")}>Réinitialiser</button>
                </div>
              </div>
            )}

            {/* Mécaniques (max 3) */}
            <div className="mt-4">
              <span className="muted text-sm">Mécaniques préférées (max 3)</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {MECHANIC_TAGS.map(m=> (
                  <button key={m.key} className={`btn ${mechanics.includes(m.key)?'glass-strong':''}`} onClick={()=>toggleMechanic(m.key)}>{m.label}</button>
                ))}
              </div>
              {limitNotice && <p className="text-xs" style={{color:'var(--warn)'}}>{limitNotice}</p>}
            </div>

            {/* Poids */}
            <div className="mt-4 space-y-3">
              <div>
                <label className="muted text-sm">Prioriser ma collection: {weightOwned.toFixed(1)}x</label>
                <input type="range" min={0} max={2} step={0.1} value={weightOwned} onChange={e=>setWeightOwned(Number(e.target.value))} className="w-full"/>
              </div>
              <div>
                <label className="muted text-sm">Prioriser EDHREC: {weightEdhrec.toFixed(1)}x</label>
                <input type="range" min={0} max={2} step={0.1} value={weightEdhrec} onChange={e=>setWeightEdhrec(Number(e.target.value))} className="w-full"/>
              </div>
            </div>

            {/* Terrains & Budget */}
            <div className="mt-4">
              <label className="muted text-sm">Nombre de terrains visé: {targetLands}</label>
              <input type="range" min={32} max={40} step={1} value={targetLands} onChange={e=>setTargetLands(Number(e.target.value))} className="w-full"/>
            </div>
            <div className="mt-3">
              <label className="muted text-sm">Budget global du deck (EUR)</label>
              <input type="number" min={0} placeholder="0 = sans limite" value={deckBudget} onChange={e=>setDeckBudget(Number(e.target.value||0))} className="w-full input"/>
              <p className="text-xs muted mt-1">Prix EUR Scryfall; popularité EDHREC via edhrec_rank.</p>
            </div>

            {/* Partner / Background */}
            <div className="mt-4 flex items-center justify-between">
              <div className="space-y-1"><span>Autoriser Partner</span><p className="text-xs muted">N'influence pas la recherche ; ajoute un partenaire si possible.</p></div>
              <input type="checkbox" checked={allowPartner} onChange={e=>setAllowPartner(e.target.checked)} />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="space-y-1"><span>Autoriser Background</span><p className="text-xs muted">Si le commandant le permet.</p></div>
              <input type="checkbox" checked={allowBackground} onChange={e=>setAllowBackground(e.target.checked)} />
            </div>

            <button className="mt-5 w-full btn-primary justify-center" disabled={loading} onClick={generate}>
              {loading? (<RefreshCcw className="h-4 w-4 animate-spin"/>):(<Shuffle className="h-4 w-4"/>)} {loading?"Génération...":"Générer un deck"}
            </button>

            {error && <p className="text-sm" style={{color:'#ffb4c2'}}>{error}</p>}

            <div className="text-xs muted flex items-start gap-2 mt-3">
              <Info className="h-4 w-4 mt-0.5"/>
              <p>Règles EDH respectées (100 cartes, singleton sauf bases, identité couleur, légalités). Budget heuristique glouton.</p>
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Collection */}
            <div className="glass p-6">
              <div className="flex items-center gap-2 mb-4"><Upload className="h-5 w-5"/><h2 className="font-medium">Collection personnelle (optionnel)</h2></div>
              <p className="text-sm muted">Importe un ou plusieurs fichiers pour prioriser tes cartes lors de la génération.</p>
              <div className="mt-3"><FileDrop onFiles={async (files)=>{ for(const f of files){ await handleCollectionFile(f); } }}/></div>
              <div className="mt-3 text-sm">
                {uploadedFiles.length>0 ? (
                  <div className="space-y-2">
                    <div className="muted text-xs">Fichiers importés ({uploadedFiles.length}) :</div>
                    <ul className="grid md:grid-cols-2 gap-2">
                      {uploadedFiles.map(f=> (
                        <li key={f.id} className="flex items-center justify-between glass-strong rounded-lg px-3 py-1.5">
                          <span className="truncate" title={f.name}>{f.name}</span>
                          <button className="btn" onClick={()=>removeUploadedFile(f.id)} title="Supprimer ce fichier"><Trash2 className="h-4 w-4"/></button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (<div className="muted">Aucun fichier importé pour l’instant.</div>)}
              </div>
              <div className="flex items-center justify-between mt-3">
                <p>Cartes reconnues: <span className="font-semibold">{ownedMap.size}</span></p>
                <button className="btn" onClick={clearCollection}>Réinitialiser</button>
              </div>
            </div>

            {/* Editable balance targets */}
            <div className="glass p-6">
              <h3 className="font-medium mb-3">Cibles d’équilibrage (éditables)</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                {["ramp","draw","removal","wraths"].map(cat=> (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="w-28 capitalize">{cat}</span>
                    <label className="text-xs muted">Min</label>
                    <input type="number" className="w-16 input px-2 py-1" value={targets[cat].min} min={0} max={99} onChange={e=>setTargets(prev=>({...prev, [cat]:{...prev[cat], min:Number(e.target.value)||0}}))}/>
                    <label className="text-xs muted">Max</label>
                    <input type="number" className="w-16 input px-2 py-1" value={targets[cat].max} min={0} max={99} onChange={e=>setTargets(prev=>({...prev, [cat]:{...prev[cat], max:Number(e.target.value)||0}}))}/>
                  </div>
                ))}
              </div>
              <p className="text-xs muted mt-2">L’algo vise le <b>min</b> comme plancher; le max est indicatif pour l’affichage.</p>
            </div>

            {/* Result */}
            <div className="glass p-6">
              <div className="flex items-center gap-2 mb-4"><Sparkles className="h-5 w-5"/><h2 className="font-medium">Résultat</h2></div>
              {!deck ? (
                <div className="text-sm muted">Configure les options puis clique « Générer un deck ».</div>
              ) : (
                <div className="space-y-6">
                  {/* Commander(s) */}
                  <div ref={commanderSectionRef} className="section-anchor">
                    <h3 className="text-lg font-medium">Commandant{deck.commanders.length>1?'s':''} ({deck.commanders.length})</h3>
                    <div className="mt-2 grid md:grid-cols-2 gap-3">
                      {deck.commandersFull?.map((c,i)=> {
                        const owned = isOwned(c.name);
                        return (
                          <div key={i} className="glass-strong rounded-lg p-3 flex gap-3">
                            {c.small ? (
                              <img src={c.small} alt={c.name} className="w-20 h-28 object-cover rounded cursor-pointer" onClick={()=>{setModalCard(c); setModalOwned(owned); setShowModal(true);}}/>
                            ) : (<div className="w-20 h-28 glass-strong rounded"/>) }
                            <div className="min-w-0">
                              <button className="text-left font-medium hover:underline flex items-center gap-1" onClick={()=>{setModalCard(c); setModalOwned(owned); setShowModal(true);}}>
                                <span className="truncate">{c.name}</span>
                                {owned && (<span style={{color:'limegreen',fontWeight:'bold'}} title="Carte présente dans votre collection">✓</span>)}
                              </button>
                              {c.mana_cost && <div className="text-xs muted mt-0.5"><ManaCost cost={c.mana_cost}/></div>}
                              {c.oracle_en && (
                                <div className="text-xs mt-1" style={{display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden'}}>
                                  {c.oracle_en}
                                </div>
                              )}
                              <div className="text-xs muted mt-1">Prix estimé: {(Number(c.prices?.eur)||Number(c.prices?.eur_foil)||0).toFixed(2)}€</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="muted text-xs mt-1">Identité: {deck.colorIdentity || "(Colorless)"} • Taille: {deckSize} cartes • Coût estimé: {deck.spent?.toFixed(2)}€{deck.budget?` / Budget: ${deck.budget}€`:''}</p>
                  </div>

                  {/* Balance indicators */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <Progress label="Ramp" value={deck.balanceCounts?.ramp||0} targetMin={targets.ramp.min} targetMax={targets.ramp.max}/>
                    <Progress label="Pioche" value={deck.balanceCounts?.draw||0} targetMin={targets.draw.min} targetMax={targets.draw.max}/>
                    <Progress label="Anti-bêtes / Answers" value={deck.balanceCounts?.removal||0} targetMin={targets.removal.min} targetMax={targets.removal.max}/>
                    <Progress label="Wraths" value={deck.balanceCounts?.wraths||0} targetMin={targets.wraths.min} targetMax={targets.wraths.max}/>
                  </div>

                  {/* Non-land spells grouped by primary type */}
                  <div>
                    <h3 className="text-lg font-medium">Sorts non-terrains ({Object.values(deck.nonlands).reduce((a,b)=>a+b,0)})</h3>
                    {Object.keys(nonlandsByType).length===0 ? (
                      <p className="text-sm muted mt-1">Aucun sort détecté.</p>
                    ) : (
                      <div className="space-y-4 mt-2">
                        {Object.entries(nonlandsByType).map(([label, cards])=> (
                          <div key={label}>
                            <h4 className="text-sm muted mb-2">{label} ({cards.length})</h4>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {cards.map((c,idx)=> {
                                const owned = isOwned(c.name);
                                return (
                                  <CardTile key={c.name+idx} card={c} owned={owned} onOpen={(cc, ow)=>{setModalCard(cc); setModalOwned(ow); setShowModal(true);}}/>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Lands as tiles (with modal) */}
                  <div>
                    <h3 className="text-lg font-medium">Terrains ({Object.values(deck.lands).reduce((a,b)=>a+b,0)})</h3>
                    {Array.isArray(deck.landCards) && deck.landCards.length>0 ? (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                        {deck.landCards.map((lc,idx)=> {
                          const owned = isOwned(lc.name);
                          return (
                            <CardTile key={lc.name+idx} card={lc} qty={lc.qty} owned={owned} onOpen={(cc, ow)=>{setModalCard(cc); setModalOwned(ow); setShowModal(true);}}/>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-2 mt-2 text-sm">
                        {Object.entries(deck.lands).map(([n,q]) => (
                          <div key={n} className="flex justify-between glass-strong rounded-lg px-3 py-1.5"><span>{n}</span><span className="muted">x{q}</span></div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Statistics */}
                  <div className="glass-strong rounded-xl p-4">
                    <h3 className="font-medium mb-3">Statistiques</h3>
                    {stats ? (
                      <div className="grid md:grid-cols-3 gap-3 text-sm">
                        <div className="glass rounded-lg p-3">
                          <div className="muted text-xs">Cartes possédées utilisées</div>
                          <div className="text-lg font-semibold">{stats.ownedCount} / {deckSize} <span className="text-xs muted">({stats.ownedPct}%)</span></div>
                        </div>
                        <div className="glass rounded-lg p-3">
                          <div className="muted text-xs">Coût estimé du deck</div>
                          <div className="text-lg font-semibold">{(deck.spent||0).toFixed(2)}€</div>
                        </div>
                        <div className="glass rounded-lg p-3">
                          <div className="muted text-xs">CMC moyen (hors terrains)</div>
                          <div className="text-lg font-semibold">{stats.avgCmc}</div>
                        </div>
                        <div className="md:col-span-3 grid md:grid-cols-4 gap-2">
                          {Object.entries(stats.typeCounts).map(([k,v])=> (
                            <div key={k} className="glass rounded-lg p-3 flex items-center justify-between"><span className="muted text-xs">{k}</span><span className="font-medium">{v}</span></div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="muted text-sm">Aucune statistique (génère un deck d'abord).</div>
                    )}
                  </div>

                  {/* Bottom actions: stack on mobile for consistency */}
                  <div className="grid grid-cols-1 lg:flex lg:flex-wrap lg:gap-2 gap-2">
                    <button className="btn" onClick={copyList}><Copy className="inline-block h-4 w-4"/>Copier</button>
                    <button className="btn" onClick={exportJson}><Download className="inline-block h-4 w-4"/>JSON</button>
                    <button className="btn-primary" onClick={exportTxt}><Download className="inline-block h-4 w-4"/>TXT</button>
                    <button className="btn" onClick={reequilibrer} disabled={loading}><Sparkles className="inline-block h-4 w-4"/>Rééquilibrer</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <CardModal open={showModal} card={modalCard} owned={modalOwned} onClose={()=>setShowModal(false)}/>

        <footer className="mt-10 text-xs muted">Fait avec ❤️ — Scryfall API (popularité EDHREC via <code>edhrec_rank</code>). Non affilié à WotC.</footer>
      </div>
    </div>
  );
}

/*************** Resolve name FR/EN ***************/
async function resolveCommanderByAnyName(name){
  try { const en = await sf.namedExact(name); if(isCommanderLegal(en)) return en; } catch {}
  const term = `legal:commander name:\"${name}\" (type:legendary or o:\"can be your commander\")`;
  const fr = await sf.search(`${term} lang:fr unique:prints order:released`).catch(()=>null);
  const any = fr?.data?.[0];
  if(any){
    const oid = any.oracle_id;
    const enOfSame = await sf.search(`oracleid:${oid} lang:en order:released unique:prints`).catch(()=>null);
    const best = enOfSame?.data?.[0] || any;
    if(isCommanderLegal(best)) return best;
  }
  const gen = await sf.search(`legal:commander name:${name} (type:legendary or o:\"can be your commander\") order:edhrec`).catch(()=>null);
  const pick = gen?.data?.find(isCommanderLegal) || gen?.data?.[0];
  if(pick) return pick;
  throw new Error(`Impossible de résoudre le nom: ${name}`);
}

/************** Import collection (parser) **************/
async function parseCollectionFile(file){
  const text=await file.text(); const ext=file.name.split('.').pop().toLowerCase(); const rows=[];
  if(ext==="json"){ try{ const data=JSON.parse(text); if(Array.isArray(data)) for(const it of data){ if(it?.name) rows.push({name:String(it.name).trim(), qty:Number(it.quantity||it.qty||1)||1}); } }catch{} }
  else if(["csv","tsv","tab"].includes(ext)){
    const lines=text.split(/\r?\n/).filter(Boolean); const [h0,...rest]=lines; const headers=h0.toLowerCase().split(/,|\t|;/).map(s=>s.trim()); const hasHeader=headers.includes('name'); const dataLines=hasHeader?rest:lines;
    for(const line of dataLines){ const cols=line.split(/,|\t|;/).map(s=>s.trim()); let name="", qty=1; if(hasHeader){ const obj=Object.fromEntries(cols.map((v,i)=>[headers[i]||`c${i}`,v])); name=obj.name||obj.card||""; qty=Number(obj.count||obj.qty||obj.quantity||1)||1; } else { const [a,b]=cols; if(/^\d+$/.test(a)){ qty=Number(a); name=b; } else if(/^\d+$/.test(b)){ qty=Number(b); name=a; } else { name=line.trim(); qty=1; } } if(name) rows.push({name,qty}); }
  }
  else {
    for(const line of text.split(/\r?\n/)){ const m=line.match(/^\s*(\d+)\s+(.+?)\s*$/); if(m) rows.push({name:m[2].trim(), qty:Number(m[1])}); else if(line.trim()) rows.push({name:line.trim(), qty:1}); }
  }
  const map=new Map(); for(const {name,qty} of rows){ const k=name.toLowerCase(); map.set(k,(map.get(k)||0)+qty); }
  return map;
}

/************** Minimal tests (dev console) **************/
(function runUnitTests(){
  if (typeof window === 'undefined') return; if (window.__MTG_V66_TESTED__) return; window.__MTG_V66_TESTED__=true;
  const cases = [
    { in:"{3}{G}{G}", out:["3","G","G"] },
    { in:"{X}{U/R}{2}", out:["X","U/R","2"] },
    { in:"{C}{10}", out:["C","10"] },
  ];
  for (const c of cases){
    const toks = tokenizeMana(c.in);
    console.assert(JSON.stringify(toks.map(x=>x.toUpperCase()))===JSON.stringify(c.out), `tokenizeMana failed for ${c.in}`, toks);
  }
})();
