/**
 * syncMiddleware.ts — Firebase Realtime Database sync layer
 *
 * Architecture:
 *   Teacher (/teacher):   Writes full Zustand state → Firebase /gameState (debounced 150ms)
 *                         Listens to /pendingActions for student submissions
 *   Board (/board):       Reads /gameState → overwrites local Zustand store
 *   Student (/party/:id): Reads /gameState → overwrites local Zustand store
 *                         Writes action submissions → /pendingActions/{push}
 *
 * The Zustand store is NOT modified — Firebase is purely the persistence/sync layer.
 */

import { useEffect, useRef } from 'react';
import { ref, set, onValue, onChildAdded, remove, push, Unsubscribe } from 'firebase/database';
import { db } from '../firebase';
import { useGameStore } from './gameStore';
import { ActionPayload } from '../types/game';

const STATE_PATH = 'gameState';
const PENDING_PATH = 'pendingActions';

/** Strip Zustand store actions (functions) and return a JSON string safe for Firebase. */
function serializeState(): string {
  const {
    setupGame, advanceRound, setPhase, grantAP,
    queueAction, removeQueuedAction, applyAction, overwriteState,
    ...data
  } = useGameStore.getState();
  return JSON.stringify(data);
}

/**
 * useSyncMiddleware — call in every page component.
 * isTeacher = true  → writes Zustand to Firebase on every store change
 * isTeacher = false → listens to Firebase and overwrites local Zustand
 */
export function useSyncMiddleware(isTeacher: boolean) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stateRef = ref(db, STATE_PATH);

    if (isTeacher) {
      // Teacher is the single writer — push state to Firebase on every change (debounced)
      const unsubscribe = useGameStore.subscribe(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          set(stateRef, serializeState()).catch(err =>
            console.error('[Firebase] Failed to write game state:', err)
          );
        }, 150);
      });

      // Immediately push the current state so joining clients get it right away
      set(stateRef, serializeState()).catch(console.error);

      return () => {
        unsubscribe();
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    } else {
      // Students & Board: listen for state changes and overwrite local store
      const unsubscribe: Unsubscribe = onValue(stateRef, (snapshot) => {
        const raw = snapshot.val();
        if (!raw) return;
        try {
          const data = JSON.parse(raw as string);
          useGameStore.getState().overwriteState(data);
        } catch (e) {
          console.error('[Firebase] Failed to parse game state:', e);
        }
      });

      return () => unsubscribe();
    }
  }, [isTeacher]);
}

/**
 * useTeacherSyncResponder — call only from TeacherDashboard.
 * Listens to /pendingActions for student-submitted actions and queues them locally.
 * Each action is deleted from Firebase immediately after being picked up (process-once semantics).
 */
export function useTeacherSyncResponder() {
  useEffect(() => {
    const pendingRef = ref(db, PENDING_PATH);

    const unsubscribe: Unsubscribe = onChildAdded(pendingRef, (snapshot) => {
      const data = snapshot.val();
      if (data?.payload) {
        // Delete from Firebase first to prevent duplicate processing
        remove(snapshot.ref).catch(console.error);
        useGameStore.getState().queueAction(data.payload as ActionPayload);
      }
    });

    return () => unsubscribe();
  }, []);
}

/**
 * dispatchActionRequest — call from StudentPortal to submit an action to the teacher.
 * Pushes the payload to /pendingActions; the teacher's useTeacherSyncResponder picks it up.
 */
export function dispatchActionRequest(payload: ActionPayload): void {
  // Firebase rejects writes containing `undefined` values.
  // JSON round-trip strips them cleanly.
  const clean = JSON.parse(JSON.stringify(payload)) as ActionPayload;
  push(ref(db, PENDING_PATH), {
    payload: clean,
    timestamp: Date.now()
  }).catch(err => console.error('[Firebase] Failed to dispatch action:', err));
}
