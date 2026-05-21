/**
 * Persona Service
 *
 * Central abstraction layer for all AI persona logic.
 * UI pages should use this service rather than importing raw persona data.
 * Designed to be extended when backend-managed personas are added.
 */

import { AI_PERSONAS } from '../data/aiPersonas';

// Difficulty ordering for sorting
const DIFFICULTY_ORDER = { Easy: 0, Medium: 1, Hard: 2 };

// Cialdini principle mapping per category — used for scoring and debrief analysis
export const CATEGORY_PRINCIPLES = {
  'Business Email Compromise (BEC)': ['authority', 'scarcity'],
  'Tech Support Scam': ['authority', 'commitment'],
  'Phishing': ['liking', 'scarcity'],
  'Finance Fraud': ['scarcity', 'social_proof'],
  'Social Engineering': ['reciprocity', 'liking'],
  'Vishing / Impersonation': ['authority', 'scarcity'],
  'Supply Chain Attack': ['social_proof', 'commitment'],
  'Deepfake / AI-Assisted Attack': ['authority', 'liking'],
  'Watering Hole / Technical Phishing': ['social_proof', 'authority'],
  'Reconnaissance / Pretexting': ['liking', 'reciprocity'],
  'Insider Threat / Social Engineering': ['liking', 'commitment'],
  'Charity Fraud / Reciprocity': ['reciprocity', 'liking'],
  'MFA Fatigue / Account Takeover': ['authority', 'scarcity'],
  'AI Voice Cloning / Vishing': ['liking', 'scarcity'],
  'Quishing (QR Phishing)': ['authority', 'scarcity'],
  // Indonesian context categories
  'Penipuan Pajak (DJP)': ['authority', 'scarcity'],
  'Penipuan Bank (Vishing)': ['authority', 'commitment'],
  'BEC via WhatsApp': ['authority', 'scarcity'],
  'Phishing Rekrutmen': ['liking', 'scarcity'],
  'Penipuan Vendor BUMN': ['authority', 'commitment'],
  'Intelijen Sosial (LinkedIn)': ['liking', 'reciprocity'],
};

/**
 * Get all available personas, optionally filtered.
 *
 * @param {{ difficulty?: string, category?: string }} filters
 * @returns Persona[]
 */
export function getPersonas(filters = {}) {
  let list = [...AI_PERSONAS];

  if (filters.difficulty) {
    list = list.filter((p) => p.difficulty === filters.difficulty);
  }
  if (filters.category) {
    list = list.filter((p) => p.category === filters.category);
  }

  return list.sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty]);
}

/**
 * Find a single persona by ID.
 * @param {string} id
 * @returns Persona | undefined
 */
export function getPersonaById(id) {
  return AI_PERSONAS.find((p) => p.id === id);
}

/**
 * Get all unique categories from the persona catalog.
 * @returns string[]
 */
export function getPersonaCategories() {
  return [...new Set(AI_PERSONAS.map((p) => p.category))].sort();
}

/**
 * Get unique difficulty levels.
 * @returns string[]
 */
export function getPersonaDifficulties() {
  return ['Easy', 'Medium', 'Hard'];
}

/**
 * Group personas by difficulty tier.
 * @returns Record<string, Persona[]>
 */
export function getPersonasByDifficulty() {
  return getPersonaDifficulties().reduce((acc, difficulty) => {
    acc[difficulty] = getPersonas({ difficulty });
    return acc;
  }, {});
}

/**
 * Build the LLM system prompt for a persona roleplay session.
 * Centralizing this here means prompt changes don't require touching UI pages.
 *
 * @param {Persona} persona
 * @param {{ language?: string }} options
 * @returns string
 */
export function buildPersonaSystemPrompt(persona, { language = 'en' } = {}) {
  const langInstruction = language === 'id'
    ? 'Respond in Indonesian (Bahasa Indonesia) throughout the entire session.'
    : 'Respond in English throughout the entire session.';

  return `You are a roleplay actor in a cybersecurity awareness simulation designed for professional security training.

PERSONA
Name: ${persona.name}
Category: ${persona.category}
Goal: ${persona.goal}
Communication Style: ${persona.style}
Scenario Context: ${persona.context}
Difficulty: ${persona.difficulty}

SIMULATION RULES
1. Respond naturally as your character. Keep messages realistic and concise (chat/email style).
2. Never break character or reveal you are an AI simulation.
3. If the participant detects the attack and refuses securely → react realistically (frustration, pivot tactics, or give up), then output [ATTACK_FAILED].
4. If the participant complies with the attack goal (gives credentials, approves transfer, etc.) → react with success, then output [SUCCESS_ATTACK].
5. Adjust pressure gradually. Do not immediately expose the full attack.
6. Use the Cialdini principles naturally: ${(CATEGORY_PRINCIPLES[persona.category] || []).join(', ')}.

LANGUAGE
${langInstruction}

Begin by continuing from the participant's response. Do not re-send your opening line.`;
}

/**
 * Get a difficulty color class for UI rendering.
 * @param {string} difficulty
 * @returns string
 */
export function getDifficultyColor(difficulty) {
  const map = {
    Easy: 'text-emerald-400 border-emerald-400/50 bg-emerald-400/10',
    Medium: 'text-yellow-400 border-yellow-400/50 bg-yellow-400/10',
    Hard: 'text-red-400 border-red-400/50 bg-red-400/10',
  };
  return map[difficulty] || 'text-muted-foreground border-muted bg-muted/10';
}

/**
 * Get a difficulty badge variant string.
 * @param {string} difficulty
 * @returns 'default' | 'secondary' | 'destructive'
 */
export function getDifficultyVariant(difficulty) {
  const map = { Easy: 'default', Medium: 'secondary', Hard: 'destructive' };
  return map[difficulty] || 'secondary';
}

/**
 * Stub: future hook point for fetching backend-managed personas.
 * When backend persona management is implemented, replace getPersonas() calls
 * with fetchPersonas() to use server-side persona catalogs.
 *
 * @returns Promise<Persona[]>
 */
export async function fetchPersonas(apiClient) {
  // Future: return apiClient.get('/personas').then(r => r.data);
  return Promise.resolve(getPersonas());
}
