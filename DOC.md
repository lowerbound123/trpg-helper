# Handout Generator — 项目文档

> 本地桌面单页讲义（handout）编辑器，基于 Tauri 2 + Vue 3 + TypeScript + Konva.js 构建。

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

---

## 1. 项目概览

**Handout Generator** 是一个本地桌面应用，用于创建、编辑、导出单页图形讲义/海报。用户通过文件浏览器管理项目、背景图、图像素材和字体，然后在画布上叠加图层（图像、文字、形状、笔刷）、应用遮罩与效果，最终导出为 PNG/JPEG/WebP。

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
| vue-sonner | ^2.0.9 | Toast 通知 |
| @vueuse/core | ^14.3.0 | Vue 组合式工具集 |
| zod | ^4.4.3 | Schema 校验 |
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
| `pnpm exec vitest run` | 运行单元测试 |

### 开发流程

- **浏览器端**：`pnpm dev` → Vite HMR（忽略 `data/`、`log.txt`、`src-tauri/target/`）
- **桌面端**：`pnpm tauri dev` → 自动执行 `pnpm dev` 启动 Vite，原生窗口加载 `http://localhost:5173`
- **生产打包**：`pnpm tauri build` → 先 `pnpm build` 构建前端，再 Tauri 打包 `dist/` 为桌面应用

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
│   ├── App.vue                   # 根组件（1020 行，shell + composable 编排）
│   ├── style.css                 # 全局样式 + Tailwind 4 配置
│   ├── app/                      # 快捷键、持久化、生命周期
│   ├── assets/                   # 静态资源
│   ├── components/               # Vue 组件
│   │   ├── ui/                   # shadcn-vue UI 原语（20 个组件）
│   │   ├── editor/               # 编辑器面板（RightInspector, ExportPanel）
│   │   ├── handout/              # 新建讲义对话框
│   │   ├── settings/             # 配置对话框
│   │   ├── BootSplash.vue        # 启动加载画面
│   │   ├── EditorTopBar.vue      # 编辑器顶栏（Save/工具/Undo/Redo）
│   │   ├── ManagerShell.vue      # 管理器视图（Handouts/Assets/Fonts 三标签）
│   │   ├── LeftRail.vue          # 编辑器左栏（Assets/Fonts/Graph/Layers 四标签）
│   │   └── CanvasWorkspace.vue   # Konva 画布工作区
│   ├── composables/              # 24 个组合式函数（详见 6.7）
│   ├── stores/                   # Pinia 状态仓库
│   │   ├── editor.ts             # facade store（656 行）
│   │   └── editor/               # 4 个子 store
│   │       ├── font-store.ts
│   │       ├── library-store.ts
│   │       ├── mask-store.ts
│   │       └── project-store.ts
│   └── lib/                      # 核心业务逻辑
│       ├── backend.ts            # Tauri IPC 桥接层
│       ├── configuration.ts      # TOML 配置解析
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
│       ├── commands/             # IPC 命令模块（4 组 + mod.rs）
│       ├── services/             # 服务层（5 模块 + mod.rs）
│       └── editor/mod.rs         # 编辑器领域占位
│
└── data/                         # 运行时数据（git 忽略）
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
```

---

## 5. 根目录配置文件

| 文件 | 用途 | 关键内容 |
|---|---|---|
| `package.json` | 项目元数据、依赖、脚本 | `type: module`；devEngines 强制 pnpm 11.8.0；脚本见第 3 节 |
| `pnpm-workspace.yaml` | pnpm 工作区配置 | `allowBuilds.vue-demi: false`；`storeDir: .pnpm-store` |
| `vite.config.ts` | Vite 构建配置 | `vue()` + `tailwindcss()` 插件；端口 5173 strictPort；`@` → `./src` 别名；忽略 `data/`、`log.txt`、`src-tauri/target/` |
| `tsconfig.json` | 根 TS 配置 | 项目引用模式，引用 `tsconfig.app.json` 与 `tsconfig.node.json`；`@/*` → `./src/*` |
| `tsconfig.app.json` | 应用 TS 配置 | 继承 `@vue/tsconfig/tsconfig.dom.json`；`types: ["vite/client"]`；严格 lint 选项 |
| `tsconfig.node.json` | Node 端 TS 配置 | `target: es2023`；bundler 模式；仅含 `vite.config.ts` |
| `components.json` | shadcn-vue CLI 配置 | `style: "new-york"`；`font: "inter"`；`iconLibrary: "lucide"`；别名映射 |
| `configuration.toml` | 应用运行时配置 | 见下表 |
| `index.html` | Vite HTML 入口 | `<div id="app">`；入口 `/src/main.ts`；favicon `/favicon.svg` |
| `.gitignore` | Git 忽略规则 | `node_modules`、`.pnpm-store`、`dist`、`data`、`src-tauri/target`、`log.txt` 等 |
| `.vscode/extensions.json` | 推荐 VS Code 扩展 | `Vue.volar` |

### `configuration.toml` 配置项

| 段 | 键 | 默认值 | 说明 |
|---|---|---|---|
| `[paths]` | `data_dir` | `./data` | 数据目录 |
| | `log_file` | `./log.txt` | 日志文件 |
| `[uploads]` | `max_file_size` | `100mb` | 上传文件大小上限 |
| `[previews]` | `thumbnail_max_edge_px` | `256` | 缩略图最大边长 |
| | `thumbnail_quality` | `80` | 缩略图质量 |
| | `target_max_bytes` | `524288` | 预览目标大小上限（512KB） |
| `[finder]` | `manager_height_px` | `360` | 管理器高度 |
| | `compact_height_px` | `300` | 紧凑模式高度 |
| | `handout_grid_scale` | `2` | 讲义网格缩放 |
| | `background_grid_scale` | `2` | 背景网格缩放 |
| `[editor]` | `snap_threshold_screen_px` | `5` | 对齐阈值（屏幕像素） |
| | `max_snap_candidates` | `24` | 最大对齐候选数 |
| | `continuous_edit_commit_delay_ms` | `450` | 连续编辑合并延迟 |
| `[mask]` | `enabled` | `true` | 遮罩总开关 |
| | `use_pixi_preview` | `true` | 使用 PixiJS 预览合成 |
| `[export]` | `default_scale` | `1` | 默认导出缩放 |
| | `min_scale` | `0.1` | 最小导出缩放 |
| `[debug]` | `file_log_enabled` | `true` | 文件日志开关 |
| | `render_perf_log_enabled` | `true` | 渲染性能日志开关 |

> `configuration.toml` 可被 localStorage（key: `handout-generator.configuration.toml`）覆盖，实现运行时配置覆盖而无需改源文件。

---

## 6. 前端源码（src/）

### 6.1 入口文件

| 文件 | 用途 |
|---|---|
| `src/main.ts` | 应用启动入口。`createApp(App).use(createPinia()).use(VueKonva).use(VueFinderPlugin, { locale: 'zhCN' }).mount('#app')` |
| `src/App.vue` | 根组件（1020 行）。shell + composable 编排器，详见 6.12 |
| `src/style.css` | 全局样式（1148 行）。`@import "tailwindcss"` + `@import "tw-animate-css"`；`:root` 定义 shadcn 设计令牌（HSL）；大量应用专属类（`.loading-shell`、`.manager-shell`、`.app-shell`、`.left-rail`、`.right-rail`、`.stage-frame`、`.topbar`、`.inspector-panel` 等） |

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
| `switch` | `Switch.vue` | 开关（被 ConfigurationDialog 使用） |
| `tabs` | 4 文件 | 标签页族 |
| `textarea` | `Textarea.vue` | 多行输入 |
| `tooltip` | 4 文件 | 工具提示族 |

### 6.4 `src/components/` — 应用组件

#### 6.4.1 编辑器面板（`editor/`）

| 文件 | 用途 |
|---|---|
| `RightInspector.vue` | 右侧检视栏（755 行）。三个标签页：**Inspect**（图层属性：transform/opacity/blend/shape/brush/text/effects）、**Doc Type**（画布属性）、**Export**（嵌套 ExportPanel）。`scheduleContinuousEditEnd` 用 `continuousEditCommitDelayMs` 延迟合并历史。所有控件直接调用 `useEditorStore` 的 patch 方法 |
| `ExportPanel.vue` | 导出面板（73 行）。`defineModel` 绑定 scale/format/quality；按钮 emit `exportImage`；带进度条与日志区 |

#### 6.4.2 新建讲义对话框（`handout/`）

| 文件 | 用途 |
|---|---|
| `CreateHandoutDialog.vue` | 81 行。两种模式：`upload-background`（拖拽/选择图片作背景并以其尺寸建画布）与 `blank`（手填宽高） |

#### 6.4.3 配置对话框（`settings/`）

| 文件 | 用途 |
|---|---|
| `ConfigurationDialog.vue` | 330 行。编辑 `configuration.toml`。表单分组：Paths / Uploads & previews / Finder / Editor / Mask / Export & debug。保存时序列化 TOML 并写入，提示需重启 |

#### 6.4.4 应用骨架组件（根目录）

| 文件 | 行数 | 用途 |
|---|---|---|
| `BootSplash.vue` | 11 | 启动加载画面（三点跳动动画 + "Handout Generator" 标题） |
| `EditorTopBar.vue` | 57 | 编辑器顶栏：Save 按钮 + 工具切换（Select/Brush/Eraser）+ Undo/Redo。Props: `activeTool`/`canUndo`/`canRedo`；Emits: `save`/`set-tool`/`undo`/`redo` |
| `ManagerShell.vue` | 206 | 管理器视图：三标签页（Handouts/Assets/Fonts）+ VueFinder 实例 + Create/Clone/Export 操作 + CreateHandoutDialog + ConfigurationDialog。通过 `inject('manager-context')` 获取 33 个共享值 |
| `LeftRail.vue` | 398 | 编辑器左栏：四标签页（Assets/Fonts/Graph/Layers）+ VueFinder + 搜索 + 可拖拽素材/字体列表 + SVG 形状预览 + 图层/分组列表（拖拽排序、mask 预览、可见性切换、Merge/Flat/Move/Delete）。通过 `inject('left-rail-context')` 获取 57 个共享值 |
| `CanvasWorkspace.vue` | 388 | Konva 画布工作区：`<v-stage>` 含背景层 + 所有图层节点分支（masked image/raw image/text/rect/line/ellipse/curve/line group/paint）+ 曲线编辑手柄 + draftStroke + mask 编辑代理 + snap guideLines + marquee selectionBox + Transformer。通过 `inject('canvas-context')` 获取 65+ 共享值含 Konva refs |

### 6.7 `src/composables/` — 组合式函数（24 个）

#### 原有 composables（6 个）

| 文件 | 行数 | 用途 |
|---|---|---|
| `useCanvasViewport.ts` | 168 | Konva 视口管理：`fitScale`/`canvasZoom`/`canvasPan`/`stageScale`/`fitCanvasView`/`zoomCanvas in/out`、滚轮缩放（以鼠标为锚）、中键拖拽平移。zoom 限制 0.1–8 |
| `useEditorDragPayloads.ts` | 80 | HTML5 拖拽 payload 统一管理：`draggedAssetId`/`draggedFontId`/`draggedShapeKind` 及各 `start*/clear*` 函数 |
| `useExportProgress.ts` | 56 | 模拟导出进度条：`beginExportProgress`（90ms 渐增到 95）、`prepareExportProgress`（等待 nextTick + RAF + setTimeout 让 UI 先绘制） |
| `useFinderManagement.ts` | 531 | 把 Pinia store 包装成 VueFinder 的 Driver 接口，使 VueFinder 能管理 backgrounds/assets/fonts/handouts 四种"虚拟存储"。路径编码：`<storage>://<folder>/__<kind>-<id>`。注入右键菜单项 |
| `useHandoutExport.ts` | 222 | 导出当前文档或项目为 PNG/JPEG/WebP。`exportCurrentImage` 流程：签名去重 → `ensureDocumentImages` → `renderHandoutToBlob` → `exportImageBlobToDownloads` |
| `useResourceImages.ts` | 68 | 图片预加载与缓存管理。`previewUrl(record)` 优先 thumbnailPath，回退 fileUrl |

