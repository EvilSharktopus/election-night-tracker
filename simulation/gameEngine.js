/**
 * simulation/gameEngine.js
 *
 * All game logic as pure functions — zero React, zero Firebase, zero Zustand.
 * Each function takes state and returns new (immutable-style) state or a result.
 * Safe to run in Node.js, a web worker, or any test harness.
 *
 * Exports:
 *   createInitialState(partiesData, ridingsData, maxRounds?)        → GameState
 *   resolveAction(state, actionReq, debateMultiplier?)              → { state, logEntry }
 *   calculateCampaignValue(state, ridingId, partyId, demographic, medium, funds, debateMultiplier?) → number
 *   getWinner(state)                                                → { party, seats } | null
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const HACK_BASE_CHANCE    = 0.5;
const HACK_UPGRADE_CHANCE = 0.7;
const CAMPAIGN_ROUND_CAP  = 15;   // max $ per party per riding per round
const CAMPAIGN_MIN_COST   = 1;    // minimum spend to campaign

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Fundraise roll: 4–7 base (was 5–10).
 * Deep Pockets upgrade adds +30%.
 * Returns 0 if DonorFreeze is active (caller checks externally).
 */
function rollFundraise(hasDeepPockets) {
  const base = Math.floor(Math.random() * 4) + 4; // 4–7
  return hasDeepPockets ? Math.floor(base * 1.3) : base;
}

/** Deep-clone a plain JSON-serialisable object. */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ─── createInitialState ───────────────────────────────────────────────────────
/**
 * Build a fresh game state from configuration arrays.
 *
 * @param {Array<{id, name, color, logo?}>} partiesData
 * @param {Array<{id, name, seats, region, strongDemo, weakDemo}>} ridingsData
 * @param {number} [maxRounds=4]
 * @returns {GameState}
 */
function createInitialState(partiesData, ridingsData, maxRounds = 4) {
  return {
    round:      1,
    maxRounds,
    phase:      'active',
    parties: partiesData.map(p => ({
      id:                  p.id,
      name:                p.name,
      color:               p.color,
      logo:                p.logo ?? null,
      ap:                  3,
      funds:               0,
      upgrades:            [],
      researched:          [],
      traps:               [],
      scandalShieldActive: false,
      regionalStronghold:  null,
    })),
    ridings: ridingsData.map(r => ({
      id:               r.id,
      name:             r.name,
      seats:            r.seats,
      region:           r.region,
      strongDemo:       r.strongDemo,
      weakDemo:         r.weakDemo,
      campaignValues:   {},  // partyId → effective score
      rawInvestments:   {},  // partyId → total raw dollars (display)
      roundInvestments: {},  // partyId → dollars spent THIS round (resets on advance)
      scandalPenalties: {},  // partyId → expiry round for 0.5× debuff
    })),
    actionLog:     [],
    queuedActions: [],
    darkOps:       [],     // active DarkOp[]
  };
}

// ─── calculateCampaignValue ───────────────────────────────────────────────────
/**
 * Compute the effective campaign score that `partyId` would add in `ridingId`.
 * Applies all upgrade multipliers and round-based dark ops (BotFarm, MediaBuyout,
 * ChamberDeal). Does NOT apply one-shot dark ops (those are consumed in resolveAction).
 * Does NOT apply the trap check (that depends on random draw in resolveAction).
 *
 * @param {GameState} state
 * @param {string}    ridingId
 * @param {string}    partyId
 * @param {string}    demographic   e.g. 'Youth'
 * @param {string}    medium        e.g. 'Canvassing'
 * @param {number}    funds         raw dollars invested (already capped by caller)
 * @param {number}    [debateMultiplier=1]
 * @returns {number}  effective campaign value (before one-shot ops and traps)
 */
