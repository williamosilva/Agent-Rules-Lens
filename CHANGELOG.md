# Changelog

## 0.1.2 — 2026-09-02

Documentation and presentation only. No functional change to the extension, the
local dashboard or the CLI.

- The main README is now the English one, so the GitHub landing page and the
  Marketplace listing read in English by default.
- The Portuguese version moved to `README.pt-BR.md` and stays one click away
  through the language switch at the top of each file.
- Added English screenshots of the sidebar and of the local dashboard, so the
  images match the language of the page they appear on. The Portuguese
  screenshots are unchanged and still used by `README.pt-BR.md`.

## 0.1.1 — 2026-09-02

Documentation and Marketplace metadata only. No functional change to the
extension, the local dashboard or the CLI.

- Fixed the screenshots that failed to load on the Marketplace page: both now
  use absolute raw URLs instead of repository relative paths.
- Reorganised the README in Portuguese and in English, so what the project does
  and what it only detects are clear from the top.
- Documented the ways to use it separately: the Marketplace extension, the
  extension built from source, the local dashboard and the JSON report.
- Updated every repository, issues and homepage URL to the lower case
  `williamosilva/agent-rules-lens` slug after the repository was renamed.
- Replaced the screenshots with captures that show the current icon.

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
- A local mode that runs the same analysis outside VS Code. After
  `npm run local:link`, `arl` opens a panel on `127.0.0.1` for whatever
  directory the terminal is in, and `arl <file> --json` prints the analysis for
  scripts. It shares the extension's catalog, parsers, resolver and view model.
- `npm run install:local` builds the VSIX and installs it through the VS Code
  CLI, so the sidebar is available in every workspace after a window reload.

Known limitations: multi-folder workspaces are analysed on their first folder
only, the local panel refreshes on demand rather than watching the filesystem,
and the analysis reads configuration from disk rather than the live context an
agent assembled.
