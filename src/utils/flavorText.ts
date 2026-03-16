/**
 * flavorText.ts — AI-powered whimsical Canadian political news headlines
 *
 * Calls Gemini Flash to generate a short, punchy, satirical ticker headline
 * to replace plain action log messages on the Board view ticker.
 *
 * Set VITE_GEMINI_API_KEY in a .env.local file (not committed to source control).
 * If the key is absent or the call fails, the plain log message is used as fallback.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { ActionPayload } from '../types/game';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
console.log('Gemini key:', API_KEY);

const ai = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

export const SYSTEM_PROMPT = `Using SimCity style whimsy as your inspiration,You are a comedic Canadian political news anchor writing breaking-news ticker headlines for a classroom election simulation game. Keep headlines SHORT (max 15 words), punchy, and whimsical. Use Canadian cultural references when appropriate (hockey, Tim Hortons, poutine, the CBC, etc.). Do NOT use quotation marks. Reply with only the headline, no punctuation at the end.`;

interface FlavorContext {
  actionType: ActionPayload['actionType'];
  partyName: string;
  targetPartyName?: string;
  ridingName?: string;
  amount?: number;
}

export async function generateFlavorText(ctx: FlavorContext, fallback: string, customPrompt?: string): Promise<string> {
  console.log('[Gemini] generateFlavorText called with ctx:', ctx, 'fallback:', fallback);
  console.log('[Gemini] is AI initialized?', !!ai);
  if (!ai) return fallback;

  const prompt = buildPrompt(ctx);
  // Pull from store if the teacher customized it, otherwise use default
  const activePrompt = customPrompt || SYSTEM_PROMPT;

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: activePrompt
    });
    console.log('[Gemini] requesting content with prompt:', prompt);
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/['"]/g, '').replace(/\.$/, '');
    console.log('[Gemini] generated text:', text);
    return text || fallback;
  } catch (e) {
    console.error('[Gemini] Failed to generate flavor text:', e);
    return fallback;
  }
}

function buildPrompt(ctx: FlavorContext): string {
  const { actionType, partyName, targetPartyName, ridingName } = ctx;
  switch (actionType) {
    case 'campaign':
      return `Generate a news ticker for: ${partyName} is campaigning in ${ridingName ?? 'a key riding'}.`;
    case 'research':
      return `Generate a news ticker for: ${partyName} quietly researches voter demographics in ${ridingName ?? 'an unnamed riding'}.`;
    case 'recon':
      return `Generate a news ticker for: ${partyName} sends a spy to learn secrets about ${targetPartyName ?? 'a rival party'}.`;
    case 'scandal':
      return `Generate a news ticker for: ${partyName} leaks a damaging scandal about ${targetPartyName ?? 'a rival party'}.`;
    case 'misinformation':
      return `Generate a news ticker for: ${partyName} plants a misinformation trap targeting ${targetPartyName ?? 'voters'} in ${ridingName ?? 'a riding'}.`;
    case 'hack':
      return `Generate a news ticker for: ${partyName} attempts to hack the finances of ${targetPartyName ?? 'a rival'}.`;
    case 'crisis_response':
      return `Generate a news ticker for: ${partyName} goes into damage control mode.`;
    case 'last_push':
      return `Generate a news ticker for: ${partyName} makes an all-out final push in ${ridingName ?? 'a riding'} on election day.`;
    case 'purchase_upgrade':
      return `Generate a news ticker for: ${partyName} unveils a powerful new campaign strategy.`;
    default:
      return `Generate a news ticker for: ${partyName} makes a political move.`;
  }
}
