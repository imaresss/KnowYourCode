export type IdeKind =
  | "cursor"
  | "vscode"
  | "windsurf"
  | "antigravity"
  | "intellij"
  | "webstorm"
  | "unknown";

export interface IdeInfo {
  kind: IdeKind;
  displayName: string;
}

export interface IdeDetectionSnapshot {
  appName?: string;
  uriScheme?: string;
  execPath?: string;
  argv0?: string;
}

interface IdeDefinition extends IdeInfo {
  fingerprints: readonly string[];
}

const IDE_DEFINITIONS: readonly IdeDefinition[] = [
  // Keep IDE fingerprints centralized so adding support for new hosts stays data-driven.
  {
    kind: "cursor",
    displayName: "Cursor",
    fingerprints: ["cursor"]
  },
  {
    kind: "windsurf",
    displayName: "Windsurf",
    fingerprints: ["windsurf", "codeium"]
  },
  {
    kind: "antigravity",
    displayName: "Antigravity IDE",
    fingerprints: ["antigravity", "anti-gravity"]
  },
  {
    kind: "vscode",
    displayName: "Visual Studio Code",
    fingerprints: ["visual studio code", "vscode", "code-oss", "code oss"]
  },
  {
    kind: "webstorm",
    displayName: "WebStorm",
    fingerprints: ["webstorm"]
  },
  {
    kind: "intellij",
    displayName: "IntelliJ IDEA",
    fingerprints: ["intellij", "idea"]
  }
] as const;

const UNKNOWN_IDE: IdeInfo = {
  kind: "unknown",
  displayName: "Unknown"
};

export function detectIde(snapshot: IdeDetectionSnapshot): IdeInfo {
  const haystacks = [
    snapshot.appName,
    snapshot.uriScheme,
    snapshot.execPath,
    snapshot.argv0
  ]
    .map(normalizeIdeToken)
    .filter((value): value is string => Boolean(value));

  for (const definition of IDE_DEFINITIONS) {
    if (definition.fingerprints.some((fingerprint) => haystacks.some((value) => value.includes(fingerprint)))) {
      return {
        kind: definition.kind,
        displayName: definition.displayName
      };
    }
  }

  return UNKNOWN_IDE;
}

export function shouldEnableCursorHandoff(snapshot: IdeDetectionSnapshot): boolean {
  return detectIde(snapshot).kind === "cursor";
}

function normalizeIdeToken(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.trim().toLowerCase();
}
