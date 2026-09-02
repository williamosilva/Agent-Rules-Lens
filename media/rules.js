// VS Code transport for the shared renderer. Everything the sidebar draws
// arrives through postMessage; this file only forwards clicks back to the
// extension host and keeps the open/closed state in the webview state, so it
// survives a re-render, including a language change.
(function () {
  'use strict';

  var vscode = acquireVsCodeApi();
  var collapsed = loadCollapsed();

  function loadCollapsed() {
    var previous = vscode.getState();
    var list = previous && Array.isArray(previous.collapsed) ? previous.collapsed : [];
    var set = Object.create(null);
    for (var i = 0; i < list.length; i += 1) {
      if (typeof list[i] === 'string') {
        set[list[i]] = true;
      }
    }
    return set;
  }

  var view = window.AgentRulesRenderer.create({
    root: document.getElementById('root'),
    showLanguageSwitch: true,
    host: {
      isCollapsed: function (id, defaultExpanded) {
        if (Object.prototype.hasOwnProperty.call(collapsed, id)) {
          return collapsed[id];
        }
        return !defaultExpanded;
      },
      setCollapsed: function (id, isCollapsed) {
        if (isCollapsed) {
          collapsed[id] = true;
        } else {
          delete collapsed[id];
        }
        vscode.setState({ collapsed: Object.keys(collapsed) });
      },
      openRule: function (row) {
        vscode.postMessage({ type: 'openRule', fsPath: row.fsPath });
      },
      openWarning: function (warning) {
        var message = { type: 'openWarning', fsPath: warning.fsPath };
        if (typeof warning.line === 'number') {
          message.line = warning.line;
        }
        vscode.postMessage(message);
      },
      setLanguage: function (locale) {
        vscode.postMessage({ type: 'setLanguage', language: locale });
      }
    }
  });

  window.addEventListener('message', function (event) {
    var message = event.data;
    if (!message || message.type !== 'state' || !message.model) {
      return;
    }
    view.render(message.model, message.icons);
  });

  vscode.postMessage({ type: 'ready' });
})();
