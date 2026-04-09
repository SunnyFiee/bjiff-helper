# BJIFF 排片助手

基于 `React + Vite + Tauri + Rust + SQLite` 的北影节个人排片桌面应用。

当前版本：`v1.0`

它的目标不是做票务平台，而是把“导入排片、补充影片资料、筛场次、看冲突、生成片单、导出日程”这一套个人选片流程闭环起来。

## 当前能力

- 支持从 Excel 导入北影节排片，并写入本地 SQLite。
- 内置样本数据，可在未导入时直接预演界面。
- 支持总览、偏好与约束、场次浏览、时间轴、我的片单五个主页面。
- 支持影片资料补充，已内置一份从表格提取的影片元数据。
- 支持豆瓣相关操作：
  - 打开豆瓣搜索页
  - 手动绑定豆瓣条目
  - 打开已绑定的豆瓣条目
- 支持基于预算、日期、缓冲时间、价格上限等规则生成推荐草案。
- 支持在时间轴中手动选片，并查看：
  - 当前片单冲突
  - 同片其他场次
  - 附近相关场次
  - 影片资料与评分
- 支持保存片单到本地数据库，并导出 `CSV` / `ICS`。
- 桌面端当前使用原生装饰窗体，优先保证 macOS 上的圆角、拖拽和缩放稳定性。

## 当前界面特性

- `总览`：展示数据摘要、排片热度、推荐摘要、影片资料覆盖率和最近保存片单。
- `场次浏览`：关键词搜索改为手动触发，避免输入时即时筛选卡顿。
- `场次浏览`：影片卡片区域已改为接近瀑布流的列式布局，减少高卡片造成的大块空白。
- `时间轴`：
  - 场次卡片高度按真实时长显示
  - 左侧时间轴为固定视窗高度，内部滚动
  - 轨道语义已固定为“当前片单 -> 已优先 -> 普通 -> 已屏蔽”
  - 分轨已按实际渲染高度避让，减少上下重叠影响分析

## 技术栈

- 前端：`React 18`、`TypeScript`、`Vite`
- UI：`Material UI`
- 桌面端：`Tauri 2`
- Rust 侧能力：
  - Excel 解析
  - SQLite 持久化
  - 片单保存与导出
  - 原生文件选择器
  - 打开外部链接
- 本地存储：`SQLite`

## 目录结构

- [src/App.tsx](/Users/sunnyfiee/CODE/CODE_TAURI/bjiff-helper/src/App.tsx)：主应用壳与页面切换
- [src/components](/Users/sunnyfiee/CODE/CODE_TAURI/bjiff-helper/src/components)：总览、场次浏览、时间轴、片单等页面组件
- [src/lib](/Users/sunnyfiee/CODE/CODE_TAURI/bjiff-helper/src/lib)：推荐、导出、桌面端调用、格式化、数据源合并
- [src/data/bjiff-schedule.json](/Users/sunnyfiee/CODE/CODE_TAURI/bjiff-helper/src/data/bjiff-schedule.json)：内置排片样本数据
- [src/data/bjiff-film-metadata.json](/Users/sunnyfiee/CODE/CODE_TAURI/bjiff-helper/src/data/bjiff-film-metadata.json)：内置影片补充资料
- [scripts/extract_schedule.py](/Users/sunnyfiee/CODE/CODE_TAURI/bjiff-helper/scripts/extract_schedule.py)：排片提取脚本
- [scripts/extract_film_metadata.py](/Users/sunnyfiee/CODE/CODE_TAURI/bjiff-helper/scripts/extract_film_metadata.py)：影片资料提取脚本
- [src-tauri/src/main.rs](/Users/sunnyfiee/CODE/CODE_TAURI/bjiff-helper/src-tauri/src/main.rs)：Tauri Rust 命令与本地存储逻辑
- [docs/BJIFF-排片助手实施进展.md](/Users/sunnyfiee/CODE/CODE_TAURI/bjiff-helper/docs/BJIFF-排片助手实施进展.md)：实施进展
- [docs/BJIFF-排片助手-v1-规划.md](/Users/sunnyfiee/CODE/CODE_TAURI/bjiff-helper/docs/BJIFF-排片助手-v1-规划.md)：原始规划与现状注记

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 浏览器预演模式

```bash
npm run dev
```

说明：

- 这是纯前端预演模式。
- 可浏览内置样本数据。
- 桌面端原生命令会自动回退到浏览器逻辑。

### 3. Tauri 桌面开发模式

先确保本机具备：

- Node.js
- Rust / Cargo
- Xcode Command Line Tools

然后运行：

```bash
npm run tauri dev
```

## 数据脚本

### 重新提取排片数据

```bash
npm run extract:schedule
```

### 重新提取影片资料

```bash
npm run extract:metadata
```

说明：

- 排片与影片资料目前是两条独立提取链路。
- 前端加载时会自动把影片资料合并进排片数据。

## 构建与打包

### 前端生产构建

```bash
npm run build
```

产物在：

- [dist](/Users/sunnyfiee/CODE/CODE_TAURI/bjiff-helper/dist)

### 打包桌面应用

推荐先打 `.app`：

```bash
npm run tauri build -- --bundles app
```

产物通常在：

- [src-tauri/target/release/bundle/macos](/Users/sunnyfiee/CODE/CODE_TAURI/bjiff-helper/src-tauri/target/release/bundle/macos)

如果只想做一次调试构建验证：

```bash
npm run tauri build -- --debug --bundles app
```

## 当前已验证

截至 2026-04-09，本仓库当前已验证：

- `npm run build` 通过
- `npm run tauri build -- --debug --bundles app` 通过

说明：

- 完整 `all` bundle 在某些本地环境下可能卡在 `dmg` 打包脚本；
- 当前 `.app` 产物路径与桌面端主流程已验证可产出。

## 已知问题

- 前端打包后主包体积仍超过 Vite 的 `500 kB` 警戒线。
- `dmg` 打包链路仍需要单独继续整理。
- 推荐、筛选、导入等关键流程还缺少自动化测试。

## 后续重点

- 继续优化时间轴分析能力，尤其是冲突解释和替换效率。
- 继续降低前端包体积。
- 补充导入、推荐、导出相关回归测试。
- 继续完善历史片单的恢复、重用和二次编辑能力。
