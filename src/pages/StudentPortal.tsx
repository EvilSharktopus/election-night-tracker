import React, { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useSyncMiddleware } from '../store/syncMiddleware';
import { dispatchActionRequest } from '../store/syncMiddleware';
import { ActionPayload, Demographic, Medium, UpgradeId, DarkOpType } from '../types/game';
import toast, { Toaster } from 'react-hot-toast';

export function StudentPortal() {
  // Students receive state but don't broadcast actions themselves
  useSyncMiddleware(false);

  const { id: partyIdParam } = useParams<{ id: string }>();
  const parties = useGameStore(state => state.parties);
  const ridings = useGameStore(state => state.ridings);
  const round = useGameStore(state => state.round);
  const phase = useGameStore(state => state.phase);
  const queuedActions = useGameStore(state => state.queuedActions);
  const actionLog = useGameStore(state => state.actionLog);
  const updatePartyLogo = useGameStore(state => state.updatePartyLogo);
  const updatePartyPassword = useGameStore(state => state.updatePartyPassword);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const UPGRADE_DESCS: Record<string, string> = {
    grassroots: '+20% Canvassing value',
    social_media: '+$1 base Social value',
    deep_pockets: '+30% Fundraise yield',
    oppo_research: 'Recon costs 0 AP',
    scandal_shield: 'Blocks first Scandal (once)',
    firewall: 'Blocks opponent hacks (0% chance)',
    regional_strong: 'Regional bonus',
    party_machine: '+2 AP per round',
    dark_money: 'Invisible traps',
    cyber_division: '70% Hack success',
  };

  const UPGRADE_COSTS: Record<string, number> = {
    grassroots: 3, social_media: 3, deep_pockets: 3,
    oppo_research: 5, scandal_shield: 5, firewall: 12, regional_strong: 5,
    party_machine: 8, dark_money: 8, cyber_division: 8,
  };

  const HACK_COST = 4;
  const DARK_OP_COST = 5;

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // Action form state
  const [actionType, setActionType] = useState<ActionPayload['actionType']>('fundraise');
  const [targetRidingId, setTargetRidingId] = useState('');
  const [targetPartyId, setTargetPartyId] = useState('');
  const [demographic, setDemographic] = useState<Demographic>('Youth');
  const [medium, setMedium] = useState<Medium>('Social');
  const [costText, setCostText] = useState('');
  const [upgradeId, setUpgradeId] = useState<UpgradeId>('grassroots');
  const [darkOpType, setDarkOpType] = useState<DarkOpType>('bot_farm');
  const [targetRegionId, setTargetRegionId] = useState('');
  const [note, setNote] = useState('');

  const party = parties.find(p => p.id === partyIdParam);

  // Simple PIN = party name lowercase, first 4 chars
  const expectedPin = party ? party.name.toLowerCase().slice(0, 4) : '';

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const isCorrect = party?.password ? pin === party.password : pin.toLowerCase() === expectedPin;
    if (isCorrect) {
      setIsAuthenticated(true);
      toast.success(`Welcome, ${party?.name}!`);
    } else {
      toast.error('Incorrect PIN. Ask your teacher.');
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!party) return;
    if (newPassword.trim().length < 4) {
      toast.error('Password must be at least 4 characters.');
      return;
    }
    updatePartyPassword(party.id, newPassword.trim());
    toast.success('Password changed successfully!');
    setNewPassword('');
    setShowSettings(false);
  };

  const buildPayload = (): ActionPayload => {
    let finalCost = parseInt(costText) || 0;
    if (actionType === 'purchase_upgrade') finalCost = UPGRADE_COSTS[upgradeId] ?? 5;
    if (actionType === 'hack') finalCost = HACK_COST;
    if (actionType === 'purchase_dark_op') finalCost = DARK_OP_COST;
    return {
      partyId: partyIdParam!,
      actionType,
      targetRidingId: targetRidingId || undefined,
      targetPartyId: targetPartyId || undefined,
      targetRegionId: targetRegionId || undefined,
      demographic: actionType === 'campaign' ? demographic : undefined,
      medium: actionType === 'campaign' ? medium : undefined,
      cost: finalCost,
      upgradeId: actionType === 'purchase_upgrade' ? upgradeId : undefined,
      darkOpType: actionType === 'purchase_dark_op' ? darkOpType : undefined,
    };
  };

  const handleSubmit = () => {
    if (!party) return;

    const apCost = ['scandal', 'misinformation', 'hack', 'purchase_dark_op'].includes(actionType) ? 2
      : actionType === 'research' ? 0 : 1;
    if (party.ap < apCost) {
      toast.error(`Not enough AP! Need ${apCost}, have ${party.ap}.`);
      return;
    }
    if (actionType === 'campaign' && party.funds < (parseInt(costText) || 0)) {
      toast.error(`Not enough funds! Need $${costText}, have $${party.funds}.`);
      return;
    }
    if (actionType === 'hack') {
      if (party.funds < HACK_COST) {
        toast.error(`Not enough funds! Hack costs $${HACK_COST}, you have $${party.funds}.`);
        return;
      }
      // Hack cooldown rule: No consecutive hacks on the same target
      const targetParty = parties.find(p => p.id === targetPartyId);
      const hackedLastRound = actionLog.some(log => 
        log.round === round - 1 &&
        log.actionType === 'hack' &&
        log.sourcePartyId === party.id &&
        (log.metadata as any)?.targetName === targetParty?.name
      );
      if (hackedLastRound) {
        toast.error(`Hack Cooldown! You cannot hack ${targetParty?.name} on consecutive rounds.`);
        return;
      }
    }
    if (actionType === 'purchase_upgrade' && party.funds < (UPGRADE_COSTS[upgradeId] ?? 5)) {
      toast.error(`Not enough funds! This upgrade costs $${UPGRADE_COSTS[upgradeId] ?? 5}, you have $${party.funds}.`);
      return;
    }
    if (actionType === 'purchase_dark_op' && party.funds < DARK_OP_COST) {
      toast.error(`Not enough funds! Dark Ops cost $${DARK_OP_COST}, you have $${party.funds}.`);
      return;
    }

    dispatchActionRequest(buildPayload());
    toast.success('Action submitted! Waiting for teacher approval.');

    // Reset form
    setCostText('');
    setNote('');
    setTargetRidingId('');
    setTargetPartyId('');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !party) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      updatePartyLogo(party.id, base64);
      toast.success('Logo updated globally!');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Loading state — waiting for game data to sync
  if (parties.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-white flex-col gap-4">
        <Toaster position="top-center" />
        <div className="text-4xl animate-pulse">🗳️</div>
        <p className="text-neutral-400 text-lg">Waiting for game to start...</p>
        <p className="text-neutral-600 text-sm">URL: /party/{partyIdParam}</p>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="flex h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-red-400 flex-col gap-4">
        <Toaster position="top-center" />
        <p className="text-xl font-bold">Party not found.</p>
        <p className="text-neutral-500 text-sm">Check your link: /party/{partyIdParam}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-white">
        <Toaster position="top-center" />
        <form onSubmit={handleLogin} className="flex flex-col gap-5 bg-slate-900 p-8 rounded-2xl border border-slate-700 shadow-2xl w-80">
          <div className="flex flex-col items-center gap-2">
            {party.logo ? (
              <img src={party.logo} alt="Logo" className="w-16 h-16 object-contain drop-shadow-lg" />
            ) : (
              <div className="w-10 h-10 rounded-full border-4 border-white" style={{ backgroundColor: party.color }} />
            )}
            <h2 className="text-xl font-black uppercase tracking-wide">{party.name}</h2>
            <p className="text-neutral-500 text-sm">Enter your party PIN to proceed</p>
          </div>
          <input
            type="password"
            placeholder="PIN"
            className="p-3 bg-slate-800 border border-slate-600 rounded-lg text-white text-center text-xl tracking-widest focus:outline-none focus:border-blue-500"
            value={pin}
            onChange={e => setPin(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="py-3 rounded-lg text-white font-bold text-lg transition-opacity hover:opacity-90 active:scale-95"
            style={{ backgroundColor: party.color }}
          >
            Enter
          </button>
        </form>
      </div>
    );
  }

  // Calculate seats this party leads
  let currentSeats = 0;
  ridings.forEach(r => {
    let leaderId: string | null = null;
    let maxVal = -1;
    Object.entries(r.campaignValues).forEach(([pId, val]) => {
      if (val > maxVal) { maxVal = val; leaderId = pId; }
    });
    if (leaderId === party.id && maxVal > 0) currentSeats += r.seats;
  });

  // Check if this party has pending items in the queue
  const myPendingItems = queuedActions.filter(a => a.payload.partyId === party.id && a.status === 'pending');

  const showRidingSelect = ['campaign', 'research', 'scandal', 'last_push'].includes(actionType);
  const showPartyTarget = ['recon', 'misinformation', 'hack', 'scandal'].includes(actionType);
  const showCampaignFields = actionType === 'campaign';
  const showCostField = actionType === 'campaign'; // only campaign has manual cost entry
  const showUpgradeSelect = actionType === 'purchase_upgrade';

  const apCost = ['scandal', 'misinformation', 'hack'].includes(actionType) ? 2 : 1;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-white flex flex-col font-sans relative">
      <Toaster position="top-center" />

      {/* Header */}
      <div className="relative z-10 p-4 flex items-center justify-between border-b border-slate-800 bg-slate-950/40 backdrop-blur-md"
           style={{ borderBottomColor: party.color + '44' }}>
        <div className="flex items-center gap-3">
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleLogoUpload} className="hidden" />
          <div 
            className="w-10 h-10 rounded-full cursor-pointer flex-shrink-0 border-2 border-transparent hover:border-white transition-colors overflow-hidden flex items-center justify-center bg-slate-900 relative group"
            onClick={() => fileInputRef.current?.click()}
            title="Upload Party Logo"
          >
            {party.logo ? (
              <img src={party.logo} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full" style={{ backgroundColor: party.color }} />
            )}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <span className="text-[10px] font-bold">⬆️</span>
            </div>
          </div>
          <div>
            <div className="font-black text-lg leading-tight">{party.name}</div>
            <div className="text-xs text-neutral-500 leading-tight">Round {round} · {phase}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowSettings(true)}
            className="text-neutral-400 hover:text-white transition-colors"
            title="Party Settings"
          >
            ⚙️
          </button>
          <div className="flex gap-4 text-right">
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider">AP</div>
              <div className="font-black text-xl text-blue-400">{party.ap}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider">Funds</div>
              <div className="font-black text-xl text-green-400">${party.funds}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider">Seats</div>
              <div className="font-black text-xl text-yellow-400">{currentSeats}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Party Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-neutral-500 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleChangePassword}>
              <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Change Password</label>
              <input
                type="text"
                placeholder="New Password"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 mb-4"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
              <button
                type="submit"
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors"
              >
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Pending Submissions Banner */}
      {myPendingItems.length > 0 && (
        <div className="bg-amber-900/50 border-b border-amber-700 px-4 py-2 text-amber-300 text-sm flex items-center gap-2">
          <span className="animate-pulse">⏳</span>
          <span>{myPendingItems.length} action(s) pending teacher approval</span>
        </div>
      )}

      {/* Phase Locked State */}
      {phase === 'setup' || phase === 'end' ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-3 text-neutral-500">
          <div className="text-5xl">{phase === 'end' ? '🏁' : '⏸️'}</div>
          <p className="text-xl font-bold">{phase === 'end' ? 'The election is over.' : 'Game not started yet.'}</p>
        </div>
      ) : (
        <div className="flex-1 p-4 flex flex-col gap-4 max-w-lg mx-auto w-full">
          
          {/* Active Upgrades Panel */}
          {party.upgrades.length > 0 && (
            <div className="bg-slate-900 rounded-2xl border border-purple-900/50 shadow-[0_0_15px_-3px_rgba(147,51,234,0.15)] overflow-hidden">
              <div className="px-5 py-3 border-b border-purple-900/30 bg-purple-950/20">
                <h2 className="font-bold text-sm uppercase tracking-wide text-purple-400 flex items-center gap-2">
                  <span>⚡</span> Active Tech Upgrades
                </h2>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {party.upgrades.map(u => (
                  <div key={u} className="bg-purple-900/20 border border-purple-800/30 rounded p-2 flex flex-col">
                    <span className="text-purple-300 font-bold text-xs uppercase tracking-wider">{u.replace('_', ' ')}</span>
                    <span className="text-neutral-400 text-[10px] mt-0.5">{UPGRADE_DESCS[u]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Card */}
          <div className="bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-slate-700">
              <h2 className="font-black text-lg uppercase tracking-wide">Submit Action</h2>
              <p className="text-neutral-500 text-xs mt-1">Choose an action for Round {round}. Your teacher will approve it.</p>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {/* Action Type */}
              <div>
                <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Action Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'fundraise', label: '💰 Fundraise', apCost: 1 },
                    { value: 'campaign', label: '📣 Campaign', apCost: 1 },
                    { value: 'research', label: '🔬 Research', apCost: 0 },
                    { value: 'recon', label: '🕵️ Recon', apCost: 1 },
                    { value: 'scandal', label: '📰 Scandal', apCost: 2 },
                    { value: 'misinformation', label: '🎭 Misinfo', apCost: 2 },
                    { value: 'hack', label: '💻 Hack ($4)', apCost: 2 },
                    { value: 'crisis_response', label: '🛡️ Crisis', apCost: 1 },
                    { value: 'purchase_upgrade', label: '⬆️ Upgrade', apCost: 1 },
                    { value: 'last_push', label: '🚀 Last Push', apCost: 1 },
                    { value: 'purchase_dark_op', label: '🕶️ Dark Op', apCost: 2 },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setActionType(opt.value as ActionPayload['actionType']); }}
                      className={`px-3 py-2 rounded-lg border text-sm font-bold transition-all text-left flex justify-between items-center
                        ${actionType === opt.value
                          ? 'border-transparent text-white'
                          : 'bg-slate-800 border-slate-700 text-neutral-400 hover:border-slate-500'
                        }`}
                      style={actionType === opt.value ? { backgroundColor: party.color + 'cc', borderColor: party.color } : {}}
                    >
                      <span>{opt.label}</span>
                      <span className={`text-xs ${opt.apCost === 2 ? 'text-red-400' : 'text-blue-300'} font-mono`}>{opt.apCost} AP</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* AP Warning */}
              {party.ap < apCost && (
                <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-2 text-red-300 text-sm">
                  ❌ Not enough AP — this action costs {apCost} AP but you only have {party.ap}.
                </div>
              )}

              {/* Conditional: Riding */}
              {showRidingSelect && (
                <div>
                  <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Target Riding</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
                    value={targetRidingId}
                    onChange={e => setTargetRidingId(e.target.value)}
                  >
                    <option value="">-- Select a Riding --</option>
                    {ridings.map(r => <option key={r.id} value={r.id}>{r.name} ({r.seats} seats)</option>)}
                  </select>
                </div>
              )}

              {/* Conditional: Party Target */}
              {showPartyTarget && (
                <div>
                  <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Target Party</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
                    value={targetPartyId}
                    onChange={e => setTargetPartyId(e.target.value)}
                  >
                    <option value="">-- Select Opponent --</option>
                    {parties.filter(p => p.id !== partyIdParam).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Campaign specific */}
              {showCampaignFields && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Demographic</label>
                    <select
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
                      value={demographic}
                      onChange={e => setDemographic(e.target.value as Demographic)}
                    >
                      <option value="Youth">Youth</option>
                      <option value="Seniors">Seniors</option>
                      <option value="Workers">Workers</option>
                      <option value="Business">Business</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Medium</label>
                    <select
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
                      value={medium}
                      onChange={e => setMedium(e.target.value as Medium)}
                    >
                      <option value="Social">Social Media</option>
                      <option value="Traditional">Traditional</option>
                      <option value="Canvassing">Canvassing</option>
                      <option value="Lobbying">Lobbying</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Cost field */}
              {showCostField && (
                <div>
                  <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">
                    Spend ($) <span className="text-neutral-600 normal-case">— you have ${party.funds}</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={party.funds}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
                    value={costText}
                    onChange={e => setCostText(e.target.value)}
                    placeholder="Enter amount..."
                  />
                </div>
              )}

              {/* Dark Op selector */}
              {actionType === 'purchase_dark_op' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Dark Op Type</label>
                    <select
                      className="w-full bg-slate-800 border border-rose-800 rounded-lg p-3 text-white focus:outline-none focus:border-rose-500"
                      value={darkOpType}
                      onChange={e => setDarkOpType(e.target.value as DarkOpType)}
                    >
                      <option value="bot_farm">🤖 BotFarm — Social campaigns 50% weaker (all, 1 round)</option>
                      <option value="media_buyout">📺 MediaBuyout — Opponent Traditional 50% weaker in region (1 round)</option>
                      <option value="chamber_deal">💼 ChamberDeal — Business demo = 0 for opponents in region (1 round)</option>
                      <option value="influencer_blackout">📵 InfluencerBlackout — Target's next Social = 0</option>
                      <option value="donor_freeze">🧊 DonorFreeze — Target's next Fundraise = $0</option>
                    </select>
                  </div>
                  {['media_buyout', 'chamber_deal'].includes(darkOpType) && (
                    <div>
                      <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Target Region</label>
                      <select
                        className="w-full bg-slate-800 border border-rose-800 rounded-lg p-3 text-white focus:outline-none"
                        value={targetRegionId}
                        onChange={e => setTargetRegionId(e.target.value)}
                      >
                        <option value="">-- Select Region --</option>
                        {['BC', 'Prairies', 'Ontario', 'Quebec', 'Atlantic'].map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Upgrade selector */}
              {showUpgradeSelect && (
                <div>
                  <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Upgrade</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
                    value={upgradeId}
                    onChange={e => setUpgradeId(e.target.value as UpgradeId)}
                  >
                    <option value="grassroots">Tier 1: Grassroots Network — $3</option>
                    <option value="social_media">Tier 1: Social Media Mastery — $3</option>
                    <option value="deep_pockets">Tier 1: Deep Pockets — $3</option>
                    <option value="oppo_research">Tier 2: Oppo Research — $5</option>
                    <option value="scandal_shield">Tier 2: Scandal Shield — $5</option>
                    <option value="regional_strong">Tier 2: Regional Stronghold — $5</option>
                    <option value="firewall">Tier 2: Firewall — $12</option>
                    <option value="party_machine">Tier 3: Party Machine — $8</option>
                    <option value="dark_money">Tier 3: Dark Money — $8</option>
                    <option value="cyber_division">Tier 3: Cyber Division — $8</option>
                  </select>
                  <p className="text-xs text-purple-400 mt-1.5 font-semibold">Cost: ${UPGRADE_COSTS[upgradeId] ?? 5} · {UPGRADE_DESCS[upgradeId] ?? ''}</p>
                </div>
              )}

              {/* Optional note */}
              <div>
                <label className="block text-xs text-neutral-500 uppercase tracking-wider mb-2">Note to Teacher (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 'targeting youth in BC to flip it'"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 text-sm"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>

              {/* Action description */}
              {(() => {
                const desc: Record<string, string> = {
                  fundraise:        '💰 Spin the wheel for $5–$10. No targeting needed — just pure cash.',
                  campaign:         '📣 Invest funds into a riding. Choose a demographic and medium to maximise your score. Strong demo = 2× boost; weak demo = 0.5×.',
                  research:         '🔬 Secretly reveal the strong and weak demographics for a riding. Only you can see the results.',
                  recon:            '🕵️ Spy on another party — see their AP, Funds, and current seat count.',
                  scandal:          '📰 Leak a damaging story about a rival party. Costs 2 AP and reduces their effectiveness this round.',
                  misinformation:   '🎭 Plant a hidden trap in a riding. The next party to campaign there gets a negative result instead.',
                  hack:             '💻 Attempt to steal funds from a rival party. 50% success rate (70% with Cyber Division upgrade). Costs 2 AP.',
                  crisis_response:  '🛡️ Defend your party against incoming attacks or negative press. Reduces the impact of scandals this round.',
                  last_push:        '🚀 An all-in push into a riding — double the normal campaign value. Only usable in Round 4.',
                  purchase_upgrade: '⬆️ Spend AP to permanently unlock a party upgrade from the tech tree. Upgrades persist for the rest of the game.',
                };
                const text = desc[actionType];
                if (!text) return null;
                return (
                  <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-sm text-neutral-300 leading-relaxed">
                    {text}
                  </div>
                );
              })()}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={party.ap < apCost}
                className="w-full py-4 rounded-xl font-black text-lg uppercase tracking-wide transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                style={{ backgroundColor: party.ap >= apCost ? party.color : '#374151' }}
              >
                Submit Action
              </button>
            </div>
          </div>

          {/* Owned Upgrades */}
          {party.upgrades.length > 0 && (
            <div className="bg-slate-900 rounded-2xl border border-slate-700 p-4">
              <h3 className="text-xs text-neutral-500 uppercase tracking-wider mb-3">Your Upgrades</h3>
              <div className="flex flex-wrap gap-2">
                {party.upgrades.map(u => (
                  <span key={u} className="px-2 py-1 bg-slate-800 border border-slate-600 rounded-full text-xs text-neutral-300">{u.replace(/_/g, ' ')}</span>
                ))}
              </div>
            </div>
          )}

          {/* My Riding Investments */}
          {(() => {
            // Build list of ridings this party has invested in, with placement info
            const myRidings = ridings
              .filter(r => (r.campaignValues[party.id] || 0) > 0)
              .map(r => {
                // Sort all parties by campaignValue desc to get placement
                const sorted = Object.entries(r.campaignValues)
                  .filter(([, v]) => v > 0)
                  .sort(([, a], [, b]) => b - a);
                const place = sorted.findIndex(([pid]) => pid === party.id) + 1;
                const myValue = r.campaignValues[party.id] || 0;
                const leader = parties.find(p => p.id === sorted[0]?.[0]);
                return { riding: r, place, myValue, leader, totalCompeting: sorted.length };
              })
              .sort((a, b) => a.place - b.place);

            if (myRidings.length === 0) return null;

            const placeLabel = (n: number) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
            const placeColor = (n: number) => n === 1 ? 'text-yellow-400' : n === 2 ? 'text-slate-300' : n === 3 ? 'text-amber-600' : 'text-neutral-500';

            return (
              <div className="bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
                  <h3 className="text-xs text-neutral-500 uppercase tracking-wider">My Riding Investments</h3>
                  <span className="text-xs text-neutral-600">{myRidings.length} riding{myRidings.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-slate-800">
                  {myRidings.map(({ riding, place, myValue, leader, totalCompeting }) => (
                    <div key={riding.id} className="px-5 py-3 flex items-center gap-3">
                      {/* Place badge */}
                      <span className={`font-black text-base w-8 text-center flex-shrink-0 ${placeColor(place)}`}>
                        {placeLabel(place)}
                      </span>
                      {/* Riding info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-white truncate">{riding.name}</div>
                        <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2">
                          <span>{riding.seats} seats</span>
                          {place > 1 && leader && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                Leading:
                                <span className="font-bold" style={{ color: leader.color }}>{leader.name}</span>
                              </span>
                            </>
                          )}
                          {place === 1 && totalCompeting > 1 && (
                            <>
                              <span>·</span>
                              <span className="text-yellow-600">{totalCompeting - 1} chasing</span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Campaign value */}
                      <div className="text-right flex-shrink-0">
                        <div className="font-mono text-sm font-bold" style={{ color: party.color }}>
                          {myValue.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-neutral-600">value</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Research Log */}
          <div className="bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-xs text-neutral-500 uppercase tracking-wider">Research Log</h3>
              <span className="text-xs text-neutral-600">{party.researched.length} riding{party.researched.length !== 1 ? 's' : ''} scouted</span>
            </div>
            {party.researched.length === 0 ? (
              <div className="px-5 py-4 text-neutral-600 italic text-sm text-center">
                No ridings researched yet. Use the Research action to reveal hidden demographics.
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {party.researched.map(ridingId => {
                  const riding = ridings.find(r => r.id === ridingId);
                  if (!riding) return null;
                  return (
                    <div key={ridingId} className="px-5 py-3 flex items-center justify-between">
                      <span className="font-medium text-sm text-white">{riding.name}</span>
                      <div className="flex gap-3 text-xs font-mono">
                        <span className="text-green-400">⬆ {riding.strongDemo}</span>
                        <span className="text-red-400">⬇ {riding.weakDemo}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
