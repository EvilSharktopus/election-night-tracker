# Election Night Tracker — Project Spec
> Drop this file in the project root. Read it at the start of every session before writing any code.

---

## What This Is

A browser-based React web app simulating a Canadian federal election campaign. Up to 10 student-run political parties compete over 4 weeks (one class period = one turn) to win Ridings and accumulate the most parliamentary seats. The teacher controls the game from a private dashboard; the game board is displayed on a classroom projector.

---

## Tech Stack

- **Framework:** React (single codebase, no backend)
- **State:** Zustand (global store, single source of truth)
- **Tab Sync:** BroadcastChannel API — teacher dashboard tab posts state; projector tab listens and re-renders in real time. Same device, two browser tabs, no server required.
- **Routing:** React Router with three routes:
  - `/board` — Projector view (read-only)
  - `/teacher` — Teacher dashboard (password-protected, write access)
  - `/party/:id` — Optional per-party view for student devices
- **Styling:** Tailwind CSS
- **Deployment:** Vercel (static export)

---

## Core Data Model

```js
// Game-level state
{
  round: Number,           // Current round (1–4, where 4 = final)
  phase: String,           // "active" | "debate" | "coalition" | "end"
  parties: Party[],        // Up to 10
  ridings: Riding[],       // 35 total
  actionLog: LogEntry[],   // Full history, used for ticker + autopsy
}

// Party
{
  id: String,
  name: String,
  color: String,           // Hex, chosen at game setup
  ap: Number,              // Action Points remaining this turn
  funds: Number,
  upgrades: String[],      // IDs of purchased upgrades
  researched: String[],    // Riding IDs this party has researched
  traps: Trap[],           // Active Misinformation traps set by this party
}

// Riding
{
  id: String,
  name: String,            // e.g., "Metro Vancouver"
  seats: Number,           // Weight toward 338 total
  strongDemo: String,      // HIDDEN — "Youth" | "Seniors" | "Workers" | "Business"
  weakDemo: String,        // HIDDEN
  campaignValues: {        // { partyId: Number } — cumulative investment per party
    [partyId]: Number
  }
}
```

---

## The 35 Ridings

35 interactive ridings weighted to total 338 seats. Each riding represents a real Canadian electoral cluster (e.g., "Metro Vancouver = 12 seats", "Rural Saskatchewan = 4 seats"). Seat weights are pre-loaded at game setup. Teacher assigns `strongDemo` and `weakDemo` to each riding before the game starts — these are locked and hidden from students.

---

## Resources

| Resource | Description |
|---|---|
| **Action Points (AP)** | Granted at the start of each round. Spent to take actions. Default: 3 AP/round. |
| **Funds ($)** | Earned via Fundraise. Spent on Campaigns and Upgrades. |

---

## Actions (AP Cost)

| Action | AP Cost | Description |
|---|---|---|
| **Fundraise** | 1 | Gain funds. Base yield is slightly less than a full Campaign costs, keeping parties cash-constrained. |
| **Campaign** | 1 | Target a Riding. Choose a Demographic (Youth / Seniors / Workers / Business) and Medium (Social / Traditional / Canvassing / Lobbying). Spend $. Final Campaign Value = $ × demographic modifier (2× if Strong, 0.5× if Weak) × any upgrade bonuses. Highest cumulative Campaign Value controls the riding. |
| **Research** | 1 | Target a Riding. Reveal its Strong and Weak demographics to your party only (visible in `/party/:id` view). |
| **Recon** | 1 | Target an opponent. Reveal their purchased upgrades to your party. |
| **Scandal** | 2 | Target an opponent. Remove a capped amount of their Campaign Value from a specific riding (not a whole region — max damage capped to prevent instant seat-flips). |
| **Misinformation** | 2 | Set a trap on an opponent. The next time they Campaign, their $ reduces their Campaign Value instead of raising it. Trap is invisible until triggered. |
| **Hack** | 2 | High risk/reward. Base: 50/50 chance to steal 50% of opponent's funds or lose 1 AP + 20% of your own funds. Success rate improves with "Cyber Division" upgrade. |
| **Crisis Response** | 1 | React to a Scandal. Absorb a portion of the damage. Teaches real-world damage control. |
| **Last Push** *(Final Round only)* | 1 | Spend all remaining $ on one riding. No demographic or medium selection. Campaign Value = total $ × 1.25. Rewards parties that saved resources. |