#### 从 App.vue 抽取的 composables（18 个）

| 文件 | 行数 | 用途 |
|---|---|---|
| `useMaskPreviewCache.ts` | 204 | idle-task mask 预览缓存队列：downsample/save/load cache data URL，`requestIdleTask`/`waitForIdleTask` |
| `useMaskComposition.ts` | 362 | mask 合成/刷新：`refreshMaskedLayerImages`/`refreshMaskPreviewUrls`/`refreshMaskEditImage`/`refreshMaskedBackgroundImage`/`scheduleMaskCompositeRefresh`（带 runId 防竞态） |
| `useLayerEffectCache.ts` | 99 | Konva 节点缓存：`refreshLayerEffectCache`（768px 上限）、RAF 批处理 `scheduleLayerEffectCacheRefresh`、签名 diff `changedEffectLayerIds` |
| `usePaintStrokes.ts` | 172 | 画笔/橡皮擦：`activePaintDefaults`/`localizeStrokePoints`/`maskLocalPoint`/`startPaintStroke`/`movePaintStroke`/`stopPaintStroke`（draftStroke 实时更新） |
| `useCurveEditing.ts` | 155 | 曲线手柄编辑：`curvePointKeys`/`curveHandleConfig`/`curveGuideConfig`/`moveCurvePoint`/`endCurvePointMove`/`normalizeCurveLayerPatch` |
| `useLayerDragTransform.ts` | 319 | 拖拽/变换/吸附：`onLayerDragStart`/`onDragMove`（含 `calculateSnapGuides` 实时对齐、`multiDragState` 多选同步）/`onTransformEnd`/`onDragEnd`/`ellipseDragSnapshot` |
| `useSelectionBox.ts` | 111 | 框选：`handleStagePointer`/`startSelectionBox`/`moveSelectionBox`/`stopSelectionBox`/`containsSelection`，含 `suppressNextStageClick` 防抖 |
| `useFlattenLayers.ts` | 194 | 图层合并：`layerOuterBounds`/`selectedLayerBounds`/`flattenDocumentForSelectedLayers`/`flattenSelectedLayers`（弹 confirm → 离屏渲染 → saveProjectAsset → replace） |
| `useProjectPreviews.ts` | 74 | 项目预览维护：`ensureProjectPreviews`（后台生成缺失/过期 webp 预览） |
| `useProjectCreation.ts` | 99 | 项目创建：`createProject`/`createProjectFromBackground`/`createHandoutFromImageRecord`/`saveProject`/`cloneHandoutProject`，含对话框状态 |
| `useFinderSelection.ts` | 171 | finder 选择/上传：`uploadFiles`/`handleDirectFinderDrop`/`selectedImageRecord`/`selectedHandoutProject`/`exportSelectedHandout`/`handleCreateBackgroundInput` |
| `useCanvasDrop.ts` | 128 | 画布拖放：`handleCanvasDrop`（font/shape/asset 分派）/`handleCanvasDragOver`/`handleDocumentFontDragOver`/`handleDocumentFontDrop`/`pointInsideStageFrame` |
| `useTextLayerAutoResize.ts` | 79 | 文本高度自适应：`autoResizeTextLayerHeights`/`autoTextLayerHeight`/`textLineCount`/`logTextLayerMetrics` |
| `useLayerRenderConfigs.ts` | 233 | Konva 配置构建：`layerConfig`/`textConfig`/`shapeConfig`/`paintConfig`/`maskedLayerConfig`/`layerPreviewStyle`/`layerPreviewText`/`canvasLayerRenderInfo` |
| `useRenderSignatures.ts` | 290 | 24 个 computed 渲染签名：`canvasLayers`/`visibleCanvasLayers`/`layerListItems`/各种 `*Signature`（watch 触发用）/`transformerConfig`/`documentFilterStyle`/`backgroundAsset`/`backgroundImage` |
| `useMaskActions.ts` | 195 | mask 操作：`toggleSelectedLayerMask`/`toggleMaskEditFromLayerRow`/`toggleMaskEnabledFromLayerRow`/`startMaskDrag`/`handleMaskDrop`/`maskEditConfig`/`onMaskEditDragStart`/`onMaskEditDragEnd`/`onMaskEditTransformEnd`/`maskPreviewClass` |
| `useLayerListDragDrop.ts` | 152 | 图层列表拖拽：`startLayerListDrag`/`handleLayerListDrop`/`handleGroupDrop`/`groupForLayer`/`layersForGroup`/`groupIsCollapsed`/`toggleGroupCollapsed`/`selectLayerFromList`/`toggleLayerVisibility` |
| `useTransformerSync.ts` | 40 | Transformer 同步：`updateTransformer`（同步 Konva Transformer 节点到当前选择，mask-edit 模式附加 maskNode） |

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
| `backend.ts` | 445 | Tauri IPC 桥接层。`isTauriRuntime()` 检测；非 Tauri 时浏览器回退。导出所有 IPC 调用函数（library/project/mask/asset/export/configuration/debug） |
| `configuration.ts` | 239 | TOML 配置解析。从 `configuration.toml?raw` 内联默认配置，支持 localStorage 覆盖。导出 `AppConfiguration` 类型与 `appConfiguration` 实例 |
| `history.ts` | 61 | 通用命令历史。`createHistory<T>(initial, maxSteps=100)`：`past/present/future` 三栈，`commit(mutator, {merge})`、`replace(next)`、`undo/redo` |
| `mask.ts` | 229 | 遮罩像素处理。`createSolidMaskDataUrl`、`drawMaskStroke`、`applyGrayMaskToCanvas`、坐标互转（图层↔文档、遮罩↔文档）、`createLayerLocalMaskCanvas`、`applyLayerMaskToCanvas`（destination-in 合成） |
| `render/` | 899 行（12 模块） | **Konva 离屏渲染与导出**（从原 `render.ts` 823 行拆分）。`index.ts` barrel 导出；`stage.ts` 构造离屏 Konva.Stage；`preview.ts` `renderHandoutPreviewToDataUrl`（≤1MB 预览）；`mask-composition.ts` `renderMaskedLayerImage`（Canvas2D/Pixi 合成）；`nodes/` 按类型生成 Konva 节点（image/text/shape/paint）；`image-loading.ts` 图片预加载 |
| `handout/layer/` | 832 行（9 模块） | **图层类型与操作**（从原 `layer.ts` 778 行拆分）。`index.ts` barrel 导出；`types.ts` 类型定义；`factories.ts` `addImageLayer`/`addTextLayer`/`addShapeLayer`/`addPaintLayer`；`mask.ts` `setLayerMask`/`clearLayerMask`/`transferLayerMask`/`copyLayerMask`；`group.ts` 分组操作；`ordering.ts` 排序；`delete.ts` 删除；`update.ts` 更新 |
| `shape-rendering.ts` | 243 | 形状渲染辅助。`shapeKonvaConfig`（按 ShapeKind 生成 Konva 配置）、`curveSceneFunc`（Bezier 自定义 sceneFunc）、`polygonPoints`（diamond/hexagon 顶点）、`lineDash`、`arrowDotConfig/arrowLineConfig`（自定义箭头） |
| `paint-rendering.ts` | 180 | 笔刷渲染。`brushDefaults`（pixel/pencil/marker/highlighter/airbrush 五种预设）；`paintCanvasCache` 用 stroke 签名做增量缓存——只重画新增 stroke |
| `layer-rendering.ts` | 53 | 图层→Konva 配置映射。`layerKonvaConfig`（id/x/y/w/h/scale/rotation/opacity/visible/draggable/blendMode）、`textKonvaConfig`（加 text/font/fontStyle/fill/align 等） |
| `effects.ts` | 47 | 效果→Konva 滤镜映射。`hasVisibleEffects`、`konvaEffectConfig`（filters 数组来自 Blur/Brighten/Contrast/HSL） |
| `snapping.ts` | 132 | 对齐辅助线计算。`calculateSnapGuides(input)`：屏幕阈值换算到画布阈值；canvas 的 0/中/边三条 + 候选图层的左/中/右三条；返回 `nextPosition` 与 `lines` |
| `selection.ts` | 13 | `RectBounds` 类型与 `containsRect(container, item)` 几何包含判断 |
| `shape-items.ts` | 13 | `shapeItems` 数组：9 种 ShapeKind（line/quadratic-curve/cubic-bezier/rect/round-rect/ellipse/diamond/hexagon-h/hexagon-v）的 label/detail |
| `export-options.ts` | 18 | `ExportFormat`、`exportMimeType/exportExtension/exportQualityValue` |
| `upload-validation.ts` | 31 | `isSupportedUpload`（按 MIME 或扩展名判断图片/字体）、`partitionUploadFiles` |
| `font-preview.ts` | 71 | `generateFontPreviewDataUrl(font)`：通过像素差异比较判断中文字形支持 → 256×144 WebP/PNG dataURL |
| `debug-log.ts` | 34 | `writeDebugLog`、`createDebugLogger(scope)`，按配置过滤高频事件 |
| `dom.ts` | 5 | `isEditableTarget(target)` 判断事件目标是否在 input/textarea/contenteditable 内 |
| `utils.ts` | 7 | `cn(...inputs)` = `twMerge(clsx(inputs))`，shadcn-vue 标准类合并工具 |

