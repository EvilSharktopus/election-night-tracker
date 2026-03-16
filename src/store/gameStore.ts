import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { GameState, Phase } from '../types/game';

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substring(2, 9);

const initialState = {
  round: 1,
  maxRounds: 10,
  phase: "setup" as Phase,
  parties: [],
  ridings: [],
  actionLog: [],
  queuedActions: [],
  darkOps: [],
};

const HACK_BASE_CHANCE = 0.5;
const HACK_UPGRADE_CHANCE = 0.7;
const CAMPAIGN_ROUND_CAP = 15;    // max $ per party per riding per round
const CAMPAIGN_MIN_COST = 1;      // minimum spend to campaign
// Fundraise: 4–7 base (was 5–10)
const rollFundraise = (hasDeepPockets: boolean) => {
  const base = Math.floor(Math.random() * 4) + 4; // 4-7
  return hasDeepPockets ? Math.floor(base * 1.3) : base;
};

export const useGameStore = create<GameState>()(
  immer((set) => ({
    ...initialState,

    setupGame: (partiesData, ridingsData, maxRounds = 4) => set((state) => {
      state.parties = partiesData.map(p => ({
        ...p,
        ap: 3,
        funds: 0,
        upgrades: [],
        researched: [],
        traps: [],
        scandalShieldActive: false
      }));
      state.ridings = ridingsData.map(r => ({
        ...r,
        campaignValues:   {},
        rawInvestments:   {},
        roundInvestments: {},
        scandalPenalties: {},
      }));
      state.maxRounds = maxRounds;
      state.phase = "active";
      state.round = 1;
      state.actionLog = [];
      state.queuedActions = [];
      state.darkOps = [];
    }),

    advanceRound: () => set((state) => {
      state.round += 1;
      if (state.round > state.maxRounds) {
        state.phase = "end";
      } else if (state.round === state.maxRounds) {
        state.phase = "debate";
      }
      // Grant base AP for the new round
      // Reset per-round investment caps, clear expired scandal penalties, clear expired dark ops
      state.ridings.forEach(r => {
        r.roundInvestments = {};
        Object.keys(r.scandalPenalties || {}).forEach(pId => {
          if (r.scandalPenalties[pId] < state.round) delete r.scandalPenalties[pId];
        });
      });
      state.darkOps = state.darkOps.filter(op => op.expiryRound >= state.round);
      // Grant base AP for the new round + Party Machine (+2, was +1)
      state.parties.forEach(p => {
        p.ap += 3;
        if (p.upgrades.includes("party_machine")) p.ap += 2;
      });
      state.actionLog.push({
        id: generateId(),
        round: state.round,
        message: `Round ${state.round} of ${state.maxRounds} has begun.`,
        actionType: "system",
        sourcePartyId: "system",
        timestamp: Date.now()
      });
    }),

    setPhase: (phase) => set((state) => {
      state.phase = phase;
    }),

    grantAP: (amount, partyId) => set((state) => {
      if (partyId) {
        const party = state.parties.find(p => p.id === partyId);
        if (party) party.ap += amount;
      } else {
        state.parties.forEach(p => { p.ap += amount; });
      }
    }),

    queueAction: (payload) => set((state) => {
      const party = state.parties.find(p => p.id === payload.partyId);
      let apCost = 1;
      if (payload.actionType === "scandal" || payload.actionType === "misinformation" || payload.actionType === "hack" || payload.actionType === "purchase_dark_op") apCost = 2;
      // Research is free (0 AP)
      if (payload.actionType === "research") apCost = 0;
      if (payload.actionType === "recon" && party?.upgrades.includes("oppo_research")) apCost = 0;
      // Deduct AP now so students can't over-submit
      if (party) party.ap -= apCost;
      state.queuedActions.push({
        id: generateId(),
        payload,
        status: "pending",
        apCost
      });
    }),

    removeQueuedAction: (actionId) => set((state) => {
      const action = state.queuedActions.find(a => a.id === actionId);
      // Refund reserved AP if the action was still pending
      if (action && action.status === 'pending') {
        const party = state.parties.find(p => p.id === action.payload.partyId);
        if (party) party.ap += action.apCost;
      }
      state.queuedActions = state.queuedActions.filter(a => a.id !== actionId);
    }),

    applyAction: (actionReq, debateMultiplier = 1) => set((state) => {
      const payload = actionReq.payload;
      const sourceParty = state.parties.find(p => p.id === payload.partyId);
      if (!sourceParty) return;

      const cost = payload.cost || 0;
      let logMessage = "";
      let logMetadata: Record<string, unknown> | undefined = undefined;

      // AP was already deducted when the action was queued; don't deduct again.
      // For manually-applied teacher actions (not from queue), deduct AP here.
      const isFromQueue = state.queuedActions.some(a => a.id === actionReq.id);
      if (!isFromQueue) {
        let apCost = 1;
        if (["scandal", "misinformation", "hack", "purchase_dark_op"].includes(payload.actionType)) apCost = 2;
        if (payload.actionType === "research") apCost = 0;
        if (payload.actionType === "recon" && sourceParty.upgrades.includes("oppo_research")) apCost = 0;
        sourceParty.ap -= apCost;
      }

      switch (payload.actionType) {
        case "fundraise": {
          // DonorFreeze: target's next Fundraise yields zero
          const freezeIdx = state.darkOps.findIndex(op => op.type === 'donor_freeze' && op.targetPartyId === sourceParty.id);
          const yieldAmt = freezeIdx >= 0 ? 0 : rollFundraise(sourceParty.upgrades.includes("deep_pockets"));
          if (freezeIdx >= 0) state.darkOps.splice(freezeIdx, 1); // consume one-shot op
          sourceParty.funds += yieldAmt;
          const fundraiseMsg = yieldAmt > 0
            ? `${sourceParty.name} raised $${yieldAmt} from fundraising.`
            : `${sourceParty.name}'s fundraiser was frozen — $0 raised!`;
          state.actionLog.push({
            id: generateId(), round: state.round, message: fundraiseMsg,
            actionType: "fundraise", sourcePartyId: sourceParty.id,
            timestamp: Date.now(), metadata: { amount: yieldAmt }
          });
          logMessage = '';
          break;
        }
        case "campaign": {
          const riding = state.ridings.find(r => r.id === payload.targetRidingId);
          if (riding) {
            const alreadySpent = riding.roundInvestments?.[sourceParty.id] || 0;
            const remaining = CAMPAIGN_ROUND_CAP - alreadySpent;
            if (remaining <= 0) {
              logMessage = `${sourceParty.name} has already hit their investment cap in ${riding.name} this round.`;
              break;
            }
            const cappedCost = Math.max(CAMPAIGN_MIN_COST, Math.min(cost, remaining));
            sourceParty.funds -= cappedCost;

            let finalValue = cappedCost;
            if (payload.medium === "Canvassing" && sourceParty.upgrades.includes("grassroots")) finalValue *= 1.2;
            if (payload.medium === "Social"     && sourceParty.upgrades.includes("social_media")) finalValue += 1;

            if (payload.demographic === riding.strongDemo) finalValue *= 2;
            else if (payload.demographic === riding.weakDemo) finalValue *= 0.5;

            if (sourceParty.regionalStronghold === riding.region) finalValue *= 1.1;
            finalValue *= debateMultiplier;

            // Scandal penalty
            const penaltyExpiry = riding.scandalPenalties?.[sourceParty.id] || 0;
            if (penaltyExpiry >= state.round) finalValue *= 0.5;

            // ── Dark Ops effects on campaign value ──────────────────────────
            // BotFarm: Social ×0.5 for all parties
            const hasBotFarm = state.darkOps.some(op => op.type === 'bot_farm' && op.expiryRound >= state.round);
            if (hasBotFarm && payload.medium === "Social") finalValue *= 0.5;

            // MediaBuyout: opponent Traditional ×0.5 in target region
            const mediaBuyout = state.darkOps.find(op =>
              op.type === 'media_buyout' && op.targetRegion === riding.region &&
              op.sourcePartyId !== sourceParty.id && op.expiryRound >= state.round);
            if (mediaBuyout && payload.medium === "Traditional") finalValue *= 0.5;

            // ChamberDeal: Business demo = 0 for opponents in region
            const chamberDeal = state.darkOps.find(op =>
              op.type === 'chamber_deal' && op.targetRegion === riding.region &&
              op.sourcePartyId !== sourceParty.id && op.expiryRound >= state.round);
            if (chamberDeal && payload.demographic === "Business") finalValue = 0;

            // InfluencerBlackout: target's next Social = 0, consumed
            const blackoutIdx = state.darkOps.findIndex(op =>
              op.type === 'influencer_blackout' && op.targetPartyId === sourceParty.id);
            if (blackoutIdx >= 0 && payload.medium === "Social") {
              finalValue = 0;
              state.darkOps.splice(blackoutIdx, 1);
            }
            // ──────────────────────────────────────────────────────────────

            // Trap check
            let trapTriggered = false;
            const targetPartyTraps = state.parties.flatMap(p => p.traps.filter(t => t.targetPartyId === sourceParty.id));
            if (targetPartyTraps.length > 0) {
              const trap = targetPartyTraps[0];
              trapTriggered = true;
              const trapOwner = state.parties.find(p => p.id === trap.sourcePartyId);
              if (trapOwner) trapOwner.traps = trapOwner.traps.filter(t => t.id !== trap.id);
            }

            if (trapTriggered) {
              finalValue = -Math.abs(finalValue);
              logMessage = `${sourceParty.name} triggered a misinformation trap in ${riding.name}!`;
            } else {
              logMessage = `${sourceParty.name} campaigned in ${riding.name}${penaltyExpiry >= state.round ? ' (scandal-weakened)' : ''}.`;
            }

            riding.campaignValues[sourceParty.id] = Math.max(0, (riding.campaignValues[sourceParty.id] || 0) + finalValue);
            if (!riding.rawInvestments)   riding.rawInvestments   = {};
            if (!riding.roundInvestments) riding.roundInvestments = {};
            riding.rawInvestments[sourceParty.id]   = (riding.rawInvestments[sourceParty.id]   || 0) + cappedCost;
            riding.roundInvestments[sourceParty.id] = (riding.roundInvestments[sourceParty.id] || 0) + cappedCost;
          }
          break;
        }
        case "research": {
          if (payload.targetRidingId && !sourceParty.researched.includes(payload.targetRidingId)) {
            sourceParty.researched.push(payload.targetRidingId);
            const riding = state.ridings.find(r => r.id === payload.targetRidingId);
            logMessage = `${sourceParty.name} researched ${riding?.name || 'a riding'}.`;
          }
          break;
        }
        case "recon": {
          const target = state.parties.find(p => p.id === payload.targetPartyId);
          logMessage = `${sourceParty.name} conducted recon on ${target?.name || 'an opponent'}.`;
          break;
        }
        case "scandal": {
          const target = state.parties.find(p => p.id === payload.targetPartyId);
          const riding  = state.ridings.find(r => r.id === payload.targetRidingId);
          if (target && riding) {
            sourceParty.funds -= 3; // $3 cost in addition to 2 AP
            if (target.scandalShieldActive) {
              target.scandalShieldActive = false;
              logMessage = `${sourceParty.name} attempted a scandal against ${target.name}, but it was deflected!`;
            } else {
              if (!riding.scandalPenalties) riding.scandalPenalties = {};
              riding.scandalPenalties[target.id] = state.round + 1;
              logMessage = `${sourceParty.name} launched a scandal against ${target.name} in ${riding.name}! Their next campaign there will be weakened.`;
            }
          }
          break;
        }
        case "misinformation": {
          sourceParty.traps.push({
            id: generateId(),
            sourcePartyId: sourceParty.id,
            targetPartyId: payload.targetPartyId!,
            isHidden: sourceParty.upgrades.includes("dark_money")
          });
          const target = state.parties.find(p => p.id === payload.targetPartyId);
          logMessage = `${sourceParty.name} deployed misinformation against ${target?.name || 'an opponent'}.`;
          break;
        }
        case "hack": {
          const hackCost = cost || 4; // default $4
          const target = state.parties.find(p => p.id === payload.targetPartyId);
          if (target) {
            sourceParty.funds -= hackCost;
            let chance = sourceParty.upgrades.includes("cyber_division") ? HACK_UPGRADE_CHANCE : HACK_BASE_CHANCE;
            if (target.upgrades.includes("firewall")) {
              chance = 0; // Firewall is a direct counter
            }
            const success = Math.random() < chance;
            logMetadata = { type: 'hack', success, sourceName: sourceParty.name, targetName: target.name };
            if (success) {
              const stolen = Math.floor(target.funds * 0.5);
              target.funds -= stolen;
              sourceParty.funds += stolen;
              logMetadata.amount = stolen;
              logMessage = `${sourceParty.name} successfully hacked ${target.name}! Stole $${stolen}.`;
            } else {
              const penalty = Math.floor(sourceParty.funds * 0.2);
              sourceParty.funds -= penalty;
              sourceParty.ap = Math.max(0, sourceParty.ap - 1);
              logMetadata.penalty = penalty;
              logMessage = `${sourceParty.name} failed to hack ${target.name} and suffered blowback.`;
            }
          }
          break;
        }
        case "crisis_response": {
          // Restores some campaign value or grants a temporary buff
          logMessage = `${sourceParty.name} launched a crisis response team.`;
          // Placeholder for exact scandal mitigation implementation
          break;
        }
        case "last_push": {
          const riding = state.ridings.find(r => r.id === payload.targetRidingId);
          if (riding) {
            const allFunds = sourceParty.funds;
            sourceParty.funds = 0;
            const finalValue = allFunds * 1.25 * debateMultiplier;
            riding.campaignValues[sourceParty.id] = (riding.campaignValues[sourceParty.id] || 0) + finalValue;
            logMessage = `${sourceParty.name} made a final push in ${riding.name}!`;
          }
          break;
        }
        case "purchase_upgrade": {
          if (payload.upgradeId) {
            sourceParty.upgrades.push(payload.upgradeId);
            sourceParty.funds -= cost;
            if (payload.upgradeId === "scandal_shield") sourceParty.scandalShieldActive = true;
            logMessage = `${sourceParty.name} acquired a new upgrade.`;
          }
          break;
        }
        case "purchase_dark_op": {
          if (payload.darkOpType) {
            sourceParty.funds -= cost;
            const isOneShot = ['influencer_blackout', 'donor_freeze'].includes(payload.darkOpType);
            state.darkOps.push({
              id: generateId(),
              type: payload.darkOpType,
              sourcePartyId: sourceParty.id,
              targetPartyId: payload.targetPartyId,
              targetRegion: payload.targetRegionId,
              expiryRound: isOneShot ? 9999 : state.round + 1,
            });
            logMessage = `${sourceParty.name} activated a dark operation.`; // vague on purpose
          }
          break;
        }
      } // end switch

      // Update status inside the Immer draft
      const draftAction = state.queuedActions.find(a => a.id === actionReq.id);
      if (draftAction) draftAction.status = "approved";
      // Remove from queue
      state.queuedActions = state.queuedActions.filter(a => a.id !== actionReq.id);

      if (logMessage) {
        state.actionLog.slice(-7); // Keep recent
        state.actionLog.push({
          id: generateId(),
          round: state.round,
          message: logMessage,
          actionType: payload.actionType,
          sourcePartyId: sourceParty.id,
          timestamp: Date.now(),
          metadata: logMetadata || { targetRegionId: payload.targetRegionId }
        });
      }
    }),

    overwriteState: (newState) => set((state) => {
      return { ...state, ...newState };
    }),

    updateLogMessage: (id, message) => set((state) => {
      const entry = state.actionLog.find(e => e.id === id);
      if (entry) entry.message = message;
    }),

    updatePartyLogo: (partyId, logo) => set((state) => {
      const party = state.parties.find(p => p.id === partyId);
      if (party) party.logo = logo;
    }),

    updatePartyPassword: (partyId, password) => set((state) => {
      const party = state.parties.find(p => p.id === partyId);
      if (party) party.password = password;
    })
  }))
);
