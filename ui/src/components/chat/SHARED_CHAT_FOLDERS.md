# Shared chat folders (`core/`, `oss-plugins/`)

These two folders are the **shared chat library**, copied verbatim from
kagent-enterprise (`solo-io/kagent-enterprise`). They are the same folders that live
there under `Components/Chat/`:

```
components/chat/
├── core/          ← SHARED. Copied ENT ⇆ OSS verbatim. Chassis + render tree.
├── oss-plugins/   ← SHARED. Copied ENT ⇆ OSS verbatim. HITL, ask-user, subagent.
└── (no ent-plugins/ — trace + rewind/fork are enterprise-only and never copied here)
```

Each folder has its own `README.md` describing the copy flow. The rule that makes the
copy work: **`core/` and `oss-plugins/` never import from `ent-plugins/`**, so the
enterprise-only features simply aren't present here and nothing breaks.

## Status in this PR: staged mirror (not yet wired in)

This PR **lands the folder structure** so kagent OSS mirrors the enterprise layout and
a future feature can flow ENT → OSS (or OSS → ENT) as a literal folder copy. The files
are **not yet wired into the live `ChatInterface`**, and they are excluded from
`tsc` / `eslint` / `next build` (see `tsconfig.json` and `eslint.config.mjs`) so `main`
stays green.

Wiring them in — replacing the current OSS chat with the shared component and verifying
**no feature regression** — is the tracked follow-up.

## Adaptation checklist (ENT → OSS)

The shared code is framework-agnostic React + Emotion, but a copy needs these edits to
run in this Next.js app:

1. **Design-system alias** — swap `@solo-io/ui-components-enterprise` (+ `/styles`,
   `/utils`) for this repo's primitives (Button, Tooltip, Markdown, code highlighter,
   `StateMachine`, `useEventListener`).
2. **Module alias** — the shared files use enterprise absolute imports
   (`Components/Chat/...`); map them to this repo's `@/components/chat/...`.
3. **Injected app context** — supply the host couplings as props/providers instead of
   the enterprise ones: current user + access token (was `context/AuthContext`), the
   A2A transport client (was `Api/external/kagent/a2aClient`), and session/tasks data
   (was `AgentContext`).
4. **Host** — write an OSS composition root (the equivalent of enterprise
   `ScrollableChatTasks`) that wires `core/` + `oss-plugins/` to the OSS transport. Do
   **not** pass a `renderUserMessageActions` slot (that seam is for the enterprise
   trace + rewind/fork actions).

See the enterprise PR (solo-io/kagent-enterprise#2313) for the Storybook story,
mock-data harness, and screenshot/video tests that demonstrate the shared component
rendering with no backend.