#### 6.9.2 `src/lib/handout/` — 文档模型（纯函数 reducer 风格）

| 文件 | 行数 | 用途 |
|---|---|---|
| `index.ts` | — | barrel 导出 |
| `document.ts` | 111 | `HandoutDocument`/`CanvasSettings` 接口；`createDefaultHandout(title)`（1280×720，透明背景）；`updateCanvas`；`setBackgroundMask/clearBackgroundMask/deleteBackgroundMask` |
| `layer/` | 832 行（9 模块） | **图层类型与操作**（从原 `layer.ts` 778 行拆分）。`index.ts` barrel；`types.ts` 类型；`factories.ts` 各 `add*Layer`；`mask.ts` mask 操作；`group.ts` 分组；`ordering.ts` 排序；`delete.ts`/`update.ts`；`shared.ts` 共享工具 |
| `mask.ts` | 118 | `LayerMask`/`MaskCacheMeta` 类型；`createCanvasLayerMask`（按画布尺寸创建）；`normalizeMask`/`normalizeMaskCache` |
| `paint.ts` | 51 | `PaintMode`/`BrushKind`/`StrokePoint`/`PaintStroke`；`normalizePaintStroke`；`pointsToStrokePoints/strokePointsToFlat`（扁平坐标 ↔ StrokePoint[] 互转） |
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
| `configuration.test.ts` | 44 行，TOML 解析/序列化/往返一致性 |
| `snapping.test.ts` | 90 行，对齐计算 |
| `selection.test.ts` | 14 行，几何包含判断 |
| `upload-validation.test.ts` | 19 行，上传校验 |
| `handout.test.ts` | 520 行，document/layer/mask/paint/migration/history 与 render 工具函数 |

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