function calculateCampaignValue(state, ridingId, partyId, demographic, medium, funds, debateMultiplier = 1) {
  const party  = state.parties.find(p => p.id === partyId);
  const riding = state.ridings.find(r => r.id === ridingId);
  if (!party || !riding) return 0;

  let value = funds;

  // Upgrade multipliers
  if (medium === 'Canvassing' && party.upgrades.includes('grassroots'))  value *= 1.2;
  if (medium === 'Social'     && party.upgrades.includes('social_media')) value += 1;

  // Demographic multiplier
  if (demographic === riding.strongDemo)      value *= 2;
  else if (demographic === riding.weakDemo)   value *= 0.5;

  // Regional stronghold
  if (party.regionalStronghold === riding.region) value *= 1.1;

  // Debate round multiplier
  value *= debateMultiplier;

  // ── Round-based Dark Ops (visible to calculateCampaignValue) ──────────────
  // BotFarm: any active → Social ×0.5 for ALL parties
  const hasBotFarm = (state.darkOps || []).some(
    op => op.type === 'bot_farm' && op.expiryRound >= state.round);
  if (hasBotFarm && medium === 'Social') value *= 0.5;

  // MediaBuyout: opponent Traditional ×0.5 in that region
  const mediaBuyout = (state.darkOps || []).find(op =>
    op.type === 'media_buyout' && op.targetRegion === riding.region &&
    op.sourcePartyId !== partyId && op.expiryRound >= state.round);
  if (mediaBuyout && medium === 'Traditional') value *= 0.5;

  // ChamberDeal: Business demo = 0 for opponents in region
  const chamberDeal = (state.darkOps || []).find(op =>
    op.type === 'chamber_deal' && op.targetRegion === riding.region &&
    op.sourcePartyId !== partyId && op.expiryRound >= state.round);
  if (chamberDeal && demographic === 'Business') value = 0;

  return value;
}

// ─── getWinner ────────────────────────────────────────────────────────────────
/**
 * Return the party currently winning the most seats, or null if no votes cast.
 *
 * @param {GameState} state
 * @returns {{ party: object, seats: number } | null}
 */
function getWinner(state) {
  const seatCounts = {};
  state.parties.forEach(p => { seatCounts[p.id] = 0; });

  state.ridings.forEach(r => {
    let leaderId = null;
    let maxVal   = -1;
    Object.entries(r.campaignValues).forEach(([pId, val]) => {
      if (val > maxVal) { maxVal = val; leaderId = pId; }
    });
    if (leaderId && maxVal > 0) {
      seatCounts[leaderId] = (seatCounts[leaderId] || 0) + r.seats;
    }
  });

  let winner = null;
  let maxSeats = -1;
  state.parties.forEach(p => {
    if (seatCounts[p.id] > maxSeats) { maxSeats = seatCounts[p.id]; winner = p; }
  });

  return winner && maxSeats > 0 ? { party: winner, seats: maxSeats } : null;
}

// ─── resolveAction ────────────────────────────────────────────────────────────
/**
 * Apply an approved action to the state. This is the core game-engine function.
 * Returns a new state object (does NOT mutate the input) plus a log entry.
 *
 * @param {GameState}    state
 * @param {ActionRequest} actionReq  { id, payload, apCost, status }
 * @param {number}       [debateMultiplier=1]
 * @returns {{ state: GameState, logEntry: LogEntry | null }}
 */
