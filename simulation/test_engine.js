import { createInitialState, resolveAction, calculateCampaignValue, getWinner } from './gameEngine.js';

let pass = 0; let fail = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓', msg); pass++; }
  else       { console.error('  ✗', msg); fail++; }
}

const PARTIES = [
  { id: 'lib', name: 'Liberals',  color: '#d00' },
  { id: 'ndp', name: 'NDP',       color: '#f80' },
];
const RIDINGS = [
  { id: 'r1', name: 'Ottawa',    seats: 10, region: 'Ontario', strongDemo: 'Youth',   weakDemo: 'Seniors' },
  { id: 'r2', name: 'Vancouver', seats:  8, region: 'BC',      strongDemo: 'Workers', weakDemo: 'Business' },
];

// ────────────────────────────────────────────────────────────────────────────
console.log('\n── Fundraise range 4-7 ──');
{
  const state = createInitialState(PARTIES, RIDINGS);
  let min = Infinity; let max = -Infinity;
  for (let i = 0; i < 500; i++) {
    const { state: s2 } = resolveAction(state, { id: `f${i}`, apCost: 1, status: 'pending', payload: { partyId: 'lib', actionType: 'fundraise' } });
    const amt = s2.parties[0].funds;
    if (amt < min) min = amt;
    if (amt > max) max = amt;
  }
  assert(min >= 4,  `fundraise min >= 4  (got ${min})`);
  assert(max <= 7,  `fundraise max <= 7  (got ${max})`);
  assert(max >= 6,  `fundraise reaches at least 6 (distribution ok, got ${max})`);
}

// ────────────────────────────────────────────────────────────────────────────
console.log('\n── Campaign value (strong demo 2×) ──');
{
  const state = createInitialState(PARTIES, RIDINGS);
  const val = calculateCampaignValue(state, 'r1', 'lib', 'Youth', 'Social', 5);
  assert(val === 10, `$5 with strong demo = 10 (got ${val})`);
}

// ────────────────────────────────────────────────────────────────────────────
console.log('\n── Per-round investment cap ($15) ──');
{
  let state = createInitialState(PARTIES, RIDINGS);
  // Give liberals money
  state = { ...state, parties: state.parties.map(p => p.id === 'lib' ? { ...p, funds: 50 } : p) };

  // First campaign: invest $10
  ({ state } = resolveAction(state, { id: 'c1', apCost: 1, status: 'pending', payload: { partyId: 'lib', actionType: 'campaign', targetRidingId: 'r1', demographic: 'Youth', medium: 'Social', cost: 10 } }));
  const roundSpent1 = state.ridings[0].roundInvestments['lib'] || 0;
  assert(roundSpent1 === 10, `After $10 campaign, roundInvestments = 10 (got ${roundSpent1})`);

  // Second campaign: try to invest $10 more — should be capped at $5 (15 - 10)
  ({ state } = resolveAction(state, { id: 'c2', apCost: 1, status: 'pending', payload: { partyId: 'lib', actionType: 'campaign', targetRidingId: 'r1', demographic: 'Youth', medium: 'Social', cost: 10 } }));
  const roundSpent2 = state.ridings[0].roundInvestments['lib'] || 0;
  assert(roundSpent2 === 15, `Cap enforced: total roundInvestments = 15 (got ${roundSpent2})`);

  // Third campaign: already at cap, should log cap message and not deduct more
  const fundsBeforeCap = state.parties[0].funds;
  ({ state } = resolveAction(state, { id: 'c3', apCost: 1, status: 'pending', payload: { partyId: 'lib', actionType: 'campaign', targetRidingId: 'r1', demographic: 'Youth', medium: 'Social', cost: 5 } }));
  assert(state.parties[0].funds === fundsBeforeCap, `Funds unchanged when at cap (${state.parties[0].funds} === ${fundsBeforeCap})`);
}

// ────────────────────────────────────────────────────────────────────────────
console.log('\n── Scandal: applies 0.5× penalty next round ──');
{
  let state = createInitialState(PARTIES, RIDINGS);
  state = { ...state, parties: state.parties.map(p => ({ ...p, funds: 50 }) ) };

  // Round 1: NDP campaigns for $10 in r1 (strong demo)
  ({ state } = resolveAction(state, { id: 'c1', apCost: 1, status: 'pending', payload: { partyId: 'ndp', actionType: 'campaign', targetRidingId: 'r1', demographic: 'Youth', medium: 'Social', cost: 10 } }));
  const valueRound1 = state.ridings[0].campaignValues['ndp'];
  assert(valueRound1 === 20, `NDP $10 + strong demo = 20 (got ${valueRound1})`);

  // Round 1: Liberals scandal NDP in r1
  ({ state } = resolveAction(state, { id: 's1', apCost: 2, status: 'pending', payload: { partyId: 'lib', actionType: 'scandal', targetPartyId: 'ndp', targetRidingId: 'r1' } }));
  const penalty = state.ridings[0].scandalPenalties['ndp'];
  assert(penalty === 2, `Scandal sets penalty expiry = round+1 = 2 (got ${penalty})`);
  assert(state.ridings[0].campaignValues['ndp'] === 20, `Scandal does NOT remove existing campaign value (got ${state.ridings[0].campaignValues['ndp']})`);

  // Simulate advancing to round 2 (reset roundInvestments as advanceRound would)
  state = {
    ...state,
    round: 2,
    ridings: state.ridings.map(r => ({ ...r, roundInvestments: {} }))
  };

  // Round 2: NDP campaigns again in r1 — should get 0.5× penalty
  ({ state } = resolveAction(state, { id: 'c2', apCost: 1, status: 'pending', payload: { partyId: 'ndp', actionType: 'campaign', targetRidingId: 'r1', demographic: 'Youth', medium: 'Social', cost: 10 } }));
  const addedValue = state.ridings[0].campaignValues['ndp'] - 20; // subtract the round-1 value
  const logMsg = state.actionLog[state.actionLog.length - 1]?.message ?? '';
  assert(addedValue === 10, `With 0.5× penalty: $10 strong-demo (20) × 0.5 = 10 added (got ${addedValue})`);
  assert(logMsg.includes('scandal-weakened'), `Log mentions scandal-weakened (got: "${logMsg}")`);
}

