# Chat / oss-plugins — SHARED (copied OSS ⇆ ENT)

Chat features that **both** kagent OSS and kagent‑enterprise ship. They plug into
`core/` through contexts and the part‑kind renderer, and — like `core/` — they name
nothing enterprise‑specific.

## Copy rule

> **This folder is copied verbatim between kagent OSS and kagent‑enterprise.**
> Edit it in either repo, then sync the whole folder to the other. New shared chat
> features go here (OSS‑first is fine — build it in OSS, then sync it back).

Same import‑alias adaptation as `core/` (the design‑system module name differs per
repo). `oss-plugins/` may import from `core/`, but **never** from `../ent-plugins/`.

## What's in here

| Folder       | Feature                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| `hitl/`      | Human‑in‑the‑loop tool approval — pause and approve/reject tool calls (`HitlContext`, `hitlHelpers`) |
| `ask-user/`  | Interactive "agent asks the user a question" card (`AskUserDisplay`)    |
| `subagent/`  | Live, expandable panel of a delegated sub‑agent's activity (`SubagentActivityPanel`, its context) |

## How they attach

- **HITL** is a context (`HitlProvider`) the host wraps around the render tree; the
  data part renderer reads it to show approve/reject controls.
- **ask‑user** is dispatched by `core/render/MessageDisplay` when a message is an
  `AskUserRequest`.
- **subagent** is a context + a panel the data part renderer toggles open.

Because they attach through `core/`'s existing seams (contexts + part kinds), adding
or removing one is a host‑level decision — not an edit to `core/`.