function resolveAction(state, actionReq, debateMultiplier = 1) {
  const s = clone(state);
  const payload = actionReq.payload;

  const sourceParty = s.parties.find(p => p.id === payload.partyId);
  if (!sourceParty) return { state: s, logEntry: null };

  const cost = payload.cost || 0;
  let logMessage = '';

  // AP deduction for manually-applied (non-queued) actions
  const isFromQueue = s.queuedActions.some(a => a.id === actionReq.id);
  if (!isFromQueue) {
    let apCost = 1;
    if (['scandal', 'misinformation', 'hack', 'purchase_dark_op'].includes(payload.actionType)) apCost = 2;
    if (payload.actionType === 'research') apCost = 0;
    if (payload.actionType === 'recon' && sourceParty.upgrades.includes('oppo_research')) apCost = 0;
    sourceParty.ap -= apCost;
  }

  let logMetadata = undefined;

  switch (payload.actionType) {

    // ── Fundraise ──────────────────────────────────────────────────────────────
    case 'fundraise': {
      // DonorFreeze: target's next Fundraise yields zero, consumed on trigger
      const freezeIdx = s.darkOps.findIndex(
        op => op.type === 'donor_freeze' && op.targetPartyId === sourceParty.id);
      const amount = freezeIdx >= 0 ? 0 : rollFundraise(sourceParty.upgrades.includes('deep_pockets'));
      if (freezeIdx >= 0) s.darkOps.splice(freezeIdx, 1);
      sourceParty.funds += amount;
      const msg = amount > 0
        ? `${sourceParty.name} raised $${amount} from fundraising.`
        : `${sourceParty.name}'s fundraiser was frozen — $0 raised!`;
      const entry = makeLogEntry(s.round, msg, 'fundraise', sourceParty.id, { amount });
      s.queuedActions = s.queuedActions.filter(a => a.id !== actionReq.id);
      return { state: s, logEntry: entry };
    }

    // ── Campaign ───────────────────────────────────────────────────────────────
    case 'campaign': {
      const riding = s.ridings.find(r => r.id === payload.targetRidingId);
      if (riding) {
        const alreadySpent = riding.roundInvestments?.[sourceParty.id] || 0;
        const remaining   = CAMPAIGN_ROUND_CAP - alreadySpent;
        if (remaining <= 0) {
          logMessage = `${sourceParty.name} has already hit their investment cap in ${riding.name} this round.`;
          break;
        }
        const cappedCost = Math.max(CAMPAIGN_MIN_COST, Math.min(payload.cost || 0, remaining));
        sourceParty.funds -= cappedCost;

        // Base effective value (upgrades, demo multipliers, debate, scandal)
        let finalValue = calculateCampaignValue(
          s, riding.id, sourceParty.id, payload.demographic, payload.medium,
          cappedCost, debateMultiplier);

        // Scandal penalty (applied after calculateCampaignValue because it's riding-specific)
        const penaltyExpiry = riding.scandalPenalties?.[sourceParty.id] || 0;
        if (penaltyExpiry >= s.round) finalValue *= 0.5;

        // ── One-shot Dark Op effects ───────────────────────────────────────
        // InfluencerBlackout: target's next Social = 0, consumed
        const blackoutIdx = s.darkOps.findIndex(op =>
          op.type === 'influencer_blackout' && op.targetPartyId === sourceParty.id);
        if (blackoutIdx >= 0 && payload.medium === 'Social') {
          finalValue = 0;
          s.darkOps.splice(blackoutIdx, 1);
        }
        // ──────────────────────────────────────────────────────────────────

        // Trap check (misinformation)
        let trapTriggered = false;
        const allTraps = s.parties.flatMap(p => p.traps.filter(t => t.targetPartyId === sourceParty.id));
        if (allTraps.length > 0) {
          const trap = allTraps[0];
          trapTriggered = true;
          const trapOwner = s.parties.find(p => p.id === trap.sourcePartyId);
          if (trapOwner) trapOwner.traps = trapOwner.traps.filter(t => t.id !== trap.id);
        }

        if (trapTriggered) {
          finalValue = -Math.abs(finalValue);
          logMessage = `${sourceParty.name} triggered a misinformation trap in ${riding.name}!`;
        } else {
          const scandalTag = penaltyExpiry >= s.round ? ' (scandal-weakened)' : '';
          logMessage = `${sourceParty.name} campaigned in ${riding.name}${scandalTag}.`;
        }

        riding.campaignValues[sourceParty.id] = Math.max(0, (riding.campaignValues[sourceParty.id] || 0) + finalValue);
        if (!riding.rawInvestments)   riding.rawInvestments   = {};
        if (!riding.roundInvestments) riding.roundInvestments = {};
        riding.rawInvestments[sourceParty.id]   = (riding.rawInvestments[sourceParty.id]   || 0) + cappedCost;
        riding.roundInvestments[sourceParty.id] = (riding.roundInvestments[sourceParty.id] || 0) + cappedCost;
      }
      break;
    }

    // ── Research ───────────────────────────────────────────────────────────────
    case 'research': {
      if (payload.targetRidingId && !sourceParty.researched.includes(payload.targetRidingId)) {
        sourceParty.funds = Math.max(0, sourceParty.funds - 2);
        sourceParty.researched.push(payload.targetRidingId);
        const riding = s.ridings.find(r => r.id === payload.targetRidingId);
        logMessage = `${sourceParty.name} researched ${riding?.name ?? 'a riding'} for $2.`;
      }
      break;
    }

    // ── Recon ──────────────────────────────────────────────────────────────────
    case 'recon': {
      const target = s.parties.find(p => p.id === payload.targetPartyId);
      logMessage = `${sourceParty.name} conducted recon on ${target?.name ?? 'an opponent'}.`;
      break;
    }

    // ── Scandal (2 AP + $3) ────────────────────────────────────────────────────
    case 'scandal': {
      const target = s.parties.find(p => p.id === payload.targetPartyId);
      const riding = s.ridings.find(r => r.id === payload.targetRidingId);
      if (target && riding) {
        sourceParty.funds -= 3; // $3 cost in addition to 2 AP
        if (target.scandalShieldActive) {
          target.scandalShieldActive = false;
          logMessage = `${sourceParty.name} attempted a scandal against ${target.name}, but it was deflected!`;
        } else {
          if (!riding.scandalPenalties) riding.scandalPenalties = {};
          riding.scandalPenalties[target.id] = s.round + 1;
          logMessage = `${sourceParty.name} launched a scandal against ${target.name} in ${riding.name}! Their next campaign there will be weakened.`;
        }
      }
      break;
    }

    // ── Misinformation ─────────────────────────────────────────────────────────
    case 'misinformation': {
      sourceParty.traps.push({
        id:            generateId(),
        sourcePartyId: sourceParty.id,
        targetPartyId: payload.targetPartyId,
        isHidden:      sourceParty.upgrades.includes('dark_money'),
      });
      const target = s.parties.find(p => p.id === payload.targetPartyId);
      logMessage = `${sourceParty.name} deployed misinformation against ${target?.name ?? 'an opponent'}.`;
      break;
    }

    // ── Hack ───────────────────────────────────────────────────────────────────
    case 'hack': {
      const hackCost = cost || 4; // default $4
      const target = s.parties.find(p => p.id === payload.targetPartyId);
      if (target) {
        sourceParty.funds -= hackCost;
        let chance  = sourceParty.upgrades.includes('cyber_division') ? HACK_UPGRADE_CHANCE : HACK_BASE_CHANCE;
        if (target.upgrades.includes('firewall')) {
          chance = 0; // Target has firewall
        }
        const success = Math.random() < chance;
        
        logMetadata = { type: 'hack', success, sourceName: sourceParty.name, targetName: target.name };
        
        if (success) {
          const stolen = Math.floor(target.funds * 0.5);
          target.funds       -= stolen;
          sourceParty.funds  += stolen;
          logMetadata.amount = stolen;
          logMessage = `${sourceParty.name} successfully hacked ${target.name}!`;
        } else {
          const penalty = Math.floor(sourceParty.funds * 0.2);
          sourceParty.funds -= penalty;
          sourceParty.ap    = Math.max(0, sourceParty.ap - 1);
          logMetadata.penalty = penalty;
          logMessage = `${sourceParty.name} failed to hack ${target.name} and suffered blowback.`;
        }
      }
      break;
    }

    // ── Crisis Response ────────────────────────────────────────────────────────
    case 'crisis_response': {
      logMessage = `${sourceParty.name} launched a crisis response team.`;
      break;
    }

    // ── Last Push ──────────────────────────────────────────────────────────────
    case 'last_push': {
      const riding = s.ridings.find(r => r.id === payload.targetRidingId);
      if (riding) {
        const allFunds = sourceParty.funds;
        sourceParty.funds = 0;
        const finalValue = allFunds * 1.25 * debateMultiplier;
        riding.campaignValues[sourceParty.id] = (riding.campaignValues[sourceParty.id] || 0) + finalValue;
        logMessage = `${sourceParty.name} made a final push in ${riding.name}!`;
      }
      break;
    }

    // ── Purchase Upgrade ───────────────────────────────────────────────────────
    case 'purchase_upgrade': {
      if (payload.upgradeId) {
        sourceParty.upgrades.push(payload.upgradeId);
        sourceParty.funds -= cost;
        if (payload.upgradeId === 'scandal_shield') sourceParty.scandalShieldActive = true;
        if (payload.upgradeId === 'regional_strong') sourceParty.regionalStronghold = payload.targetRegionId ?? null;
        logMessage = `${sourceParty.name} acquired the ${payload.upgradeId.replace(/_/g, ' ')} upgrade.`;
      }
      break;
    }

    // ── Purchase Dark Op ───────────────────────────────────────────────────────
    case 'purchase_dark_op': {
      if (payload.darkOpType) {
        sourceParty.funds -= cost;
        // One-shot ops (influencer_blackout, donor_freeze) never expire by round
        const isOneShot = ['influencer_blackout', 'donor_freeze'].includes(payload.darkOpType);
        s.darkOps.push({
          id:            generateId(),
          type:          payload.darkOpType,
          sourcePartyId: sourceParty.id,
          targetPartyId: payload.targetPartyId,
          targetRegion:  payload.targetRegionId,
          expiryRound:   isOneShot ? 9999 : s.round + 1,
        });
        logMessage = `${sourceParty.name} activated a dark operation.`; // vague on purpose
      }
      break;
    }
  } // end switch

  // Mark action as approved and remove from queue
  const qa = s.queuedActions.find(a => a.id === actionReq.id);
  if (qa) qa.status = 'approved';
  s.queuedActions = s.queuedActions.filter(a => a.id !== actionReq.id);

  const logEntry = logMessage
    ? makeLogEntry(s.round, logMessage, payload.actionType, sourceParty.id, logMetadata)
    : null;
  if (logEntry) s.actionLog.push(logEntry);

  return { state: s, logEntry };
}

