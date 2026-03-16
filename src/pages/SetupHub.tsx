import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { generateDefaultRidings, RidingTemplate, REGIONS } from '../data/ridings';
import { Demographic } from '../types/game';
import toast from 'react-hot-toast';

const DEMO_OPTIONS: Demographic[] = ['Youth', 'Seniors', 'Workers', 'Business'];

const PRESET_COLORS = [
  '#ef4444', '#3b82f6', '#f97316', '#22c55e', '#a855f7', '#eab308',
  '#ec4899', '#06b6d4'
];

interface PartyDraft {
  id: string;
  name: string;
  color: string;
  logo?: string;       // base64 data URL
  startingAP: number;
  startingFunds: number;
}

function makeParty(index: number): PartyDraft {
  return {
    id: `party-${Date.now()}-${index}`,
    name: '',
    color: PRESET_COLORS[index % PRESET_COLORS.length],
    startingAP: 3,
    startingFunds: 0,
  };
}

export function SetupHub() {
  const navigate = useNavigate();
  const setupGame = useGameStore(s => s.setupGame);
  const overwriteState = useGameStore(s => s.overwriteState);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parties, setParties] = useState<PartyDraft[]>([
    makeParty(0), makeParty(1), makeParty(2),
  ]);
  const [ridings, setRidings] = useState<RidingTemplate[]>(generateDefaultRidings);
  const [activeRegion, setActiveRegion] = useState<string>(REGIONS[0]);
  const [defaultAP, setDefaultAP] = useState(3);
  const [defaultFunds, setDefaultFunds] = useState(0);
  const [maxRounds, setMaxRounds] = useState(10);
  const [showDemos, setShowDemos] = useState(true);

  // ── Party helpers ──────────────────────────────────────────────
  const updateParty = (idx: number, field: keyof PartyDraft, value: string | number) =>
    setParties(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));

  const addParty = () => {
    if (parties.length >= 8) { toast.error('Maximum 8 parties.'); return; }
    setParties(prev => [...prev, makeParty(prev.length)]);
  };

  const updateLogoForParty = (idx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const base64 = ev.target?.result as string;
      setParties(prev => prev.map((p, i) => i === idx ? { ...p, logo: base64 } : p));
    };
    reader.readAsDataURL(file);
  };

  const removeParty = (idx: number) =>
    setParties(prev => prev.filter((_, i) => i !== idx));

  const applyDefaultsToAll = () =>
    setParties(prev => prev.map(p => ({ ...p, startingAP: defaultAP, startingFunds: defaultFunds })));

  // ── Riding helpers ─────────────────────────────────────────────
  const updateRiding = (id: string, field: keyof RidingTemplate, value: string | number) =>
    setRidings(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const reshuffleDemos = () => {
    setRidings(generateDefaultRidings());
    toast.success('Demographics reshuffled!');
  };

  // ── Launch ────────────────────────────────────────────────────
  const slugify = (name: string) =>
    name.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'party';

  const handleLaunch = () => {
    const validParties = parties.filter(p => p.name.trim());
    if (validParties.length < 2) {
      toast.error('Need at least 2 named parties to launch.');
      return;
    }
    // Use slugified names as IDs so portal URLs are readable (e.g. /party/liberals)
    setupGame(
      validParties.map(p => ({ id: slugify(p.name), name: p.name.trim(), color: p.color, logo: p.logo })),
      ridings,
      maxRounds
    );
    // Apply custom starting AP/Funds per party
    const store = useGameStore.getState();
    validParties.forEach(p => {
      const partyInStore = store.parties.find(sp => sp.id === p.id);
      if (partyInStore) {
        useGameStore.setState(state => {
          const party = state.parties.find(sp => sp.id === p.id);
          if (party) { party.ap = p.startingAP; party.funds = p.startingFunds; }
          return state;
        });
      }
    });
    toast.success('Game launched! Redirecting to dashboard...');
    setTimeout(() => navigate('/teacher'), 800);
  };

  // ── Export ───────────────────────────────────────────────────
  const handleExport = () => {
    const state = useGameStore.getState();
    const { setupGame: _sg, advanceRound: _ar, setPhase: _sp, grantAP: _gp,
            queueAction: _qa, removeQueuedAction: _rqa, applyAction: _aa, overwriteState: _ow,
            ...data } = state;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `election-save-R${state.round}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Game state exported!');
  };

  // ── Import ───────────────────────────────────────────────────
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        overwriteState(data);
        toast.success('Save loaded! Redirecting to dashboard...');
        setTimeout(() => navigate('/teacher'), 800);
      } catch {
        toast.error('Invalid save file.');
      }
    };
    reader.readAsText(file);
    // reset so the same file can be selected again
    e.target.value = '';
  };

  // ── Render ────────────────────────────────────────────────────
  const totalSeats = ridings.reduce((sum, r) => sum + r.seats, 0);
  const regionRidings = ridings.filter(r => r.region === activeRegion);

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans flex flex-col">
      {/* Header */}
      <div className="border-b border-neutral-800 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-white">🗳️ Election Night Setup</h1>
          <p className="text-neutral-500 text-sm mt-0.5">Configure parties, ridings, and game rules before launch</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Import */}
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 text-sm font-bold hover:border-neutral-500 hover:text-white transition-colors flex items-center gap-2"
          >
            📂 Import Save
          </button>
          {/* Export — only useful after game is started */}
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 text-sm font-bold hover:border-neutral-500 hover:text-white transition-colors flex items-center gap-2"
          >
            💾 Export Save
          </button>
          {/* Launch */}
          <button
            onClick={handleLaunch}
            className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-black uppercase tracking-wide text-sm transition-colors shadow-lg shadow-green-900/40"
          >
            🚀 Launch Game
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden gap-0">

        {/* ── Left: Party Setup ──────────────────────────────── */}
        <div className="w-80 border-r border-neutral-800 flex flex-col overflow-y-auto p-6 gap-5">
          <div className="flex items-center justify-between">
            <h2 className="font-black uppercase tracking-wider text-neutral-400 text-xs">Parties <span className="text-neutral-600">({parties.length}/8)</span></h2>
            <button onClick={addParty} className="text-xs text-blue-400 hover:text-blue-300 font-bold transition-colors">+ Add Party</button>
          </div>

          {/* Default AP/Funds */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3">
            <p className="text-xs text-neutral-500 uppercase tracking-wider font-bold">Default Starting Values</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-neutral-600 uppercase tracking-wider">AP</label>
                <input type="number" min="0" max="20"
                  value={defaultAP} onChange={e => setDefaultAP(Number(e.target.value))}
                  className="w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-[10px] text-neutral-600 uppercase tracking-wider">Funds ($)</label>
                <input type="number" min="0" max="100"
                  value={defaultFunds} onChange={e => setDefaultFunds(Number(e.target.value))}
                  className="w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-neutral-600 uppercase tracking-wider">Max Rounds</label>
              <input type="number" min="2" max="30"
                value={maxRounds} onChange={e => setMaxRounds(Number(e.target.value))}
                className="w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              <p className="text-[10px] text-neutral-600 mt-1">Final round triggers debate phase</p>
            </div>
            <button onClick={applyDefaultsToAll}
              className="text-xs text-amber-400 hover:text-amber-300 font-bold text-left transition-colors">
              Apply to all parties ↑
            </button>
          </div>

          {/* Party Cards */}
          <div className="flex flex-col gap-3">
            {parties.map((party, idx) => (
              <div key={party.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  {/* Color Picker */}
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full cursor-pointer border-2 border-neutral-600 hover:border-white transition-colors flex-shrink-0"
                         style={{ backgroundColor: party.color }}
                         onClick={() => document.getElementById(`color-${idx}`)?.click()} />
                    <input id={`color-${idx}`} type="color" value={party.color}
                      onChange={e => updateParty(idx, 'color', e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  </div>
                  <input
                    type="text"
                    placeholder={`Party ${idx + 1} name…`}
                    value={party.name}
                    onChange={e => updateParty(idx, 'name', e.target.value)}
                    className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-neutral-600"
                  />
                  {parties.length > 2 && (
                    <button onClick={() => removeParty(idx)} className="text-neutral-600 hover:text-red-400 text-sm transition-colors">✕</button>
                  )}
                </div>
                {/* Preset colours */}
                <div className="flex gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => updateParty(idx, 'color', c)}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${party.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-neutral-600 uppercase tracking-wider">Starting AP</label>
                    <input type="number" min="0" max="20"
                      value={party.startingAP} onChange={e => updateParty(idx, 'startingAP', Number(e.target.value))}
                      className="w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-600 uppercase tracking-wider">Starting Funds ($)</label>
                    <input type="number" min="0" max="100"
                      value={party.startingFunds} onChange={e => updateParty(idx, 'startingFunds', Number(e.target.value))}
                      className="w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                </div>

                {/* Logo Upload */}
                <div>
                  <label className="text-[10px] text-neutral-600 uppercase tracking-wider block mb-1.5">Party Logo</label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) updateLogoForParty(idx, f); e.target.value=''; }} />
                    {party.logo ? (
                      <img src={party.logo} alt="logo"
                        className="w-10 h-10 rounded-lg object-contain border-2 border-neutral-500 bg-white/10" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-neutral-800 border-2 border-dashed border-neutral-600 flex items-center justify-center text-lg group-hover:border-neutral-400 transition-colors">
                        🖼️
                      </div>
                    )}
                    <span className="text-xs text-neutral-500 group-hover:text-neutral-300 transition-colors">
                      {party.logo ? 'Click to change logo' : 'Upload logo image'}
                    </span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Ridings ─────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Riding header */}
          <div className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-black uppercase tracking-wider text-neutral-400 text-xs">
                Ridings
                <span className="text-neutral-600 ml-2">{ridings.length} ridings · {totalSeats} total seats</span>
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer select-none">
                <input type="checkbox" checked={showDemos} onChange={e => setShowDemos(e.target.checked)}
                  className="accent-blue-500" />
                Show demographics
              </label>
              <button onClick={reshuffleDemos}
                className="text-xs text-purple-400 hover:text-purple-300 font-bold transition-colors border border-purple-900 hover:border-purple-700 px-3 py-1.5 rounded-lg">
                🎲 Reshuffle Demographics
              </button>
            </div>
          </div>

          {/* Region tabs */}
          <div className="border-b border-neutral-800 px-6 flex gap-0">
            {REGIONS.map(region => (
              <button
                key={region}
                onClick={() => setActiveRegion(region)}
                className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors ${
                  activeRegion === region
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {region}
                <span className="ml-1.5 text-xs font-normal text-neutral-600">
                  ({ridings.filter(r => r.region === region).length})
                </span>
              </button>
            ))}
          </div>

          {/* Riding table */}
          <div className="flex-1 overflow-y-auto p-6">
            <table className="w-full text-sm border-separate border-spacing-y-1.5">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-neutral-500">
                  <th className="text-left px-4 pb-2">Riding Name</th>
                  <th className="text-center px-4 pb-2 w-24">Seats</th>
                  {showDemos && <>
                    <th className="text-center px-4 pb-2 w-36 text-green-600">Strong Demo (2×)</th>
                    <th className="text-center px-4 pb-2 w-36 text-red-600">Weak Demo (0.5×)</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {regionRidings.map(riding => (
                  <tr key={riding.id} className="bg-neutral-900 hover:bg-neutral-800/80 transition-colors rounded-lg">
                    <td className="px-4 py-2.5 rounded-l-lg">
                      <input
                        type="text"
                        value={riding.name}
                        onChange={e => updateRiding(riding.id, 'name', e.target.value)}
                        className="bg-transparent w-full font-medium text-white focus:outline-none hover:bg-neutral-800 px-1 -mx-1 rounded"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <input
                        type="number" min="1" max="20"
                        value={riding.seats}
                        onChange={e => updateRiding(riding.id, 'seats', Number(e.target.value))}
                        className="w-14 bg-neutral-800 border border-neutral-700 rounded text-center text-white text-sm focus:outline-none focus:border-blue-500 p-1 mx-auto"
                      />
                    </td>
                    {showDemos && <>
                      <td className="px-4 py-2.5 text-center rounded-none">
                        <select
                          value={riding.strongDemo}
                          onChange={e => updateRiding(riding.id, 'strongDemo', e.target.value as Demographic)}
                          className="bg-neutral-800 border border-green-900 text-green-400 rounded px-2 py-1 text-xs focus:outline-none focus:border-green-500"
                        >
                          {DEMO_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-center rounded-r-lg">
                        <select
                          value={riding.weakDemo}
                          onChange={e => updateRiding(riding.id, 'weakDemo', e.target.value as Demographic)}
                          className="bg-neutral-800 border border-red-900 text-red-400 rounded px-2 py-1 text-xs focus:outline-none focus:border-red-500"
                        >
                          {DEMO_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}
