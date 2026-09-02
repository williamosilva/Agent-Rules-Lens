# Sample workspace

This folder exists to demonstrate Agent Rules Lens. Press F5 in the extension
repository to open it in an Extension Development Host.

Open the Agent Rules Lens view in the Activity Bar, then switch between:

- `src/backend/order.service.ts` — the backend override and the Claude
  TypeScript rule become applicable.
- `src/frontend/OrderCard.tsx` — the backend rules drop out and the Cursor
  frontend rule becomes applicable.

What else the folder demonstrates:

- `src/backend/AGENTS.override.md` replaces `src/backend/AGENTS.md`, so only one
  of the two is ever applied.
- `GEMINI.md` is detected as another agent's configuration, with no
  applicability claim.
- `AI_RULES.md` is a candidate: it looks like instructions, and no agent is
  known to load it.
- `.github/agents/reviewer.agent.md` is a custom agent definition and must never
  appear as a rule.
- `CLAUDE.md` imports a file that does not exist, so the Warnings section always
  has one entry.
