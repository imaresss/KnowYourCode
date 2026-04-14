const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectIde,
  shouldEnableCursorHandoff
} = require("../dist/core/ideDetection.js");

test("cursor hosts enable cursor handoff automatically", () => {
  const ide = detectIde({
    appName: "Cursor",
    uriScheme: "cursor",
    execPath: "/Applications/Cursor.app/Contents/MacOS/Cursor",
    argv0: "Cursor"
  });

  assert.equal(ide.kind, "cursor");
  assert.equal(shouldEnableCursorHandoff({
    appName: "Cursor",
    uriScheme: "cursor"
  }), true);
});

test("non-cursor vscode hosts do not enable cursor handoff", () => {
  const ide = detectIde({
    appName: "Visual Studio Code",
    uriScheme: "vscode",
    execPath: "/Applications/Visual Studio Code.app/Contents/MacOS/Electron",
    argv0: "code"
  });

  assert.equal(ide.kind, "vscode");
  assert.equal(shouldEnableCursorHandoff({
    appName: "Visual Studio Code",
    uriScheme: "vscode"
  }), false);
});

test("unknown hosts fall back to false", () => {
  const ide = detectIde({
    appName: "Some Custom IDE",
    uriScheme: "custom-ide",
    execPath: "/opt/custom-ide/bin/custom",
    argv0: "custom"
  });

  assert.equal(ide.kind, "unknown");
  assert.equal(shouldEnableCursorHandoff({
    appName: "Some Custom IDE"
  }), false);
});
