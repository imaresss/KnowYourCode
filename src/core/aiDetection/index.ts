/**
 * Public API surface for the AI environment detection subsystem.
 *
 * Import only from this barrel in other parts of the extension to keep the
 * internal module graph an implementation detail.
 */

export {
  initHandoffDetection,
  isAiHandoffEnabled,
  getHandoffResolution,
  getBestChatStrategy,
  invalidateAndRefresh
} from "./handoffResolver";

export type { HandoffResolution, ChatStrategy } from "./types";
