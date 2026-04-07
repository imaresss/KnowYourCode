export type RerunIntent = "regenerate" | "switchModel";

export interface LastActionRunner {
  rerun: (intent: RerunIntent) => Promise<void>;
}
