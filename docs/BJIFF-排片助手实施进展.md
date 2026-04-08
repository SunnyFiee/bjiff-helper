# BJIFF 排片助手实施进展

## 当前完成情况

- 已建立 `React + Vite + Tauri` 工程骨架。
- 已完成首页总览、场次浏览、偏好设置、时间轴排片、我的片单等首版界面。
- 已完成基于 `Material UI` 的界面重构，PC 端现已使用左侧功能侧边栏承载导航、导入与高频操作。
- 已从 Excel 源文件生成前端样本数据 `src/data/bjiff-schedule.json`。
- 已通过前端生产构建与 Tauri Rust 编译检查。

## 本轮新增

- Tauri 端 `load_dataset` 已支持优先读取本地 SQLite 缓存数据，未导入时再回退到内置样本数据。
- `import_schedule` 已替换为真实 Excel 解析流程，按 `北京展映` sheet 读取 A-J 列并生成标准化数据集。
- 已加入本地 SQLite 存储，用于保存：
  - 导入后的排片数据集
  - 用户偏好配置
  - 已保存片单
- `list_screenings` 已支持基于本地缓存数据做搜索和筛选。
- `generate_recommendations` 已支持基于偏好约束生成 Rust 侧推荐结果。
- `save_itinerary` 与 `export_itinerary` 已支持本地保存片单，并导出 `.csv` / `.ics` 文件。
- 前端已抽出桌面端命令调用层，`load_dataset`、`import_schedule`、`save_preferences`、`save_itinerary`、`export_itinerary` 都已有对应调用封装。
- 前端状态持久化已优先走 Tauri 命令，桌面端会把 `profile`、`selections`、`activeSection` 写入本地数据库；浏览器预演模式仍保留 `localStorage` 回退。
- 总览页已增加 Excel 路径导入入口与状态提示。
- 片单页已增加“保存片单”按钮，并在桌面端走真实保存与导出流程。
- 已补充 macOS 原生文件选择器命令，桌面端可直接选择 Excel 文件而不必手输路径。
- 首页已增加“最近保存片单”摘要，能读取本地数据库中最近保存的片单记录。
- 已补充“恢复默认偏好”“清空手动标记”“清空筛选条件”等重置能力。
- 已补充“恢复内置样本数据”能力，可清除已导入缓存并回退到内置样本。
- 历史片单现已支持单条删除和一键清空。
- 前端已接入 `Material UI` 主题系统，统一了配色、圆角、层级和桌面端布局。
- 应用外壳已重构为 `AppBar + Drawer + Main Content` 结构，PC 端左侧固定侧边栏已落地。
- `偏好与约束` 已从旧侧栏拆分为独立主页面，便于在桌面端获得更完整的表单编辑空间。
- `总览`、`场次浏览`、`时间轴`、`我的片单` 四个核心页面已全部替换为 Material UI 组件实现。
- 原有自定义大段 CSS 已收缩到最小兜底，主要视觉样式现由 MUI Theme 与 `sx` 驱动。

## 当前验证结果

- `npm run build` 已通过。
- `cargo check --manifest-path src-tauri/Cargo.toml` 已通过。
- Tauri 环境检查已通过，Rust、Cargo、Xcode Command Line Tools 均可用。
- 前端与 Tauri 命令层联通后，双端再次通过构建验证。
- 引入原生文件选择器与最近片单读取后，双端再次通过构建验证。
- 引入清空/重置能力后，`npm run build` 与 `cargo check --manifest-path src-tauri/Cargo.toml` 再次通过。
- 完成 Material UI 重构与 PC 左侧侧边栏改版后，`npm run build` 与 `cargo check --manifest-path src-tauri/Cargo.toml` 再次通过。

## 仍待继续的高价值工作

- 继续把场次筛选与推荐结果逐步切到 Rust 侧，减少前后端双份逻辑。
- 为导入、推荐、导出流程补上最小回归测试。
- 在“我的片单”页里加入历史片单详情、重新导出和恢复到当前视图，而不仅是首页摘要展示。
- 继续优化前端包体积，当前接入 Material UI 后 `dist/assets/index-*.js` 已超过 500 kB 警戒线。
- 增加移动端适配策略，为后续向移动端过渡提前整理导航与信息层级。
