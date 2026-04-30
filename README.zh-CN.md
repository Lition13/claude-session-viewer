# Claude Session Viewer

> [English](./README.md) · **简体中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Build](https://github.com/Lition13/claude-session-viewer/actions/workflows/build.yml/badge.svg)](https://github.com/Lition13/claude-session-viewer/actions/workflows/build.yml)

一个用于浏览、分析和分享 Claude Code 会话的 Electron 桌面应用。

Claude Code 的 `/export` 只能导出纯文本，无法直观查看对话过程（思考链、工具调用、代码变更等）。本工具直接读取 `~/.claude/projects/` 下的 JSONL 会话文件，以美观、可交互的界面展示完整对话内容。

> 🔒 **隐私优先** — 本工具完全在本地运行，只读取 `~/.claude/` 下的本地文件，不上传任何数据，不接入任何分析/埋点服务。源码开放，可自行审计。

![demo.git](demo.gif)

## 功能特性

### 核心功能
- **会话浏览** — 自动扫描所有 Claude Code 会话，按项目分组、日期分组显示
- **对话渲染** — 完整展示用户消息、助手回复、思考过程（可折叠）、工具调用及结果
- **语法高亮** — 基于 Shiki 的代码高亮，支持 30+ 种语言，自动根据文件扩展名识别
- **工具专用渲染** — Edit（diff 对比）、Read（代码高亮）、Write（创建文件）、Bash（命令+输出）、Grep/Glob（搜索结果）等
- **子 Agent 查看** — 展示 subagent 会话完整内容
- **会话回放** — 像播放幻灯片一样逐条回放对话，支持暂停/加速/跳转

### 数据分析
- **会话统计** — Token 用量（Input/Output/Cache Read/Cache Write）、工具使用排行、费用估算
- **全局仪表盘** — 跨所有会话的汇总统计、每日趋势图、总费用
- **智能洞察** — 会话健康度评分、低效模式检测（重复调用/循环修复/空结果/过度读取）
- **Token 趋势图** — 按时间轴展示每轮对话的 token 消耗

### 导出与分享
- **HTML 导出** — 生成自包含的独立 HTML 文件，可在任何浏览器中离线查看；逐工具专属渲染（Edit diff、Bash、Grep、TodoWrite、AskUserQuestion 等），slash 命令带 ANSI 着色，与界面显示一致
- **Markdown 导出** — 生成 Markdown 文件，方便在 GitHub 等平台分享
- **Raw JSON 视图** — 查看源 JSONL 文件格式化后的 JSON 数据

### 管理功能
- **删除会话** — 完整清理会话相关的所有文件（JSONL、子 Agent、文件历史、遥测、任务）
- **在 Claude Code 中打开** — 一键在终端恢复会话（`claude --resume`），优先使用 Windows Terminal
- **批量删除** — 勾选多个会话一键删除
- **跨会话搜索** — 在所有会话中搜索关键词，点击匹配项直接跳转至对应消息位置，支持展开更多匹配
- **文件监听** — 自动检测新会话并刷新列表

### 个性化
- **三种主题** — 深色、浅色、Sepia（纸质），针对长时间阅读优化
- **自定义标题栏** — 无边框窗口，内置控制按钮；顶部窗口栏在所有平台跟随主题
- **自定义字体** — 支持 6 种字体和字号调整
- **模型定价配置** — 内置 Claude Opus/Sonnet/Haiku 定价，支持添加自定义模型（GPT-4o、DeepSeek 等）

## 快速开始

### 环境要求
- Node.js >= 18
- npm >= 9

### 通过 npm 运行（无需克隆）

```bash
npx claude-session-browser
```

首次运行会下载 Electron（约 100 MB）并缓存，之后启动即开即用。

### 从源码构建

```bash
# 克隆项目
git clone https://github.com/Lition13/claude-session-viewer.git
cd claude-session-viewer

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 生产构建
npm run build

# 打包为可分发的安装程序
npm run package
```

## 快捷键

| 快捷键                  | 功能                          |
| ----------------------- | ----------------------------- |
| `Ctrl+F`                | 当前会话内搜索                |
| `Ctrl+Shift+F`          | 跨会话全局搜索                |
| `Ctrl+D`                | 全局统计仪表盘                |
| `Ctrl+E`                | 导出 HTML                     |
| `Ctrl+O`                | 在 Claude Code 中打开当前会话 |
| `Alt+↑/↓`               | 切换上/下一个会话             |
| `Enter` / `Shift+Enter` | 搜索时跳转下/上一个匹配       |

### 回放模式快捷键

| 快捷键        | 功能                 |
| ------------- | -------------------- |
| `Space` / `K` | 播放/暂停            |
| `→` / `L`     | 下一条消息           |
| `←` / `J`     | 上一条消息           |
| `Shift+→`     | 跳到下一条 User 消息 |
| `Shift+←`     | 跳到上一条 User 消息 |
| `Esc`         | 退出回放             |

## 技术栈

- **Electron** + **electron-vite** — 跨平台桌面应用
- **React 19** + **TypeScript** — 前端 UI
- **Tailwind CSS v4** — 样式
- **Shiki** — 语法高亮（JavaScript 引擎，无 WASM 依赖）
- **react-markdown** + **remark-gfm** — Markdown 渲染
- **marked** — HTML 导出时的 Markdown 转换
- **date-fns** — 日期格式化

## 项目结构

```
src/
├── main/                          # Electron 主进程
│   ├── index.ts                   # 窗口创建、IPC 注册
│   ├── session-discovery.ts       # 会话发现与元数据提取
│   ├── session-parser.ts          # JSONL 解析、消息合并
│   ├── session-insights.ts        # 智能分析（健康度、低效检测）
│   ├── session-delete.ts          # 会话删除（6 处清理）
│   ├── html-exporter.ts           # HTML 导出
│   ├── md-exporter.ts             # Markdown 导出
│   ├── global-stats.ts            # 全局统计聚合
│   └── cross-search.ts            # 跨会话搜索
├── preload/
│   └── index.ts                   # contextBridge API
├── renderer/
│   ├── App.tsx                    # 主布局
│   ├── hooks/
│   │   ├── useSettings.ts         # 设置 + 模型定价
│   │   ├── useHighlighter.ts      # Shiki 语法高亮
│   │   ├── useCollapseControl.ts  # 全局展开/折叠
│   │   ├── useSessionList.ts      # 会话列表
│   │   ├── useSessionMessages.ts  # 会话消息
│   │   └── useExport.ts           # 导出
│   └── components/
│       ├── layout/                # 侧边栏、搜索
│       ├── conversation/          # 对话渲染组件
│       ├── common/                # 通用组件
│       ├── GlobalDashboard.tsx    # 全局仪表盘
│       ├── CrossSearch.tsx        # 跨会话搜索
│       └── SettingsPanel.tsx      # 设置面板
└── shared/
    └── constants.ts               # IPC 通道常量
```

## 数据说明

本工具只读取 `~/.claude/` 目录下的本地文件，不会上传任何数据。删除会话时清理以下位置：

| 位置                         | 说明                    |
| ---------------------------- | ----------------------- |
| `projects/<proj>/<id>.jsonl` | 主会话文件              |
| `projects/<proj>/<id>/`      | 子 Agent + tool-results |
| `file-history/<id>/`         | 文件版本快照            |
| `telemetry/*.<id>.*.json`    | 遥测事件                |
| `tasks/<id>/`                | 任务文件                |
| `sessions-index.json`        | 移除该条目              |

## 贡献

欢迎 issue 和 PR！请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。变更记录见 [CHANGELOG.md](./CHANGELOG.md)。

## License

MIT