**职责**：应用 shell + composable 编排器。管理三态切换（boot/manager/editor）、提供 3 个 provide 上下文给子组件、装配 18 个 composable、注册全局监听与 watcher。

#### script setup 结构（1–850 行）

- **imports**（1–55）：Vue/Konva/Tauri；4 个子组件、24 个 composable、lib、store
- **类型**（57–59）：`NodeRef`/`KonvaEvent`/`EditorTool`
- **响应式状态**（61–100）：editor store；stage/transformer/maskEdit node refs；`maskedLayerImages`/`maskPreviewUrls`/`maskEditImage`（传给 C2/C17）；`isDraggingMask`/`draggedMaskLayerId`（传给 C11）；对话框开关；`activeTool`/`activeRailTab`；`isBooting`；finder 选择/revision
- **composable 装配**（102–580）：按依赖序调用 18 个 composable，用 holder 模式打破循环依赖（`maskCompositionRefreshHolder`/`projectCreationHolder`/`finderSelectionHolder`/`layerListHolder`）
- **provide 注入**（520–580）：`manager-context`（33 值）、`left-rail-context`（57 值）、`canvas-context`（65+ 值含 Konva refs）
- **handleGlobalKeydown**（582–595）：`createAppShortcutHandler` 绑定快捷键
- **辅助函数**（597–850）：`resetKonvaDragButtons`/`fontFamily`/`logViewport`/`roundMetric`/`backgroundRenderMetrics`/`logBackgroundRender`/`setActiveTool`/`fitEditorCanvas`/`selectCanvasLayer`/`deleteLayer`/`toggleBackgroundVisibility`/`addAssetToCanvas`/`addFontTextToCanvas`/`createFontTextOnCanvas`/`addShapeToCanvas`
- **生命周期**（800–840）：onMounted 并行刷新 library + projects、同步图片、注册监听、ensureProjectPreviews；onBeforeUnmount 移除监听、cleanup
- **watch**（840–870）：14 个 watch 把签名变化映射到 transformer 更新、effect 缓存刷新、mask 合成、文字自适应

