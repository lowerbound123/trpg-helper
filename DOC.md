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
│   ├── App.vue                   # 根组件（3714 行，应用中枢）
│   ├── style.css                 # 全局样式 + Tailwind 4 配置
│   ├── app/                      # 应用外壳、快捷键、持久化
│   ├── assets/                   # 静态资源
│   ├── components/               # Vue 组件
│   │   ├── ui/                   # shadcn-vue UI 原语（20 个组件）
│   │   ├── editor/               # 编辑器面板
│   │   ├── handout/              # 新建讲义对话框
│   │   └── settings/             # 配置对话框
│   ├── composables/              # 组合式函数
│   ├── stores/                   # Pinia 状态仓库
│   └── lib/                      # 核心业务逻辑
│       ├── backend.ts            # Tauri IPC 桥接层
│       ├── configuration.ts      # TOML 配置解析
│       ├── history.ts            # 通用命令历史
│       ├── render.ts             # Konva 离屏渲染与导出
│       ├── mask.ts               # 遮罩像素处理
│       ├── shape-rendering.ts    # 形状渲染辅助
│       ├── paint-rendering.ts    # 笔刷渲染
│       ├── layer-rendering.ts    # 图层→Konva 配置映射
│       ├── effects.ts            # 效果→Konva 滤镜映射
│       ├── snapping.ts           # 对齐辅助线计算
│       ├── selection.ts          # 选择几何判断
│       ├── handout/              # 文档模型（纯函数 reducer）
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
│       ├── lib.rs                # 核心逻辑（1472 行，38 个 IPC 命令）
│       ├── types.rs              # 类型边界（占位）
│       ├── errors.rs             # 错误边界（占位）
│       ├── commands/             # IPC 命令模块
│       ├── services/             # 服务层
│       └── editor/               # 编辑器领域模块（占位）
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
| `src/App.vue` | 根组件（3714 行）。应用状态中枢与画布编排器，详见 6.12 |
| `src/style.css` | 全局样式（1148 行）。`@import "tailwindcss"` + `@import "tw-animate-css"`；`:root` 定义 shadcn 设计令牌（HSL）；大量应用专属类（`.loading-shell`、`.manager-shell`、`.app-shell`、`.left-rail`、`.right-rail`、`.stage-frame`、`.topbar`、`.inspector-panel` 等） |

### 6.2 `src/app/` — 应用外壳与编排

| 文件 | 用途 |
|---|---|
| `AppShell.vue` | 纯 `<slot />` 包装组件（预留扩展） |
| `AppLayout.vue` | 纯 `<slot />` 包装组件（预留布局插槽） |
| `AppDialogs.vue` | 纯 `<slot />` 包装组件（预留对话框插槽） |
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

### 6.4 `src/components/editor/` — 编辑器面板

| 文件 | 用途 |
|---|---|
| `RightInspector.vue` | 右侧检视栏（755 行）。三个标签页：**Inspect**（图层属性：transform/opacity/blend/shape/brush/text/effects）、**Doc Type**（画布属性）、**Export**（嵌套 ExportPanel）。`scheduleContinuousEditEnd` 用 `continuousEditCommitDelayMs` 延迟合并历史。所有控件直接调用 `useEditorStore` 的 patch 方法 |
| `ExportPanel.vue` | 导出面板（73 行）。`defineModel` 绑定 scale/format/quality；按钮 emit `exportImage`；带进度条与日志区 |

### 6.5 `src/components/handout/` — 新建讲义对话框

| 文件 | 用途 |
|---|---|
| `CreateHandoutDialog.vue` | 81 行。两种模式：`upload-background`（拖拽/选择图片作背景并以其尺寸建画布）与 `blank`（手填宽高） |

### 6.6 `src/components/settings/` — 配置对话框

| 文件 | 用途 |
|---|---|
| `ConfigurationDialog.vue` | 330 行。编辑 `configuration.toml`。表单分组：Paths / Uploads & previews / Finder / Editor / Mask（enabled、usePixiPreview 两个 Switch）/ Export & debug。保存时序列化 TOML 并写入，提示需重启 |

### 6.7 `src/composables/` — 组合式函数

