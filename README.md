# Claude Session Viewer

> **English** · [简体中文](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Build](https://github.com/Lition13/claude-session-viewer/actions/workflows/build.yml/badge.svg)](https://github.com/Lition13/claude-session-viewer/actions/workflows/build.yml)

An Electron desktop app for browsing, analyzing, and sharing Claude Code sessions.

Claude Code's `/export` only produces plain text — you can't see thinking blocks, tool calls, code diffs, or token usage in a useful way. This tool reads the JSONL session files under `~/.claude/projects/` directly and presents them with a clean, interactive UI.

> 🔒 **Privacy first** — Everything runs locally. The app only reads files under `~/.claude/`. No telemetry, no analytics, no network calls to third parties. The source is open — audit it yourself.

![demo.git](demo.gif)

## Features

### Core
- **Session browser** — automatically scans every Claude Code session, grouped by project and date
- **Conversation rendering** — user messages, assistant replies, thinking blocks (collapsible), tool calls and results
- **Syntax highlighting** — Shiki-based, 30+ languages, auto-detected from file extension
- **Tool-specific renderers** — Edit (diff), Read (highlighted source), Write, Bash (command + output), Grep/Glob, and more
- **Sub-agent viewer** — opens the full sub-agent conversation in-place
- **Session replay** — step through a conversation like a slideshow, with pause/speed/seek

### Analytics
- **Per-session stats** — token usage (input / output / cache read / cache write), tool ranking, cost estimate
- **Global dashboard** — totals across all sessions, daily trend, cumulative cost
- **Insights** — health score, inefficiency detection (repeated calls, fix loops, empty results, excessive reads)
- **Token-per-turn chart** — token spend per assistant turn over time

### Export & sharing
- **HTML export** — self-contained file viewable offline in any browser; per-tool renderers (Edit diff, Bash, Grep, TodoWrite, AskUserQuestion, etc.) and ANSI-colored slash commands match the in-app rendering
- **Markdown export** — for sharing on GitHub or anywhere else
- **Raw JSON view** — pretty-printed view of the source JSONL

### Management
- **Delete session** — cleans up everything (jsonl, sub-agents, file history, telemetry, tasks, index)
- **Open in Claude Code** — restores a session in your terminal (`claude --resume`); on Windows, prefers Windows Terminal
- **Bulk delete** — multi-select sessions and remove them at once
- **Cross-session search** — search across all sessions; click a hit to jump straight to that message; expand for more matches
- **File watcher** — detects new sessions and refreshes the list automatically

### Personalization
- **Three themes** — Dark, Light, and Sepia (paper) for long-form reading
- **Custom titlebar** — frameless window with built-in controls; theme-aware top chrome on all platforms
- **Custom fonts** — 6 fonts and adjustable font size
- **Model pricing config** — built-in Claude Opus / Sonnet / Haiku pricing; add your own (GPT-4o, DeepSeek, etc.)

## Quick start

### Requirements
- Node.js >= 18
- npm >= 9

### Run via npm (no clone needed)

```bash
npx claude-session-browser
```

The first run downloads Electron (~100 MB) and caches it; subsequent launches are instant.

### Build from source

```bash
# Clone
git clone https://github.com/Lition13/claude-session-viewer.git
cd claude-session-viewer

# Install
npm install

# Dev (HMR)
npm run dev

# Production build
npm run build

# Package as a distributable installer
npm run package
```

## Keyboard shortcuts

| Shortcut                | Action                                |
| ----------------------- | ------------------------------------- |
| `Ctrl+F`                | Search inside the current session     |
| `Ctrl+Shift+F`          | Cross-session global search           |
| `Ctrl+D`                | Global dashboard                      |
| `Ctrl+E`                | Export HTML                           |
| `Ctrl+O`                | Open the current session in Claude    |
| `Alt+↑/↓`               | Previous / next session               |
| `Enter` / `Shift+Enter` | Next / previous match while searching |

### Replay mode

| Shortcut      | Action                        |
| ------------- | ----------------------------- |
| `Space` / `K` | Play / pause                  |
| `→` / `L`     | Next message                  |
| `←` / `J`     | Previous message              |
| `Shift+→`     | Jump to next user message     |
| `Shift+←`     | Jump to previous user message |
| `Esc`         | Exit replay                   |

## Tech stack

- **Electron** + **electron-vite** — cross-platform desktop shell
- **React 19** + **TypeScript** — UI
- **Tailwind CSS v4** — styling
- **Shiki** — syntax highlighting (JS engine, no WASM)
- **react-markdown** + **remark-gfm** — Markdown rendering
- **marked** — Markdown → HTML for export
- **date-fns** — date formatting

## Project layout

```
src/
├── main/                          # Electron main process
│   ├── index.ts                   # Window creation, IPC registration
│   ├── session-discovery.ts       # Session discovery & metadata
│   ├── session-parser.ts          # JSONL parsing, message merging
│   ├── session-insights.ts        # Health score & inefficiency detection
│   ├── session-delete.ts          # Session deletion (6 cleanup sites)
│   ├── html-exporter.ts           # HTML export
│   ├── md-exporter.ts             # Markdown export
│   ├── global-stats.ts            # Cross-session aggregation
│   └── cross-search.ts            # Cross-session search
├── preload/
│   └── index.ts                   # contextBridge API
├── renderer/
│   ├── App.tsx                    # Main layout
│   ├── hooks/
│   │   ├── useSettings.ts         # Settings + model pricing
│   │   ├── useHighlighter.ts      # Shiki
│   │   ├── useCollapseControl.ts  # Global expand/collapse
│   │   ├── useSessionList.ts      # Session list
│   │   ├── useSessionMessages.ts  # Session messages
│   │   └── useExport.ts           # Export
│   └── components/
│       ├── layout/                # Sidebar, search
│       ├── conversation/          # Conversation rendering
│       ├── common/                # Shared components
│       ├── GlobalDashboard.tsx    # Global dashboard
│       ├── CrossSearch.tsx        # Cross-session search
│       └── SettingsPanel.tsx      # Settings panel
└── shared/
    └── constants.ts               # IPC channel constants
```

## Data handling

The app only reads files inside `~/.claude/`. Nothing is uploaded. Deleting a session cleans up:

| Location                     | What it is                |
| ---------------------------- | ------------------------- |
| `projects/<proj>/<id>.jsonl` | Main session file         |
| `projects/<proj>/<id>/`      | Sub-agents + tool results |
| `file-history/<id>/`         | File version snapshots    |
| `telemetry/*.<id>.*.json`    | Telemetry events          |
| `tasks/<id>/`                | Task files                |
| `sessions-index.json`        | Removes the entry         |

## Documentation

- [Architecture](./docs/architecture.md) — process model, JSONL parsing, IPC channels, performance notes
- [Development](./docs/development.md) — local setup, conventions, debugging
- [Features](./docs/features.md) — detailed feature guide

## Contributing

Issues and PRs are welcome — please read [CONTRIBUTING.md](./CONTRIBUTING.md) first. Release history lives in [CHANGELOG.md](./CHANGELOG.md).

## License

MIT
