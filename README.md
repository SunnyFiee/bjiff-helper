# BJIFF 排片助手

基于 `React + Vite + Tauri` 的北影节个人排片助手原型。

## 当前状态

- 已落地前端工程骨架。
- 已从 Excel 生成真实排片数据集：`src/data/bjiff-schedule.json`。
- 已实现首版界面：总览、场次浏览、偏好设置、推荐排片、时间轴、我的片单。
- 已预留 `src-tauri` 命令层骨架，等待 Rust 工具链接通后继续实现。

## 目录说明

- `docs/BJIFF-排片助手-v1-规划.md`：产品与技术规划。
- `scripts/extract_schedule.py`：从 Excel 抽取常规展映数据。
- `src/`：React 前端。
- `src-tauri/`：Tauri Rust 端骨架。

## 本地启动

1. 安装前端依赖

```bash
npm install
```

2. 如需重新生成数据

```bash
npm run extract:schedule
```

3. 启动前端预演

```bash
npm run dev
```

4. 安装 Rust 工具链后启动桌面端

```bash
npm run tauri dev
```

## 说明

当前仓库里的前端已经能基于真实排片 JSON 进行本地演示，但本次会话中没有安装依赖，也没有可用的 Rust 工具链，所以还未实际跑通构建和桌面调试。
