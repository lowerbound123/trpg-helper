# Handout Generator — 项目文档

> 本地桌面 Handout 与 Token 生成器，基于 Tauri 2 + Vue 3 + TypeScript + Konva.js + PixiJS 构建。

---

## 目录

- [1. 项目概览](#1-项目概览)
- [2. 技术栈](#2-技术栈)
- [3. 构建与开发](#3-构建与开发)
- [4. 目录结构总览](#4-目录结构总览)
- [5. 根目录配置文件](#5-根目录配置文件)
- [6. 前端源码（src/）](#6-前端源码src)
- [7. Rust 后端（src-tauri/）](#7-rust-后端src-tauri)
- [8. 运行时数据（data/）](#8-运行时数据data)
- [9. IPC API 全景](#9-ipc-api-全景)
- [10. 数据流与架构](#10-数据流与架构)
- [11. 关键设计决策](#11-关键设计决策)
- [12. Token Generator 领域](#12-token-generator-领域)

---

## 1. 项目概览

**Handout Generator** 是一个本地桌面应用，用于创建、编辑、导出单页图形讲义/海报以及批量 TRPG Token。用户通过文件浏览器管理 Handout、Token、图像素材和字体；Handout 编辑器使用 Konva 图层系统，Token 编辑器使用 PixiJS 实时预览，最终支持 PNG/JPEG/WebP/JXL 导出。

- **应用类型**：Tauri 2 桌面应用（Rust 后端 + Vue 3 前端），支持浏览器独立开发预览
- **包管理器**：pnpm 11.8.0（强制声明于 `package.json` 的 `devEngines`）
- **模块系统**：ESM（`"type": "module"`）
- **工作区**：单包仓库，`pnpm-workspace.yaml` 仅配置本地存储与构建排除项
- **标识符**：`com.tonychow.handoutgenerator`

---

## 2. 技术栈

### 前端

| 技术 | 版本 | 用途 |
|---|---|---|
| Vue 3 | ^3.5.34 | UI 框架（Composition API + `<script setup>`） |
| TypeScript | ~6.0.2 | 类型系统 |
| Vite | ^8.0.12 | 构建工具与开发服务器 |
| Pinia | ^3.0.4 | 状态管理 |
| Konva / vue-konva | ^10.3.0 / ^3.4.0 | 2D 画布渲染引擎 |
| PixiJS | ^8.19.0 | WebGL 渲染（遮罩预览合成，可选） |
| Tailwind CSS 4 | ^4.3.1 | 样式（CSS-first 配置） |
| reka-ui | ^2.9.10 | 无样式 UI 原语（shadcn-vue 底层） |
| shadcn-vue | — | UI 组件库（new-york 风格） |
| Lucide Vue | ^1.20.0 | 图标库 |
| VueFinder | ^4.5.5 | 文件管理器组件 |
| Vue I18n | ^11.4.6 | 中文/英文 UI 国际化与系统语言解析 |
| vue-sonner | ^2.0.9 | Toast 通知 |
| @vueuse/core | ^14.3.0 | Vue 组合式工具集 |
| zod | ^4.4.3 | Schema 校验 |
| js-toml | ^1.2.1 | 完整 TOML 1.1 解析与序列化（嵌套表、数组、数组表） |
| Vitest + @vue/test-utils + jsdom | — | 单元测试 |

### 后端

| 技术 | 版本 | 用途 |
|---|---|---|
| Tauri | 2.11.2 | 桌面应用框架（含 `protocol-asset` feature） |
| tauri-plugin-dialog | 2 | 原生对话框 |
| tauri-plugin-fs | 2.5.1 | 文件系统访问 |
| tauri-plugin-log | 2 | 日志（仅 debug 构建） |
| serde / serde_json | 1.0 | 序列化 |
| image | 0.25.6 | 图像解码/缩放/编码 |
| webp | 0.3.1 | WebP 编码 |
| oxipng / mozjpeg-rs | 10.1.1 / 0.9.2 | Token 与 Handout 共享的 PNG/JPEG 高质量编码 |
| jpegxl-rs / jpegxl-sys | 0.15.0 / 0.13.0 | Token 与 Handout 共享 JPEG XL 编码（GPL-3.0-or-later 约束） |
| resvg / usvg / tiny-skia | 0.47 / 0.47 / 0.12 | 11 个内置 SVG Token 环渲染 |
| ort / ndarray | 2.0.0-rc.10 / 0.16.1 | BiRefNet/U²-Net/BEN2 ONNX 推理、Execution Provider 探测与 NCHW Tensor |
| objc2-core-ml | 0.3.2 | macOS 原生加载单一 `.mlmodelc`、构造 MLMultiArray 并执行 Core ML 推理 |
| objc2-vision / objc2-core-video | 0.3.2 / 0.3.2 | macOS 14+ 系统 Vision 前景实例分割与浮点 mask 读取 |
| reqwest / sha2 | 0.12.28 / 0.10.9 | 缺失 ONNX 模型的运行时下载、SHA-256 校验和原子缓存替换 |
| base64 | 0.22.1 | data URL 编解码 |
| uuid | 1.20.0 | UUIDv4 生成 |
| chrono | 0.4.45 | 时间戳 |
| thiserror | 2.0.18 | 错误类型派生 |
| rusqlite | 0.40.1 | **声明但未使用**（当前持久化全走 JSON 文件） |

---

## 3. 构建与开发

### npm 脚本

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动 Vite 开发服务器（端口 5173，strictPort） |
| `pnpm typecheck` | `vue-tsc -b` TypeScript 类型检查（项目引用模式） |
| `pnpm build` | `vue-tsc -b && vite build` → 输出到 `dist/` |
| `pnpm preview` | `vite preview` 预览构建产物 |
| `pnpm tauri` | Tauri CLI 入口（`pnpm tauri dev` / `pnpm tauri build`） |
| `pnpm prepare:segmentation-resources` | 按目标平台下载并校验 ONNX Runtime 动态库；模型在首次使用时按需下载 |
| `pnpm compile:segmentation-coreml -- --source=/path/to/model.mlpackage` | macOS 显式把 Core ML 源模型编译并持久化为单一 `native-coreml/model.mlmodelc`；可用 `--input-name` / `--output-name` 指定特征名 |
| `pnpm test:segmentation-smoke` | 自动识别测试机 OS/架构，生成测试 PNG，并使用真实 BiRefNet 执行一次 CPU 前景分割 |
| `pnpm exec vitest run` | 运行单元测试 |

### 开发流程

- **浏览器端**：`pnpm dev` → Vite HMR（忽略 `data/`、`logs/`、`src-tauri/target/`）
- **桌面端**：`pnpm tauri dev` → 先准备当前平台分割资源，再启动 Vite 和原生窗口
- **生产打包**：`pnpm tauri build` → 先准备并校验目标平台 ONNX Runtime，再构建前端和 Tauri bundle；缺失模型在首次使用时按配置下载

### 验证命令

```bash
pnpm exec vitest run          # 前端测试
pnpm run build                # 前端构建（类型检查 + 打包）
cd src-tauri && cargo build   # Rust 编译
```

---

## 4. 目录结构总览

```
handout-generator/
├── package.json                  # 项目元数据与脚本
├── pnpm-workspace.yaml           # 工作区与存储配置
├── vite.config.ts                # Vite 构建配置
├── tsconfig.json                 # 根 TS 配置（项目引用）
├── tsconfig.app.json             # 应用代码 TS 配置
├── tsconfig.node.json            # Node 端 TS 配置
├── components.json               # shadcn-vue CLI 配置
├── configuration.toml            # 应用运行时配置
├── index.html                    # Vite HTML 入口
├── README.md                     # 项目说明
├── DOC.md                        # 本文档
│
├── public/                       # 静态资源（原样拷贝到 dist/）
│   ├── favicon.svg
│   └── icons.svg
│
├── src/                          # 前端源码
│   ├── main.ts                   # 应用入口
│   ├── App.vue                   # 根组件（1252 行，shell + composable 编排）
│   ├── style.css                 # 全局样式 + Tailwind 4 配置
│   ├── app/                      # 快捷键、持久化、生命周期
│   ├── assets/                   # 静态资源
│   ├── components/               # Vue 组件
│   │   ├── ui/                   # shadcn-vue UI 原语（20 个组件）
│   │   ├── controls/             # 通用 NumericSliderField / ParameterLabel
│   │   ├── editor/               # Handout 编辑器面板（RightInspector, ExportPanel）
│   │   ├── token/                # Token 三栏编辑器与 Pixi 实时预览
│   │   ├── handout/              # 新建讲义对话框
│   │   ├── settings/             # 配置对话框
│   │   ├── BootSplash.vue        # 启动加载画面
│   │   ├── EditorTopBar.vue      # 编辑器顶栏（Save/工具/Undo/Redo）
│   │   ├── ManagerShell.vue      # 管理器视图（Handouts/Tokens/Assets/Fonts 四标签）
│   │   ├── LeftRail.vue          # 编辑器左栏（Assets/Fonts/Graph/Layers 四标签）
│   │   └── CanvasWorkspace.vue   # Konva 画布工作区
│   ├── composables/              # 27 个组合式函数实现（详见 6.7）
│   ├── i18n/                     # Vue I18n 运行时、中文/英文语言包及源码审计测试
│   ├── stores/                   # Pinia 状态仓库（workspace/editor/token）
│   │   ├── editor.ts             # facade store（656 行）
│   │   └── editor/               # 4 个子 store
│   │       ├── font-store.ts
│   │       ├── library-store.ts
│   │       ├── mask-store.ts
│   │       └── project-store.ts
│   └── lib/                      # 核心业务逻辑
│       ├── backend.ts            # Tauri IPC 桥接层
│       ├── configuration.ts      # js-toml 配置解析与完整 round-trip
│       ├── token/                # Token 类型、配置、Pixi 几何、环纹理 Worker
│       ├── history.ts            # 通用命令历史
│       ├── render/               # Konva 离屏渲染（12 个模块）
│       ├── handout/layer/        # 图层操作（9 个模块）
│       ├── mask.ts               # 遮罩像素处理
│       ├── shape-rendering.ts    # 形状渲染辅助
│       ├── paint-rendering.ts    # 笔刷渲染
│       ├── layer-rendering.ts    # 图层→Konva 配置映射
│       ├── effects.ts            # 效果→Konva 滤镜映射
│       ├── snapping.ts           # 对齐辅助线计算
│       ├── selection.ts          # 选择几何判断
│       └── pixi/                 # PixiJS 遮罩预览桥
│
├── src-tauri/                    # Rust 后端
│   ├── Cargo.toml                # Rust 依赖
│   ├── tauri.conf.json           # Tauri 应用配置
│   ├── build.rs                  # Cargo 构建脚本
│   ├── capabilities/default.json # Tauri 权限配置
│   ├── icons/                    # 应用图标集
│   └── src/
│       ├── main.rs               # 二进制入口
│       ├── lib.rs                # 模块声明 + run()（89 行）
│       ├── types.rs              # 共享数据结构
│       ├── errors.rs             # AppError 枚举
│       ├── commands/             # IPC 命令模块（含 Token 项目 CRUD）
│       ├── services/             # 服务层（含 Token 项目源图回退）
│       ├── token/                # Token Rust 引擎、编码、配色、环与 55 项测试
│       └── editor/mod.rs         # 编辑器领域占位
│
└── data/                         # 开发目录示意；运行时实际位于 ~/Documents/trpg-helper/data
    ├── library/                  # 资源库
    │   ├── index.json
    │   ├── backgrounds/
    │   ├── assets/
    │   ├── fonts/
    │   └── thumbnails/
    └── projects/                 # 用户项目
        ├── folders.json
        └── <project-uuid>/
            ├── handout.json
            ├── metadata.json
            ├── preview.webp
            ├── masks/
            └── .cache/
    └── token-projects/           # Token 项目
        ├── folders.json
        └── <project-uuid>/
            ├── token.json
            ├── metadata.json
            ├── preview.webp
            └── sources/          # Asset 删除后的原图保底副本
```

---

## 5. 根目录配置文件

| 文件 | 用途 | 关键内容 |
|---|---|---|
| `package.json` | 项目元数据、依赖、脚本 | `type: module`；devEngines 强制 pnpm 11.8.0；脚本见第 3 节 |
| `pnpm-workspace.yaml` | pnpm 工作区配置 | `allowBuilds.vue-demi: false`；`storeDir: .pnpm-store` |
| `vite.config.ts` | Vite 构建配置 | `vue()` + `tailwindcss()` 插件；端口 5173 strictPort；`@` → `./src` 别名；忽略 `data/`、`logs/`、`src-tauri/target/`；Rolldown vendor code-splitting；精确过滤 `@vueuse/core` pure annotation warning |
| `tsconfig.json` | 根 TS 配置 | 项目引用模式，引用 `tsconfig.app.json` 与 `tsconfig.node.json`；`@/*` → `./src/*` |
| `tsconfig.app.json` | 应用 TS 配置 | 继承 `@vue/tsconfig/tsconfig.dom.json`；`types: ["vite/client"]`；严格 lint 选项 |
| `tsconfig.node.json` | Node 端 TS 配置 | `target: es2023`；bundler 模式；仅含 `vite.config.ts` |
| `components.json` | shadcn-vue CLI 配置 | `style: "new-york"`；`font: "inter"`；`iconLibrary: "lucide"`；别名映射 |
| `configuration.toml` | 应用运行时配置 | 见下表 |
| `index.html` | Vite HTML 入口 | `<div id="app">`；入口 `/src/main.ts`；favicon `/favicon.svg` |
| `.gitignore` | Git 忽略规则 | `node_modules`、`.pnpm-store`、`dist`、`data`、`logs`、`src-tauri/target` 等 |
| `.vscode/extensions.json` | 推荐 VS Code 扩展 | `Vue.volar` |

### `configuration.toml` 配置项

| 段 | 键 | 默认值 | 说明 |
|---|---|---|---|
| 根 | `schema_version` | `1` | 配置 schema 版本，Rust 只接受已支持版本 |
| `[application]` | `title` | `Handout Generator` | 应用和主窗口标题 |
| | `locale` | `auto` | UI 语言：`auto`、`zh-CN` 或 `en-US`；修改后重启生效 |
| `[window]` | `width` / `height` | `1440` / `920` | 启动时应用的窗口尺寸 |
| | `min_width` / `min_height` | `1180` / `760` | 最小窗口尺寸 |
| | `resizable` | `true` | 是否允许调整窗口 |
| `[diagnostics]` | `log_directory` | `./logs` | 统一日志目录 |
| `[paths]` | `data_dir` | `./data` | 数据目录 |
| | `log_file` | `./logs/app.log` | 默认应用日志文件 |
| `[uploads]` | `max_file_size` | `100mb` | 上传文件大小上限 |
| `[previews]` | `thumbnail_max_edge_px` | `256` | 缩略图最大边长 |
| | `thumbnail_quality` | `80` | 缩略图质量 |
| | `target_max_bytes` | `524288` | 预览目标大小上限（512KB） |
| `[finder]` | `manager_height_px` | `1080` | 主界面 Handouts 文件管理器高度 |
| | `compact_height_px` | `300` | 紧凑模式高度 |
| | `handout_grid_scale` | `2` | 讲义网格缩放 |
| | `background_grid_scale` | `2` | 背景网格缩放 |
| `[editor]` | `snap_threshold_screen_px` | `5` | 对齐阈值（屏幕像素） |
| | `max_snap_candidates` | `24` | 最大对齐候选数 |
| | `continuous_edit_commit_delay_ms` | `450` | 连续编辑合并延迟 |
| `[mask]` | `enabled` | `true` | 遮罩总开关 |
| | `use_pixi_preview` | `true` | 使用 PixiJS 预览合成 |
| | `stroke_preview_min_opacity` | `0.3` | mask brush/eraser 编辑中临时笔迹的最低可见透明度，不影响最终 mask 像素 |
| | `interactive_refresh_delay_ms` | `1000` | brush/eraser/shape 后 secondary mask 工作（左栏预览、mask edit image、full refresh）的延迟；目标图层下一帧开始重合成 |
| | `pointer_idle_grace_ms` | `120` | pointer down/drag 后 secondary/full mask 工作的空闲等待时间；不阻塞目标图层刷新或光标更新 |
| `[export]` | `default_scale` | `1` | 默认导出缩放 |
| | `min_scale` | `0.1` | 最小导出缩放 |
| | `raw_rgba_ipc_max_bytes` | `134217728` | RGBA raw IPC 阈值；超过后前端以无损 PNG 传输 |
| `[export.limits]` | `max_canvas_dimension` | `16384` | Handout 导出单边上限 |
| | `max_canvas_pixels` | `67108864` | Handout 导出总像素上限（64 MP） |
| `[debug]` | `file_log_enabled` | `true` | 文件日志开关 |
| | `render_perf_log_enabled` | `true` | 渲染性能日志开关 |
| `[foreground_segmentation]` | `enabled` / `model` | `true` / `birefnet-general` | 前景分割开关与模型；可选 BiRefNet、U²-Net、BEN2、macOS Vision |
| | `device` / `worker_threads` | `auto` / `1` | macOS 自动模式只复用已手动编译的 CoreML，否则走 CPU；批量任务默认单 worker |
| | `intra_threads` / `inter_threads` | `0` / `1` | ORT 线程配置；intra 为 0 时交给 ORT 自动选择 |
| | `download_missing_models` / `download_timeout_seconds` | `true` / `600` | 首次使用缺失 ONNX 模型时下载及超时配置 |
| | `model_cache_directory` | `models/foreground-segmentation` | 相对于 `~/Documents/trpg-helper` 的模型缓存目录 |
| | `output_suffix` | `-foreground` | 同目录透明 PNG 的文件名后缀，冲突时自动追加序号 |
| | `max_source_dimension` / `max_source_pixels` | `16384` / `67108864` | 分割输入的单边和总像素上限 |

`[export.defaults]` / `[export.limits]` / `[export.rendering]` / `[[export.webp_strength_profiles]]` 是 Handout 编码配置；`[token.*]` 是独立的完整 Token 配置命名空间，包含 `defaults`、`limits`、`export.*`、`preview`、`layout`、`files`、`rings`、`history` 和 `notifications`。前端由 `js-toml` 完整往返；Rust 在启动和 Settings 写入前严格校验 Token 与 Handout 导出配置。根目录 `configuration.toml` 是唯一配置文件，`src-tauri/configuration.toml` 已移除。

桌面端启动时加载并激活 `~/Documents/trpg-helper/configuration.toml`；浏览器开发环境使用 localStorage（key: `handout-generator.configuration.toml`）覆盖内联默认配置。Settings 保存后需要重启的字段会在下次桌面启动生效。`application.locale = "auto"` 时，系统语言以 `zh` 开头则使用简体中文，其余语言回退英文；文件名、项目名和用户输入内容不参与翻译。

---

## 6. 前端源码（src/）

### 6.1 入口文件

| 文件 | 用途 |
|---|---|
| `src/main.ts` | 最小应用启动入口。先安装启动失败捕获，再动态加载 `bootstrap.ts`；模块初始化失败时显示错误并写入 `logs/app.log`，避免无日志白屏 |
| `src/bootstrap.ts` | Vue 应用装配入口。挂载前读取配置并激活 Vue I18n，同时把解析后的 `zh-CN/en-US` 映射为 VueFinder 的 `zhCN/en`，再注册 Pinia、VueKonva 和 VueFinder |
| `src/App.vue` | 根组件（1252 行）。shell + composable 编排器，详见 6.12 |
| `src/style.css` | 全局样式（1148 行）。`@import "tailwindcss"` + `@import "tw-animate-css"`；`:root` 定义 shadcn 设计令牌（HSL）；大量应用专属类（`.loading-shell`、`.manager-shell`、`.app-shell`、`.left-rail`、`.right-rail`、`.stage-frame`、`.topbar`、`.inspector-panel` 等） |

### 6.1.1 UI 国际化

- `src/i18n/en-US.ts` 是消息键类型来源，`src/i18n/zh-CN.ts` 必须提供完全相同的键。
- 所有 UI 源码使用全大写标识符，例如 `t('SAVE_SETTINGS')`；禁止在 Vue 模板中直接写中文、英文标题、占位符或可访问性标签。
- `src/i18n/source-audit.test.ts` 扫描 Vue 模板中的中文和静态用户文案，`src/i18n/index.test.ts` 检查消息键全大写及中英文语言包完整性。
- 配置、启动失败页、Manager、Handout、Token、Finder 扩展菜单和导出状态共用同一 i18n 实例；VueFinder 自带界面跟随应用解析后的语言。
- Settings 中切换语言只写配置，重启应用后生效；运行过程中不热切换，避免第三方组件与业务组件语言不同步。

### 6.2 `src/app/` — 快捷键、持久化、生命周期

| 文件 | 用途 |
|---|---|
| `AppShortcuts.ts` | 全局键盘快捷键。`createAppShortcutHandler(context)`：`Cmd/Ctrl+S` 保存、`Cmd/Ctrl+Z`/`+Shift` 撤销/重做、`Delete` 删除图层、`S/B/E` 切换工具、`L/A/F/G` 切换标签页、`T` 添加文字 |
| `useAppBootstrap.ts` | `requestAppIdleTask(task, timeout)` 用 `requestIdleCallback`（回退 setTimeout）调度空闲任务 |
| `useAppPersistence.ts` | 项目保存编排：`saveProjectWithPreview(options)` → 保存文档 → 渲染缩略图 → 持久化预览 → 刷新项目列表 |
| `useAppProjectLifecycle.ts` | 极简生命周期工厂 `createProjectLifecycle(hooks)`，预留扩展点 |

### 6.3 `src/components/ui/` — shadcn-vue UI 原语

共 20 个子目录，全部基于 `reka-ui` 原语封装，配合 `class-variance-authority` 做 variant、`@/lib/utils` 的 `cn()` 合并 Tailwind 类。

| 组件 | 文件 | 说明 |
|---|---|---|
| `badge` | `Badge.vue` | 徽章（default/secondary/destructive/outline） |
| `button` | `Button.vue` | 按钮（6 种 variant × 6 种 size） |
| `button-group` | 3 文件 | 按钮组（含分隔符与文本） |
| `card` | 7 文件 | 标准卡片族 |
| `context-menu` | 15 文件 | 完整右键菜单族 |
| `dialog` | 10 文件 | 模态对话框族 |
| `dropdown-menu` | 14 文件 | 下拉菜单族 |
| `input` | `Input.vue` | 文本输入 |
| `popover` | 4 文件 | 浮层 |
| `resizable` | 3 文件 | 可调宽面板组（被 App.vue 三栏布局使用） |
| `scroll-area` | 2 文件 | 自定义滚动区 |
| `select` | 12 文件 | 下拉选择族 |
| `separator` | `Separator.vue` | 分隔线 |
| `sheet` | 10 文件 | 侧滑抽屉族 |
| `slider` | `Slider.vue` | 滑块（被 RightInspector 使用） |
| `sonner` | `Sonner.vue` | Toast 通知（注入 Lucide 图标） |
| `switch` | `Switch.vue` | 基于 Reka UI `modelValue` / `update:modelValue` 的高对比开关；Configuration、Token 和 Handout Export 共用 |
| `tabs` | 4 文件 | 标签页族 |
| `textarea` | `Textarea.vue` | 多行输入 |
| `tooltip` | 4 文件 | 工具提示族 |

### 6.4 `src/components/` — 应用组件

#### 6.4.1 编辑器面板（`editor/`）

| 文件 | 用途 |
|---|---|
| `RightInspector.vue` | 右侧检视栏（756 行）。三个标签页：**Inspect**（选中图层属性、样式、效果、mask 开关）、**Brush**（brush/eraser 宽度、透明度滑条、tension、颜色等绘制设置）、**Document**（文档类型、画布、效果与嵌套 ExportPanel）。`scheduleContinuousEditEnd` 用 `continuousEditCommitDelayMs` 延迟合并历史。所有控件直接调用 `useEditorStore` 的 patch 方法 |
| `ExportPanel.vue` | Handout 高级导出面板。绑定 scale 与四格式编码设置；分别提供 OxiPNG、MozJPEG、WebP profile 和 JPEG XL 参数；浏览器环境禁用 JXL |

#### 6.4.2 新建讲义对话框（`handout/`）

| 文件 | 用途 |
|---|---|
| `CreateHandoutDialog.vue` | 81 行。两种模式：`upload-background`（拖拽/选择图片作背景并以其尺寸建画布）与 `blank`（手填宽高） |

#### 6.4.3 配置对话框（`settings/`）

| 文件 | 用途 |
|---|---|
| `ConfigurationDialog.vue` | 宽屏设置对话框，使用 General/Library/Handout/Token/Export/AI 六标签分类编辑唯一配置；标题、标签和保存栏固定，内容独立滚动；写入前由 Rust 严格校验 |

#### 6.4.4 应用骨架组件（根目录）

| 文件 | 行数 | 用途 |
|---|---|---|
| `BootSplash.vue` | 11 | 启动加载画面（三点跳动动画 + "Handout Generator" 标题） |
| `EditorTopBar.vue` | 61 | 编辑器顶栏：Save 按钮 + ButtonGroup 工具切换（Select/Brush/Eraser/Polygon）+ ButtonGroup Undo/Redo。Props: `activeTool`/`canUndo`/`canRedo`；Emits: `save`/`set-tool`/`undo`/`redo` |
| `ManagerShell.vue` | 管理器视图：Handouts/Tokens/Assets/Fonts 四标签 VueFinder，包含 Handout/Token 创建、Clone、Export 与 Settings |
| `LeftRail.vue` | 402 | 编辑器左栏：四标签页（Assets/Fonts/Graph/Layers）+ VueFinder + 搜索 + 可拖拽素材/字体列表 + SVG 形状预览（含 Polygon 入口）+ 图层/分组列表（拖拽排序、mask 预览、可见性切换、Merge/Flat/Move/Delete）。通过 `inject('left-rail-context')` 获取 57 个共享值 |
| `CanvasWorkspace.vue` | 446 | Konva 画布工作区：`<v-stage>` 含背景层 + 所有图层节点分支（masked image/raw image/text/rect/line/ellipse/polygon/curve/line group/paint）+ 曲线编辑手柄 + polygon draft overlay + brush cursor overlay + draftStroke + mask 编辑代理 + snap guideLines + marquee selectionBox + Transformer。通过 `inject('canvas-context')` 获取 65+ 共享值含 Konva refs |

### 6.7 `src/composables/` — 组合式函数（27 个实现 + 9 个测试）

#### 原有 composables（6 个）

| 文件 | 行数 | 用途 |
|---|---|---|
| `useCanvasViewport.ts` | 168 | Konva 视口管理：`fitScale`/`canvasZoom`/`canvasPan`/`stageScale`/`fitCanvasView`/`zoomCanvas in/out`、滚轮缩放（以鼠标为锚）、中键拖拽平移。zoom 限制 0.1–8 |
| `useEditorDragPayloads.ts` | 80 | HTML5 拖拽 payload 统一管理：`draggedAssetId`/`draggedFontId`/`draggedShapeKind` 及各 `start*/clear*` 函数 |
| `useExportProgress.ts` | 56 | 模拟导出进度条：`beginExportProgress`（90ms 渐增到 95）、`prepareExportProgress`（等待 nextTick + RAF + setTimeout 让 UI 先绘制） |
| `useFinderManagement.ts` | 将 Pinia store 包装为 Handout/Token/Assets/Fonts VueFinder Driver。Manager、Handout、Token 三处 Assets 均支持对当前单选或多选图片执行前景分割；目录和非图片不进入任务 |
| `useHandoutExport.ts` | 导出当前文档或 Manager 项目。签名去重 → 加载图片 → materialize mask → `renderHandoutToCanvas` → 自适应 RGBA/PNG raw IPC → Rust 四格式编码并直写 Downloads |
| `useResourceImages.ts` | 68 | 图片预加载与缓存管理。`previewUrl(record)` 优先 thumbnailPath，回退 fileUrl |

#### 从 App.vue 抽取的 composables（18 个）

| 文件 | 行数 | 用途 |
|---|---|---|
| `useMaskPreviewCache.ts` | 204 | idle-task mask 预览缓存队列：downsample/save/load cache data URL，`requestIdleTask`/`waitForIdleTask` |
| `useMaskComposition.ts` | 412 | mask 合成/刷新：`refreshMaskedLayerImages`/`refreshMaskPreviewUrls`/`refreshMaskEditImage`/`refreshMaskedBackgroundImage`/`scheduleMaskCompositeRefresh`。使用 per-layer token、mask identity freshness、render revision 与 thumbnail token 防止旧异步结果覆盖新状态 |
| `useLayerEffectCache.ts` | 99 | Konva 节点缓存：`refreshLayerEffectCache`（768px 上限）、RAF 批处理 `scheduleLayerEffectCacheRefresh`、签名 diff `changedEffectLayerIds` |
| `usePaintStrokes.ts` | 178 | 画笔/橡皮擦：`activePaintDefaults`/`localizeStrokePoints`/`maskLocalPoint`/`startPaintStroke`/`movePaintStroke`/`stopPaintStroke`（draftStroke 实时更新；单点 stroke 自动补 0.1px 线段，保证 click paint/mask 生效） |
| `useCurveEditing.ts` | 155 | 曲线手柄编辑：`curvePointKeys`/`curveHandleConfig`/`curveGuideConfig`/`moveCurvePoint`/`endCurvePointMove`/`normalizeCurveLayerPatch` |
| `useLayerDragTransform.ts` | 319 | 拖拽/变换/吸附：`onLayerDragStart`/`onDragMove`（含 `calculateSnapGuides` 实时对齐、`multiDragState` 多选同步）/`onTransformEnd`/`onDragEnd`/`ellipseDragSnapshot` |
| `useSelectionBox.ts` | 111 | 框选：`handleStagePointer`/`startSelectionBox`/`moveSelectionBox`/`stopSelectionBox`/`containsSelection`，含 `suppressNextStageClick` 防抖 |
| `useFlattenLayers.ts` | 194 | 图层合并：`layerOuterBounds`/`selectedLayerBounds`/`flattenDocumentForSelectedLayers`/`flattenSelectedLayers`（弹 confirm → 离屏渲染 → saveProjectAsset → replace） |
| `useProjectPreviews.ts` | 74 | 项目预览维护：`ensureProjectPreviews`（后台生成缺失/过期 webp 预览） |
| `useProjectCreation.ts` | 99 | 项目创建：`createProject`/`createProjectFromBackground`/`createHandoutFromImageRecord`/`saveProject`/`cloneHandoutProject`，含对话框状态 |
| `useFinderSelection.ts` | 171 | finder 选择/上传：`uploadFiles`/`handleDirectFinderDrop`/`selectedImageRecord`/`selectedHandoutProject`/`exportSelectedHandout`/`handleCreateBackgroundInput` |
| `useCanvasDrop.ts` | 128 | 画布拖放：`handleCanvasDrop`（font/shape/asset 分派）/`handleCanvasDragOver`/`handleDocumentFontDragOver`/`handleDocumentFontDrop`/`pointInsideStageFrame` |
| `useTextLayerAutoResize.ts` | 79 | 文本高度自适应：`autoResizeTextLayerHeights`/`autoTextLayerHeight`/`textLineCount`/`logTextLayerMetrics` |
| `useLayerRenderConfigs.ts` | 233 | Konva 配置构建：`layerConfig`/`textConfig`/`shapeConfig`/`paintConfig`/`maskedLayerConfig`/`layerPreviewStyle`/`layerPreviewText`/`canvasLayerRenderInfo`。masked config 带 `maskRenderRevision`，即使复用同一 canvas 引用也能触发 Konva 更新 |
| `useRenderSignatures.ts` | 290 | 24 个 computed 渲染签名：`canvasLayers`/`visibleCanvasLayers`/`layerListItems`/各种 `*Signature`（watch 触发用）/`transformerConfig`/`documentFilterStyle`/`backgroundAsset`/`backgroundImage` |
| `useMaskActions.ts` | 195 | mask 操作：`toggleSelectedLayerMask`/`toggleMaskEditFromLayerRow`/`toggleMaskEnabledFromLayerRow`/`startMaskDrag`/`handleMaskDrop`/`maskEditConfig`/`onMaskEditDragStart`/`onMaskEditDragEnd`/`onMaskEditTransformEnd`/`maskPreviewClass` |
| `useLayerListDragDrop.ts` | 152 | 图层列表拖拽：`startLayerListDrag`/`handleLayerListDrop`/`handleGroupDrop`/`groupForLayer`/`layersForGroup`/`groupIsCollapsed`/`toggleGroupCollapsed`/`selectLayerFromList`/`toggleLayerVisibility` |
| `useTransformerSync.ts` | 40 | Transformer 同步：`updateTransformer`（同步 Konva Transformer 节点到当前选择，mask-edit 模式附加 maskNode） |
| `useBrushCursor.ts` | 49 | brush/eraser DOM 光标圆环：按当前工具宽度与 stage scale 计算屏幕直径，离开画布或切换工具时隐藏 |
| `usePolygonCreation.ts` | 140 | 任意多边形创建：左键加点、右键撤销、点击首点闭合、离开 polygon tool 时自动闭合有效草稿；mask 编辑模式下输出 mask polygon operation |

### 6.8 `src/stores/` — Pinia 状态仓库

| 文件 | 用途 |
|---|---|
| `editor.ts` | **facade store**（656 行）。setup 风格 `defineStore('editor', () => {...})`。聚合 4 个子 store 并全量展开其 API，消费者零改动。保留核心：历史记录、文档、图层选择、图层 CRUD/排序/分组/栅格化、工具设置、dirty flags。详见 6.8.1 |
| `editor/font-store.ts` | 99 行。`createFontStore` 工厂：字体加载、预览生成、空闲调度 |
| `editor/library-store.ts` | 133 行。`createLibraryStore` 工厂：库 CRUD、导入管线、`resolveAsset`/`resolveBackground`/`resolveFont`、项目资产合并 |
| `editor/mask-store.ts` | 394 行。`createMaskStore` 工厂：所有 mask 操作（add/edit/delete/clear/transfer/copy）、mask data URL 缓存、mask 编辑目标、`persistProjectMasks` |
| `editor/project-store.ts` | 214 行。`createProjectStore` 工厂：项目 CRUD、文件夹管理、save/open/clone/close 生命周期 |
| `editor.test.ts` | 168 行 Vitest 测试，覆盖 commit/undo/redo、layer 增删移序、group、mask、flatten 等关键行为 |

> 子 store 用普通工厂函数（非 `defineStore`），通过依赖注入接收共享 ref（`projectTarget()`、`status`、`maskEditTarget`）。facade 组装顺序：fontStore → libraryStore → maskStore → replaceDocument → projectStore。

#### 6.8.1 `editor.ts` 关键 API

- **文档与历史**：`document`（computed）、`layers`（按 zIndex 降序）、`groups`、`selectedLayer/selectedLayers`、`canUndo/canRedo`、`commit/commitContinuous/endContinuousEdit`
- **图层操作**：`addLayerFromAsset/addText/addShape/addPaint/appendStrokeToPaintLayer/applyOrCreateTextWithFont`
- **图层修改**：`patchSelectedLayer*/patchLayer*/patchCanvas/patchCanvasEffectContinuous/patchSelectedLayerEffect*`
- **图层排序**：`moveSelectedLayer/moveLayerToIndex/moveGroupToIndex/addLayerToGroupAt/moveSelectedLayersOutOfGroup`
- **图层组**：`mergeSelectedLayersIntoGroup/ungroupGroup/toggleGroupVisibility`
- **图层栅格化**：`flattenSelectedLayersToImage`
- **遮罩**：`addMaskToLayer/addMaskToSelectedLayer/addBackgroundMask/editLayerMask/editBackgroundMask/exitMaskEdit/setSelectedLayerMaskEnabled/patchLayerMask/saveMaskCache/clearSelectedLayerMask/deleteSelectedLayerMask/moveOrCopyLayerMask/paintMask/loadMaskDataUrl/persistProjectMasks`
- **库管理**：`refreshLibrary/repairLibraryThumbnails/importAssetFile/importBackgroundFile/importFontFile/createResourceFolder/renameResource/moveResourceToFolder/deleteResourceEntries`
- **项目管理**：`refreshProjects/saveCurrentProject/openProjectFromPath/createManagedHandout/cloneManagedHandout/openManagedHandout/closeEditor`
- **解析**：`resolveAsset/resolveBackground/resolveFont`
- **类型守卫**：`isImageLayer/isTextLayer/isShapeLayer/isPaintLayer`

### 6.9 `src/lib/` — 核心业务逻辑

#### 6.9.1 顶层模块

| 文件 | 行数 | 用途 |
|---|---|---|
| `backend.ts` | 489 | Tauri IPC 桥接层。`isTauriRuntime()` 检测；非 Tauri 时浏览器回退。导出所有 IPC 调用函数（library/project/mask/asset/export/configuration/debug）。`writeEncodedImageBlobToDownloads` 直接传 `Uint8Array` raw body，避免大导出经 JSON 数组复制 |
| `configuration.ts` | 239 | TOML 配置解析。从 `configuration.toml?raw` 内联默认配置，支持 localStorage 覆盖。导出 `AppConfiguration` 类型与 `appConfiguration` 实例 |
| `history.ts` | 61 | 通用命令历史。`createHistory<T>(initial, maxSteps=100)`：`past/present/future` 三栈，`commit(mutator, {merge})`、`replace(next)`、`undo/redo` |
| `mask.ts` | 229 | 遮罩像素处理。`createSolidMaskDataUrl`、`drawMaskStroke`、`applyGrayMaskToCanvas`、坐标互转（图层↔文档、遮罩↔文档）、`createLayerLocalMaskCanvas`、`applyLayerMaskToCanvas`（默认可见语义：mask bitmap 外按 `defaultAlpha` 显示） |
| `mask-runtime.ts` | 586 | 编辑器实时 mask GPU/runtime。长期持有 mask canvas、layer output canvas 与 runtime revision；支持 seed 持久化 path、增量 stroke/shape 同步、thumbnail/materialize、mask/layer LRU 清理 |
| `mask-shapes.ts` | 487 | mask brush/eraser/shape/polygon 单通道合成。颜色在 mask 模式下被忽略；brush 目标白、eraser 目标黑，opacity 作为混合强度；写回强制 `R=G=B`、`A=255` |
| `mask-geometry.ts` | 108 | mask matrix 与图层变换同步：图层移动/旋转/翻转时同步 mask matrix，mask 也可独立移动/旋转/缩放 |
| `mask-tiles.ts` | 82 | mask dirty tile 计算，供大图局部刷新/持久化策略使用 |
| `polygon-creation.ts` | 91 | 任意多边形创建与变换 helper：文档点归一化为 layer-local points、首点闭合阈值、polygon resize 后重算 bbox 与 `polygonPoints` |
| `speed-log.ts` | 34 | 渲染/导出耗时 JSONL 日志 helper，写入 `logs/speed.log` |
| `render/` | 956 行（12 模块） | **Konva 离屏渲染与导出**（从原 `render.ts` 823 行拆分）。`index.ts` barrel 导出；`stage.ts` 构造离屏 Konva.Stage；`preview.ts` `renderHandoutPreviewToDataUrl`（≤1MB 预览）；`mask-composition.ts` `renderMaskedLayerImage`（Canvas2D/Pixi 合成，含 source canvas LRU 缓存）；`nodes/` 按类型生成 Konva 节点（image/text/shape/paint）；`image-loading.ts` 图片预加载 |
| `handout/layer/` | 832 行（9 模块） | **图层类型与操作**（从原 `layer.ts` 778 行拆分）。`index.ts` barrel 导出；`types.ts` 类型定义；`factories.ts` `addImageLayer`/`addTextLayer`/`addShapeLayer`/`addPaintLayer`；`mask.ts` `setLayerMask`/`clearLayerMask`/`transferLayerMask`/`copyLayerMask`；`group.ts` 分组操作；`ordering.ts` 排序；`delete.ts` 删除；`update.ts` 更新 |
| `shape-rendering.ts` | 243 | 形状渲染辅助。`shapeKonvaConfig`（按 ShapeKind 生成 Konva 配置）、`curveSceneFunc`（Bezier 自定义 sceneFunc）、`polygonPoints`（diamond/hexagon/custom polygon 顶点）、`lineDash`、`arrowDotConfig/arrowLineConfig`（自定义箭头） |
| `paint-rendering.ts` | 225 | 笔刷渲染。`brushDefaults`（pixel/pencil/marker/highlighter/airbrush 五种预设）；`paintCanvasCache` 用 stroke 签名做增量缓存并带 LRU 上限/清理 API——只重画新增 stroke |
| `layer-rendering.ts` | 53 | 图层→Konva 配置映射。`layerKonvaConfig`（id/x/y/w/h/scale/rotation/opacity/visible/draggable/blendMode）、`textKonvaConfig`（加 text/font/fontStyle/fill/align 等） |
| `effects.ts` | 47 | 效果→Konva 滤镜映射。`hasVisibleEffects`、`konvaEffectConfig`（filters 数组来自 Blur/Brighten/Contrast/HSL） |
| `snapping.ts` | 132 | 对齐辅助线计算。`calculateSnapGuides(input)`：屏幕阈值换算到画布阈值；canvas 的 0/中/边三条 + 候选图层的左/中/右三条；返回 `nextPosition` 与 `lines` |
| `selection.ts` | 13 | `RectBounds` 类型与 `containsRect(container, item)` 几何包含判断 |
| `shape-items.ts` | 13 | `shapeItems` 数组：10 种 ShapeKind（line/quadratic-curve/cubic-bezier/rect/round-rect/ellipse/diamond/hexagon-h/hexagon-v/polygon）的 label/detail |
| `export-options.ts` | 18 | `ExportFormat`、`exportMimeType/exportExtension/exportQualityValue` |
| `upload-validation.ts` | 31 | `isSupportedUpload`（按 MIME 或扩展名判断图片/字体）、`partitionUploadFiles` |
| `font-preview.ts` | 71 | `generateFontPreviewDataUrl(font)`：通过像素差异比较判断中文字形支持 → 256×144 WebP/PNG dataURL |
| `debug-log.ts` | 34 | `appendDebugLog`、`createDebugLogger(scope)`，按 scope 路由到 `logs/app.log`、`logs/mask.log`、`logs/render.log`、`logs/text.log`、`logs/speed.log` 等；浏览器非 Tauri 环境回退 console |
| `dom.ts` | 5 | `isEditableTarget(target)` 判断事件目标是否在 input/textarea/contenteditable 内 |
| `utils.ts` | 7 | `cn(...inputs)` = `twMerge(clsx(inputs))`，shadcn-vue 标准类合并工具 |

#### 6.9.2 `src/lib/handout/` — 文档模型（纯函数 reducer 风格）

| 文件 | 行数 | 用途 |
|---|---|---|
| `index.ts` | — | barrel 导出 |
| `document.ts` | 111 | `HandoutDocument`/`CanvasSettings` 接口；`createDefaultHandout(title)`（1280×720，透明背景）；`updateCanvas`；`setBackgroundMask/clearBackgroundMask/deleteBackgroundMask` |
| `layer/` | 832 行（9 模块） | **图层类型与操作**（从原 `layer.ts` 778 行拆分）。`index.ts` barrel；`types.ts` 类型；`factories.ts` 各 `add*Layer`；`mask.ts` mask 操作；`group.ts` 分组；`ordering.ts` 排序；`delete.ts`/`update.ts`；`shared.ts` 共享工具 |
| `mask.ts` | 118 | `LayerMask`/`MaskCacheMeta` 类型；`createCanvasLayerMask`（按画布尺寸创建）；`normalizeMask`/`normalizeMaskCache` |
| `paint.ts` | 62 | `PaintMode`/`BrushKind`/`StrokePoint`/`PaintStroke`；`normalizePaintStroke`；`ensureRenderableStrokePoints`/`ensureRenderablePaintStroke`（单点补短线段）；`pointsToStrokePoints/strokePointsToFlat`（扁平坐标 ↔ StrokePoint[] 互转） |
| `effects.ts` | 28 | `BlendMode`（6 种）、`LayerEffects`（brightness/contrast/saturation/blur）、`defaultEffects/normalizeEffects` |
| `migration.ts` | 44 | `normalizeHandoutDocument(document)`：对每个图层应用 defaults + normalize effects + normalize mask；清理重复/失效 group；规范化 canvas。任何 load/replace/save 路径都会经过它 |
| `dirty.ts` | 34 | `DirtyReason`/`DirtyFlags`；`createDirtyFlags/markLayerDirty/markProjectPreviewDirty`。供 App.vue 决定哪些图层需重渲染 |
| `paths.ts` | 11 | 项目内相对路径常量（mask/maskPreview/projectPreview） |
| `defaults.ts` | 8 | barrel 重导出常用默认值与工厂函数 |

#### 6.9.3 `src/lib/pixi/` — PixiJS 遮罩预览桥

| 文件 | 用途 |
|---|---|
| `PixiMaskBridge.ts` | 109 行。`composeMaskPreview(input)`：用 `Application.init({ preference: ['canvas'] })`（避免 Tauri WebView 的 WebGL readback SecurityError）；sourceCanvas 作为 Sprite、localMaskCanvas 作为 mask Sprite；render → extract.canvas。仅用于低频预览合成；**最终导出走 Canvas2D/Konva 保证确定性** |

#### 6.9.4 测试文件

| 文件 | 用途 |
|---|---|
| `configuration.test.ts` | TOML 解析/序列化/往返一致性 |
| `snapping.test.ts` | 对齐计算 |
| `selection.test.ts` | 几何包含判断 |
| `upload-validation.test.ts` | 上传校验 |
| `handout.test.ts` | document/layer/mask/paint/migration/history 与 render 工具函数 |
| `mask*.test.ts` | mask 几何、tile、单通道合成、runtime seed/revision/cache 行为 |
| `polygon-creation.test.ts` / `shape-rendering.test.ts` | custom polygon 创建、fallback、缩放回写与渲染 |
| `use*Composition/Actions/PaintStrokes/PolygonCreation/BrushCursor*.test.ts` | 编辑器交互 composable 的 mask 刷新、mask 拖动、单点笔触、polygon draft、brush cursor 行为 |
| `backend-log.test.ts` / `backend-export.test.ts` | 日志 scope 路由与 raw bytes 导出 IPC 参数 |

### 6.10 `src/assets/` — 静态资源

| 文件 | 用途 |
|---|---|
| `hero.png` | 13KB 启动/欢迎图（当前未直接引用，预留） |

### 6.11 `public/` — 静态公共文件

| 文件 | 用途 |
|---|---|
| `favicon.svg` | 9.5KB，应用图标 |
| `icons.svg` | 5KB，SVG 图标集 |

### 6.12 `src/App.vue` — 根组件深度解析

**职责**：应用 shell + composable 编排器。管理三态切换（boot/manager/editor）、提供 3 个 provide 上下文给子组件、装配编辑器 composable、注册全局监听与 watcher。

#### script setup 结构

- **imports**：Vue/Konva/Tauri；4 个子组件、27 个 composable 实现、lib、store
- **类型**：`NodeRef`/`KonvaEvent`/`EditorTool`
- **响应式状态**：editor store；stage/transformer/maskEdit node refs；`maskedLayerImages`/`maskedLayerRenderRevisions`/`maskPreviewUrls`/`maskEditImage`；`isDraggingMask`/`draggedMaskLayerId`；polygon draft；对话框开关；`activeTool`/`activeRailTab`；`isBooting`；finder 选择/revision
- **composable 装配**：按依赖序调用 composable，用 holder 模式打破循环依赖（`maskCompositionRefreshHolder`/`projectCreationHolder`/`finderSelectionHolder`/`layerListHolder`）
- **provide 注入**：`manager-context`、`left-rail-context`、`canvas-context`，向子组件提供 Konva refs、mask runtime 结果、polygon draft、brush cursor、导出状态等共享值
- **handleGlobalKeydown**：`createAppShortcutHandler` 绑定快捷键，并在 polygon tool 退出时自动闭合/丢弃草稿
- **辅助函数**：`setActiveTool`/`startPolygonCreation`/`finishPolygonTool`/`addShapeToCanvas`/`addShapeToActiveMask`/`addPolygonToActiveMask`/`cleanupRuntimeLayerCaches` 等
- **生命周期**：onMounted 并行刷新 library + projects、同步图片、注册监听、ensureProjectPreviews；onBeforeUnmount 移除监听、退出 polygon draft、cleanup
- **watch**：把签名变化映射到 transformer 更新、effect 缓存刷新、targeted mask 合成、文字自适应、runtime cache 清理等副作用

#### template 结构（编辑器 shell）

三态切换：

1. **`isBooting`** → `<BootSplash />`
2. **`editor.view === 'manager'`** → `<ManagerShell />`（通过 inject 获取上下文）
3. **editor 视图** → `<ResizablePanelGroup direction="horizontal">` 三栏：
   - **左栏（23%）**：`<LeftRail />`（通过 inject 获取上下文）
   - **中栏（57%）**：`<EditorTopBar />` + `<CanvasWorkspace />`
   - **右栏（20%）**：`<RightInspector>` 绑定 export 模型，`@export-image="exportCurrentImage"`

---

## 7. Rust 后端（src-tauri/）

### 7.1 配置文件

| 文件 | 用途 |
|---|---|
| `Cargo.toml` | Rust 包配置。`name="app"`，`crate-type=["staticlib","cdylib","rlib"]`；关键依赖见第 2 节 |
| `tauri.conf.json` | Tauri 应用配置。窗口 1440×920（min 1180×760）；`dragDropEnabled: false`；`assetProtocol` 限定到 `data/**/*`；`beforeDevCommand: pnpm dev`；`beforeBuildCommand: pnpm build` |
| `build.rs` | 标准 Tauri 构建脚本，调用 `tauri_build::build()` |
| `capabilities/default.json` | 主窗口最小权限集合：`core:default`、`dialog:allow-open/confirm` 和 `fs:allow-app-write-recursive` |

### 7.2 源码文件

#### 入口

| 文件 | 用途 |
|---|---|
| `src/main.rs` | 6 行。二进制入口，release 模式隐藏 Windows 控制台，调用 `app_lib::run()` |
| `src/lib.rs` | Tauri 入口：解析根配置、应用窗口标题/尺寸/最小尺寸/resizable，初始化 Token 与 Handout 导出配置，注册所有 IPC 命令 |
| `src/foreground_segmentation.rs` | 前景分割外围 adapter：Asset 路径安全、批量 worker、Channel 进度、透明 PNG/缩略图和单次 Library index 事务 |
| `src/foreground_segmentation/engine.rs` | 与 Tauri/Library 解耦的推理核心：方向修正、模型预处理、Session pool、soft mask 和 PNG 输出 |
| `src/foreground_segmentation/models.rs` | 四种模型注册表、固定 revision、下载 URL、SHA-256 和模型专用输入/输出规则 |
| `src/foreground_segmentation/downloader.rs` | 运行时模型缓存、single-flight 下载、SHA-256 校验持久化和 `.partial` 原子替换 |
| `src/foreground_segmentation/device.rs` | 平台 GPU Provider 优先级和 CPU 回退顺序 |
| `src/foreground_segmentation/vision.rs` | macOS Vision 实例 mask、CoreVideo 行步长读取及原 Alpha 合成 |

#### 模块结构（staged module split 已完成）

| 文件 | 行数 | 用途 |
|---|---|---|
| `src/types.rs` | 86 | 共享数据结构：`LibraryRecord`/`LibraryIndex`/`ImportResult`/`ProjectPayload`/`ProjectSummary`/`ProjectFolderIndex`/`DeleteEntries` |
| `src/errors.rs` | 30 | `AppError` 枚举 + `CommandResult<T>` 别名 |
| `src/commands/mod.rs` | 5 | 模块声明 |
| `src/commands/asset_commands.rs` | 311 | 15 个库/config 命令 |
| `src/commands/project_commands.rs` | 324 | 13 个项目命令 |
| `src/commands/preview_commands.rs` | 68 | `save_project_preview` + `save_project_asset` |
| `src/commands/export_commands.rs` | 兼容旧导出命令，并提供 `encode_handout_image_to_downloads`：解析 HGE1 二进制 envelope、验证尺寸/payload/编码参数、`spawn_blocking` 编码、文件名避让和 Downloads 直写 |
| `src/commands/mask_commands.rs` | 87 | 4 个遮罩/项目文件 I/O 命令 |
| `src/services/mod.rs` | 5 | 模块声明 |
| `src/services/path_service.rs` | 182 | 路径/文件夹/fs/data-url/debug log |
| `src/services/preview_service.rs` | 56 | 缩略图/预览编码 |
| `src/services/project_service.rs` | 144 | 项目文件 I/O + folder index |
| `src/services/asset_service.rs` | 311 | 库 I/O + 字体解析 + import pipeline |
| `src/services/image_codec.rs` | 104 | 图像转码核心（PNG/JPEG/WebP） |
| `src/services/image_encoding.rs` | Token/Handout 共享编码服务：OxiPNG、MozJPEG、libwebp、jpegxl-rs，统一 `ImageEncodingOptions` 边界校验 |
| `src/services/export_service.rs` | 1 | 占位（逻辑在 `export_commands.rs`） |
| `src/editor/mod.rs` | 5 | 编辑器领域占位 |

### 7.3 关键数据结构与路径解析

> 数据结构已迁移至 `src/types.rs`，路径解析至 `src/services/path_service.rs`，字体元数据解析至 `src/services/asset_service.rs`，缩略图管线至 `src/services/preview_service.rs`。详见 7.2 模块表。

#### 数据结构（均 `#[serde(rename_all = "camelCase")]`）

- `LibraryRecord` — 库项：id/name/file_name/path/thumbnail_path/font_family/tags/folder/media_type/created_at/updated_at
- `LibraryIndex` — `index.json` 结构：backgrounds/assets/fonts（各 Vec<LibraryRecord>）+ 三组 folder 列表
- `ImportResult` — `{ record, library }`
- `ProjectPayload` — `{ document: serde_json::Value, metadata: serde_json::Value }`
- `ProjectSummary` — 项目列表项：id/title/project_dir/folder/background_asset_id/preview_path/preview_size_bytes/updated_at
- `ProjectFolderIndex` — `{ folders: Vec<String> }`
- `DeleteEntries` — `{ ids: Vec<String>, folders: Vec<String> }`

#### 路径解析

- `app_root(app)` → `~/Documents/trpg-helper/data`
- `library_root(app)` → `data/library`
- `projects_root(app)` → `data/projects`
- `index_path(app)` → `data/library/index.json`
- `project_dir(app, id)` → `data/projects/<id>`
- `safe_project_relative_path(rel)` — 拒绝绝对路径和 `..` 段（路径穿越防护）

#### 字体元数据解析

`extract_font_family_from_bytes(bytes)` — 手写 TrueType/OpenType `name` 表解析器：big-endian u16/u32 读取；UTF-16BE 解码（platform 0/3）；提取 name_id 16（typographic family）/1（family）/4（full name）/6（PostScript）；优先 Unicode + English（language ID 0x0409 或 0）。

#### 缩略图管线

`encode_webp_thumbnail_bytes(input)`：
1. `image::load_from_memory` 解码
2. 读取尺寸，若最长边 > 256 则 Lanczos3 缩放
3. 转 RGBA8
4. `webp::Encoder::from_rgba` 编码（quality 80）

#### 共享最终编码管线（`services/image_encoding.rs`）

`encode_rgba_image(image, options, context)` 由 Token adapter 和 Handout raw command 共用：
- **PNG** — 基础 PNG 后经 OxiPNG，支持 optimization level、alpha optimization、metadata 和 Zopfli。
- **JPEG** — alpha 先合成到可配 matte，再用 MozJPEG 编码，支持 progressive、deringing 和 444/422/420。
- **WebP** — libwebp advanced config，支持 lossy/lossless、quality、method 和 passes profile。
- **JXL** — jpegxl-rs，支持 lossless/distance/effort/progressive/decoding speed。

`services/image_codec.rs` 仅保留旧 PNG/JPEG/WebP 转码命令的兼容实现，不是 Handout/Token 新导出主路径。

---

## 8. 运行时数据（~/Documents/trpg-helper/）

> 桌面应用启动时固定使用 `~/Documents/trpg-helper/` 作为运行时根目录；不存在时自动创建配置、数据、日志和项目目录。开发模式与打包应用使用同一位置，避免依赖进程工作目录。

```
~/Documents/trpg-helper/
├── configuration.toml           # 不存在时从项目默认配置自动创建
├── logs/                         # app/mask/render/speed/text/upload/token 日志
└── data/
├── library/
│   ├── index.json                 # LibraryIndex（所有资源元数据 + 文件夹列表）
│   ├── backgrounds/<id>-<name>    # 原始背景图
│   ├── assets/<id>-<name>         # 原始素材图
│   ├── fonts/<id>-<name>          # 字体文件（ttf/otf）
│   └── thumbnails/<id>.webp       # WebP 缩略图（256px，q80）
│
└── projects/
    ├── folders.json               # 项目文件夹列表
    └── <project-uuid>/
        ├── handout.json           # 完整编辑器文档
        ├── metadata.json          # { id, folder, savedAt, app }
        ├── preview.webp           # 项目预览图
        ├── assets/<asset_id>.<ext>  # 项目内嵌素材
        ├── masks/<mask_id>.png    # 图层遮罩 PNG
        └── .cache/masks/          # 降采样遮罩缓存
```

**运行时根目录文件**：
- `logs/*.log` — 调试日志（启动时清空默认日志文件，由 `append_debug_log` 按 scope 追加；渲染耗时在 `logs/speed.log`）
- `configuration.toml` — 应用配置（由 `read/write_configuration` 读写）

---

## 9. IPC API 全景

后端共暴露 **56 个 Tauri 命令**，全部返回 `Result<T, String>`。前端通过 `@tauri-apps/api` 的 `invoke("command_name", args?, options?)` 调用。常规命令使用 JSON 参数；Handout 大导出使用 raw bytes body，Token 批量导出使用 Channel 推送进度。

### 库管理

| 命令 | 用途 |
|---|---|
| `get_library` | 读取 `index.json`，修复缺失字体元数据 |
| `repair_missing_thumbnails` | 重新生成缺失缩略图 |
| `create_library_folder` | 创建库文件夹 |
| `rename_library_folder` | 重命名库文件夹（含所有记录的 folder 字段） |
| `rename_library_record` | 重命名库记录的显示名 |
| `move_library_record` | 移动记录到指定文件夹 |
| `delete_library_entries` | 删除记录（含磁盘文件 + 缩略图） |
| `import_background` | 导入背景图（生成缩略图） |
| `import_asset` | 导入素材图（生成缩略图） |
| `import_font` | 导入字体（提取 font_family） |
| `update_token_ring_config` | 使用 expected revision 更新 Asset 自定义环几何 |
| `update_token_background_config` | 使用 expected revision 更新 Asset 自定义背景位移 |
| `segment_asset_foreground` | 单文件兼容入口，内部转发到批量分割链路 |
| `segment_assets_foreground` | 批量接收 `assetId + sourcePath`，按配置并发分割，通过 Channel 返回下载/探测/逐项处理/写入进度，最后单次提交 Library index |

### 项目管理（13）

| 命令 | 用途 |
|---|---|
| `list_projects` | 列出所有项目（按 updated_at 降序） |
| `create_project` | 创建新项目（UUIDv4） |
| `open_project` | 从指定目录打开项目 |
| `save_project` | 保存项目到指定目录 |
| `open_managed_project` | 按 id 打开托管项目 |
| `save_managed_project` | 保存托管项目 |
| `rename_managed_project` | 重命名托管项目 |
| `move_managed_project` | 移动项目到文件夹 |
| `delete_project_entries` | 删除项目 |
| `copy_project_masks` | 复制项目遮罩目录 |
| `create_project_folder` | 创建项目文件夹 |
| `rename_project_folder` | 重命名项目文件夹（遍历所有项目 metadata） |
| `list_project_folders` | 列出项目文件夹 |

### Token 项目与导出（13）

| 命令 | 用途 |
|---|---|
| `list_token_projects` | 列出 Token 项目及 preview/item count |
| `create_token_project` | 创建批量 Token 项目并复制源图到 `sources/` |
| `open_token_project` | 解析 Asset ID，缺失时回退项目源图副本 |
| `save_token_project` | 保存项目并补齐新增项源图副本 |
| `rename_token_project` | 重命名 Token 项目 |
| `move_token_project` | 移动 Token 项目到逻辑目录 |
| `copy_token_project` | 复制完整项目和 `sources/` |
| `delete_token_project_entries` | 删除 Token 项目或目录树 |
| `create_token_project_folder` | 创建 Token 逻辑目录 |
| `rename_token_project_folder` | 重命名 Token 逻辑目录及项目 metadata |
| `list_token_project_folders` | 列出 Token 逻辑目录 |
| `save_token_project_preview` | 保存当前项优先的 WebP 项目预览 |
| `generate_token_batch` | PNG/JPEG/WebP/JXL 批量生成，逐项失败隔离 |

`generate_token_batch` 的 `onProgress` 参数是 Tauri Channel，发送逐项阶段和完成进度，不单独占用命令名。

### 遮罩/项目文件 I/O（4）

| 命令 | 用途 |
|---|---|
| `save_project_mask` | 保存遮罩 PNG |
| `save_project_mask_cache` | 保存降采样遮罩缓存 |
| `read_project_file_data_url` | 读取项目文件为 data URL |
| `delete_project_mask` | 删除项目文件 |

### 资源 I/O（1）

| 命令 | 用途 |
|---|---|
| `save_project_asset` | 保存项目内嵌素材 |

### 导出

| 命令 | 用途 |
|---|---|
| `export_image` | 导出图像到指定路径 |
| `export_image_to_downloads` | 导出图像到下载目录（原样写入） |
| `export_image_bytes_to_downloads` | 转码 inline bytes 后导出到下载目录 |
| `export_image_file_to_downloads` | 转码 staging 文件后导出到下载目录（删除 staging） |
| `write_encoded_image_bytes_to_downloads` | 已编码 PNG/JPEG/WebP bytes raw body 直写下载目录；文件名通过 `x-file-name` header 传入 |
| `encode_handout_image_to_downloads` | 接收 HGE1 raw envelope，根据 `rgba8`/`png` transport 解码，使用共享 Rust 编码器输出 PNG/JPG/WebP/JXL，直写 Downloads 并返回分段耗时 |

### 预览（2）

| 命令 | 用途 |
|---|---|
| `save_project_preview` | 保存项目预览（重新编码为 WebP） |
| `save_font_preview` | 保存字体预览 |

### 通用（4）

| 命令 | 用途 |
|---|---|
| `read_file_data_url` | 读取任意文件为 data URL |
| `append_debug_log(scope, line)` | 按 scope 追加调试日志到 `logs/*.log` |
| `read_configuration` | 读取 configuration.toml |
| `write_configuration` | 严格解析并校验 Token/Handout 配置后写入根 `configuration.toml` |

### 通信机制

- **IPC**：Tauri 2 `invoke` 协议，JSON 参数/返回值，所有结构体 `camelCase` 序列化；已编码导出图像用 `Uint8Array` raw body 避免 JSON 数组大拷贝
- **Asset 协议**：`asset://`（`http://asset.localhost/`）直接加载磁盘图片，scope 限定 `data/**/*`
- **大数据传输**：小图走 IPC base64 data URL；导出首选前端已编码 Blob → raw bytes IPC → Rust 直接写 Downloads；旧 staging 转码命令仅保留兼容路径

---

## 10. 数据流与架构

### 10.1 启动

```
main.ts → createApp → App.vue onMounted
  ├─ editor.refreshLibrary()     → invoke('get_library')
  ├─ editor.refreshProjects()    → invoke('list_projects')
  ├─ syncImages()                → 预加载图片
  ├─ repairLibraryThumbnails()   → 后台修复缩略图
  └─ ensureProjectPreviews()     → 后台生成缺失预览
→ isBooting = false
```

### 10.2 用户输入 → store → 历史记录

所有编辑操作通过 `useEditorStore` 方法进入。`commit(mutator)` 把 `history.current`（即 `document`）经 `mutator`（最终调用 `lib/handout/*` 纯函数 reducer）产出新 `HandoutDocument`，推入 `past` 栈成为新 `present`，清空 `future`。`commitContinuous(key, mutator)` 在同一 key 下合并历史（拖拽/滑块连续调整不爆历史）。同时 `markLayerDirty(layerId, reason)` 更新 `dirtyFlags`。

### 10.3 store → Konva 画布渲染

`useRenderSignatures`（C18）的 computed（`canvasLayers`/`layerEffectsSignature`/`layerMaskRenderSignature`/...）是 `editor.document` 的派生视图。`CanvasWorkspace.vue` 的 `<v-stage>` 的 `<v-group>` 套用 `useCanvasViewport` 的 pan/zoom；每个图层节点用 `useLayerRenderConfigs`（C17）的 `layerConfig`/`textConfig`/`shapeConfig`/`paintConfig`/`maskedLayerConfig` 生成 Konva config。Vue-Konva 响应式应用并 `layer.draw()`。

- **带效果的图层**：`useLayerEffectCache`（C3）的 `refreshLayerEffectCacheAfterUpdate` 中 `node.cache()`（768px 上限）
- **带遮罩的图层**：mask change pulse / targeted refresh → `useMaskComposition`（C2）的 per-layer refresh queue → `renderMaskedLayerImage` / `MaskGpuRuntime.composeLayerAsync` 离屏合成 → 结果存入稳定 `maskedLayerImages[layer.id]`，并递增 `maskedLayerRenderRevisions[layer.id]` 触发 `<v-image>` 更新
- **mask 编辑**：brush/eraser/polygon/shape 都写入单通道 mask operation；实时 draft stroke 只做视觉反馈，commit 后通过 runtime 同步 stroke/shape 并触发目标 layer 合成

### 10.4 画布交互回写 store

拖拽/变换时 Konva 事件 → `useLayerDragTransform`（C6）的 `onDragMove`/`onTransform`/`onTransformEnd`（含 `calculateSnapGuides` 实时对齐、`multiDragState` 多选同步）→ `editor.patchSelectedLayersContinuous(...)` 回写 store；改 transform 时同步移动/缩放/旋转 mask，polygon layer 变换会同步缩放 `polygonPoints` 并重算 bbox。App.vue 的 watcher 监听签名变化，触发 transformer 重建、effect 缓存刷新、mask targeted 合成、文字自适应与 runtime cache 清理等副作用，形成闭环。

### 10.5 持久化

```
Save 按钮 → saveProject()
  → saveProjectWithPreview()
    ├─ editor.saveCurrentProject()
    │   ├─ persistProjectMasks()    → saveProjectMask（写盘 + 清 cache）
    │   └─ saveManagedProject()     → 写 handout.json + metadata.json
    ├─ renderHandoutPreviewToDataUrl()  → ≤1MB 预览
    └─ saveProjectPreview()         → 写 preview.webp
  → refreshProjects()
```

### 10.6 导出

```
Document 标签 → ExportPanel exportImage emit → exportCurrentImage()
  ├─ prepareExportProgress()    → 进度条先动
  ├─ 签名去重（相同文档+参数不重复导出）
  ├─ ensureDocumentImages()
  ├─ materialize 当前 enabled masks（优先 MaskGpuRuntime，回退 loadMaskDataUrl）
  ├─ renderHandoutToCanvas(document, library, scale, imageElements, {maskDataUrls, projectTarget, masksEnabled})
│   ├─ 构造离屏 Konva.Stage
│   ├─ 按 zIndex 渲染背景 + 所有可见图层
│   ├─ 带遮罩走 applyLayerMaskToCanvas（Canvas2D 确定性路径，不走 Pixi）
│   └─ stage.toCanvas → HTMLCanvasElement
  └─ encodeHandoutCanvasToDownloads()
      ├─ 校验 16384px / 64MP 上限
      ├─ <=128MiB: getImageData RGBA8；超过阈值: canvas.toBlob(image/png)
      ├─ HGE1 envelope + raw invoke('encode_handout_image_to_downloads')
      ├─ Rust: 解码（必要时）→ 共享编码器 → Downloads
      └─ 浏览器: canvas.toBlob PNG/JPEG/WebP；JXL 明确禁用
```

---

## 11. 关键设计决策

### 11.1 文档模型不可变

所有 `lib/handout/*` 操作返回新 `HandoutDocument`，配合 `history.ts` 的三栈实现撤销/重做。store 的 `commit(mutator)` 是唯一的变更入口。

### 11.2 遮罩双路径

- **编辑器预览**：可用 PixiJS（canvas renderer，避免 Tauri WebView 的 WebGL readback SecurityError）加速
- **导出与 flatten**：始终用 Canvas2D/Konva 保证像素确定性

由 `configuration.toml` 的 `[mask].use_pixi_preview` 控制，Pixi 失败自动回退到 Canvas2D。

### 11.3 配置驱动

`appConfiguration`（来自 `configuration.toml`，可被 localStorage 覆盖）控制：遮罩开关、Pixi 开关、snap 阈值、continuous edit 延迟、缩略图/预览尺寸、finder 网格缩放、导出默认缩放、调试日志等。

### 11.4 Tauri/浏览器双跑

`backend.ts` 每个函数都先 `isTauriRuntime()` 判断，浏览器提供最小可运行回退（`<a download>` 触发下载、localStorage 存配置等），使前端可独立开发调试。

### 11.5 纯函数 reducer + 薄 store

编辑器逻辑（`lib/handout/*`）是纯函数，store 只是包装历史 + 选择 + 副作用调度。这使得文档操作可测试、可序列化、可回放。

### 11.6 自适应 raw bytes 导出

Handout 在 WebView 内只生成最终 Canvas，格式编码交给 Rust。RGBA 小于 `raw_rgba_ipc_max_bytes` 时直接通过 Tauri raw body 传输；大图先生成无损 PNG，避免巨型 RGBA IPC 分配。Rust 在 blocking worker 中编码并直写 Downloads，返回 decode/encode/write 分段耗时。

### 11.7 路径安全

`safe_project_relative_path` 拒绝绝对路径和 `..` 段；`clean_file_name` 清洗所有用户输入文件名，防止路径穿越和非法字符。

### 11.8 四阶段代码拆解

项目经历四阶段结构性重构，将高耦合大文件分解为模块化架构：

1. **Rust 后端**（`lib.rs` 1472→89 行）：拆分为 `types.rs`/`errors.rs` + `commands/`（4 组）+ `services/`（5 模块）
2. **渲染与图层模块**（`render.ts` 823 行 → `render/` 12 模块；`layer.ts` 778 行 → `layer/` 9 模块）：barrel 导出保持 API 不变
3. **Editor store**（`editor.ts` 1348→656+840 行）：facade + 4 子 store（font/library/mask/project），工厂函数 + 依赖注入
4. **App.vue**（3714→1252 行）：27 个 composable 实现 + 5 个子组件，provide/inject 共享上下文

所有阶段均保持测试全通过、typecheck 清洁、生产构建成功。消费者代码零改动。

### 11.9 未使用依赖

`rusqlite` 0.40.1 和 `anyhow` 在 `Cargo.toml` 中声明但全代码库零引用——持久化完全基于 JSON 文件 + 图像文件，无数据库。这两个依赖可安全移除。

---

## 12. Token Generator 领域

### 12.1 Workspace 与主界面

根级 `useWorkspaceStore` 管理 `manager | handout-editor | token-editor`，Token 导航不依赖 Handout Editor Store。主界面包含 `Handouts / Tokens / Assets / Fonts`：Tokens 使用独立 VueFinder driver；Assets 使用多选模式，恰好一张图片时可创建 Handout，任意数量图片可一次创建一个批量 Token 项目。

Token 项目默认命名为 `未命名项目-YYYYMMDD-HHmmss`，创建后立即打开。Tokens VueFinder 支持目录、新建、重命名、移动、删除和 Clone；双击项目进入 Token 编辑器。

### 12.2 项目模型与资源回退

`TokenProjectDocument` 保存项目项的独立 `TokenVisualStyle` 和共享 `TokenExportSettings`。每个项目项优先使用稳定 `assetId` 解析当前 Assets；创建/保存时 Rust 将源图复制到项目 `sources/` 并写入 `fallbackSource`。Asset 被移动不影响引用，Asset 被删除后仍可通过项目副本打开、预览和导出；两处均缺失的项保留在文档中，批量导出会为其生成明确失败结果，而不是静默跳过。

Assets 初始化会确保逻辑目录 `rings`、`token-backgrounds` 和 `token-tmp` 存在。Token 编辑器导入外部文件/文件夹时先进入 `token-tmp`；自定义环进入 `rings`，自定义背景进入 `token-backgrounds`。`LibraryRecord.tokenRing` 保存 revision、设计尺寸、内外径、素材缩放和偏移；`LibraryRecord.tokenBackground` 保存 revision、设计尺寸及 X/Y 位移，两者均使用 expected revision 防止旧提交覆盖新设置。

### 12.3 三栏编辑器

- 左栏 `Items / Assets`：Items 提供外部图片/文件夹导入、拖放、全选/取消、样式批量应用、清空和紧凑项列表；文件选择统一走 64 MiB 分批 raw IPC，Tauri 原生文件/目录拖放在 Rust 侧递归收集图片并通过单批索引事务导入。列表优先使用 Library thumbnail，项目 fallback source 使用 64 项运行时小图缓存。Assets 是完整 VueFinder，支持上传、目录、移动、重命名、删除、搜索、多选，并可右键递归加入文件/目录。
- 中栏：长期持有的 `PixiTokenRenderer`，支持头像拖动、滚轮缩放、响应式取景、出框参考线、快速切图 freshness token、纹理释放和完整 dispose。Asset/项目 fallback/自定义环/自定义背景通过 Tauri asset protocol URL 加载，不请求 plugin-fs 读取 capability；加载错误可见且写入 `logs/token.log`。
- 右栏 `参数 / 导出`：头像缩放/偏移/独立裁切半径、纯色或自定义背景、环样式/颜色/半径/拉伸、分割角度与高度、自定义环几何，以及 PNG/JPEG/WebP/JXL 参数和导出范围。

三栏首行分别承载“返回与可编辑项目名”、“实时预览与视口缩放”、“撤销/重做/保存”，不再叠加整宽项目横条。下划线标签、列表密度、选择态和控制面板顺序与独立 Token Generator 保持一致，同时继续使用集成应用的 shadcn-vue 中性主题。左侧 Assets 通过 `TokenEditorContext` 注入已解析的 plain VueFinder driver、features 和 context menu，不能把嵌套 `ComputedRef` 直接传给 VueFinder；资源浏览器及其 explorer 使用完整高度和独立滚动区。

全局 Tailwind v4 主题必须在 `style.css` 的 `@theme` 中把 `--background`、`--primary`、`--border` 等运行时变量注册为 `--color-*`；仅声明 `:root` 变量不会生成 `bg-background`、`border-border`、`bg-primary` 等 utility。共享 Button/Input/Switch/Slider 使用与 Token Generator 一致的紧凑视觉参数，禁止再用全局 `[data-slot] !important` 覆盖组件内部样式。

所有布尔参数使用共享 `BooleanSettingField`，内部遵循 Reka UI `Switch` 的 `modelValue` / `update:modelValue` 契约。选中轨道使用高对比 primary 色；分割环、PNG Alpha/Metadata/Zopfli、JPEG、WebP、JXL 等高级参数均提供可聚焦的悬停说明。导出格式、色度采样和 WebP 编码强度使用 `aria-pressed` 暴露选中状态，并以实心 primary 样式显示当前选项。

连续滑块编辑通过 `edit-start -> update:modelValue -> commit` 合并为一条历史。Token Store 使用 `style | export | items | ringConfig` 混合 Action History：参数只记录目标项，自定义环几何支持异步撤销，结构操作同时恢复选择、勾选和 runtime source；保存项目不清空历史，打开其他项目才重置。Token 编辑器提供 `Cmd/Ctrl+Z`、`Cmd/Ctrl+Y` 和 `Cmd/Ctrl+Shift+Z`，输入控件中保留系统撤销。显式 Save 和返回 Manager 都会保存；Save 使用当前预览写入 `preview.webp`。`NumericSliderField` 是 Handout 与 Token 共享的唯一滑块精确输入控件，支持点击数字编辑、clamp、step、单位、Mixed 和禁用状态。

### 12.4 圆环与 Pixi 预览

11 个内置 SVG 位于 `src-tauri/src/token/rings/`，Rust 文件是素材唯一来源，前端通过 Vite `?raw` 复用。`useTokenRingStore` 统一提供 descriptor、runtime preview override、revision commit、导入、删除、设计尺寸迁移和有效几何；Workspace 只创建一个共享 `RingTextureProvider`，预览与 Ring Selector 共用按 revision 缓存、Worker 径向映射、DPR 清晰度和 50 ms 请求去抖。Ring Selector 显示应用内外径/缩放/位移后的真实缩略图，不再直接显示原始 SVG 或 Asset thumbnail。

圆环样式选择器与自定义圆环六项几何使用两个相互独立、默认折叠的 Reka UI Collapsible。折叠标题分别显示当前圆环摘要和 geometry revision；折叠只节省控制面板空间，不销毁共享纹理，也不中断实时预览或 revision 提交。

自定义环六项几何在滑块拖动时只更新 runtime preview，松手后以 expected revision 提交并进入撤销历史；`designSize` 不再对用户开放。非标准旧设计尺寸会按当前配置同比迁移半径和位移。前端和 Rust 均先裁切透明边界，保证带透明留白的环在预览与导出中位置一致；自定义环保留原始 RGB，仅乘环颜色 alpha。环 Asset 缺失时预览和导出均回退 solid，并写入 `logs/token.log`。

头像的 `scale` 与 `offsetX/offsetY` 始终以圆环外径为参考，圆环内径只约束环带。`avatarRadius` 是独立圆形裁切参数：普通模式裁切整个头像，出框模式允许侧不裁切、受限侧继续裁切并由前层环覆盖。纯色及自定义背景统一裁切到 `max(ringOuterRadius - 1, 0)`；自定义背景保持完整源图透明边界，按 Cover 铺满后只应用共享的设计空间 X/Y 位移，不提供缩放参数。

背景选择器与自定义背景位移面板均为独立 Collapsible。`useTokenBackgroundStore` 负责 descriptor、runtime preview、revision commit、导入、删除和缺失回退；纹理按 Asset revision 缓存。旧项目缺少 `avatarRadius` 时以有效环内径迁移，缺少 `backgroundStyle` 时迁移为 `solid`，原有 scale/offset 数值保持不变。

### 12.5 Rust 批量导出与共享编码

`generate_token_batch` 使用 Tauri `Channel<ExportProgressEvent>` 报告 preparing、decoding、rendering、compositing、encoding。每项冻结独立视觉参数与共享导出参数，单项失败不会终止后续项，重复文件名按配置避让。`token/encoding.rs` 现仅负责将 `TokenParams` 适配到 `services/image_encoding.rs`，Token 和 Handout 不再各自维护编码器实现。

- PNG：OxiPNG，支持优化级别、alpha、metadata 和 Zopfli。
- JPEG：MozJPEG，支持质量、progressive、deringing 和 444/422/420。
- WebP：lossy/lossless、质量和 strength profile。
- JXL：lossless/distance/effort/progressive/decoding speed。

随机配色使用高对比 palette；内置环可随机环色，自定义环通过 `ringAssetPath` 识别并保持 RGB，随机背景使用自定义环 Alpha 加权代表色选择对比色。导出完成后前端总是以 Rust 最终结果校准 completed/success/failure，即使 Channel 没有发送 `finished`；命令异常写入可观察状态和通知，不从点击事件重新抛出。导出结果与耗时分别写入 `logs/render.log` 和 `logs/speed.log`，Token 业务事件写入 `logs/token.log`。

### 12.6 当前验证基线

- `pnpm exec vitest run`：64 个测试文件、253 项测试。
- `pnpm run typecheck`：通过。
- `pnpm run build`：通过，无构建 warning。
- VueFinder 包含预打包的 CodeMirror 模块，必须保持为单一 vendor chunk；禁止通过 `maxSize` 强制拆分，否则会形成循环初始化并导致打包应用启动白屏。`chunkSizeWarningLimit=850` 仅覆盖该已知 812 kB 第三方 chunk，其他更大 chunk 仍会报警。
- `cargo test --manifest-path src-tauri/Cargo.toml`：87 项 Rust 测试通过，另有 1 项真实 BiRefNet smoke test 按需运行；覆盖项目源图副本、Token/Handout/AI/i18n 配置、头像与背景几何、内置/自定义环、自定义背景 Cover/Alpha、前景 mask Alpha 合成、模型注册与下载、持久化校验缓存、单一 CoreML manifest、设备选择、惰性后端错误恢复与平台资源映射、四种编码器、HGE1 envelope、中文文件名和重名避让。

### 12.7 前景分割资源与运行时

`scripts/prepare-segmentation-resources.mjs` 依据 `--target`、`TAURI_ENV_TARGET_TRIPLE` 或 host target 下载并校验 ONNX Runtime 1.22 动态库。当前打包目标为 `aarch64-apple-darwin`、`x86_64-pc-windows-msvc`、`x86_64-unknown-linux-gnu`；未知目标在构建阶段失败。运行库缓存位于 `~/.cache/handout-generator/segmentation-resources` 并作为 Tauri resource 打包。

BiRefNet General、U²-Net 和 BEN2 不进入应用 bundle；首次选择模型时由 Rust 下载到 `~/Documents/trpg-helper/models/foreground-segmentation/<model>/<revision>/`，写入 `.partial` 后校验 SHA-256，再原子替换正式文件。完整校验成功后会写入与模型 ID、revision、SHA-256、文件大小和修改时间绑定的 `.verified.json` 侧车文件；后续启动在文件指纹未变化时直接复用校验结果，模型被替换或修改后自动重新执行完整校验。同一模型下载与首次校验由 single-flight 锁去重，失败不破坏已有缓存。`macos-vision` 使用 macOS 14+ 的 `VNGenerateForegroundInstanceMaskRequest`，不可用时自动回退 BiRefNet。

桌面端命令只接收文件路径，不通过 IPC 传 Base64 或 Tensor。Rust 再次核对 Asset ID、index 路径和 canonical Assets 根目录，拒绝伪造路径及符号链接逃逸。Windows/Linux 的 ONNX 路径先注册随包分发的 ONNX Runtime，再检测 Provider，且不执行模型基准。macOS 不再使用 ORT CoreML Execution Provider：`pnpm compile:segmentation-coreml` 将用户提供的 `.mlmodel` / `.mlpackage` 通过 `coremlcompiler` 原子持久化为模型 revision 目录下唯一的 `native-coreml/model.mlmodelc` 和 manifest；运行时由 `objc2-core-ml` 原生 `MLModel` 加载，并将 compute units 设为 All。`device = "auto"` 或 `"coreml"` 找不到匹配 model/revision/SHA-256 的单一产物时会记录具体路径并回退 CPU，不会触发 ORT 分区编译。Windows 依次尝试 CUDA/DirectML，Linux 优先 CUDA，都不可用时回退 CPU。Session pool 按 model/device/线程配置分别缓存，数量由 `worker_threads` 控制。模型缓存检查、下载进度、SHA-256 校验、设备选择、Session 加载、推理、后处理和写入阶段会同步更新右上角状态，并逐条写入 `logs/segmentation.log`。输出保留原图 RGB，Alpha 为 `原 Alpha × soft mask`；批量任务逐项隔离失败，文件和缩略图完成后仅写一次 Library index，事务失败会清理半成品。

真实模型 smoke test 默认使用 CPU，测试在系统临时目录生成输入与 `segmented-output.png`，并输出 Session、推理和后处理耗时。CoreML smoke 只会加载已经存在的单一 `mlmodelc`，不会在测试进程中转换 ONNX；缺失时明确回退 CPU。动态加载 ORT 的测试进程在 macOS 退出阶段可能触发上游 C++ 全局析构异常，因此 runner 以推理完成后写入的成功标记和可解码输出为准；常驻 Tauri 进程不会在每次分割后卸载 ORT。

---

## 附录：模块成熟度

### 前端

| 文件 | 行数 | 状态 |
|---|---|---|
| `src/App.vue` | 1252 | shell + composable 编排 |
| `src/stores/editor.ts` | 656 | facade store |
| `src/stores/editor/` (4 文件) | 840 | 子 store |
| `src/composables/` (27 个实现文件 + 9 个测试文件) | — | 完整实现 |
| `src/components/` (5 新组件) | 1060 | 完整实现 |
| `src/components/editor/RightInspector.vue` | 756 | 完整实现 |
| `src/lib/backend.ts` | 489 | 完整实现 |
| `src/lib/render/` (12 模块) | 956 | 完整实现 |
| `src/lib/handout/layer/` (9 模块) | 832 | 完整实现 |
| `src/lib/handout.test.ts` | 520 | 完整测试 |

### Rust 后端

| 文件 | 行数 | 状态 |
|---|---|---|
| `src-tauri/src/lib.rs` | 89 | 模块声明 + run() |
| `src-tauri/src/types.rs` | 86 | 完整实现 |
| `src-tauri/src/errors.rs` | 30 | 完整实现 |
| `src-tauri/src/commands/` (5 文件) | 927 | 完整实现 |
| `src-tauri/src/services/` (6 文件) | 802 | 完整实现（export_service 占位） |
| `src-tauri/src/editor/mod.rs` | 5 | 占位 |