| 文件 | 用途 |
|---|---|
| `useCanvasViewport.ts` | 168 行。Konva 视口管理：`fitScale`、`canvasZoom`、`canvasPan`、`stageScale`、`fitCanvasView`、`zoomCanvas/in/out`、滚轮缩放（以鼠标为锚）、中键拖拽平移。zoom 限制 0.1–8 |
| `useEditorDragPayloads.ts` | 80 行。HTML5 拖拽 payload 统一管理：`draggedAssetId/draggedFontId/draggedShapeKind` 及各 `start*/clear*` 函数 |
| `useExportProgress.ts` | 56 行。模拟导出进度条：`beginExportProgress`（90ms 渐增到 95）、`prepareExportProgress`（等待 nextTick + RAF + setTimeout 让 UI 先绘制） |
| `useFinderManagement.ts` | 531 行。把 Pinia store 包装成 VueFinder 的 Driver 接口，使 VueFinder 能管理 backgrounds/assets/fonts/handouts 四种"虚拟存储"。路径编码：`<storage>://<folder>/__<kind>-<id>`。注入右键菜单项（Create handout / Export PNG / Clone） |
| `useHandoutExport.ts` | 222 行。导出当前文档或项目为 PNG/JPEG/WebP。`exportCurrentImage` 流程：签名去重 → `ensureDocumentImages` → `renderHandoutToBlob` → `exportImageBlobToDownloads`。带完整耗时日志 |
| `useResourceImages.ts` | 68 行。`useResourceImages(fallbackW, fallbackH)`：图片预加载与缓存管理。`previewUrl(record)` 优先 thumbnailPath，回退 fileUrl |

### 6.8 `src/stores/` — Pinia 状态仓库

| 文件 | 用途 |
|---|---|
| `editor.ts` | **核心 store**（1348 行）。setup 风格 `defineStore('editor', () => {...})`。聚合：历史记录（`createHistory(createDefaultHandout())`）、当前文档、图层选择、项目元数据、库、工具设置、遮罩编辑目标、dirty flags。详见 6.8.1 |
| `editor.test.ts` | 168 行 Vitest 测试，覆盖 commit/undo/redo、layer 增删移序、group、mask、flatten 等关键行为 |

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
| `render.ts` | 823 | **Konva 离屏渲染与导出**。`renderHandoutToBlob/renderHandoutToDataUrl/renderHandoutPreviewToDataUrl`；构造离屏 Konva.Stage；按 zIndex 渲染背景+图层；带遮罩走 `applyLayerMaskToCanvas`（Canvas2D 确定性路径，不走 Pixi）；预览在 PNG/WebP/JPEG 多档中选最小且 ≤1MB |
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
| `layer.ts` | 778 | **图层类型与操作**。`LayerType`/`ShapeKind`/`HandoutLayer`（联合：Image/Text/Shape/Paint）/`LayerGroup`；`addImageLayer/addTextLayer/addShapeLayer/addPaintLayer`；`setLayerMask/clearLayerMask/deleteLayerMask/transferLayerMask/copyLayerMask`；`removeLayer/moveLayer`；`groupForLayer/addLayerGroup/ungroupLayerGroup/moveLayerOutOfGroup`；`flattenLayersToImage` |
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

**职责**：整个应用唯一的 view-layer 编排器，承担启动加载、manager 视图、editor 视图、所有 Konva 交互、遮罩预览调度、flatten 流程。

#### script setup 结构（1–2884 行）