#### template 结构（852–1020 行）

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
| `capabilities/default.json` | Tauri 权限：`core:default` + `dialog:allow-confirm` + `fs:allow-app-write-recursive` |

### 7.2 源码文件

#### 入口

| 文件 | 用途 |
|---|---|
| `src/main.rs` | 6 行。二进制入口，release 模式隐藏 Windows 控制台，调用 `app_lib::run()` |
| `src/lib.rs` | 89 行。模块声明 + `run()` 构建 Tauri 应用并注册全部 38 个命令处理器 |

#### 模块结构（staged module split 已完成）

| 文件 | 行数 | 用途 |
|---|---|---|
| `src/types.rs` | 86 | 共享数据结构：`LibraryRecord`/`LibraryIndex`/`ImportResult`/`ProjectPayload`/`ProjectSummary`/`ProjectFolderIndex`/`DeleteEntries` |
| `src/errors.rs` | 30 | `AppError` 枚举 + `CommandResult<T>` 别名 |
| `src/commands/mod.rs` | 5 | 模块声明 |
| `src/commands/asset_commands.rs` | 311 | 15 个库/config 命令 |
| `src/commands/project_commands.rs` | 324 | 13 个项目命令 |
| `src/commands/preview_commands.rs` | 68 | `save_project_preview` + `save_project_asset` |
| `src/commands/export_commands.rs` | 132 | 2 个导出命令：`export_image_bytes_to_downloads`/`export_image_file_to_downloads` |
| `src/commands/mask_commands.rs` | 87 | 4 个遮罩/项目文件 I/O 命令 |
| `src/services/mod.rs` | 5 | 模块声明 |
| `src/services/path_service.rs` | 182 | 路径/文件夹/fs/data-url/debug log |
| `src/services/preview_service.rs` | 56 | 缩略图/预览编码 |
| `src/services/project_service.rs` | 144 | 项目文件 I/O + folder index |
| `src/services/asset_service.rs` | 311 | 库 I/O + 字体解析 + import pipeline |
| `src/services/image_codec.rs` | 104 | 图像转码核心（PNG/JPEG/WebP） |
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

