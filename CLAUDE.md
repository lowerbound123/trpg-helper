# CLAUDE.md

## 工作模式

- **禁止多智能体协同作业**：不允许使用 Workflow 工具、Agent 工具的子代理模式（subagent）、或任何形式的并行多智能体协作。
- **单智能体完成所有工作**：所有代码探索、分析、调试、实现、测试均在本会话内直接完成。
- 如需读取多个文件，使用 Read 工具逐个阅读，或使用 Bash 工具执行 `grep`/`find` 进行搜索。
- 不调用 Agent/Workflow 工具（已通过 settings.json 禁用 enableWorkflows）。

## 项目概述

Handout Generator — Tauri 2 + Vue 3 + Konva.js 桌面讲义编辑器。
详见 DOC.md。