// ────────────────────────────────────────────────────────────────────────────
console.log('\n── getWinner ──');
{
  let state = createInitialState(PARTIES, RIDINGS);
  state = { ...state, parties: state.parties.map(p => ({ ...p, funds: 50 })) };
  ({ state } = resolveAction(state, { id: 'w1', apCost: 1, status: 'pending', payload: { partyId: 'lib', actionType: 'campaign', targetRidingId: 'r1', demographic: 'Youth', medium: 'Social', cost: 10 } }));
  ({ state } = resolveAction(state, { id: 'w2', apCost: 1, status: 'pending', payload: { partyId: 'ndp', actionType: 'campaign', targetRidingId: 'r2', demographic: 'Workers', medium: 'Canvassing', cost: 8 } }));
  const winner = getWinner(state);
  assert(winner !== null, 'Winner is not null');
  assert(winner.party.id === 'lib', `Winner is Liberals with most seats (got ${winner?.party.id})`);
  assert(winner.seats === 10, `Winner has 10 seats (got ${winner?.seats})`);
  assert(getWinner(createInitialState(PARTIES, RIDINGS)) === null, 'No winner before any campaigns');
}

// ────────────────────────────────────────────────────────────────────────────
console.log('\n── Dark Ops: BotFarm & MediaBuyout ──');
{
  let state = createInitialState(PARTIES, RIDINGS);
  state.parties.forEach(p => p.funds = 100);
  
  // BotFarm: halves Social for all
  ({ state } = resolveAction(state, { id: 'd1', apCost: 2, status: 'pending', payload: { partyId: 'lib', actionType: 'purchase_dark_op', darkOpType: 'bot_farm' } }));
  assert(state.darkOps.length === 1, 'DarkOp purchased');
  
  // NDP campaigns Social -> should be halved
  ({ state } = resolveAction(state, { id: 'c1', apCost: 1, status: 'pending', payload: { partyId: 'ndp', actionType: 'campaign', targetRidingId: 'r1', demographic: 'Workers', medium: 'Social', cost: 10 } }));
  assert(state.ridings[0].campaignValues['ndp'] === 5, `Social capped at 50% due to BotFarm (got ${state.ridings[0].campaignValues['ndp']})`);

  // MediaBuyout: halves opponent Traditional in region
  ({ state } = resolveAction(state, { id: 'd2', apCost: 2, status: 'pending', payload: { partyId: 'ndp', actionType: 'purchase_dark_op', darkOpType: 'media_buyout', targetRegionId: 'Ontario' } }));
  
  // Lib campaigns Traditional in Ontario (r1) -> halved
  ({ state } = resolveAction(state, { id: 'c2', apCost: 1, status: 'pending', payload: { partyId: 'lib', actionType: 'campaign', targetRidingId: 'r1', demographic: 'Workers', medium: 'Traditional', cost: 10 } }));
  assert(state.ridings[0].campaignValues['lib'] === 5, `Traditional capped at 50% due to MediaBuyout (got ${state.ridings[0].campaignValues['lib']})`);
}

// ────────────────────────────────────────────────────────────────────────────
console.log('\n── Dark Ops: InfluencerBlackout ──');
{
  let state = createInitialState(PARTIES, RIDINGS);
  state.parties.forEach(p => p.funds = 100);

  // Blackout
  ({ state } = resolveAction(state, { id: 'd1', apCost: 2, status: 'pending', payload: { partyId: 'lib', actionType: 'purchase_dark_op', darkOpType: 'influencer_blackout', targetPartyId: 'ndp' } }));
  ({ state } = resolveAction(state, { id: 'c1', apCost: 1, status: 'pending', payload: { partyId: 'ndp', actionType: 'campaign', targetRidingId: 'r1', demographic: 'Workers', medium: 'Social', cost: 10 } }));
  assert(state.ridings[0].campaignValues['ndp'] === 0, `Next Social by target is 0 from Blackout`);
  assert(state.darkOps.length === 0, `One-shot Blackout is consumed`);
}

// ────────────────────────────────────────────────────────────────────────────
console.log(`\n${ fail === 0 ? '✅ ALL' : `❌ ${fail} FAILED,`} TESTS PASSED`);
if (fail > 0) process.exit(1);
