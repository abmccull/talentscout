/**
 * Public API surface for the player subsystem.
 */

export {
  generatePlayer,
  generateSquad,
  generateWorldPlayers,
  resolveNamePool,
} from './generation';
export type { PlayerGenConfig } from './generation';

export { generatePersonalityTraits } from './personality';

export { checkPersonalityReveal } from './personalityReveal';
export type { RevealContext } from './personalityReveal';
