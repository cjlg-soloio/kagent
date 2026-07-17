# Chat / core — SHARED (copied OSS ⇆ ENT)

The chat **chassis** and **render tree**. Product‑agnostic: it knows how to send,
stream, and render an A2A conversation, and nothing about a specific product.

## Copy rule

> **This folder is copied verbatim between kagent OSS and kagent‑enterprise.**
> Edit it in either repo, then sync the whole folder to the other. Keep the two
> copies byte‑identical except for the design‑system import alias (below).

### Do
- Add reusable rendering, state, streaming, and input logic here.
- Keep every enterprise concept **out**. `core/` must never import from
  `../ent-plugins/`. Enterprise behaviour arrives as props (render‑prop *slots* and
  optional callbacks) supplied by the host.

### Don't
- Don't import product data layers, routing, or auth directly. The host passes
  those in (tasks, session, `getAccessToken`, callbacks).
- Don't reference `ent-plugins/`, "trace", or "rewind/fork" by name.

## What's in here

| Path              | Purpose                                                            |
| ----------------- | ----------------------------------------------------------------- |
| `types/`          | `ChatProvider` contract, message/session/streaming types          |
| `state/`          | `ChatStateMachine` (idle → sending → streaming → cancelling)       |
| `managers/`       | `BaseChatManager` — generic provider implementation               |
| `transport/`      | `ChatManager` + `ChatState` (A2A send/stream lifecycle)           |
| `utils/`          | SSE parsing, message ⇄ SDK conversions                             |
| `hooks/`          | scroll, textarea measurement, input history, manager wrapper      |
| `components/`     | `ChatInput`, `ChatContainer`, `ExampleMessageCards`, `LoadingIndicator` |
| `ChatTasksDisplay`| scrollable task list shell (render‑prop `renderTask`)             |
| `render/`         | task/message render tree: `TaskBlock`, `ChatMessage`, `MessagePartRenderer` and the Text/Data/File/Status/Artifact part renderers |

## The enterprise seam

`render/MessageDisplay.tsx` renders a message and exposes an optional
`renderUserMessageActions` render‑prop plus `onRewind*`/`onFork*` callbacks. When
the host passes nothing (OSS), no enterprise UI mounts and no enterprise code is
imported. When the ENT host passes its `ent-plugins/` components in, the trace and
rewind/fork actions appear. Same file, no fork.

## Copy‑time adaptation: the design‑system alias

Shared files import primitives (Button, Tooltip, FlexLayout, Text, Markdown…) from
one module. Point that alias at each repo's kit:

- **kagent‑enterprise:** `@solo-io/ui-components-enterprise` (+ `/styles`, `/utils`)
- **kagent OSS:** the OSS primitives layer

This is the only find‑and‑replace needed when copying the folder.

## Mock harness (run it with no backend)

`Chat/Chat.stories.tsx` mounts the render tree against mock A2A `Task[]` fixtures in
`Chat/mocks/` — a full conversation with text, tool calls, a HITL approval, an
ask‑user card, and a subagent panel — with no server. Run `yarn storybook` and open
**Chat / Extracted Chat**. The Playwright specs in `playwright/` drive that story to
produce screenshots and a video.
