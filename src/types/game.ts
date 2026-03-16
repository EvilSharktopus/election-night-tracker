export type Demographic = "Youth" | "Seniors" | "Workers" | "Business";
export type Medium = "Social" | "Traditional" | "Canvassing" | "Lobbying";
export type Phase = "setup" | "active" | "pause" | "debate" | "coalition" | "end";

export type DarkOpType =
  | 'bot_farm'            // all Social campaigns ×0.5 for 1 round (all parties)
  | 'media_buyout'        // opponent Traditional ×0.5 for 1 round in chosen region
  | 'chamber_deal'        // Business demo = 0 for opponents in region for 1 round
  | 'influencer_blackout' // target's next Social campaign = 0, consumed on trigger
  | 'donor_freeze';       // target's next Fundraise = 0, consumed on trigger

export interface DarkOp {
  id: string;
  type: DarkOpType;
  sourcePartyId: string;
  targetPartyId?: string;  // for targeted ops
  targetRegion?: string;   // for region-scoped ops
  expiryRound: number;     // round after which round-based ops expire; 9999 for one-shot
}

export type UpgradeId =
  | "grassroots"       // Tier 1: Canvassing campaigns +20% value
  | "social_media"     // Tier 1: Social Media campaigns +$1 base value
  | "deep_pockets"     // Tier 1: Fundraise yields +30%
  | "oppo_research"    // Tier 2: Recon costs 0 AP
  | "scandal_shield"   // Tier 2: First Scandal against you is negated
  | "firewall"         // Tier 2: Blocks opponent hacks (0% chance)
  | "regional_strong"  // Tier 2: Pick 1 region: all campaigns there +10%
  | "party_machine"    // Tier 3: +1 bonus AP each round
  | "dark_money"       // Tier 3: Misinformation traps are invisible after trigger
  | "cyber_division";  // Tier 3: Hack success rate increases to 70%

export interface Trap {
  id: string;
  sourcePartyId: string;
  targetPartyId: string;
  isHidden: boolean; // Driven by "Dark Money" upgrade
}

export interface Party {
  id: string;
  name: string;
  color: string;
  logo?: string;          // base64 data URL from student-created image
  password?: string;
  ap: number;
  funds: number;
  upgrades: UpgradeId[];
  researched: string[]; // List of Riding IDs this party has researched

  traps: Trap[]; // Active misinformation traps
  scandalShieldActive: boolean; // Initially true if they buy Scandal Shield
  regionalStronghold?: string; // Region ID if Regional Stronghold upgrade purchased
}

export interface Riding {
  id: string;
  name: string;
  seats: number;
  region: string;
  strongDemo: Demographic;
  weakDemo: Demographic;
  campaignValues: Record<string, number>;  // partyId → cumulative effective score
  rawInvestments: Record<string, number>;  // partyId → total raw dollars (display only)
  roundInvestments: Record<string, number>; // partyId → dollars spent THIS round (resets on advance)
  scandalPenalties: Record<string, number>; // partyId → round when 0.5× penalty expires
}

export interface LogEntry {
  id: string;
  round: number;
  message: string;
  actionType: string;
  sourcePartyId: string;
  timestamp: number;
  metadata?: Record<string, unknown>; // e.g. { amount: 7 } for fundraise results
}

export interface ActionPayload {
  partyId: string;
  actionType: "fundraise" | "campaign" | "research" | "recon" | "scandal" | "misinformation" | "hack" | "crisis_response" | "last_push" | "purchase_upgrade" | "purchase_dark_op";
  targetRidingId?: string;
  targetPartyId?: string;
  targetRegionId?: string;  // for MediaBuyout and ChamberDeal
  demographic?: Demographic;
  medium?: Medium;
  cost?: number;
  upgradeId?: UpgradeId;
  darkOpType?: DarkOpType;  // which dark op to purchase
}

export interface ActionRequest {
  id: string;
  payload: ActionPayload;
  status: "pending" | "approved" | "rejected";
  apCost: number; // pre-calculated so AP can be reserved immediately on submit
}

export interface GameState {
  // Core State
  round: number;
  maxRounds: number;
  phase: Phase;
  parties: Party[];
  ridings: Riding[];
  actionLog: LogEntry[];
  queuedActions: ActionRequest[];
  darkOps: DarkOp[];            // active dark operations 
  
  // Game Management Mutators
  setupGame: (parties: Omit<Party, 'ap'|'funds'|'upgrades'|'researched'|'traps'|'scandalShieldActive'>[], ridings: Omit<Riding, 'campaignValues'|'rawInvestments'|'roundInvestments'|'scandalPenalties'>[], maxRounds?: number) => void;
  advanceRound: () => void;
  setPhase: (phase: Phase) => void;
  grantAP: (amount: number, partyId?: string) => void;
  
  // Pending Actions
  queueAction: (actionPayload: ActionPayload) => void;
  removeQueuedAction: (actionId: string) => void;
  
  // Business Logic Execution
  applyAction: (action: ActionRequest, debateMultiplier?: number) => void;

  // Syncing
  overwriteState: (state: Partial<GameState>) => void;
  updateLogMessage: (id: string, message: string) => void;
  updatePartyLogo: (partyId: string, logo: string) => void;
  updatePartyPassword: (partyId: string, password: string) => void;
}
