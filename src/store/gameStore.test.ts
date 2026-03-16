import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';

describe('Game Store', () => {
  beforeEach(() => {
    // Reset store before each test
    useGameStore.setState({
      round: 1,
      phase: "setup",
      parties: [],
      ridings: [],
      actionLog: [],
      queuedActions: []
    });
  });

  const mockParties = [
    { id: 'p1', name: 'Red Party', color: '#ff0000' }
  ];

  const mockRidings = [
    { id: 'r1', name: 'Downtown', region: 'Core', seats: 10, strongDemo: 'Youth', weakDemo: 'Seniors' }
  ];

  it('sets up the game correctly', () => {
    useGameStore.getState().setupGame(mockParties as any, mockRidings as any);
    const state = useGameStore.getState();
    
    expect(state.phase).toBe('active');
    expect(state.parties).toHaveLength(1);
    expect(state.parties[0].ap).toBe(3);
    expect(state.parties[0].funds).toBe(0);
    expect(state.ridings).toHaveLength(1);
  });

  it('processes a fundraise action', () => {
    useGameStore.getState().setupGame(mockParties as any, mockRidings as any);
    
    useGameStore.getState().applyAction({
      id: 'a1',
      payload: { partyId: 'p1', actionType: 'fundraise' },
      status: 'pending',
      apCost: 1
    });

    const state = useGameStore.getState();
    // fundraise is now $5-10 randomly
    expect(state.parties[0].funds).toBeGreaterThanOrEqual(5);
    expect(state.parties[0].funds).toBeLessThanOrEqual(10);
    expect(state.parties[0].ap).toBe(2);
  });

  it('applies demographic multipliers during campaign', () => {
    useGameStore.getState().setupGame(mockParties as any, mockRidings as any);
    
    // Grant funds
    useGameStore.setState(state => {
      state.parties[0].funds = 10;
      state.parties[0].ap = 3;
      return state;
    });

    // Campaign with strong demographic
    useGameStore.getState().applyAction({
      id: 'a2',
      payload: { 
        partyId: 'p1', 
        actionType: 'campaign', 
        targetRidingId: 'r1',
        demographic: 'Youth',
        medium: 'Social',
        cost: 4
      },
      status: 'pending',
      apCost: 1
    });

    let state = useGameStore.getState();
    // 4 base * 2x for strongDemo
    expect(state.ridings[0].campaignValues['p1']).toBe(8);
    expect(state.parties[0].funds).toBe(6);

    // Campaign with weak demographic
    useGameStore.getState().applyAction({
      id: 'a3',
      payload: { 
        partyId: 'p1', 
        actionType: 'campaign', 
        targetRidingId: 'r1',
        demographic: 'Seniors',
        medium: 'Social',
        cost: 4
      },
      status: 'pending',
      apCost: 1
    });

    state = useGameStore.getState();
    // Previous 8 + (4 base * 0.5x weakDemo = 2) = 10
    expect(state.ridings[0].campaignValues['p1']).toBe(10);
  });

  it('triggers misinformation traps', () => {
    useGameStore.getState().setupGame([
      { id: 'p1', name: 'Red Party', color: '#ff0000' },
      { id: 'p2', name: 'Blue Party', color: '#0000ff' }
    ] as any, mockRidings as any);

    useGameStore.setState(state => {
      state.parties[1].funds = 10;
      return state;
    });

    // Set trap
    useGameStore.getState().applyAction({
      id: 'm1',
      payload: { partyId: 'p1', actionType: 'misinformation', targetPartyId: 'p2' },
      status: 'pending',
      apCost: 2
    });

    let state = useGameStore.getState();
    expect(state.parties[0].traps).toHaveLength(1);
    expect(state.parties[0].traps[0].targetPartyId).toBe('p2');

    // Victim campaigns
    useGameStore.getState().applyAction({
      id: 'c1',
      payload: { 
        partyId: 'p2', 
        actionType: 'campaign', 
        targetRidingId: 'r1',
        demographic: 'Workers', // Neutral demo
        medium: 'Canvassing',
        cost: 5
      },
      status: 'pending',
      apCost: 1
    });

    state = useGameStore.getState();
    // Trap consumes the campaign value and turns it negative
    expect(state.ridings[0].campaignValues['p2']).toBe(0); // Bounded at 0 from negative 5
    expect(state.parties[0].traps).toHaveLength(0); // Trap consumed
  });
});
