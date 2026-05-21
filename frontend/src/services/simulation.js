/**
 * Simulation Service
 *
 * Client-side facade for all simulation-related API interactions.
 * Encapsulates the event-driven simulation protocol so that UI
 * components only deal with high-level operations, not raw HTTP.
 *
 * Design:
 * - Simulation sessions are started, updated, and terminated through this service.
 * - Events are appended to the typed event log.
 * - The service tracks local state to avoid redundant fetches.
 * - UI components observe state via SimulationContext (contexts/SimulationContext.js).
 */

import api from './api';

// ── Event type constants ──────────────────────────────────────────

export const EventType = Object.freeze({
  NODE_ENTERED:            'node_entered',
  CHOICE_MADE:             'choice_made',
  AI_RESPONSE_RECEIVED:    'ai_response_received',
  OUTCOME_REACHED:         'outcome_reached',
  HINT_REQUESTED:          'hint_requested',
  SIMULATION_PAUSED:       'simulation_paused',
  SIMULATION_RESUMED:      'simulation_resumed',
  TIMEOUT:                 'timeout',
});

// ── Simulation session operations ─────────────────────────────────

/**
 * Create and start a new simulation session.
 *
 * @param {object} params
 * @param {string} params.challenge_id - Optional: challenge-based simulation
 * @param {string} params.persona_id   - Optional: AI persona-based simulation
 * @param {string} params.campaign_id  - Optional: campaign stage simulation
 * @param {string} params.title        - Display title
 * @param {string} params.simulation_type - 'challenge' | 'ai_challenge' | 'campaign'
 * @returns {Promise<{id: string, status: string}>}
 */
export async function startSimulation({ challenge_id, persona_id, campaign_id, title, simulation_type = 'challenge' }) {
  const response = await api.post('/simulations', {
    challenge_id,
    persona_id,
    campaign_id,
    title,
    simulation_type,
    status: 'running',
  });
  return response.data;
}

/**
 * Load a simulation by ID, including its event log.
 * @param {string} simulationId
 * @returns {Promise<{simulation: object, events: object[]}>}
 */
export async function loadSimulation(simulationId) {
  const [simRes, eventsRes] = await Promise.all([
    api.get(`/simulations/${simulationId}`),
    api.get(`/simulations/${simulationId}/events`),
  ]);
  return {
    simulation: simRes.data,
    events: eventsRes.data.events || [],
    eventsSource: eventsRes.data.source,
  };
}

/**
 * Mark a simulation as completed.
 * @param {string} simulationId
 * @param {number} finalScore - 0-100
 * @param {string} outcome - 'defended' | 'compromised' | 'incomplete'
 */
export async function completeSimulation(simulationId, finalScore, outcome = 'defended') {
  await api.put(`/simulations/${simulationId}`, {
    status: 'completed',
    score: finalScore,
    completed_at: new Date().toISOString(),
    metadata: { outcome },
  });
}

/**
 * Pause a running simulation.
 */
export async function pauseSimulation(simulationId) {
  await api.put(`/simulations/${simulationId}`, { status: 'paused' });
}

/**
 * Resume a paused simulation.
 */
export async function resumeSimulation(simulationId) {
  await api.put(`/simulations/${simulationId}`, { status: 'running' });
}

// ── Event log operations ──────────────────────────────────────────

/**
 * Append a typed event to the simulation's event log.
 * @param {string} simulationId
 * @param {object} event - Partial SimulationEvent (id, timestamp generated server-side)
 * @returns {Promise<{id: string, sequence: number}>}
 */
export async function appendEvent(simulationId, event) {
  const response = await api.post(`/simulations/${simulationId}/events`, {
    simulation_id: simulationId,
    sequence: 0, // server resolves the correct sequence
    ...event,
  });
  return response.data;
}

/**
 * Record a user's choice in the event log.
 * @param {string} simulationId
 * @param {object} choice - { node_id, action, score_impact, next_node, cialdini_trigger? }
 */
export async function recordChoice(simulationId, choice) {
  return appendEvent(simulationId, {
    event_type: EventType.CHOICE_MADE,
    actor: 'user',
    payload: {
      node_id:         choice.node_id,
      action:          choice.action,
      score_impact:    choice.score_impact || 0,
      next_node:       choice.next_node,
      cialdini_trigger: choice.cialdini_trigger || null,
    },
    state_snapshot: choice.state_snapshot || {},
  });
}

/**
 * Record an AI persona response.
 * @param {string} simulationId
 * @param {object} response - { content, status, persona_id, turn }
 */
export async function recordAIResponse(simulationId, response) {
  return appendEvent(simulationId, {
    event_type: EventType.AI_RESPONSE_RECEIVED,
    actor: 'persona',
    payload: {
      content:    response.content,
      status:     response.status,
      persona_id: response.persona_id,
      turn:       response.turn,
    },
  });
}

/**
 * Record a simulation outcome.
 */
export async function recordOutcome(simulationId, { outcome, score, triggered_principles }) {
  return appendEvent(simulationId, {
    event_type: EventType.OUTCOME_REACHED,
    actor: 'system',
    payload: { outcome, score, triggered_principles: triggered_principles || [] },
  });
}

// ── Replay operations ─────────────────────────────────────────────

/**
 * Reconstruct simulation state at a given sequence point.
 * Client-side replay — replays events up to `targetSequence`.
 *
 * @param {object[]} events - Full event log
 * @param {number} targetSequence - Replay up to this sequence number
 * @returns {{ score: number, node_id: string | null, choices: object[] }}
 */
export function replayToSequence(events, targetSequence) {
  let score = 100;
  let currentNodeId = null;
  const choices = [];

  for (const event of events) {
    if (event.sequence > targetSequence) break;

    if (event.event_type === EventType.CHOICE_MADE && event.actor === 'user') {
      const impact = event.payload?.score_impact || 0;
      score = Math.max(0, Math.min(100, score + impact));
      currentNodeId = event.payload?.next_node || currentNodeId;
      choices.push(event.payload);
    }
  }

  return { score, currentNodeId, choices };
}

/**
 * Compute a summary of principles triggered during a simulation.
 * @param {object[]} events
 * @returns {Record<string, number>} - principle → count of times triggered
 */
export function analyzePrinciplesTriggers(events) {
  const counts = {};
  for (const event of events) {
    if (event.event_type === EventType.CHOICE_MADE) {
      const trigger = event.payload?.cialdini_trigger;
      if (trigger) {
        counts[trigger] = (counts[trigger] || 0) + 1;
      }
    }
  }
  return counts;
}

// ── Risk profile ──────────────────────────────────────────────────

/**
 * Fetch the current user's risk profile.
 * @returns {Promise<RiskProfile>}
 */
export async function getMyRiskProfile() {
  const response = await api.get('/risk-profile/me');
  return response.data;
}

/**
 * Fetch available personas from the backend catalog.
 * @param {{ difficulty?: string }} filters
 */
export async function fetchPersonas(filters = {}) {
  const params = new URLSearchParams();
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  if (filters.category) params.set('category', filters.category);
  const response = await api.get(`/personas${params.size > 0 ? '?' + params : ''}`);
  return response.data;
}