- `app_root(app)` → `<project_root>/data`
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

#### 导出管线（`services/image_codec.rs`）

`encode_export_image(input, format, quality)`：
- **PNG** — `image.write_to(cursor, Png)`（无损）
- **JPEG** — `to_rgb8()` + `JpegEncoder::new_with_quality`（quality 1-100，默认 90；丢弃 alpha）
- **WebP** — `to_rgba8()` + `webp::Encoder::from_rgba`（quality 1-100，默认 90）

---

## 8. 运行时数据（data/）

> 整个 `data/` 目录由 Tauri 后端管理，已通过 `.gitignore` 排除版本控制。

```
data/
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

**根目录运行时文件**：
- `log.txt` — 调试日志（启动时清空，由 `append_debug_log` 追加）
- `configuration.toml` — 应用配置（由 `read/write_configuration` 读写）

---

## 9. IPC API 全景

后端共暴露 **38 个 Tauri 命令**，全部返回 `Result<T, String>`。前端通过 `@tauri-apps/api` 的 `invoke("command_name", { args })` 调用。

### 库管理（10）

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

### 导出（4）

| 命令 | 用途 |
|---|---|
| `export_image` | 导出图像到指定路径 |
| `export_image_to_downloads` | 导出图像到下载目录（原样写入） |
| `export_image_bytes_to_downloads` | 转码 inline bytes 后导出到下载目录 |
| `export_image_file_to_downloads` | 转码 staging 文件后导出到下载目录（删除 staging） |

### 预览（2）

| 命令 | 用途 |
|---|---|
| `save_project_preview` | 保存项目预览（重新编码为 WebP） |
| `save_font_preview` | 保存字体预览 |

### 通用（4）

| 命令 | 用途 |
|---|---|
| `read_file_data_url` | 读取任意文件为 data URL |
| `append_debug_log` | 追加调试日志 |
| `read_configuration` | 读取 configuration.toml |
| `write_configuration` | 写入 configuration.toml |

### 通信机制

- **IPC**：Tauri 2 `invoke` 协议，JSON 参数/返回值，所有结构体 `camelCase` 序列化
- **Asset 协议**：`asset://`（`http://asset.localhost/`）直接加载磁盘图片，scope 限定 `data/**/*`
- **大数据传输**：小图走 IPC base64 data URL；大导出走 **staging 文件模式**（前端写 staging → Rust 读+转码+写 Downloads+删 staging）

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
- **带遮罩的图层**：`watch(layerMaskRenderSignature)` → `useMaskComposition`（C2）的 `refreshMaskedLayerImages` → `renderMaskedLayerImage` 离屏合成 → 结果存入 `maskedLayerImages[layer.id]` → `<v-image>` 显示

