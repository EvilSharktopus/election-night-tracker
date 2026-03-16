import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useSyncMiddleware, useTeacherSyncResponder } from '../store/syncMiddleware';
import { ActionPayload, Demographic, Medium, UpgradeId } from '../types/game';
import toast from 'react-hot-toast';

// Helper to generate IDs for actions
const generateId = () => Math.random().toString(36).substring(2, 9);

export function TeacherDashboard() {
  useSyncMiddleware(true);
  useTeacherSyncResponder();

  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  
  // Game state
  const round = useGameStore(state => state.round);
  const maxRounds = useGameStore(state => state.maxRounds);
  const phase = useGameStore(state => state.phase);
  const parties = useGameStore(state => state.parties);
  const ridings = useGameStore(state => state.ridings);
  const actionLog = useGameStore(state => state.actionLog);
  const darkOps   = useGameStore(state => state.darkOps);
  
  // Actions
  const advanceRound = useGameStore(state => state.advanceRound);
  const setPhase = useGameStore(state => state.setPhase);
  const grantAP = useGameStore(state => state.grantAP);
  const setupGame = useGameStore(state => state.setupGame);
  const applyAction = useGameStore(state => state.applyAction);
  const updateLogMessage = useGameStore(state => state.updateLogMessage);
  const queuedActions = useGameStore(state => state.queuedActions);
  const removeQueuedAction = useGameStore(state => state.removeQueuedAction);
  const overwriteState = useGameStore(state => state.overwriteState);

  // Form State
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [actionType, setActionType] = useState<ActionPayload['actionType']>('fundraise');
  const [targetRidingId, setTargetRidingId] = useState('');
  const [targetPartyId, setTargetPartyId] = useState('');
  const [demographic, setDemographic] = useState<Demographic>('Youth');
  const [medium, setMedium] = useState<Medium>('Social');
  const [costText, setCostText] = useState('');
  const [upgradeId, setUpgradeId] = useState<UpgradeId>('grassroots');
  
  const [previewMsg, setPreviewMsg] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'teacher123') { 
      setIsAuthenticated(true);
    } else {
      alert('Incorrect password');
    }
  };

  const handleDebugInit = () => {
    setupGame([
      { id: 'lib', name: 'Liberals', color: '#dc2626' },
      { id: 'con', name: 'Conservatives', color: '#2563eb' },
      { id: 'ndp', name: 'NDP', color: '#f97316' }
    ], [
      { id: 'vanc', name: 'Metro Vancouver', region: 'BC', seats: 12, strongDemo: 'Youth', weakDemo: 'Seniors' },
      { id: 'calg', name: 'Calgary', region: 'AB', seats: 8, strongDemo: 'Business', weakDemo: 'Workers' }
    ]);
    toast.success('Game Data Initialized');
  };

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

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        overwriteState(data);
        toast.success('Save loaded!');
      } catch {
        toast.error('Invalid save file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Build payload
  const buildPayload = (): ActionPayload => {
    return {
      partyId: selectedPartyId,
      actionType,
      targetRidingId: targetRidingId || undefined,
      targetPartyId: targetPartyId || undefined,
      demographic: actionType === 'campaign' ? demographic : undefined,
      medium: actionType === 'campaign' ? medium : undefined,
      cost: parseInt(costText) || 0,
      upgradeId: actionType === 'purchase_upgrade' ? upgradeId : undefined
    };
  };

  const calculatePreview = () => {
    if (!selectedPartyId) {
      setPreviewMsg("Select a party first.");
      return;
    }
    const party = parties.find(p => p.id === selectedPartyId);
    if (!party) return;

    let apCost = 1;
    if (['scandal', 'misinformation', 'hack'].includes(actionType)) apCost = 2;
    if (actionType === 'recon' && party.upgrades.includes('oppo_research')) apCost = 0;

    if (party.ap < apCost) {
      setPreviewMsg(`❌ INSUFFICIENT AP: Requires ${apCost} AP, party only has ${party.ap}.`);
      return;
    }

    const payload = buildPayload();
    
    // Simulate outcome logically based on SPEC
    switch (actionType) {
      case 'fundraise':
        const yieldAmt = party.upgrades.includes('deep_pockets') ? Math.floor(5 * 1.3) : 5;
        setPreviewMsg(`Will cost ${apCost} AP. Will generate $${yieldAmt}.`);
        break;
      case 'campaign':
        if (party.funds < (payload.cost || 0)) {
           setPreviewMsg(`❌ INSUFFICIENT FUNDS: Requires $${payload.cost}, has $${party.funds}.`);
           return;
        }
        setPreviewMsg(`Will cost ${apCost} AP and $${payload.cost}. Base value before demographic/trap logic: $${payload.cost}.`);
        break;
      case 'scandal':
         setPreviewMsg(`Will cost ${apCost} AP + $3. Target's next campaign in the chosen riding will be 50% weaker (negated if Scandal Shield active).`);
         break;
      case 'hack':
         setPreviewMsg(`Will cost ${apCost} AP. ${party.upgrades.includes('cyber_division') ? '70%' : '50%'} chance to steal half target's funds. On fail: lose 20% own funds and 1 AP.`);
         break;
      default:
         setPreviewMsg(`Will cost ${apCost} AP. Ensure all targets are selected.`);
         break;
    }
  };

  const handleConfirm = () => {
    if (!selectedPartyId) return;
    const manualApCost = ['scandal', 'misinformation', 'hack'].includes(actionType) ? 2 : 1;
    const actionReq = {
      id: generateId(),
      payload: buildPayload(),
      status: "pending" as const,
      apCost: manualApCost
    };
    applyAction(actionReq);
    toast.success(`Action Confirmed: ${actionType.toUpperCase()}`);
    setPreviewMsg(null);
    // Reset inputs
    setCostText('');
  };

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-900 text-white">
        <form onSubmit={handleLogin} className="flex flex-col gap-4 bg-neutral-800 p-8 rounded border border-neutral-700">
          <h2 className="text-xl font-bold">Teacher Dashboard</h2>
          <input 
            type="password" 
            placeholder="Enter password" 
            className="p-2 bg-neutral-900 border border-neutral-700 rounded text-white"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white font-medium">
            Login
          </button>
        </form>
      </div>
    );
  }

  // Determine which conditional fields to show
  const showRidingSelect = ['campaign', 'research', 'scandal', 'last_push'].includes(actionType);
  const showPartySelect = ['recon', 'scandal', 'misinformation', 'hack'].includes(actionType);
  const showCampaignFields = actionType === 'campaign';
  const showCostField = actionType === 'campaign' || actionType === 'purchase_upgrade';
  const showUpgradeSelect = actionType === 'purchase_upgrade';

  return (
    <div className="flex h-screen w-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-neutral-100 overflow-hidden font-sans flex-col">

      
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-950 flex-shrink-0">
        <span className="text-xs font-black uppercase tracking-widest text-neutral-500">🗳️ Teacher Dashboard · Round {round} · <span className="capitalize">{phase}</span></span>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <button onClick={() => fileInputRef.current?.click()} className="text-xs px-3 py-1.5 rounded border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors">📂 Import Save</button>
          <button onClick={handleExport} className="text-xs px-3 py-1.5 rounded border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors">💾 Export Save</button>
          <button onClick={() => navigate('/setup')} className="text-xs px-3 py-1.5 rounded border border-amber-900 text-amber-500 hover:text-amber-300 hover:border-amber-700 transition-colors">⚙️ Setup Hub</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
      
      
      <div className="w-1/4 border-r border-neutral-800 flex flex-col p-4 bg-neutral-900/50">
        <h2 className="text-lg font-bold mb-6 text-neutral-400 uppercase tracking-widest text-sm">Game Controls</h2>
        
        <div className="mb-8 space-y-4">
          <div className="p-4 bg-neutral-800 rounded-lg border border-neutral-700">
            <div className="flex justify-between items-center mb-2">
              <span className="text-neutral-400">Current Phase</span>
              <span className="font-bold text-blue-400 capitalize">{phase}</span>
            </div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-neutral-400">Current Round</span>
              <span className="font-bold text-xl">{round} / {maxRounds}</span>
            </div>
            
            {phase === 'setup' ? (
              <button 
                onClick={handleDebugInit}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Initialize Game Data
              </button>
            ) : (
              <div className="space-y-2 flex flex-col">
                 <button 
                  onClick={advanceRound}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
                >
                  Advance Round
                </button>
                <div className="flex gap-2">
                   <button 
                    onClick={() => setPhase('active')}
                    className={`flex-1 py-1 px-2 rounded text-sm font-medium transition-colors ${phase === 'active' ? 'bg-neutral-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
                  >
                    Active
                  </button>
                  <button 
                    onClick={() => setPhase('pause')}
                    className={`flex-1 py-1 px-2 rounded text-sm font-medium transition-colors ${phase === 'pause' ? 'bg-amber-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
                  >
                    Pause
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {phase !== 'setup' && (
          <div className="mb-8 space-y-4">
            <h3 className="text-sm font-bold text-neutral-500 uppercase">Resource Distribution</h3>
            <button 
              onClick={() => { grantAP(3); toast.success("Granted 3 AP to all parties"); }}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded transition-colors flex justify-center items-center gap-2 shadow-lg"
            >
              <span>Grant Weekly AP (+3)</span>
            </button>
          </div>
        )}


        {/* Party Portal Links */}
        {phase !== 'setup' && parties.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm border-b border-neutral-700 pb-2 mb-3 text-sky-400 font-bold uppercase tracking-wider">
              Student Portal Links
            </h3>
            <div className="flex flex-col gap-1.5">
              {parties.map((p, idx) => {
                const url = `${window.location.origin}/party/${idx}`;
                return (
                  <div key={p.id} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-xs font-bold text-white">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <code className="text-[10px] text-sky-400 font-mono flex-1 truncate select-all">/party/{idx}</code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(url); toast.success(`Copied ${p.name} link!`); }}
                        className="text-neutral-500 hover:text-white text-xs transition-colors flex-shrink-0 px-1"
                        title="Copy full URL"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        
        <div className="flex-1 flex flex-col min-h-0">
          <h3 className="text-sm border-b border-neutral-700 pb-2 mb-3 text-emerald-400 font-bold uppercase tracking-wider">Party Stats</h3>
          <div className="overflow-y-auto pr-2 custom-scrollbar flex-1 space-y-3">
             {parties.map(p => {
               // Calculate Seats
               let seats = 0;
               ridings.forEach(r => {
                 let leaderId: string | null = null;
                 let maxVal = -1;
                 Object.entries(r.campaignValues).forEach(([pId, val]) => {
                   if (val > maxVal) { maxVal = val; leaderId = pId; }
                 });
                 if (leaderId === p.id && maxVal > 0) seats += r.seats;
               });

               return (
                 <div key={p.id} className="bg-neutral-800 p-3 rounded border border-neutral-700 flex flex-col gap-1">
                   <div className="font-bold flex justify-between items-center text-sm" style={{ color: p.color }}>
                     <span>{p.name}</span>
                     <span className="text-neutral-400 text-xs font-mono">{seats} Seats</span>
                   </div>
                   <div className="flex justify-between items-center text-xs text-neutral-300">
                     <span>Funds: <span className="font-bold text-green-400 font-mono">${p.funds}</span></span>
                     <span>AP: <span className="font-bold text-blue-400 font-mono">{p.ap}</span></span>
                   </div>
                   <div className="flex justify-between items-center text-xs text-neutral-400">
                     <span>PIN: <span className="text-sky-400 font-mono font-bold tracking-wider">{p.password || p.name.toLowerCase().slice(0, 4)}</span></span>
                   </div>
                   <details className="mt-1 text-xs text-neutral-400 group">
                     <summary className="cursor-pointer hover:text-white transition-colors duration-200 select-none">
                       View Tech & Ops ({p.upgrades.length} / {darkOps.filter(o => o.sourcePartyId === p.id).length})
                     </summary>
                     <div className="pt-1.5 pl-2 space-y-1.5 border-t border-neutral-700/50 mt-1.5">
                       <div>
                         <span className="text-purple-400 font-semibold mb-0.5 block">Tech Upgrades</span>
                         {p.upgrades.length > 0 ? (
                           <div className="flex flex-wrap gap-1">
                             {p.upgrades.map(u => (
                               <span key={u} className="bg-purple-900/30 border border-purple-800/50 text-purple-200 px-1.5 rounded text-[10px] uppercase">{u.replace('_', ' ')}</span>
                             ))}
                           </div>
                         ) : <span className="text-neutral-500 italic">None</span>}
                       </div>
                       <div>
                         <span className="text-rose-400 font-semibold mb-0.5 block">Dark Ops</span>
                         {darkOps.filter(o => o.sourcePartyId === p.id).length > 0 ? (
                           <div className="flex flex-wrap gap-1">
                             {darkOps.filter(o => o.sourcePartyId === p.id).map(o => (
                               <span key={o.id} className="bg-rose-900/30 border border-rose-800/50 text-rose-200 px-1.5 rounded text-[10px] uppercase">{o.type.replace('_', ' ')}</span>
                             ))}
                           </div>
                         ) : <span className="text-neutral-500 italic">None</span>}
                       </div>
                     </div>
                   </details>
                 </div>
               );
             })}
          </div>
        </div>

      </div>

      
      <div className="flex-1 border-r border-neutral-800 p-6 flex flex-col bg-neutral-900 overflow-y-auto gap-6">

        
        <div>
          <h2 className="text-lg font-bold mb-3 text-neutral-400 uppercase tracking-widest text-sm flex items-center gap-2">
            Student Queue
            {queuedActions.length > 0 && (
              <span className="bg-amber-500 text-black text-xs font-black px-2 py-0.5 rounded-full animate-pulse">
                {queuedActions.length}
              </span>
            )}
          </h2>

          {queuedActions.length === 0 ? (
            <div className="text-neutral-600 italic text-sm bg-neutral-800/50 border border-neutral-800 rounded-lg p-4 text-center">
              No pending student actions. They'll appear here automatically.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {Object.entries(
                queuedActions.reduce((acc, req) => {
                  const type = req.payload.actionType;
                  if (!acc[type]) acc[type] = [];
                  acc[type].push(req);
                  return acc;
                }, {} as Record<string, typeof queuedActions>)
              ).sort(([a], [b]) => a.localeCompare(b)).map(([type, actions]) => (
                <div key={type} className="space-y-2">
                  <h3 className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2 border-b border-neutral-800 pb-1 mb-2">
                    {type.replace('_', ' ')}
                    <span className="bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded text-[10px]">{actions.length}</span>
                  </h3>
                  <div className="flex flex-col gap-2">
                    {actions.map(req => {
                      const actor = parties.find(p => p.id === req.payload.partyId);
                      const targetRiding = ridings.find(r => r.id === req.payload.targetRidingId);
                      const targetParty = parties.find(p => p.id === req.payload.targetPartyId);

                      return (
                        <div key={req.id} className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: actor?.color }} />
                                <span className="font-bold text-sm" style={{ color: actor?.color }}>{actor?.name}</span>
                                <span className="text-neutral-500 text-xs">→</span>
                                <span className="bg-neutral-700 text-neutral-200 text-xs font-bold uppercase px-1.5 py-0.5 rounded">{req.payload.actionType.replace('_', ' ')}</span>
                              </div>
                              <div className="text-xs text-neutral-400 space-y-0.5 pl-4">
                                {targetRiding && <div>Riding: <span className="text-white">{targetRiding.name}</span></div>}
                                {targetParty && <div>Target: <span className="text-white">{targetParty.name}</span></div>}
                                {req.payload.demographic && <div>Demo: <span className="text-white">{req.payload.demographic}</span></div>}
                                {req.payload.medium && <div>Medium: <span className="text-white">{req.payload.medium}</span></div>}
                                {req.payload.cost && req.payload.cost > 0 && <div>Spend: <span className="text-green-400 font-mono">${req.payload.cost}</span></div>}
                                {req.payload.upgradeId && <div>Upgrade: <span className="text-purple-400">{req.payload.upgradeId.replace('_', ' ')}</span></div>}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                applyAction(req);
                                removeQueuedAction(req.id);
                                toast.success(`✅ Approved: ${actor?.name} — ${req.payload.actionType}`);
                                
                                // Async: replace the plain log message with AI flavor text
                                const newEntries = useGameStore.getState().actionLog;
                                const newEntry = newEntries[newEntries.length - 1];
                                
                                if (newEntry) {
                                  import('../utils/flavorText').then(({ generateFlavorText }) => {
                                    const tParty = parties.find(p => p.id === req.payload.targetPartyId);
                                    const tRiding = ridings.find(r => r.id === req.payload.targetRidingId);
                                    generateFlavorText(
                                      { actionType: req.payload.actionType, partyName: actor?.name ?? 'A party', targetPartyName: tParty?.name, ridingName: tRiding?.name },
                                      newEntry.message
                                    ).then(msg => updateLogMessage(newEntry.id, msg));
                                  }).catch(err => console.error('[Ticker] Failed to import flavorText:', err));
                                }
                              }}
                              className="flex-1 bg-green-700 hover:bg-green-600 text-white text-sm font-bold py-1.5 px-3 rounded transition-colors"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => {
                                removeQueuedAction(req.id);
                                toast.error(`❌ Rejected: ${actor?.name} — ${req.payload.actionType}`);
                              }}
                              className="flex-1 bg-red-900 hover:bg-red-800 text-white text-sm font-bold py-1.5 px-3 rounded transition-colors"
                            >
                              ✗ Reject
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-neutral-800" />

        <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Manual Action Input</h2>
        
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6 flex flex-col gap-4">
          
          
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Source Party</label>
            <select 
              className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white"
              value={selectedPartyId}
              onChange={e => setSelectedPartyId(e.target.value)}
            >
              <option value="">-- Select Party --</option>
              {parties.map(p => (
                <option key={p.id} value={p.id}>{p.name} (AP: {p.ap}, Funds: ${p.funds})</option>
              ))}
            </select>
          </div>

          
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Action Type</label>
            <select 
              className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white"
              value={actionType}
              onChange={e => {
                setActionType(e.target.value as ActionPayload['actionType']);
                setPreviewMsg(null);
              }}
            >
              <option value="fundraise">Fundraise (1 AP)</option>
              <option value="campaign">Campaign (1 AP)</option>
              <option value="research">Research (1 AP)</option>
              <option value="recon">Recon (1 AP)</option>
              <option value="scandal">Scandal (2 AP)</option>
              <option value="misinformation">Misinformation (2 AP)</option>
              <option value="hack">Hack (2 AP)</option>
              <option value="crisis_response">Crisis Response (1 AP)</option>
              <option value="last_push">Last Push (1 AP) [Round 4 Only]</option>
              <option value="purchase_upgrade">Purchase Upgrade</option>
            </select>
          </div>

          
          <div className="flex gap-4">
            {showPartySelect && (
              <div className="flex-1">
                <label className="block text-sm text-neutral-400 mb-1">Target Party</label>
                <select 
                  className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white"
                  value={targetPartyId}
                  onChange={e => setTargetPartyId(e.target.value)}
                >
                  <option value="">-- Select Opponent --</option>
                  {parties.filter(p => p.id !== selectedPartyId).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {showRidingSelect && (
              <div className="flex-1">
                <label className="block text-sm text-neutral-400 mb-1">Target Riding</label>
                <select 
                  className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white"
                  value={targetRidingId}
                  onChange={e => setTargetRidingId(e.target.value)}
                >
                  <option value="">-- Select Riding --</option>
                  {ridings.map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.seats} Seats)</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {showCampaignFields && (
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm text-neutral-400 mb-1">Demographic Focus</label>
                <select 
                  className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white"
                  value={demographic}
                  onChange={e => setDemographic(e.target.value as Demographic)}
                >
                  <option value="Youth">Youth</option>
                  <option value="Seniors">Seniors</option>
                  <option value="Workers">Workers</option>
                  <option value="Business">Business</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm text-neutral-400 mb-1">Medium</label>
                <select 
                  className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white"
                  value={medium}
                  onChange={e => setMedium(e.target.value as Medium)}
                >
                  <option value="Social">Social Media</option>
                  <option value="Traditional">Traditional Media</option>
                  <option value="Canvassing">Canvassing</option>
                  <option value="Lobbying">Lobbying</option>
                </select>
              </div>
            </div>
          )}

          {showUpgradeSelect && (
             <div>
                <label className="block text-sm text-neutral-400 mb-1">Upgrade ID</label>
                <select 
                  className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white"
                  value={upgradeId}
                  onChange={e => setUpgradeId(e.target.value as UpgradeId)}
                >
                  <option value="grassroots">Tier 1: Grassroots Network</option>
                  <option value="social_media">Tier 1: Social Media Mastery</option>
                  <option value="deep_pockets">Tier 1: Deep Pockets</option>
                  <option value="oppo_research">Tier 2: Oppo Research</option>
                  <option value="scandal_shield">Tier 2: Scandal Shield</option>
                  <option value="regional_strong">Tier 2: Regional Stronghold</option>
                  <option value="party_machine">Tier 3: Party Machine</option>
                  <option value="dark_money">Tier 3: Dark Money</option>
                  <option value="cyber_division">Tier 3: Cyber Division</option>
                </select>
              </div>
          )}

          {showCostField && (
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Cost ($)</label>
              <input 
                type="number" 
                min="0"
                className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-white"
                value={costText}
                onChange={e => setCostText(e.target.value)}
                placeholder="Enter funds to spend..."
              />
            </div>
          )}

          
          <div className="flex gap-4 mt-4 pt-4 border-t border-neutral-700">
            <button 
              onClick={calculatePreview}
              className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              Preview Outcome
            </button>
            <button 
              onClick={handleConfirm}
              disabled={!previewMsg || previewMsg.includes('❌')}
              className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              Confirm
            </button>
          </div>

          {previewMsg && (
            <div className={`mt-2 p-3 rounded text-sm ${previewMsg.includes('❌') ? 'bg-red-900/50 text-red-200 border border-red-800' : 'bg-blue-900/50 text-blue-200 border border-blue-800'}`}>
              <p className="font-mono">{previewMsg}</p>
            </div>
          )}

        </div>
      </div>

      
      <div className="w-1/4 flex flex-col p-4 bg-neutral-900/50 overflow-y-auto">
        <h2 className="text-lg font-bold mb-6 text-neutral-400 uppercase tracking-widest text-sm text-right">Secret Intel</h2>
        
        
        <div className="mb-6">
          <h3 className="text-sm border-b border-neutral-700 pb-2 mb-3 text-red-400 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Active Traps</span>
            <span className="bg-red-900 text-red-200 text-xs px-2 py-0.5 rounded-full">{parties.flatMap(p => p.traps).length}</span>
          </h3>
          
          {parties.flatMap(p => p.traps).length === 0 ? (
            <p className="text-neutral-500 text-sm italic">No active misinformation traps.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {parties.map(party => 
                party.traps.map(trap => {
                  const targetName = parties.find(p => p.id === trap.targetPartyId)?.name;
                  return (
                    <div key={trap.id} className="bg-neutral-800 p-2 rounded border border-neutral-700 text-neutral-300">
                      <span className="font-bold text-red-400">Target: {targetName}</span>
                      <div className="text-xs text-neutral-500 mt-1">
                        Placed by: {trap.isHidden ? "Unknown (Dark Money)" : party.name}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        
        {/* ── Dark Operations (teacher-only intelligence) ── */}
        {darkOps.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm border-b border-neutral-700 pb-2 mb-3 text-rose-400 font-bold uppercase tracking-wider flex items-center gap-2">
              <span>🕵️ Active Dark Ops</span>
              <span className="text-neutral-600 text-xs font-normal ml-auto">teacher only</span>
            </h3>
            <div className="space-y-1.5">
              {darkOps.map(op => {
                const src = parties.find(p => p.id === op.sourcePartyId);
                const tgt = parties.find(p => p.id === op.targetPartyId);
                const labels: Record<string, string> = {
                  bot_farm: '🤖 BotFarm',
                  media_buyout: '📺 MediaBuyout',
                  chamber_deal: '💼 ChamberDeal',
                  influencer_blackout: '📵 InfluencerBlackout',
                  donor_freeze: '🧊 DonorFreeze',
                };
                return (
                  <div key={op.id} className="text-xs rounded border border-rose-900/60 bg-rose-950/40 px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-rose-500" />
                      <span className="text-rose-300 font-bold">{labels[op.type] ?? op.type}</span>
                      {op.expiryRound < 9999 && <span className="ml-auto text-neutral-500 font-mono">exp R{op.expiryRound}</span>}
                    </div>
                    <div className="text-neutral-400 mt-0.5 pl-3">
                      <span>by </span><span style={{ color: src?.color }} className="font-semibold">{src?.name ?? op.sourcePartyId}</span>
                      {tgt && <><span> → </span><span style={{ color: tgt.color }} className="font-semibold">{tgt.name}</span></>}
                      {op.targetRegion && <span className="text-neutral-500"> ({op.targetRegion})</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mb-6">
          <h3 className="text-sm border-b border-neutral-700 pb-2 mb-3 text-amber-400 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Action Log</span>
            <span className="text-neutral-600 text-xs font-normal">last 10</span>
          </h3>
          {actionLog.length === 0 ? (
            <p className="text-neutral-500 text-sm italic">No actions yet this game.</p>
          ) : (
            <div className="space-y-1.5">
              {[...actionLog].reverse().slice(0, 10).map(entry => {
                const actor = parties.find(p => p.id === entry.sourcePartyId);
                return (
                  <div key={entry.id} className="text-xs rounded bg-neutral-800 border border-neutral-700/50 px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {actor && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: actor.color }} />}
                      <span className="text-neutral-500 font-mono">R{entry.round}</span>
                      <span className="text-neutral-600">·</span>
                      <span className="uppercase text-neutral-500 font-bold tracking-wider text-[10px]">{entry.actionType}</span>
                    </div>
                    <p className="text-neutral-300 leading-tight">{entry.message}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        
        <div className="flex-1 min-h-0 flex flex-col">
           <h3 className="text-sm border-b border-neutral-700 pb-2 mb-3 text-purple-400 font-bold uppercase tracking-wider flex items-center justify-between mt-auto pt-4 shadow-[0_-10px_10px_-10px_rgba(0,0,0,0.5)]">
             <span>Riding Demographics (Hidden)</span>
             <span className="text-xs text-neutral-500">Master List</span>
           </h3>
           <div className="overflow-y-auto pr-2 custom-scrollbar flex-1 border border-neutral-800 rounded">
             <table className="w-full text-xs text-left text-neutral-400">
               <thead className="bg-neutral-800 text-neutral-300 sticky top-0">
                 <tr>
                   <th className="p-2 font-medium">Riding</th>
                   <th className="p-2 font-medium">Strong (2x)</th>
                   <th className="p-2 font-medium">Weak (0.5x)</th>
                 </tr>
               </thead>
               <tbody>
                 {ridings.map((riding, idx) => (
                   <tr key={riding.id} className={`border-b border-neutral-800/50 hover:bg-neutral-800 ${idx % 2 === 0 ? 'bg-neutral-900' : 'bg-neutral-800/20'}`}>
                     <td className="p-2 font-medium text-neutral-300">{riding.name}</td>
                     <td className="p-2 text-green-400">{riding.strongDemo}</td>
                     <td className="p-2 text-red-400">{riding.weakDemo}</td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      </div>
      </div>
    </div>
  );
}