- **imports**（1–82）：Vue/Konva/Tauri dialog/Lucide/vuefinder；本地 UI 组件、composables、lib、store
- **类型**（84–91）：`NodeRef`/`KonvaEvent`/`SelectionBox`/`EditorTool`/`CurvePointKey`/`LayerListItem`
- **响应式状态**（93–184）：editor store；stage/transformer/maskEdit node refs；`maskedLayerImages`/`maskPreviewUrls` 等 shallowReactive 缓存；对话框开关；`activeTool`/`activeRailTab`；`draftStroke`/`selectionBox`/`multiDragState`/`guideLines`
- **composable 装配**（192–249）：`useEditorDragPayloads`/`useResourceImages`/`useHandoutExport`/`useCanvasViewport`
- **computed**（250–481）：`canvasLayers`/`visibleCanvasLayers`、`layerListItems`（含 group 扁平化）、各种 `*Signature`（watch 触发用）、`transformerConfig`、`documentFilterStyle`
- **工具函数**（483–818）：layerName/imageForLayer/maskedImageForLayer、mask 预览缓存调度（`requestIdleTask`/`scheduleMaskPreviewCache`/`generateMaskPreviewCache`）、日志
- **图层列表拖拽**（890–981）：startLayerListDrag/handleLayerListDrop/groupForLayer/toggleGroupCollapsed
- **遮罩操作**（1004–1081）：toggleSelectedLayerMask/toggleMaskEditFromLayerRow/startMaskDrag/handleMaskDrop
- **画布添加**（1083–1207）：addAssetToCanvas/addFontTextToCanvas/addShapeToCanvas/handleCanvasDrop/handleDocumentFontDrop
- **Konva 配置生成**（1209–1268）：layerConfig/textConfig/shapeConfig/paintConfig/maskedLayerConfig/maskEditConfig
- **笔刷绘制**（1327–1467）：startPaintStroke/movePaintStroke/stopPaintStroke（draftStroke 实时更新）
- **曲线编辑**（1468–1586）：curvePoint/curveHandleConfig/moveCurvePoint/endCurvePointMove
- **文字度量**（1587–1637）：autoResizeTextLayerHeights/autoTextLayerHeight
- **flatten**（1660–1860）：flattenSelectedLayers（弹 confirm → 离屏渲染 dataURL → saveProjectAsset → registerProjectAsset → flattenSelectedLayersToImage）
- **Konva 交互**（1862–2071）：onLayerDragStart/handleStagePointer/startSelectionBox/onTransform/onDragMove（含 calculateSnapGuides 实时对齐、multiDragState 多选同步）
- **Transformer 与效果缓存**（2182–2262）：updateTransformer/refreshLayerEffectCache（RAF 批处理 + 768px 上限缓存）
- **上传与创建**（2263–2448）：uploadFiles/createProject/createProjectFromBackground/createHandoutFromImageRecord/saveProject/exportSelectedHandout/cloneHandoutProject
- **预览/遮罩异步刷新**（2449–2795）：ensureProjectPreviews/refreshMaskedLayerImages/refreshMaskPreviewUrls/refreshMaskEditImage/refreshMaskedBackgroundImage/scheduleMaskCompositeRefresh（带 runId 防竞态）
- **生命周期**（2796–2884）：onMounted 并行刷新 library + projects、同步图片、注册监听、repairLibraryThumbnails、ensureProjectPreviews；14 个 watch 把签名变化映射到 transformer 更新、effect 缓存刷新、mask 合成、文字自适应

#### template 结构（2886–3714 行）

三态切换：

1. **`isBooting`** → `.loading-shell`（三点跳动动画）
2. **`editor.view === 'manager'`** → `.manager-shell`：header + Tabs（handouts/assets/fonts）+ VueFinder + CreateHandoutDialog + ConfigurationDialog
3. **editor 视图** → `<ResizablePanelGroup direction="horizontal">` 三栏：
   - **左栏（23%）**：`.left-rail` + `.brand-strip` + Tabs（assets/fonts/graph/layers）
   - **中栏（57%）**：`.workspace` → `.topbar`（Save/工具/Undo/Redo）+ `.canvas-wrap` + `.stage-frame` + `<v-stage>` → `<v-layer>` → `<v-group>`（pan/zoom）→ 背景层 + 图层节点（v-image/v-text/v-rect/v-line/v-ellipse/v-shape）+ 曲线手柄 + draftStroke + mask 编辑节点 + guideLines + selectionBox + `<v-transformer>`
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
| `src/lib.rs` | **1472 行核心**。模块声明、`AppError` 枚举、所有 serde 数据结构、路径解析、库/项目 I/O、字体元数据解析、缩略图生成、32 个 IPC 命令、`run()` 构建 Tauri 应用并注册全部 38 个命令处理器 |

#### 占位模块（staged module split，仅 doc-comment）

| 文件 | 状态 |
|---|---|
| `src/types.rs` | 占位："Shared backend type boundary" |
| `src/errors.rs` | 占位："Application error boundary" |
| `src/commands/{asset,editor,preview,project}_commands.rs` | 占位（各 1 行 doc-comment） |
| `src/services/{asset,export,preview,project}_service.rs` | 占位（各 1 行 doc-comment） |
| `src/editor/{document,history,layer,mask,migration,paint,preview,validation}.rs` | 占位（各 1 行 doc-comment） |

#### 实际逻辑模块

