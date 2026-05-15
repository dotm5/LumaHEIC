# LumaHEIC

<p align="center">
  <img src="public/favicon.svg" alt="LumaHEIC 图标" width="96" height="96">
</p>

[![Deploy GitHub Pages](https://github.com/dotm5/LumaHEIC/actions/workflows/pages.yml/badge.svg)](https://github.com/dotm5/LumaHEIC/actions/workflows/pages.yml)
[![License: GPL v2 or later](https://img.shields.io/badge/License-GPL_v2_or_later-blue.svg)](LICENSE)

**语言：** [English](README.md) | 简体中文

LumaHEIC 是一个纯浏览器端的 Apple HDR 增益图 HEIC 导出工具，可以把 SDR 图片转成更适合 Apple Photos 识别的 HEIC 文件，并在文件中写入 Apple HDR gain map auxiliary image。

这个应用面向静态托管设计。GitHub Pages 只托管 HTML、CSS、JavaScript 和 WASM 文件。图片不会上传到任何服务器：解码、增益图生成、预览渲染和 HEIC 编码都在用户浏览器本地完成，并运行在 Web Worker 与 `libheif + x265` WASM 编码器中。

## 功能

- 从单张 SDR 源图生成 Apple 风格 HDR 增益图。
- 从 SDR 基图和用户上传的灰度增益图封装 HEIC。
- 通过 bundled WASM 编码器在浏览器中导出 `.heic`。
- 写入 Apple HDR gain-map auxiliary image、XMP metadata，以及 native encoder 使用的 MakerApple HDR metadata 路径。
- 提供英文和中文界面。
- 保持 GitHub Pages 全静态部署，没有后端 API，也没有图片上传路径。

生成的 HDR 效果是合成结果。LumaHEIC 不能恢复源图中本来不存在的真实场景 HDR 信息。

## Authoring 模式

### Single Image Enhance

使用单张 JPEG 或 PNG 作为 SDR 基图。浏览器本地生成 synthetic HDR gain map，预览 SDR 基图 / 增益图 / HDR 参考图，并把基图和 8-bit 单通道增益图交给 WASM `libheif + x265` 编码器。

### Base + Gain Map

使用一张 SDR 基图 JPEG/PNG 和一张灰度增益图 JPEG/PNG。黑色表示 `1x` gain，白色表示当前 max headroom，中间灰度按 log2 gain 编码解释：

```text
encoded = log2(gain) / log2(maxHeadroom)
gain = maxHeadroom ^ encoded
```

当前先支持 Base + Gain Map authoring。Base + HDR Target authoring 作为后续 Roadmap。

## 预设

默认预设是 **Natural**。它面向通用摄影场景：适中的 headroom、适中的 HDR strength、较强保护和自动增益图分辨率。

- **Natural**：平衡、低风险，适合一般照片。
- **Bright**：高光和 headroom 更强，但仍避免默认过度 HDR。
- **Extreme**：用于测试或夸张风格。

选择预设后仍可继续手动微调。手动调整后 UI 会进入自定义预设状态。

## 增益图分辨率

增益图辅助图像支持不同输出分辨率：

- **Auto**：长边不超过 1200 px 时使用 half；不超过 3000 px 时使用 720 px 长边；不超过 6000 px 时使用 1080 px 长边；更大时使用 1440 px 长边。
- **480p / 720p / 1080p**：限制增益图长边不超过对应尺寸。
- **Quarter / Half / Full**：使用基图尺寸的固定比例或完整尺寸。
- **Custom**：类型已预留，UI 后续实现。

所有模式都会保持宽高比，宽高至少为 1 px，并且不会超过基图尺寸。downsample 时会混合 average 与 max pooling，减少小面积高光被完全平均掉的问题。

## 文档

### 在线使用

当前 GitHub Pages 部署地址：

```text
https://dotm5.github.io/LumaHEIC/
```

仓库路径是 `LumaHEIC`；需要让 `VITE_BASE_PATH` 和 Pages workflow 与这个 slug 保持一致，这样静态 WASM 编码器资源才能正确加载。

### 本地开发

```bash
npm install
npm run dev
npm test
npm run build
```

### 构建浏览器 HEIC 编码器

在 WSL/Linux 中使用 Emscripten、CMake、Ninja 和 Git：

```bash
source ~/emsdk/emsdk_env.sh
bash scripts/build-libheif-x265-wasm.sh
npm run build
```

编码器输出到 `public/encoders/`，并基于 `import.meta.env.BASE_URL` 加载，因此可以适配 GitHub Pages 的子路径部署。

### GitHub Pages

当前仓库 slug 对应的构建方式：

```bash
VITE_BASE_PATH=/LumaHEIC/ npm run build
```

GitHub Pages 仍然是静态部署。项目没有 `/api/encode-heic` 路由，也没有服务器端编码路径。

## 如何验证导出的 HEIC

macOS Preview 和 Quick Look 的表现可能依赖 macOS 版本，不一定是 Apple HDR gain-map HEIC 渲染效果的可靠验证工具。视觉 HDR 验证建议优先使用 macOS Photos 或 iOS Photos。

元数据和容器结构检查可以先安装本地工具，然后运行：

```bash
brew install exiftool libheif
./scripts/check-heic-hdr.sh exported.heic
```

输出中值得关注的信号：

- `AuxiliaryImageType: urn:com:apple:photo:2020:aux:hdrgainmap`
- `HDRGainMapVersion`
- `HDRGainMapHeadroom`
- 带有 Apple HDR gain-map URN 的 `auxC`
- 把 auxiliary gain-map image item 关联到 primary image item 的 `auxl` reference
- `heif-convert --with-aux` 提取出的 auxiliary gain-map image
- `MakerApple` / `Apple` `HDRHeadroom` 和 `HDRGain`，如果当前 WASM encoder build 已包含 MakerNote metadata 路径

排查问题时建议结合应用内 debug gain map 预览和 metadata 检查，区分问题来自 gain map 内容、HEIC auxiliary image 结构，还是平台渲染支持。

## 项目结构

- `src/`：React UI、本地增益图预览逻辑、i18n 和 Web Worker 集成。
- `src/workers/bypassWorker.ts`：纯浏览器端预览和 HEIC 导出 pipeline。
- `native/libheif-x265/`：浏览器 WASM HEIC 编码器的 Emscripten bridge。
- `public/encoders/apple-hdr-heic.js`：由浏览器加载的静态 WASM loader。
- `public/encoders/apple-hdr-heic.wasm`：静态浏览器编码器模块。
- `scripts/check-heic-hdr.sh`：本地 HEIC metadata 和 auxiliary image 验证脚本。

本项目把 [`toGainMapHDR`](https://github.com/chemharuka/toGainMapHDR) 中的 Swift/CoreImage/Metal 流程重构为可移植的浏览器层实现。

## 条款和许可证

本仓库基于 GNU General Public License version 2 or later 分发。详见 [LICENSE](LICENSE)。

已发布的浏览器 HEIC 编码器链接了 `x265`。`x265` 是 GPL v2 or later，同时其作者也提供商业专有许可选项。编码器还链接了 `libheif`，其库代码为 LGPL。bundled encoder 依赖的许可说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

HEVC 编码和分发可能涉及专利或平台授权义务，具体取决于应用的分发地区和分发方式。本仓库不授予专利权，本 README 也不构成法律建议。
