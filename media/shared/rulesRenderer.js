// Renders a view model into the sidebar layout. It knows nothing about how the
// model arrived: the VS Code webview feeds it through postMessage and the local
// panel through fetch. Every value is written with textContent, so no string
// from a workspace is ever parsed as HTML.
(function () {
  'use strict';

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  function create(options) {
    var root = options.root;
    var host = options.host;
    var iconUris = {};

    /**
     * A mark, as two local images. CSS shows the one that fits the current
     * theme, so switching theme needs no round trip. Falls back to the neutral
     * agent mark when an id has no file.
     */
    function icon(iconId) {
      var files = iconUris[iconId] || iconUris['generic-agent'];
      var box = element('span', 'icon');
      if (!files) {
        return box;
      }
      for (var i = 0; i < 2; i += 1) {
        var theme = i === 0 ? 'light' : 'dark';
        var img = document.createElement('img');
        img.className = 'icon-img icon-' + theme;
        img.src = files[theme];
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.setAttribute('draggable', 'false');
        box.appendChild(img);
      }
      return box;
    }

    function details(id, defaultExpanded) {
      var node = element('details', 'section');
      node.open = !host.isCollapsed(id, defaultExpanded);
      node.addEventListener('toggle', function () {
        host.setCollapsed(id, !node.open);
      });
      return node;
    }

    function summary(label, count, iconId) {
      var node = element('summary');
      if (iconId) {
        node.appendChild(icon(iconId));
      }
      var text = element('span', 'section-label', label);
      text.title = label;
      node.appendChild(text);
      if (count !== undefined && count !== null && count !== '') {
        var badge = element('span', 'section-count', count);
        badge.title = count;
        node.appendChild(badge);
      }
      return node;
    }

    /**
     * Two lines: name plus tokens, then the state. The format mark stays on the
     * section heading, so a list of six Claude rules is not six Claude logos.
     */
    function ruleButton(rule) {
      var button = element('button', 'rule tone-' + rule.tone);
      button.type = 'button';
      button.title = rule.tooltip || rule.relativePath;
      button.setAttribute('aria-label', rule.label + '. ' + rule.statusLabel + '. ' + rule.reason);

      var top = element('div', 'rule-top');
      top.appendChild(element('span', 'rule-name', rule.label));
      top.appendChild(element('span', 'rule-tokens', rule.tokens));
      button.appendChild(top);

      var meta = element('div', 'rule-meta');
      meta.appendChild(element('span', 'dot'));
      var state = rule.statusLabel
        ? rule.reason && rule.reason !== rule.statusLabel
          ? rule.statusLabel + ' · ' + rule.reason
          : rule.statusLabel
        : rule.reason;
      meta.appendChild(element('span', 'rule-state', state));
      button.appendChild(meta);

      button.addEventListener('click', function () {
        host.openRule(rule);
      });
      return button;
    }

    /** Two lines: the title, then `location · what it means`. */
    function warningButton(warning) {
      var button = element('button', 'warning');
      button.type = 'button';
      button.title = warning.tooltip || warning.message;
      button.setAttribute('aria-label', warning.title + '. ' + warning.message);
      button.appendChild(element('div', 'warning-title', warning.title));
      button.appendChild(element('div', 'warning-summary', warning.summary));
      button.addEventListener('click', function () {
        host.openWarning(warning);
      });
      return button;
    }

    /** The compact PT | EN control. One group, two buttons, keyboard reachable. */
    function languageSwitch(data) {
      var group = element('div', 'lang');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', data.ariaLabel);
      for (var i = 0; i < data.options.length; i += 1) {
        var option = data.options[i];
        if (i > 0) {
          group.appendChild(element('span', 'lang-sep', '|'));
        }
        var button = element('button', 'lang-option' + (option.active ? ' is-active' : ''));
        button.type = 'button';
        button.textContent = option.label;
        button.title = option.ariaLabel;
        button.setAttribute('aria-label', option.ariaLabel);
        button.setAttribute('aria-pressed', option.active ? 'true' : 'false');
        (function (locale) {
          button.addEventListener('click', function () {
            host.setLanguage(locale);
          });
        })(option.locale);
        group.appendChild(button);
      }
      return group;
    }

    function header(data, language) {
      var box = element('div', 'header');

      var top = element('div', 'header-top');
      var path = element('div', 'header-path', data.relativePath);
      path.title = data.tooltip || data.relativePath;
      path.setAttribute('aria-label', data.relativePath);
      top.appendChild(path);
      if (language) {
        top.appendChild(languageSwitch(language));
      }
      box.appendChild(top);

      var summaryLine = element('div', 'header-summary', data.summaryLine);
      summaryLine.title = data.summaryLine;
      box.appendChild(summaryLine);

      var tokens = element('div', 'header-tokens', data.tokensLine);
      tokens.title = data.tokensLine;
      box.appendChild(tokens);
      return box;
    }

    /** Language switch stays reachable even when there is nothing to analyze. */
    function bareLanguageBar(language) {
      var box = element('div', 'header header-bare');
      var top = element('div', 'header-top');
      top.appendChild(element('div', 'header-path', ''));
      top.appendChild(languageSwitch(language));
      box.appendChild(top);
      return box;
    }

    function emptyState(data) {
      var box = element('div', 'empty');
      box.appendChild(element('div', 'empty-title', data.title));
      box.appendChild(element('div', 'empty-body', data.body));
      return box;
    }

    function ruleGroup(group, defaultExpanded) {
      var node = details(group.id, defaultExpanded);
      node.appendChild(summary(group.label, String(group.count), group.iconId));
      var body = element('div', 'section-body');
      for (var i = 0; i < group.rules.length; i += 1) {
        body.appendChild(ruleButton(group.rules[i]));
      }
      node.appendChild(body);
      return node;
    }

    function collapsibleList(id, label, count, defaultExpanded, children) {
      var node = details(id, defaultExpanded);
      node.appendChild(summary(label, count));
      var body = element('div', 'section-body');
      for (var i = 0; i < children.length; i += 1) {
        body.appendChild(children[i]);
      }
      node.appendChild(body);
      return node;
    }

    /**
     * Detected and candidate rows keep a mark per row: unlike a format section,
     * neighbouring files here can belong to different tools.
     */
    function artifactButton(artifact) {
      var button = element('button', 'artifact');
      button.type = 'button';
      button.title = artifact.tooltip || artifact.relativePath;
      button.setAttribute('aria-label', artifact.label + '. ' + artifact.note);
      var head = element('div', 'artifact-top');
      head.appendChild(icon(artifact.iconId));
      head.appendChild(element('span', 'artifact-name', artifact.label));
      button.appendChild(head);
      button.appendChild(element('div', 'artifact-note', artifact.note));
      button.addEventListener('click', function () {
        host.openRule(artifact);
      });
      return button;
    }

    function artifactSection(section) {
      var rows = [];
      for (var i = 0; i < section.rows.length; i += 1) {
        rows.push(artifactButton(section.rows[i]));
      }
      return collapsibleList(section.id, section.label, String(section.count), false, rows);
    }

    function render(model, icons) {
      if (icons && typeof icons === 'object') {
        iconUris = icons;
      }
      root.textContent = '';

      if (model.notice) {
        root.appendChild(element('div', 'notice', model.notice));
      }

      if (model.header) {
        root.appendChild(header(model.header, options.showLanguageSwitch ? model.language : null));
      } else if (model.language && options.showLanguageSwitch) {
        root.appendChild(bareLanguageBar(model.language));
      }

      // The sidebar draws the model's own empty state; the local page has its
      // own wording for a browser and asks the renderer to leave it out.
      if (model.empty && options.suppressEmptyState !== true) {
        root.appendChild(emptyState(model.empty));
      }

      // In dashboard mode the format sections share one container, so CSS can
      // lay them out side by side. Everything else stays a direct child, which
      // keeps warnings and the secondary lists full width.
      var sectionHost = root;
      if (options.presentation === 'dashboard' && model.sections.length > 0) {
        sectionHost = element('div', 'section-grid');
        root.appendChild(sectionHost);
      }

      for (var i = 0; i < model.sections.length; i += 1) {
        var section = model.sections[i];
        var node = details('section:' + section.id, section.expanded);
        node.appendChild(summary(section.label, section.countLabel, section.iconId));
        var body = element('div', 'section-body');
        if (section.rules.length === 0) {
          body.appendChild(element('div', 'section-empty', section.emptyMessage || ''));
        }
        for (var r = 0; r < section.rules.length; r += 1) {
          body.appendChild(ruleButton(section.rules[r]));
        }
        node.appendChild(body);
        sectionHost.appendChild(node);
      }

      if (model.warnings.length > 0) {
        var warningNodes = [];
        for (var w = 0; w < model.warnings.length; w += 1) {
          warningNodes.push(warningButton(model.warnings[w]));
        }
        root.appendChild(
          collapsibleList(
            'section:warnings',
            model.warningsLabel,
            String(model.warnings.length),
            true,
            warningNodes
          )
        );
      }

      if (model.notApplicable.length > 0) {
        var notApplicableNodes = [];
        var notApplicableCount = 0;
        for (var n = 0; n < model.notApplicable.length; n += 1) {
          notApplicableNodes.push(ruleGroup(model.notApplicable[n], true));
          notApplicableCount += model.notApplicable[n].count;
        }
        root.appendChild(
          collapsibleList(
            'section:not-applicable',
            model.notApplicableLabel,
            String(notApplicableCount),
            false,
            notApplicableNodes
          )
        );
      }

      if (model.detected.length > 0) {
        var detectedNodes = [];
        for (var d = 0; d < model.detected.length; d += 1) {
          detectedNodes.push(ruleGroup(model.detected[d], true));
        }
        root.appendChild(
          collapsibleList(
            'section:detected',
            model.allDetectedLabel,
            String(model.detectedCount),
            false,
            detectedNodes
          )
        );
      }

      if (model.otherConfigurations) {
        root.appendChild(artifactSection(model.otherConfigurations));
      }

      if (model.possibleCustomInstructions) {
        root.appendChild(artifactSection(model.possibleCustomInstructions));
      }
    }

    return { render: render };
  }

  window.AgentRulesRenderer = { create: create };
})();
