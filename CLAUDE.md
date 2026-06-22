# CLAUDE.md

## 收到任务后的第一件事：明确当前 Skills

**在做出任何响应、任何操作之前**，必须先列出当前会话已加载的 Skills，判断哪些 skill 适用于当前任务，并明确告知用户。

适用判断规则（来自 `using-superpowers`）：
- 即使只有 1% 可能性某个 skill 适用，也必须调用它
- 调试 bug → `superpowers:systematic-debugging`
- 实现功能/bugfix → `superpowers:test-driven-development`
- 声称完成/通过/修好 → `superpowers:verification-before-completion`
- 创意/设计 → `superpowers:brainstorming`
- 多步骤规划 → `superpowers:writing-plans`
- 禁止跳过 skill 的借口："这只是个简单问题"、"我先探索一下"、"我记得这个 skill"、"这不需要 formal skill"

## 工作模式

- **禁止多智能体协同作业**：不允许使用 Workflow 工具、Agent 工具的子代理模式（subagent）、或任何形式的并行多智能体协作。
- **单智能体完成所有工作**：所有代码探索、分析、调试、实现、测试均在本会话内直接完成。
- 如需读取多个文件，使用 Read 工具逐个阅读，或使用 Bash 工具执行 `grep`/`find` 进行搜索。
- 不调用 Agent/Workflow 工具（已通过 settings.json 禁用 enableWorkflows）。

## 项目概述

Handout Generator — Tauri 2 + Vue 3 + Konva.js 桌面讲义编辑器。
详见 DOC.md。