### 10.4 画布交互回写 store

拖拽/变换时 Konva 事件 → `useLayerDragTransform`（C6）的 `onDragMove`/`onTransform`/`onTransformEnd`（含 `calculateSnapGuides` 实时对齐、`multiDragState` 多选同步）→ `editor.patchSelectedLayersContinuous(...)` 回写 store；改 transform 时同步移动/缩放/旋转 mask。App.vue 的 14 个 `watch` 监听签名变化，触发 transformer 重建、effect 缓存刷新、mask 合成、文字自适应等副作用，形成闭环。

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
Export 标签 → exportImage emit → exportCurrentImage()
  ├─ prepareExportProgress()    → 进度条先动
  ├─ 签名去重（相同文档+参数不重复导出）
  ├─ ensureDocumentImages()
  ├─ renderHandoutToBlob(document, library, scale, imageElements, mimeType, quality, {maskDataUrls, projectTarget, masksEnabled})
  │   ├─ 构造离屏 Konva.Stage
  │   ├─ 按 zIndex 渲染背景 + 所有可见图层
  │   ├─ 带遮罩走 applyLayerMaskToCanvas（Canvas2D 确定性路径，不走 Pixi）
  │   └─ stage.toCanvas → canvas.toBlob
  └─ exportImageBlobToDownloads()
      ├─ Tauri: 暂存 AppLocalData → invoke('export_image_file_to_downloads') → 写 Downloads + 删 staging
      └─ 浏览器: <a download>
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