---

## Upgrades (Tech Tree)

Three tiers. Purchased with funds. Teacher dashboard shows all purchases; students only see their own (unless Recon'd).

| Tier | Name | Effect |
|---|---|---|
| 1 | Grassroots Network | Canvassing campaigns +20% value |
| 1 | Social Media Mastery | Social Media campaigns +$1 base value |
| 1 | Deep Pockets | Fundraise yields +30% |
| 2 | Opposition Research | Recon costs 0 AP |
| 2 | Scandal Shield | First Scandal against you this game is negated |
| 2 | Regional Stronghold | Pick 1 region: all campaigns there +10% |
| 3 | Party Machine | +1 bonus AP each round |
| 3 | Dark Money | Your Misinformation traps are invisible even after triggered (opponent never knows it was you) |
| 3 | Cyber Division | Hack success rate increases to 70% |

---

## Final Round — Leaders' Debate

Round 4 has two phases before resolution:

**Phase 1 — Sealed Submissions (before debate)**
Each party privately submits one final Campaign action via `/party/:id`. Actions are queued in the teacher dashboard, not yet applied.

**Phase 2 — The Debate (~20 min)**
- Teacher draws a random topic card (pre-loaded list: e.g., "Why should rural Alberta voters choose you?")
- One student per party gives a 60-second closing argument
- Class votes on best argument (teacher tallies in dashboard)
- Top 3 debaters earn a **Debate Multiplier** (1st: 1.4×, 2nd: 1.25×, 3rd: 1.1×) applied to their sealed Campaign action

**Phase 3 — Resolution**
Teacher confirms all sealed actions. Dashboard applies debate multipliers, resolves in order, board updates live on projector.

---

## UI: Three Views

### `/board` — Projector View
- **Parliament chart** (semicircle, seat-weighted, colored by party) — dominant element
- **Riding grid** (35 tiles, colored by current leader, shows riding name + seat value)
  - Contested ridings (within 15% Campaign Value of leader) pulse or show striped pattern
  - Tiles animate on flip: brief flash → new color → seat counter ticks up in parliament chart
- **Action ticker** (bottom crawl, last 8 actions, e.g. "🔴 Liberal launched Scandal against NDP in Metro Vancouver!")
- **Election Night Mode** activates in Round 4: dark navy background, "ELECTION NIGHT LIVE" chyron, larger parliament chart, urgent ticker styling

### `/teacher` — Teacher Dashboard
- **Left panel:** Round controls, AP distribution ("Grant weekly AP to all parties"), pause/undo
- **Center panel:** Action input form — party selector → action selector → conditional fields → Preview Outcome button → Confirm
- **Right panel:** Secret info — all riding demographics, active Misinformation traps, research history
- Password prompt on route load (simple, client-side — this is a classroom tool, not a bank)

### `/party/:id` — Party View (optional, student devices)
- Current AP, funds, upgrades
- Researched riding demographics (only ridings this party has Research'd)
- Active traps they've set
- Action submission form (queues to teacher dashboard for approval)

---

## Winner Screen (phase: "end")

Three states based on final seat totals (majority = 170+ of 338):

| Outcome | Visual |
|---|---|
| **Majority** | Full party color wash, large seat count, "Canadians have spoken." |
| **Minority** | Muted/greyed party color, asterisk, shows coalition math |
| **Coalition** | Screen split diagonally between two party colors, combined seat count |

Below the declaration: **Full Results Table** (all 10 parties — seats, ridings won, $ spent, upgrades purchased, auto-generated highlight moment from action log).

Below that: **Campaign Autopsy** — line chart of each party's seat total across all 4 rounds, showing momentum shifts.

---

## Key Constraints for the Agent

1. **Never expose hidden riding demographics on `/board` or `/party/:id`** — only visible in `/teacher`
2. **BroadcastChannel is the only sync mechanism** — no localStorage, no backend, no polling
3. **All state mutations happen in the teacher dashboard** — party views can submit action requests but cannot apply them directly
4. **Preview Outcome must calculate result without committing state** — teacher confirms separately
5. **Action log is append-only** — never mutate past entries; used for ticker, autopsy, and highlight moments
