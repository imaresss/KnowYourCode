"use strict";
const path = require("path");
const Module = require("module");

const originalResolveFilename = Module._resolveFilename.bind(Module);

Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
  if (request === "vscode") {
    return path.join(__dirname, "vscode-shim.cjs");
  }
  return originalResolveFilename(request, parent, isMain, options);
};
