import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useSyncMiddleware } from '../store/syncMiddleware';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { Riding } from '../types/game';
import { HackAnimation } from '../components/HackAnimation';

// ─── Region drill-down types ───────────────────────────────
type DrillLevel = 'regions' | 'ridings' | 'detail';

// ─── Fundraise Wheel Component ─────────────────────────────
const DOLLAR_AMOUNTS = [5, 6, 7, 8, 9, 10];
const WHEEL_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7'];

function FundraiseWheel({ amount, partyName, partyColor, onDone }: {
  amount: number;
  partyName: string;
  partyColor: string;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<'spinning' | 'landing' | 'done'>('spinning');
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // The wheel pointer is at top (12 o'clock). We rotate the disc so the target slice faces up.
  const sliceAngle = 360 / DOLLAR_AMOUNTS.length;
  const targetIndex = DOLLAR_AMOUNTS.indexOf(amount);
  // Each wheel slice i is centered at i*sliceAngle degrees (0 = top).
  // To center targetIndex slice under the pointer we rotate by -(targetIndex * sliceAngle)
  const landDeg = 1440 - (targetIndex * sliceAngle); // 4 full spins + target alignment

  useEffect(() => {
    // Phase 1: spin freely for 2.5s
    const t1 = setTimeout(() => setPhase('landing'), 2500);
    // Phase 2: 1.5s easing transition to final angle, then show result
    const t2 = setTimeout(() => setPhase('done'), 4000 + 200);
    // Phase 3: dismiss after result shown
    const t3 = setTimeout(() => onDoneRef.current(), 4000 + 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const discStyle: React.CSSProperties =
    phase === 'spinning'
      ? {} // spin applied via className
      : { transform: `rotate(${landDeg}deg)`, transition: 'transform 1.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6">
        {/* Party label */}
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: partyColor }} />
          <span className="text-white font-black text-2xl uppercase tracking-widest">{partyName}</span>
          <span className="text-neutral-400 text-xl">is fundraising!</span>
        </div>

        {/* Wheel */}
        <div className="relative w-72 h-72">
          {/* Pointer (top) */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10 text-white text-4xl drop-shadow-lg leading-none">▼</div>

          {/* Spinning disc */}
          <div
            className={`w-full h-full rounded-full border-4 border-white shadow-2xl overflow-hidden relative ${phase === 'spinning' ? 'animate-spin' : ''}`}
            style={discStyle}
          >
            {/* SVG Wheel */}
            <svg viewBox="0 0 200 200" className="w-full h-full">
              {DOLLAR_AMOUNTS.map((amt, i) => {
                const startAngle = (i * sliceAngle - 90) * (Math.PI / 180);
                const endAngle = ((i + 1) * sliceAngle - 90) * (Math.PI / 180);
                const x1 = 100 + 100 * Math.cos(startAngle);
                const y1 = 100 + 100 * Math.sin(startAngle);
                const x2 = 100 + 100 * Math.cos(endAngle);
                const y2 = 100 + 100 * Math.sin(endAngle);
                const midAngle = ((i + 0.5) * sliceAngle - 90) * (Math.PI / 180);
                const textX = 100 + 65 * Math.cos(midAngle);
                const textY = 100 + 65 * Math.sin(midAngle);
                return (
                  <g key={amt}>
                    <path
                      d={`M 100 100 L ${x1} ${y1} A 100 100 0 0 1 ${x2} ${y2} Z`}
                      fill={WHEEL_COLORS[i % WHEEL_COLORS.length]}
                    />
                    <text
                      x={textX} y={textY}
                      textAnchor="middle" dominantBaseline="middle"
                      fill="white" fontWeight="bold" fontSize="16"
                    >
                      ${amt}
                    </text>
                  </g>
                );
              })}
              {/* Center hub */}
              <circle cx="100" cy="100" r="15" fill="white" />
            </svg>
          </div>
        </div>

        {/* Result */}
        {phase === 'done' && (
          <div className="text-center animate-bounce">
            <span className="text-7xl font-black drop-shadow-2xl" style={{ color: partyColor }}>${amount}</span>
            <p className="text-white text-xl mt-2 font-black uppercase tracking-widest">raised!</p>
          </div>
        )}

        {/* Spin indicator */}
        {phase === 'spinning' && (
          <div className="flex gap-1">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Riding Bar Chart Modal ──────────────────────────────────
function RidingDetailModal({ riding, parties, onClose }: {
  riding: Riding;
  parties: { id: string; name: string; color: string }[];
  onClose: () => void;
}) {
  // Leader calc
  let leaderId: string | null = null;
  let maxVal = -1;
  Object.entries(riding.campaignValues).forEach(([pId, val]) => {
    if (val > maxVal) { maxVal = val; leaderId = pId; }
  });
  const leader = parties.find(p => p.id === leaderId);

  // Bar chart data — raw investments only
  const chartData = parties
    .map(p => ({ name: p.name, dollars: riding.rawInvestments?.[p.id] || 0, color: p.color }))
    .filter(d => d.dollars > 0)
    .sort((a, b) => b.dollars - a.dollars);

  const hasData = chartData.length > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-[480px] max-w-[90vw] overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between"
             style={{ borderBottomColor: (leader?.color ?? '#555') + '66' }}>
          <div>
            <h2 className="text-xl font-black text-white">{riding.name}</h2>
            <div className="flex items-center gap-2 mt-1 text-sm text-neutral-400">
              <span>{riding.region}</span>
              <span>·</span>
              <span className="font-bold text-white">{riding.seats} Seats</span>
              {leader && <span>·</span>}
              {leader && (
                <span className="font-bold" style={{ color: leader.color }}>
                  Leading: {leader.name}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-2xl transition-colors leading-none">✕</button>
        </div>

        {/* Chart */}
        <div className="p-6">
          <h3 className="text-xs text-neutral-500 uppercase tracking-wider font-bold mb-4">Campaign Dollars Invested</h3>
          {!hasData ? (
            <div className="text-center text-neutral-600 italic py-8">No investments yet in this riding.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <XAxis dataKey="name" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickFormatter={v => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#f1f5f9', fontWeight: 'bold' }}
                  formatter={(val) => [`$${val}`, 'Invested']}
                />
                <Bar dataKey="dollars" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Party breakdown rows */}
        {hasData && (
          <div className="px-6 pb-5 flex flex-col gap-1.5">
            {chartData.map(d => (
              <div key={d.name} className="flex items-center gap-2 text-sm">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-neutral-300 flex-1">{d.name}</span>
                <span className="font-mono font-bold text-white">${d.dollars}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Region Card ─────────────────────────────────────────────
function RegionCard({ region, ridings, parties, onClick }: {
  region: string;
  ridings: Riding[];
  parties: { id: string; name: string; color: string }[];
  onClick: () => void;
}) {
  // Tally seats in this region
  const regionSeats: Record<string, number> = {};
  let unclaimed = 0;
  ridings.forEach(r => {
    let leaderId: string | null = null;
    let maxVal = -1;
    Object.entries(r.campaignValues).forEach(([pId, val]) => {
      if (val > maxVal) { maxVal = val; leaderId = pId; }
    });
    if (leaderId && maxVal > 0) {
      regionSeats[leaderId] = (regionSeats[leaderId] || 0) + r.seats;
    } else {
      unclaimed += r.seats;
    }
  });

  const totalSeats = ridings.reduce((s, r) => s + r.seats, 0);
  const leader = parties.reduce<{ id: string; name: string; color: string } | null>((best, p) => {
    if (!best || (regionSeats[p.id] || 0) > (regionSeats[best.id] || 0)) return p;
    return best;
  }, null);

  return (
    <button
      onClick={onClick}
      className="bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600 hover:border-slate-400 rounded-2xl p-5 text-left transition-all duration-200 active:scale-95 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="font-black text-lg text-white">{region}</span>
        <span className="text-xs text-neutral-400 font-mono">{ridings.length} ridings · {totalSeats} seats</span>
      </div>

      {/* Mini seat bar */}
      <div className="h-2 rounded-full bg-slate-700 overflow-hidden flex">
        {parties.map(p => {
          const pct = totalSeats > 0 ? ((regionSeats[p.id] || 0) / totalSeats) * 100 : 0;
          return pct > 0
            ? <div key={p.id} style={{ width: `${pct}%`, backgroundColor: p.color }} />
            : null;
        })}
        {unclaimed > 0 && (
          <div style={{ width: `${(unclaimed / totalSeats) * 100}%`, backgroundColor: '#374151' }} />
        )}
      </div>

      <div className="flex items-center gap-2 text-xs">
        {leader && (regionSeats[leader.id] || 0) > 0 ? (
          <>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: leader.color }} />
            <span className="text-neutral-300">Leading: <span className="font-bold text-white">{leader.name}</span></span>
            <span className="text-neutral-500 ml-auto font-mono">{regionSeats[leader.id]} seats</span>
          </>
        ) : (
          <span className="text-neutral-600 italic">No campaigns yet</span>
        )}
      </div>

      <div className="text-xs text-blue-400 font-bold self-end">Click to drill in →</div>
    </button>
  );
}

// ─── Main BoardView ───────────────────────────────────────────
export function BoardView() {
  useSyncMiddleware(false);
  const round = useGameStore(state => state.round);
  const maxRounds = useGameStore(state => state.maxRounds);
  const ridings = useGameStore(state => state.ridings);
  const parties = useGameStore(state => state.parties);
  const actionLog = useGameStore(state => state.actionLog);

  const isElectionNight = round >= maxRounds;

  // ── Drill-down state ──
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('regions');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedRiding, setSelectedRiding] = useState<Riding | null>(null);
  const [isAllPartiesOpen, setIsAllPartiesOpen] = useState(false);

  // ── Fundraise Wheel ──
  const [wheelVisible, setWheelVisible] = useState(false);
  const [wheelData, setWheelData] = useState<{ amount: number; partyName: string; partyColor: string } | null>(null);
  const lastFundraiseId = useRef<string | null>(null);

  useEffect(() => {
    const lastFundraise = [...actionLog].reverse().find(e => e.actionType === 'fundraise');
    if (lastFundraise && lastFundraise.id !== lastFundraiseId.current && lastFundraise.metadata?.amount) {
      lastFundraiseId.current = lastFundraise.id;
      const party = parties.find(p => p.id === lastFundraise.sourcePartyId);
      if (party) {
        setWheelData({
          amount: lastFundraise.metadata.amount as number,
          partyName: party.name,
          partyColor: party.color
        });
        setWheelVisible(true);
      }
    }
  }, [actionLog, parties]);

  // ── Parliament seats ──
  const seatCounts: Record<string, number> = {};
  parties.forEach(p => { seatCounts[p.id] = 0; });
  let unclaimedSeats = 0;
  ridings.forEach(r => {
    let leaderId: string | null = null; let maxVal = -1;
    Object.entries(r.campaignValues).forEach(([pId, val]) => {
      if (val > maxVal) { maxVal = val; leaderId = pId; }
    });
    if (leaderId && maxVal > 0) seatCounts[leaderId] += r.seats;
    else unclaimedSeats += r.seats;
  });

  const totalSeats = ridings.reduce((s, r) => s + r.seats, 0);
  const parliamentData = [
    ...parties.map(p => ({ name: p.name, value: seatCounts[p.id], color: p.color })),
    { name: 'Unclaimed', value: unclaimedSeats, color: '#374151' }
  ].filter(d => d.value > 0);

  // ── Leaderboard & 2nd-place tally ──
  const secondPlaceCounts: Record<string, number> = {};
  parties.forEach(p => { secondPlaceCounts[p.id] = 0; });
  ridings.forEach(r => {
    const sorted = Object.entries(r.campaignValues)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a);
    if (sorted.length >= 2) {
      secondPlaceCounts[sorted[1][0]] = (secondPlaceCounts[sorted[1][0]] || 0) + 1;
    }
  });
  const leaderboard = [...parties]
    .map(p => ({ ...p, seats: seatCounts[p.id] || 0, secondPlace: secondPlaceCounts[p.id] || 0 }))
    .sort((a, b) => b.seats - a.seats);
  const top3 = leaderboard.slice(0, 3);

  // ── Regions ──
  const regions = Array.from(new Set(ridings.map(r => r.region)));
  const regionRidings = ridings.filter(r => r.region === selectedRegion);

  return (
    <div className={`h-screen flex flex-col overflow-hidden font-sans transition-colors duration-1000 ${isElectionNight ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900 via-slate-900 to-black text-white' : 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-white'}`}>

      {/* Fundraise Wheel Overlay */}
      {wheelVisible && wheelData && (
        <FundraiseWheel
          amount={wheelData.amount}
          partyName={wheelData.partyName}
          partyColor={wheelData.partyColor}
          onDone={() => { setWheelVisible(false); setWheelData(null); }}
        />
      )}

      {/* Riding Detail Modal */}
      {selectedRiding && (
        <RidingDetailModal
          riding={selectedRiding}
          parties={parties}
          onClose={() => setSelectedRiding(null)}
        />
      )}

      {/* Election Night Chyron */}
      {isElectionNight && (
        <div className="bg-red-600 text-white font-black uppercase text-2xl tracking-[0.2em] p-2 text-center shadow-lg animate-pulse flex-shrink-0">
          ★ Election Night Live ★
        </div>
      )}

      {/* Header bar */}
      {!isElectionNight && (
        <div className="bg-slate-950 px-6 py-3 shadow-sm flex items-center justify-between border-b border-slate-800 flex-shrink-0">
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">Canada Decides</h1>
          <div className="text-neutral-400">Round <span className="font-bold text-white">{round}</span> / {maxRounds}</div>
        </div>
      )}

      {/* Main layout — Parliament chart left, Drill-down right */}
      <div className="flex-1 flex gap-0 min-h-0">

        {/* Left: Parliament donut + seat legend */}
        <div className="w-80 flex-shrink-0 flex flex-col items-center justify-center p-6 border-r border-slate-800 gap-4">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={parliamentData}
                cx="50%" cy="100%"
                startAngle={180} endAngle={0}
                innerRadius="55%" outerRadius="100%"
                dataKey="value" stroke="none"
              >
                {parliamentData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div className="text-center -mt-8">
            <div className="text-3xl font-black text-white">{totalSeats}</div>
            <div className="text-xs text-neutral-500 uppercase tracking-wider">Total Seats</div>
          </div>

          {/* Top 3 Leaderboard */}
          <div className="w-full flex flex-col gap-2 mt-2">
            {top3.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2 bg-slate-800/60 border border-slate-700">
                {/* Medal */}
                <span className="text-lg flex-shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                {/* Logo or color dot */}
                {p.logo ? (
                  <img src={p.logo} alt={p.name}
                    className="w-8 h-8 rounded-lg object-contain bg-white/10 flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex-shrink-0 border-2 border-white/20"
                       style={{ backgroundColor: p.color }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate" style={{ color: p.color }}>{p.name}</div>
                  <div className="text-xs text-neutral-500">{p.secondPlace} 2nd place</div>
                </div>
                <div className="text-right">
                  <div className="font-black font-mono text-lg" style={{ color: p.color }}>{p.seats}</div>
                  <div className="text-[10px] text-neutral-600">seats</div>
                </div>
              </div>
            ))}
            {unclaimedSeats > 0 && (
              <div className="flex items-center justify-between text-xs text-neutral-600 px-3 py-1">
                <span>Unclaimed</span>
                <span className="font-mono">{unclaimedSeats}</span>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsAllPartiesOpen(true)}
            className="w-full mt-2 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-xs font-bold uppercase tracking-wider transition-colors"
          >
            All Parties →
          </button>
        </div>

        {/* All Parties Modal */}
        {isAllPartiesOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm"
               onClick={() => setIsAllPartiesOpen(false)}>
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[520px] max-w-[90vw] overflow-hidden shadow-2xl"
                 onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-black text-white uppercase tracking-wide">Full Standings</h2>
                <button onClick={() => setIsAllPartiesOpen(false)}
                  className="text-neutral-500 hover:text-white text-xl transition-colors">✕</button>
              </div>
              <div className="px-6 py-4 flex flex-col gap-3">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 text-[10px] uppercase tracking-wider text-neutral-500 pb-1 border-b border-slate-800">
                  <span>Party</span>
                  <span className="text-right">Seats</span>
                  <span className="text-right">2nd Place</span>
                  <span className="text-right">%</span>
                </div>
                {leaderboard.map((p, i) => {
                  const pct = totalSeats > 0 ? ((p.seats / totalSeats) * 100).toFixed(1) : '0.0';
                  const majority = totalSeats > 0 && p.seats >= Math.ceil(totalSeats / 2);
                  return (
                    <div key={p.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-neutral-500 w-5 text-xs text-right">{i + 1}.</span>
                        {p.logo ? (
                          <img src={p.logo} alt={p.name}
                            className="w-7 h-7 rounded object-contain bg-white/10 flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full flex-shrink-0"
                               style={{ backgroundColor: p.color }} />
                        )}
                        <span className="font-bold text-sm truncate" style={{ color: p.color }}>{p.name}</span>
                        {majority && <span className="text-xs bg-green-900/60 text-green-400 px-1.5 py-0.5 rounded font-bold flex-shrink-0">MAJORITY</span>}
                      </div>
                      <span className="font-black font-mono text-white text-right">{p.seats}</span>
                      <span className="font-mono text-neutral-400 text-right">{p.secondPlace}</span>
                      <span className="font-mono text-neutral-500 text-right text-xs">{pct}%</span>
                    </div>
                  );
                })}
                {unclaimedSeats > 0 && (
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center border-t border-slate-800 pt-2 mt-1">
                    <div className="flex items-center gap-2">
                      <div className="w-5" />
                      <div className="w-7 h-7 rounded-full bg-slate-700" />
                      <span className="text-neutral-500 text-sm">Unclaimed</span>
                    </div>
                    <span className="font-mono text-neutral-500 text-right">{unclaimedSeats}</span>
                    <span className="text-neutral-600 text-right">—</span>
                    <span className="font-mono text-neutral-600 text-right text-xs">{totalSeats > 0 ? ((unclaimedSeats / totalSeats) * 100).toFixed(1) : '0.0'}%</span>
                  </div>
                )}
              </div>
              <div className="px-6 pb-4 text-xs text-neutral-600 text-center">
                {totalSeats} total seats · majority at {Math.ceil(totalSeats / 2)}
              </div>
            </div>
          </div>
        )}

        {/* Right: Drill-down panel */}
        <div className="flex-1 flex flex-col min-h-0">

          {/* Breadcrumb */}
          <div className="px-6 py-3 border-b border-slate-800 flex items-center gap-2 text-sm text-neutral-500 flex-shrink-0">
            <button
              onClick={() => { setDrillLevel('regions'); setSelectedRegion(null); }}
              className={`font-bold transition-colors ${drillLevel === 'regions' ? 'text-white' : 'hover:text-neutral-300'}`}
            >
              All Regions
            </button>
            {selectedRegion && (
              <>
                <span>›</span>
                <button
                  onClick={() => setDrillLevel('ridings')}
                  className={`font-bold transition-colors ${drillLevel === 'ridings' ? 'text-white' : 'hover:text-neutral-300'}`}
                >
                  {selectedRegion}
                </button>
              </>
            )}
          </div>

          {/* Region grid */}
          {drillLevel === 'regions' && (
            <div className="flex-1 overflow-y-auto p-6">
              {ridings.length === 0 ? (
                <div className="h-full flex items-center justify-center text-neutral-600 italic">
                  Waiting for game initialization...
                </div>
              ) : (
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                  {regions.map(region => (
                    <RegionCard
                      key={region}
                      region={region}
                      ridings={ridings.filter(r => r.region === region)}
                      parties={parties}
                      onClick={() => { setSelectedRegion(region); setDrillLevel('ridings'); }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Riding grid for selected region */}
          {drillLevel === 'ridings' && selectedRegion && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                {regionRidings.map(r => {
                  let leaderId: string | null = null; let maxVal = -1; let secondVal = -1;
                  Object.entries(r.campaignValues).forEach(([pId, val]) => {
                    if (val > maxVal) { secondVal = maxVal; maxVal = val; leaderId = pId; }
                    else if (val > secondVal) { secondVal = val; }
                  });
                  const leaderParty = parties.find(p => p.id === leaderId);
                  const isContested = maxVal > 0 && secondVal > 0 && (maxVal - secondVal) <= (maxVal * 0.2);

                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRiding(r)}
                      className={`text-left p-4 rounded-xl border transition-all duration-300 active:scale-95 hover:scale-[1.02]
                        ${isContested ? 'ring-2 ring-amber-400' : ''}
                        ${leaderParty ? 'border-transparent text-white' : 'bg-slate-800 border-slate-700 text-neutral-400 hover:border-slate-500'}
                      `}
                      style={leaderParty ? { backgroundColor: leaderParty.color + 'cc' } : {}}
                    >
                      <div className="font-bold text-base leading-tight mb-2">{r.name}</div>
                      <div className="flex justify-between items-end">
                        <span className="text-xs opacity-80 font-medium">
                          {leaderParty ? leaderParty.name : 'Unclaimed'}
                        </span>
                        <span className="text-xs font-mono opacity-90">{r.seats}s</span>
                      </div>
                      {isContested && (
                        <div className="text-xs text-amber-300 font-bold mt-1">⚡ Contested</div>
                      )}
                      <div className="text-xs text-white/60 mt-1 font-medium">Click for details →</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hack Animation Overlay */}
      <HackAnimation />

      {/* Bottom Ticker */}
      <div className={`h-10 flex items-center border-t overflow-hidden px-4 flex-shrink-0 ${isElectionNight ? 'bg-red-700 border-red-800 text-white font-bold' : 'bg-slate-950 text-neutral-300 border-slate-800'}`}>
        <div className="uppercase tracking-wider text-xs font-black mr-6 shrink-0 text-neutral-500">
          ● Live
        </div>
        <div className="flex-1 overflow-hidden relative">
          {(actionLog.length > 0) ? (
            <div className="whitespace-nowrap flex items-center animate-ticker gap-16">
              {/* Duplicate the list twice for a seamless looping ticker */}
              {[...actionLog, ...actionLog].map((log, i) => (
                <span key={`${log.id}-${i}`} className="text-sm shrink-0">
                  ● {log.message}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-neutral-600 text-sm absolute inset-y-0 flex items-center">Waiting for actions...</span>
          )}
        </div>
      </div>
    </div>
  );
}