### 11.6 Staging 文件模式（大导出）

前端写 staging 文件 → Rust 读 + 转码 + 写 Downloads + 删 staging，避免巨大 base64 payload 通过 IPC。

### 11.7 路径安全

`safe_project_relative_path` 拒绝绝对路径和 `..` 段；`clean_file_name` 清洗所有用户输入文件名，防止路径穿越和非法字符。

### 11.8 四阶段代码拆解

项目经历四阶段结构性重构，将高耦合大文件分解为模块化架构：

1. **Rust 后端**（`lib.rs` 1472→89 行）：拆分为 `types.rs`/`errors.rs` + `commands/`（4 组）+ `services/`（5 模块）
2. **渲染与图层模块**（`render.ts` 823 行 → `render/` 12 模块；`layer.ts` 778 行 → `layer/` 9 模块）：barrel 导出保持 API 不变
3. **Editor store**（`editor.ts` 1348→656+840 行）：facade + 4 子 store（font/library/mask/project），工厂函数 + 依赖注入
4. **App.vue**（3714→1020 行）：18 个 composable + 5 个子组件，provide/inject 共享上下文

所有阶段均保持 38 个测试全通过、typecheck 清洁、生产构建成功。消费者代码零改动。

### 11.9 未使用依赖

`rusqlite` 0.40.1 和 `anyhow` 在 `Cargo.toml` 中声明但全代码库零引用——持久化完全基于 JSON 文件 + 图像文件，无数据库。这两个依赖可安全移除。

---

## 附录：模块成熟度

### 前端

| 文件 | 行数 | 状态 |
|---|---|---|
| `src/App.vue` | 1020 | shell + composable 编排 |
| `src/stores/editor.ts` | 656 | facade store |
| `src/stores/editor/` (4 文件) | 840 | 子 store |
| `src/composables/` (24 文件) | 4202 | 完整实现 |
| `src/components/` (5 新组件) | 1060 | 完整实现 |
| `src/components/editor/RightInspector.vue` | 755 | 完整实现 |
| `src/lib/backend.ts` | 445 | 完整实现 |
| `src/lib/render/` (12 模块) | 899 | 完整实现 |
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
