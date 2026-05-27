# Production Log Diagnosis

Production Log Diagnosis 是一个用于产线测试日志解析和诊断的 Tauri 桌面应用。它可以导入单个日志文件或日志文件夹，按实体设备聚合多份日志，定位失败工序和异常上下文，并可通过 AI 模型生成面向生产测试的诊断报告。

[English README](./README.md)

## 功能

- 通过文件选择器或拖拽导入 `.log`、`.txt` 产线测试日志。
- 支持解析 Function Test、Install APboot、Verify TPM & AOS、Radio Test、Txpower Test、OBA Test 日志。
- 根据 SN、MAC、型号、SMT、生产日期等信息按设备聚合日志。
- 展示设备级状态、日志覆盖情况、测试流程时间线、详细工序结果、关键参数和通过率。
- 提取 warning、error、failed 等异常上下文，并保留来源文件和行号。
- 在日志包含 Shmoo 数据时渲染内存裕度视图。
- 支持可选的 AI 异常分类、设备摘要和 Markdown 测试报告生成。
- 将生成报告和 AI 缓存保存到导入日志旁边的 `.log_analysis` 目录。
- 支持从桌面应用把生成的 Markdown 报告导出为 PDF。
- 支持英文和简体中文界面、浅色/深色/跟随系统主题，以及 Tauri 更新包。

## 项目结构

```text
.
|-- log_core/              # Rust 日志解析 crate 和 golden 测试
|-- src/                   # React 界面、聚合逻辑、AI 模型集成
|-- src-tauri/             # Tauri 外壳、命令、更新配置
|-- contracts/             # 解析结果 JSON Schema
|-- docs/                  # 计划和设计文档
|-- .github/workflows/     # 构建和发布工作流
```

## 开发

环境要求：

- Node.js 22
- pnpm
- Rust stable
- 当前操作系统对应的 Tauri 平台依赖

安装依赖：

```bash
pnpm install
```

运行桌面开发版：

```bash
pnpm tauri dev
```

只构建前端：

```bash
pnpm build
```

构建桌面应用：

```bash
pnpm tauri build
```

运行 Rust 解析器测试：

```bash
cargo test
```

## AI 功能

AI 功能默认关闭。可在设置中启用，并选择以下模型来源：

- Ollama 本地模型，默认地址为 `http://127.0.0.1:11434`
- OpenAI 兼容 API
- 自定义 OpenAI 兼容接口

API Key 通过桌面命令层保存，不写入仓库。发送提示词前，应用会应用本地脱敏规则，并记录模型调用审计信息。

## 发布

CI 构建工作流会在 `main`、`release`、版本 tag、指向这些分支的 pull request 以及手动触发时运行。Release 工作流在版本 tag 上运行，并把 Tauri 构建产物上传到当前仓库的 GitHub Releases，不再发布到单独的 `tools-releases` 仓库。
