# Election Game Implementation Plan

## Goal Description
The objective is to scaffold the overall architecture for the Canadian classroom Election Simulation Game. This includes initializing a new Next.js project, setting up the necessary dependencies for state management and UI, and organizing the directory structure to support our three core views: Teacher Dashboard, Student Portal, and Public Projector Board.

## User Review Required
Please review the choice of technology:
- **Framework:** Next.js (React wrapper with API routes for our backend needs).
- **Styling:** Vanilla CSS Modules (to adhere to aesthetic requirements natively without Tailwind).
- **State/Database:** We will start with local JSON-based state syncing via Next.js API routes or a lightweight SQLite database (like `better-sqlite3`) to easily manage and sync Teacher actions and Student requests locally.

Does this setup sound good for your environment?

## Proposed Changes

### Next.js Initialization
We will run `npx create-next-app` inside the `scratch` directory to create a non-interactive, vanilla CSS setup.

#### [NEW] [election-game scaffold](file:///C:/Users/adamj/.gemini/antigravity/scratch/election-game)
We will create the following core directories:
- `components/`: For reusable UI elements (e.g., buttons, map regions, forms).
- `app/teacher/`: The Game Master dashboard page.
- `app/student/`: The student action submission portal.
- `app/public/`: The projector view (map & live results).
- `app/api/`: Endpoints for submitting actions and retrieving current game state.
- `lib/`: Core game logic (riding generation, AP/Funds calculations, tech tree definitions).

## Verification Plan

### Automated Tests
- We will verify the initialization by running `npm run build` to ensure the Next.js scaffold compiles correctly.
- We will implement initial Jest/Vitest unit tests for the core calculation logic (e.g., AP deduction, Tech Tree unlocking) in the `lib` directory once established, running them via `npm run test`.

### Manual Verification
- We will start the development server using `npm run dev` and navigate to `http://localhost:3000` using the browser subagent to verify the landing page renders correctly.
- We will manually navigate to the `/teacher`, `/student`, and `/public` routes to verify the routing architecture is correctly established.