// ─── advanceRound (pure function) ─────────────────────────────────────────────
/**
 * Advance the game to the next round. Resets per-round trackers, clears expired
 * dark ops and scandal penalties, grants AP (Party Machine grants +2, was +1).
 *
 * @param {GameState} state
 * @returns {GameState}
 */
function advanceRound(state) {
  const s = clone(state);
  s.round += 1;
  if (s.round > s.maxRounds)       s.phase = 'end';
  else if (s.round === s.maxRounds) s.phase = 'debate';

  // Reset per-round trackers and clear expired scandal penalties
  s.ridings.forEach(r => {
    r.roundInvestments = {};
    Object.keys(r.scandalPenalties || {}).forEach(pId => {
      if (r.scandalPenalties[pId] < s.round) delete r.scandalPenalties[pId];
    });
  });
  // Clear expired dark ops
  s.darkOps = s.darkOps.filter(op => op.expiryRound >= s.round);

  // Grant base AP + Party Machine bonus (+2, was +1)
  s.parties.forEach(p => {
    p.ap += 3;
    if (p.upgrades.includes('party_machine')) p.ap += 2;
  });

  s.actionLog.push(makeLogEntry(
    s.round,
    `Round ${s.round} of ${s.maxRounds} has begun.`,
    'system', 'system'));

  return s;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
function makeLogEntry(round, message, actionType, sourcePartyId, metadata = undefined) {
  const entry = { id: generateId(), round, message, actionType, sourcePartyId, timestamp: Date.now() };
  if (metadata !== undefined) entry.metadata = metadata;
  return entry;
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export {
  createInitialState,
  resolveAction,
  advanceRound,
  calculateCampaignValue,
  getWinner,
  rollFundraise   as _rollFundraise,
  generateId      as _generateId,
};