| 文件 | 行数 | 用途 |
|---|---|---|
| `src/commands/export_commands.rs` | 86 | 2 个导出命令：`export_image_bytes_to_downloads`（转码 inline bytes）、`export_image_file_to_downloads`（转码 staging 文件 + 删除 staging + 耗时日志） |
| `src/commands/mask_commands.rs` | 87 | 4 个遮罩/项目文件 I/O 命令：`save_project_mask`、`save_project_mask_cache`、`read_project_file_data_url`、`delete_project_mask`。均通过 `safe_project_relative_path` 防路径穿越 |
| `src/services/image_codec.rs` | 104 | 图像转码核心。`ExportImageFormat` 枚举（PNG/JPEG/WebP）；`encode_export_image(input, format, quality)`；`normalize_export_file_name`。含单元测试（验证 WebP/PNG magic bytes） |
| `src/services/path_service.rs` | 21 | `clean_file_name(file_name)`：提取文件名组件，非字母数字字符映射为 `_` |

### 7.3 `lib.rs` 关键内容

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

`App.vue` 的 computed（`canvasLayers`/`layerEffectsSignature`/`layerMaskRenderSignature`/...）是 `editor.document` 的派生视图。template 中 `<v-stage>` 的 `<v-group>` 套用 `useCanvasViewport` 的 pan/zoom；每个图层节点用 `layerConfig/textConfig/shapeConfig/paintConfig/maskedLayerConfig` 生成 Konva config。Vue-Konva 响应式应用并 `layer.draw()`。

- **带效果的图层**：`refreshLayerEffectCacheAfterUpdate` 中 `node.cache()`（768px 上限）
- **带遮罩的图层**：`watch(layerMaskRenderSignature)` → `refreshMaskedLayerImages` → `renderMaskedLayerImage` 离屏合成（Canvas2D 或 Pixi 桥）→ 结果存入 `maskedLayerImages[layer.id]` → `<v-image>` 显示

### 10.4 画布交互回写 store

拖拽/变换时 Konva 事件 → `onDragMove/onTransform/onTransformEnd`（含 `calculateSnapGuides` 实时对齐、`multiDragState` 多选同步）→ `editor.patchSelectedLayersContinuous(...)` 回写 store；改 transform 时同步移动/缩放/旋转 mask。14 个 `watch` 监听签名变化，触发 transformer 重建、effect 缓存刷新、mask 合成、文字自适应等副作用，形成闭环。

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

### 11.8 渐进式模块拆分

Rust 后端处于"staged module split"中间态：`lib.rs` 仍是 1472 行单体内核，`commands/`/`services/`/`editor/` 目录已创建但多数为占位文件，真实逻辑仅分布在 `lib.rs`、`commands/export_commands.rs`、`commands/mask_commands.rs`、`services/image_codec.rs`、`services/path_service.rs` 五个文件中。

### 11.9 未使用依赖

`rusqlite` 0.40.1 和 `anyhow` 在 `Cargo.toml` 中声明但全代码库零引用——持久化完全基于 JSON 文件 + 图像文件，无数据库。这两个依赖可安全移除。

---

## 附录：模块成熟度

| 文件 | 行数 | 状态 |
|---|---|---|
| `src/App.vue` | 3714 | 完整实现 |
| `src/stores/editor.ts` | 1348 | 完整实现 |
| `src/lib/render.ts` | 823 | 完整实现 |
| `src/lib/handout/layer.ts` | 778 | 完整实现 |
| `src/components/editor/RightInspector.vue` | 755 | 完整实现 |
| `src/composables/useFinderManagement.ts` | 531 | 完整实现 |
| `src/lib/backend.ts` | 445 | 完整实现 |
| `src/lib/handout.test.ts` | 520 | 完整测试 |
| `src-tauri/src/lib.rs` | 1472 | 完整实现（单体内核） |
| `src-tauri/src/commands/export_commands.rs` | 86 | 完整实现 |
| `src-tauri/src/commands/mask_commands.rs` | 87 | 完整实现 |
| `src-tauri/src/services/image_codec.rs` | 104 | 完整实现（含测试） |
| `src-tauri/src/services/path_service.rs` | 21 | 完整实现 |
| `src-tauri/src/{types,errors,commands/*,services/*,editor/*}.rs` | 1-2 each | 占位（staged module split） |
