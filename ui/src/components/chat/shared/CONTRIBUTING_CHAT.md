# Contributing to the chat UI

The kagent chat interface is **no longer owned by this repo**. It now comes from
the shared `<Chat>` component extracted into
[`@solo-io-public/ui-components`](https://www.npmjs.com/package/@solo-io-public/ui-components).

This folder (`ui/src/components/chat/shared/`) is the thin integration layer that
wires kagent into that shared component.

## Architecture

```
@solo-io-public/ui-components
        <Chat provider=… renderers=… slots=… tokenStats minimap share feedback />
                     ▲
                     │  props + generic extension seams
                     │
  ui/src/components/chat/shared/
    ├── KagentChat.tsx        renders <Chat>, chooses the provider, injects renderers/slots
    ├── a2aChatProvider.ts    ChatProvider over kagent's A2A / SSE transport
    └── acpChatProvider.ts    ChatProvider over the ACP harness (useAcpHarnessChat)
```

`<Chat>` knows nothing about A2A, ACP, ADK metadata, sessions, or SSE. It only
talks to a **`ChatProvider`** (the transport seam) and renders a
`ChatMessage[]`. Anything kagent-specific is injected.

### What is a built-in OSS feature (toggle it with a named prop)

These live in the shared component; turn them on/off via props:

| Feature      | Prop                                              |
| ------------ | ------------------------------------------------- |
| Token stats  | `tokenStats`                                      |
| Minimap      | `minimap`                                         |
| Share links  | `share={{ onCreateLink, readOnly }}`              |
| Feedback     | `feedback={{ onSubmit }}`                          |

### What is kagent-specific (inject it through a seam)

Everything else is injected — the shared component never imports kagent code:

| kagent thing              | Seam                                            |
| ------------------------- | ----------------------------------------------- |
| Tool-call / approval cards | `renderers['tool-call']` → `ToolCallDisplay`   |
| MCP apps (interactive UI)  | `renderers['data:mcp-app']` → MCP app view      |
| ask_user prompts           | `renderers['ask-user']` → `AskUserDisplay`      |
| Voice / speech input       | `slots.composerActions`                         |
| Per-message actions        | `messageActions`                                |

Renderers are keyed by `message.kind`. The **providers** are responsible for
setting `kind` (and stashing the raw A2A `Message` on `metadata.a2a`) so the
matching renderer can rebuild the rich kagent UI. This projection is the crux of
each adapter — see `messageKind()` in the provider files.

### New transports are new providers

To support a new backend, write a new `ChatProvider`; do not modify `<Chat>`.

## How to change a shared chat feature

1. **Contribute upstream.** Make the change in the `ui-components-oss` repo — see
   that package's `src/components/Chat/README.md` for the component's API,
   extension seams, and contribution guide.
2. **Publish** a new `@solo-io-public/ui-components` version.
3. **Bump** the dependency in `ui/package.json` here and re-wire any new
   prop/seam in `KagentChat.tsx`.

Do **not** re-fork the chat component back into kagent. kagent-specific behavior
belongs in a `renderer`, a `slot`, `messageActions`, or a provider — not in a
copy of the shared component.

## Status of this integration

This is a **base**. It intentionally does not typecheck or lint yet: the
`@solo-io-public/ui-components` version is a placeholder and several mappings are
marked with `// TODO(shared-chat):`. The old `ui/src/components/chat/*` files are
left in place until the wiring is finished and verified.
