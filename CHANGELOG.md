# Changelog

## 0.1.0

First release.

- A sidebar that lists the AI instruction files found in the workspace and says
  which ones match the file you have open, and why.
- Applicability is resolved for `AGENTS.md` and `AGENTS.override.md`, Claude,
  Cursor and GitHub Copilot, from the fields each format documents. A rule's
  name and body text never influence what it applies to.
- Configuration belonging to fifteen other tools is detected and listed
  without any claim about whether it applies. Files that look like hand written
  instructions are listed the same way.
- Warnings for unusable metadata, unsupported frontmatter keys and Claude
  imports that point nowhere.
- A rough token estimate per rule and per format.
- English and Brazilian Portuguese, switched from the sidebar header and
  remembered between sessions.
- `agentRulesLens.customInstructionPatterns` to track instruction files of your
  own.
- Status bar summary, and automatic refresh when the editor, a rule file or the
  setting changes.

Known limitations: multi-folder workspaces are analysed on their first folder
only, and the extension reads configuration from disk rather than the live
context an agent assembled.
