/**
 * The stages of meal estimation, from pixels to macros.
 *
 * An LLM vision call takes several seconds — two on a fast network with a small
 * model, up to thirty with a 32B model on Ollama. A frozen image with a generic
 * spinner reads as a freeze; breaking the wait into what the engine is actually
 * working on keeps the time honest and active.
 */

export interface ScanPhase {
  /** Conversational description shown in the panel. */
  label: string;
  /** Short technical token shown on the viewfinder HUD. */
  code: string;
}

export const SCAN_PHASES: { untilSec: number; label: string; code: string }[] = [
  { untilSec: 2, label: 'Scanning plate…', code: 'SCANNING' },
  { untilSec: 5, label: 'Identifying foods…', code: 'IDENTIFYING' },
  { untilSec: 9, label: 'Estimating portions…', code: 'PORTIONING' },
  { untilSec: Number.POSITIVE_INFINITY, label: 'Inferring macros…', code: 'ANALYZING' },
];

/**
 * Returns the human-readable and technical phase for the elapsed duration.
 */
export const scanPhaseOf = (elapsedSec: number): ScanPhase => {
  const elapsed = Math.max(0, elapsedSec);
  const match = SCAN_PHASES.find((phase) => elapsed < phase.untilSec) ?? SCAN_PHASES[SCAN_PHASES.length - 1];
  return { label: match.label, code: match.code };
};
