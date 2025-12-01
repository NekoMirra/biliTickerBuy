# biliTickerBuy (Rust 重构版) - 本地构建指南

本文档详细介绍了如何在本地环境中构建和运行 biliTickerBuy 的 Rust 重构版本。本项目使用 [Tauri](https://tauri.app/) 框架，结合了 Rust 后端的高性能与 React 前端的灵活性。

## 🛠️ 环境准备

在开始之前，请确保您的开发环境已安装以下必要工具：

### 1. Node.js

前端构建依赖 Node.js 环境。

- **下载地址**: [Node.js 官网](https://nodejs.org/)
- **版本要求**: 建议使用 LTS 版本 (v16 或更高)。
- **验证安装**: 在终端运行 `node -v` 和 `npm -v`。

### 2. Rust

Tauri 后端依赖 Rust 编程语言。

- **下载地址**: [Rust 官网](https://www.rust-lang.org/tools/install)
- **安装方式**: 推荐使用 `rustup` 进行安装。
- **验证安装**: 在终端运行 `rustc --version` 和 `cargo --version`。

### 3. 系统构建工具 (Windows)

在 Windows 上构建 Rust 项目需要 C++ 生成工具。

- **下载**: 安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)。
- **配置**: 在安装程序中，勾选 "使用 C++ 的桌面开发" 工作负载。

> 💡 **提示**: 关于其他操作系统（macOS/Linux）的详细环境配置，请参考 [Tauri 官方文档](https://tauri.app/v1/guides/getting-started/prerequisites)。

---

## 📦 安装依赖

1. **克隆仓库** (如果您还没有克隆):

   ```bash
   git clone https://github.com/NekoMirra/biliTickerBuy.git
   ```

2. **进入项目目录**:
   请注意，Rust 重构版本的代码位于 `bili-ticker-buy-rust` 子目录下。

   ```bash
   cd biliTickerBuy/bili-ticker-buy-rust
   ```

3. **安装前端依赖**:
   使用 npm 安装项目所需的 Node.js 包。

   ```bash
   npm install
   ```

   *如果下载速度较慢，建议配置国内镜像源。*

---

## 🚀 运行开发环境

在开发模式下运行项目，支持热重载 (Hot Reload)。

```bash
npm run tauri dev
```

- 该命令会同时启动 Vite 前端服务器和 Tauri 后端窗口。
- 首次运行时，Rust 依赖包的编译可能需要几分钟时间，请耐心等待。

---

## 🔨 构建生产版本

如果您需要生成可分发的安装包（如 `.exe` 或 `.msi`），请执行构建命令。

```bash
npm run tauri build
```

- 构建过程会进行代码优化和压缩。
- **构建产物位置**:
  构建完成后，安装包通常位于以下目录：
  `src-tauri/target/release/bundle/nsis/` (Windows 安装包)
  或
  `src-tauri/target/release/bundle/msi/`

---

## 📂 项目结构说明

- **`src/`**: 前端源代码 (React + Vite + Tailwind CSS)
  - 负责 UI 展示和用户交互。
- **`src-tauri/`**: 后端源代码 (Rust)
  - **`src/main.rs`**: 程序入口。
  - **`src/auth.rs`**: 扫码登录与鉴权逻辑。
  - **`src/buy.rs`**: 抢票核心逻辑。
  - **`src/config.rs`**: 配置管理。
  - **`tauri.conf.json`**: Tauri 项目配置文件。

## ❓ 常见问题

**Q: 编译时提示缺少依赖？**
A: 请检查是否已正确安装 Visual Studio Build Tools (Windows) 或相应的系统库 (Linux/macOS)。

**Q: 首次运行 `npm run tauri dev` 很慢？**
A: 这是正常的。Rust 编译器需要下载并编译所有依赖 crate。后续运行时，由于增量编译机制，速度会快很多。
