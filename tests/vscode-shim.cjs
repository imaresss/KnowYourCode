/** Minimal shim so Node tests can load modules that import `vscode`. */

function noopChannel(name = "") {
  return {
    name,
    appendLine: () => {},
    append: () => {},
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {}
  };
}

module.exports = {
  window: {
    createOutputChannel: noopChannel
  }
};
