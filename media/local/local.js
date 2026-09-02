// HTTP transport and dashboard chrome for the shared renderer. The session
// token lives only in this closure: it is read from the shell and never written
// to storage or a log. Every string comes from the server's dictionary, so no
// wording is decided here.
(function () {
  'use strict';

  var SEARCH_DEBOUNCE_MS = 160;

  var tokenMeta = document.querySelector('meta[name="arl-token"]');
  var token = tokenMeta ? tokenMeta.content : '';
  if (tokenMeta) {
    tokenMeta.remove();
  }

  var els = {
    modeLabel: document.getElementById('mode-label'),
    workspaceLabel: document.getElementById('workspace-label'),
    workspace: document.getElementById('workspace'),
    privacy: document.getElementById('privacy'),
    language: document.getElementById('language'),
    pickerTitle: document.getElementById('picker-title'),
    fileLabel: document.getElementById('file-label'),
    input: document.getElementById('file-input'),
    suggestions: document.getElementById('suggestions'),
    analyze: document.getElementById('analyze'),
    refresh: document.getElementById('refresh'),
    status: document.getElementById('status'),
    detected: document.getElementById('detected'),
    analysisTitle: document.getElementById('analysis-title'),
    emptyState: document.getElementById('empty-state'),
    emptyTitle: document.getElementById('empty-title'),
    emptyBody: document.getElementById('empty-body'),
    root: document.getElementById('root'),
    preview: document.getElementById('preview'),
    previewTitle: document.getElementById('preview-title'),
    previewPath: document.getElementById('preview-path'),
    previewLine: document.getElementById('preview-line'),
    previewBody: document.getElementById('preview-body'),
    previewCopy: document.getElementById('preview-copy'),
    previewClose: document.getElementById('preview-close')
  };

  var state = {
    locale: 'en',
    strings: {},
    icons: {},
    /** The path the next analysis will use, once it is known to be valid. */
    file: undefined,
    /** Paths currently offered, and which one the keyboard is on. */
    matches: [],
    activeIndex: -1,
    detectedCount: 0,
    collapsed: Object.create(null),
    searchTimer: undefined,
    busy: false
  };

  function text() {
    return state.strings[state.locale] || state.strings['en'] || {};
  }

  function api(path, options) {
    var init = options || {};
    init.headers = Object.assign({ 'X-ARL-Token': token }, init.headers || {});
    init.credentials = 'same-origin';
    return fetch(path, init).then(function (response) {
      return response.json().then(function (body) {
        return { ok: response.ok, status: response.status, body: body };
      });
    });
  }

  /** One place for the line under the picker: idle, busy or error. */
  function setStatus(message, kind) {
    els.status.textContent = message || '';
    els.status.className =
      'status' + (kind === 'error' ? ' is-error' : kind === 'busy' ? ' is-busy' : '');
  }

  function setBusy(busy) {
    state.busy = busy;
    els.refresh.disabled = busy;
    updateAnalyzeButton();
    if (busy) {
      setStatus(text().analyzing, 'busy');
    }
  }

  /** Analysis needs a chosen file, and never runs twice at once. */
  function updateAnalyzeButton() {
    var typed = els.input.value.trim();
    els.analyze.disabled = state.busy || typed.length === 0;
  }

  /* Renderer */

  var view = window.AgentRulesRenderer.create({
    root: els.root,
    // The page has its own PT | EN control and its own empty state, both worded
    // for a browser rather than for the editor sidebar.
    showLanguageSwitch: false,
    suppressEmptyState: true,
    presentation: 'dashboard',
    host: {
      isCollapsed: function (id, defaultExpanded) {
        if (Object.prototype.hasOwnProperty.call(state.collapsed, id)) {
          return state.collapsed[id];
        }
        return !defaultExpanded;
      },
      setCollapsed: function (id, isCollapsed) {
        if (isCollapsed) {
          state.collapsed[id] = true;
        } else {
          delete state.collapsed[id];
        }
      },
      openRule: function (row) {
        showPreview(row.fsPath, undefined);
      },
      openWarning: function (warning) {
        showPreview(warning.fsPath, warning.line);
      },
      setLanguage: function (locale) {
        setLocale(locale);
      }
    }
  });

  function renderLanguage(model) {
    els.language.textContent = '';
    if (!model || !model.language) {
      return;
    }
    var data = model.language;
    var group = document.createElement('div');
    group.className = 'lang';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', data.ariaLabel);
    for (var i = 0; i < data.options.length; i += 1) {
      var option = data.options[i];
      if (i > 0) {
        var separator = document.createElement('span');
        separator.className = 'lang-sep';
        separator.textContent = '|';
        group.appendChild(separator);
      }
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'lang-option' + (option.active ? ' is-active' : '');
      button.textContent = option.label;
      button.title = option.ariaLabel;
      button.setAttribute('aria-label', option.ariaLabel);
      button.setAttribute('aria-pressed', option.active ? 'true' : 'false');
      (function (locale) {
        button.addEventListener('click', function () {
          setLocale(locale);
        });
      })(option.locale);
      group.appendChild(button);
    }
    els.language.appendChild(group);
  }

  function applyChrome() {
    var t = text();
    els.modeLabel.textContent = t.modeLabel || '';
    // The product name is in the heading; this line names the analysed project.
    els.workspaceLabel.textContent = t.workspaceLabel ? t.workspaceLabel + ':' : '';
    els.privacy.textContent = t.privacy || '';
    els.pickerTitle.textContent = t.pickerTitle || '';
    els.fileLabel.textContent = t.fileLabel || '';
    els.input.placeholder = t.filePlaceholder || '';
    els.suggestions.setAttribute('aria-label', t.suggestionsLabel || '');
    els.analyze.textContent = t.analyze || '';
    els.refresh.textContent = t.refresh || '';
    els.analysisTitle.textContent = t.analysisTitle || '';
    els.emptyTitle.textContent = t.emptyTitle || '';
    els.emptyBody.textContent = t.emptyBody || '';
    els.previewTitle.textContent = t.preview || '';
    els.previewCopy.textContent = t.copyPath || '';
    els.previewClose.textContent = t.close || '';
    document.documentElement.lang = state.locale === 'pt-BR' ? 'pt-BR' : 'en';
    renderDetected();
  }

  /** Plural selection only; the three forms come from the server dictionary. */
  function renderDetected() {
    var forms = text().detectedFiles;
    if (!forms) {
      els.detected.textContent = '';
      return;
    }
    var count = state.detectedCount;
    els.detected.textContent =
      count === 0
        ? forms.zero
        : count === 1
          ? forms.one
          : String(forms.many).replace('{count}', String(count));
  }

  /* Analysis */

  function analyze(options) {
    var settings = options || {};
    if (state.busy) {
      return Promise.resolve();
    }
    // A debounced search still in flight would otherwise report "no results"
    // on top of the analysis outcome.
    window.clearTimeout(state.searchTimer);

    var payload = { locale: state.locale };
    if (settings.file !== undefined) {
      payload.file = settings.file;
    } else if (state.file) {
      payload.file = state.file;
    }
    if (settings.refresh) {
      payload.refresh = true;
    }

    setBusy(true);
    return api('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (result) {
        var t = text();
        if (!result.ok) {
          setStatus(
            result.body && result.body.error === 'file-not-found'
              ? t.fileNotFound
              : t.analysisFailed,
            'error'
          );
          return;
        }

        state.locale = result.body.locale || state.locale;
        state.file = result.body.file;
        state.detectedCount = countDetected(result.body.model);
        applyChrome();
        renderLanguage(result.body.model);
        view.render(result.body.model, state.icons);

        var hasFile = Boolean(result.body.file);
        els.emptyState.hidden = hasFile;
        setStatus(settings.refresh ? t.refreshed : '', undefined);
      })
      .catch(function () {
        setStatus(text().analysisFailed, 'error');
      })
      .then(function () {
        setBusy(false);
        if (!state.busy) {
          els.refresh.disabled = false;
        }
      });
  }

  /** Rule files the analysis knows about, whatever the selected file is. */
  function countDetected(model) {
    if (!model) {
      return 0;
    }
    return typeof model.detectedCount === 'number' ? model.detectedCount : 0;
  }

  function setLocale(locale) {
    if (locale === state.locale || state.busy) {
      return;
    }
    state.locale = locale;
    applyChrome();
    // Language only re-renders the cached analysis; discovery is not repeated.
    void analyze();
  }

  /* File search */

  function closeSuggestions() {
    els.suggestions.hidden = true;
    els.suggestions.textContent = '';
    els.input.setAttribute('aria-expanded', 'false');
    els.input.removeAttribute('aria-activedescendant');
    state.matches = [];
    state.activeIndex = -1;
  }

  function highlight(index) {
    var items = els.suggestions.querySelectorAll('.suggestion');
    for (var i = 0; i < items.length; i += 1) {
      var isActive = i === index;
      items[i].classList.toggle('is-active', isActive);
      items[i].parentElement.setAttribute('aria-selected', isActive ? 'true' : 'false');
      if (isActive) {
        els.input.setAttribute('aria-activedescendant', items[i].id);
        items[i].scrollIntoView({ block: 'nearest' });
      }
    }
    state.activeIndex = index;
  }

  function choose(path) {
    els.input.value = path;
    closeSuggestions();
    updateAnalyzeButton();
    void analyze({ file: path });
  }

  function renderSuggestions(files) {
    els.suggestions.textContent = '';
    state.matches = files;
    state.activeIndex = -1;

    if (files.length === 0) {
      closeSuggestions();
      if (!state.busy) {
        setStatus(text().noResults, undefined);
      }
      return;
    }

    for (var i = 0; i < files.length; i += 1) {
      var item = document.createElement('li');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'suggestion';
      button.id = 'suggestion-' + i;
      button.textContent = files[i];
      button.title = files[i];
      (function (path) {
        button.addEventListener('click', function () {
          choose(path);
        });
      })(files[i]);
      item.appendChild(button);
      els.suggestions.appendChild(item);
    }
    els.suggestions.hidden = false;
    els.input.setAttribute('aria-expanded', 'true');
    if (!state.busy) {
      setStatus('', undefined);
    }
  }

  function search(query) {
    if (query.length === 0) {
      closeSuggestions();
      return Promise.resolve();
    }
    return api('/api/files?q=' + encodeURIComponent(query)).then(function (result) {
      if (result.ok) {
        renderSuggestions(result.body.files || []);
      }
    });
  }

  els.input.addEventListener('input', function () {
    window.clearTimeout(state.searchTimer);
    updateAnalyzeButton();
    var query = els.input.value.trim();
    state.searchTimer = window.setTimeout(function () {
      void search(query);
    }, SEARCH_DEBOUNCE_MS);
  });

  els.input.addEventListener('keydown', function (event) {
    var open = !els.suggestions.hidden && state.matches.length > 0;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) {
        return;
      }
      event.preventDefault();
      var step = event.key === 'ArrowDown' ? 1 : -1;
      var next = state.activeIndex + step;
      if (next < 0) {
        next = state.matches.length - 1;
      } else if (next >= state.matches.length) {
        next = 0;
      }
      highlight(next);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (open && state.activeIndex >= 0) {
        choose(state.matches[state.activeIndex]);
        return;
      }
      closeSuggestions();
      if (els.input.value.trim().length > 0) {
        void analyze({ file: els.input.value.trim() });
      }
      return;
    }

    if (event.key === 'Escape') {
      closeSuggestions();
    }
  });

  document.addEventListener('click', function (event) {
    if (!els.suggestions.contains(event.target) && event.target !== els.input) {
      closeSuggestions();
    }
  });

  els.analyze.addEventListener('click', function () {
    closeSuggestions();
    var typed = els.input.value.trim();
    if (typed.length > 0) {
      void analyze({ file: typed });
    }
  });

  els.refresh.addEventListener('click', function () {
    closeSuggestions();
    void analyze({ refresh: true });
  });

  /* Preview */

  function showPreview(handle, line) {
    if (!handle) {
      return;
    }
    void api('/api/artifacts/' + encodeURIComponent(handle)).then(function (result) {
      var t = text();
      if (!result.ok) {
        setStatus(result.status === 413 ? t.previewTooLarge : t.previewUnavailable, 'error');
        return;
      }
      els.previewPath.textContent = result.body.relativePath;
      els.previewPath.title = result.body.relativePath;
      els.previewLine.textContent = typeof line === 'number' ? t.previewLine + ' ' + line : '';
      els.previewBody.textContent = result.body.content;
      els.preview.hidden = false;
      els.preview.scrollIntoView({ block: 'nearest' });
    });
  }

  els.previewClose.addEventListener('click', function () {
    els.preview.hidden = true;
    els.input.focus();
  });

  els.previewCopy.addEventListener('click', function () {
    var value = els.previewPath.textContent || '';
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(value).then(function () {
        setStatus(text().copied, undefined);
      });
    }
  });

  /* Theme: rules.css keys the mark variants off these body classes. */

  function applyTheme(isDark) {
    document.body.className = isDark ? 'vscode-dark' : 'vscode-light';
  }

  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  applyTheme(darkQuery.matches);
  darkQuery.addEventListener('change', function (event) {
    applyTheme(event.matches);
  });

  /* Start */

  void api('/api/session').then(function (result) {
    if (!result.ok) {
      setStatus('Session unavailable.', 'error');
      return;
    }
    state.locale = result.body.locale || 'en';
    state.strings = result.body.strings || {};
    state.icons = result.body.icons || {};

    els.workspace.textContent = result.body.workspace;
    els.workspace.title = result.body.workspace;
    if (result.body.file) {
      els.input.value = result.body.file;
    }
    applyChrome();
    updateAnalyzeButton();
    els.input.focus();
    void analyze({ file: result.body.file });
  });
})();
