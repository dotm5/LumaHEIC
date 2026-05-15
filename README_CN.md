# LumaHEIC

<p align="center">
  <img src="public/favicon.svg" alt="LumaHEIC 图标" width="96" height="96">
</p>

[![Deploy GitHub Pages](https://github.com/dotm5/LumaHEIC/actions/workflows/pages.yml/badge.svg)](https://github.com/dotm5/LumaHEIC/actions/workflows/pages.yml)
[![License: GPL v2 or later](https://img.shields.io/badge/License-GPL_v2_or_later-blue.svg)](LICENSE)

**语言：** [English](README.md) | 简体中文

LumaHEIC 是一个开源、纯浏览器端运行的 HDR gain map HEIC 生成与调试工具。它可以把普通 SDR 图片，或自定义的 SDR base + gain map 组合，导出为适用于兼容照片查看器和 HDR/EDR 显示环境的 HDR HEIC 文件。

LumaHEIC 现在使用基于百分位的高光 mask 和传统 gain-map 管线，而不是单个曝光滑条。你可以调整 HDR 强度、高光起点、高光滚降、阴影抬升、颜色保护、细节、headroom、中灰锁定、裁剪保护、gain-map gamma 和边缘感知平滑。

所有处理都在本地浏览器中完成。图片不会上传到服务器；解码、gain map 生成、预览渲染和 HEIC 编码都运行在 Web Worker 与 WASM 编码器中。

在线使用：[https://dotm5.github.io/LumaHEIC/](https://dotm5.github.io/LumaHEIC/)

> 目标：让 HDR gain map 图片生成不再是黑盒，而是一个可解释、可调试、可复现的开放工作流。

生成的 HDR 效果是合成结果。LumaHEIC 不会恢复源图中本来不存在的真实场景 HDR 信息。

## 为什么做 LumaHEIC？

HDR/EDR 显示环境和兼容照片查看器可以渲染基于 gain map 的图片，但生成一个可检查的 HDR HEIC 文件并不透明。很多图片工具更偏向一键式体验，用户能看到最终观感，却很难确认 gain map 分辨率、headroom、辅助图像、XMP 元数据和 HEIF item reference 到底是什么状态。

LumaHEIC 的重点不是简单套一个 HDR 效果，而是提供一套开放的 HDR gain map authoring workflow：你可以理解它生成了什么，调参数，导出 HEIC，再检查文件结构是否符合预期。

- 开源
- 无水印
- 无服务器上传路径
- 纯浏览器静态部署
- 支持单张 SDR 图片生成 synthetic gain map
- 支持 Base + Gain Map 生成模式
- 支持 gain map 分辨率控制
- 支持预设，同时保留全部手动参数
- 支持 HEIC 元数据和 auxiliary image 验证

## 核心能力

### 1. 从 SDR 图片生成 HDR gain-map HEIC

使用一张 JPEG 或 PNG 作为输入。LumaHEIC 会在浏览器本地生成 synthetic HDR gain map，提供 SDR 基图 / gain map / HDR 参考预览，并导出适用于兼容照片查看器和 HDR/EDR 显示环境的 HDR HEIC。

### 2. 从 Base + Gain Map 生成 HEIC

使用一张 SDR base 图片和一张你自己准备的灰度 gain map。这个模式适合更可控的创作流程、格式实验，以及调试 base + gain-map 图像处理管线。

### 3. 用基于百分位的管线调 HDR 参数

项目提供预设，但不会把结果锁死在预设里。你可以继续调整 HDR 强度、高光起点、高光滚降、阴影抬升、颜色保护、细节、headroom、中灰锁定、白点/黑点保护、裁剪保护、gain-map gamma、边缘感知平滑和 gain map 分辨率。

### 4. 本地处理，不上传服务器

应用面向静态托管设计。GitHub Pages 只托管 HTML、CSS、JavaScript 和 WASM 文件。项目没有后端 API，也没有 `/api/encode-heic` 路由。

### 5. 验证导出的 HEIC

LumaHEIC 会写入 gain-map auxiliary image、XMP metadata，以及编码器使用的 HDR metadata 路径。仓库内提供本地验证脚本，用来检查导出后的辅助图像、元数据和 HEIF item reference。

## 适合谁使用？

- 想把普通图片转成适用于兼容查看器和显示环境的 HDR HEIC 文件的用户。
- 希望获得比一键 HDR 滤镜更多控制的创作者、摄影和调色用户。
- 研究 HDR/EDR、gain map 和 HEIF auxiliary image 的开发者。
- 调试 base + gain-map 工作流的图像处理开发者。
- 需要检查 XMP metadata、auxiliary image 和 HEIC item reference 的格式调试用户。
- 不希望上传私密图片、希望全部本地处理的用户。

## 在线使用

当前 GitHub Pages 部署地址：

```text
https://dotm5.github.io/LumaHEIC/
```

仓库路径是 `LumaHEIC`；需要让 `VITE_BASE_PATH` 和 Pages workflow 与这个 slug 保持一致，这样静态 WASM 编码器资源才能正确加载。

## 生成模式

### Single Image Enhance

使用单张 JPEG 或 PNG 作为 SDR 基图。浏览器本地生成 synthetic HDR gain map，预览 SDR 基图 / gain map / HDR 参考图，并把基图和 8-bit 单通道 gain-map luma 交给 WASM `libheif + x265` 编码器。

### Base + Gain Map

使用一张 SDR base JPEG/PNG 和一张灰度 gain map JPEG/PNG。黑色表示 `1x` gain，白色表示当前 max headroom，中间灰度按 log2 gain 编码解释：

```text
encoded = log2(gain) / log2(maxHeadroom)
gain = maxHeadroom ^ encoded
```

当前先支持 Base + Gain Map authoring。Base + HDR Target authoring 是后续 roadmap。

## 预设

默认预设是 **Natural**。它面向通用摄影场景：适中的 headroom、适中的 HDR strength、较强保护和自动 gain map 分辨率。

- **Natural**：平衡、低风险，适合一般照片。
- **Bright**：高光和 headroom 更强，但仍适合常规图片。
- **Neon / Night**：适合夜景、灯牌、霓虹和游戏截图。
- **Soft**：更柔和的高光过渡。
- **Product**：适合产品图、白底图、金属和玻璃，颜色更保守。

预设只是起点，不是锁定模式。选择预设后仍可继续手动微调所有参数；手动调整后 UI 会进入自定义预设状态。

## Gain Map 分辨率

Gain map 分辨率是 HDR HEIC 生成和调试中很重要的控制项。LumaHEIC 允许你选择 auxiliary image 保留多少细节，而不是把 gain map 当成不可见的内部实现。

Gain-map auxiliary image 支持不同输出分辨率：

- **Auto**：长边不超过 1200 px 时使用 half；不超过 3000 px 时使用 720 px 长边；不超过 6000 px 时使用 1080 px 长边；更大时使用 1440 px 长边。
- **480p / 720p / 1080p**：限制 gain map 长边不超过对应尺寸。
- **Quarter / Half / Full**：使用基图尺寸的固定比例或完整尺寸。
- **Custom**：数据模型已预留，当前 UI 中显示为禁用的 TODO。

所有当前可用模式都会保持宽高比，宽高至少为 1 px，并且不会超过基图尺寸。downsample 时会混合 average 与 max pooling，减少小面积高光被完全平均掉的问题。

合成管线仍然不能恢复源图里本来不存在的真实场景 HDR 信息。

## 本地开发

```bash
npm install
npm run dev
npm test
npm run build
```

## 构建浏览器 HEIC 编码器

在 WSL/Linux 中使用 Emscripten、CMake、Ninja 和 Git：

```bash
source ~/emsdk/emsdk_env.sh
bash scripts/build-libheif-x265-wasm.sh
npm run build
```

编码器输出到 `public/encoders/`，并基于 `import.meta.env.BASE_URL` 加载，因此可以适配 GitHub Pages 的子路径部署。

## GitHub Pages

当前仓库 slug 对应的构建方式：

```bash
VITE_BASE_PATH=/LumaHEIC/ npm run build
```

GitHub Pages 仍然是静态部署。项目没有后端 API，没有服务器端编码路径，也没有图片上传路径。

## 如何验证导出的 HEIC

视觉 HDR 渲染效果会受到查看器、显示设备、系统版本和元数据支持情况影响。某些兼容查看器可能只显示 SDR 基图，或以不同方式解释 gain map。

在 Apple 平台上，Preview 和 Quick Look 的表现可能依赖 macOS 版本，不一定是 HDR gain-map HEIC 渲染效果的可靠验证工具。macOS 或 iOS 上的 Photos 可作为视觉 HDR 验证参考，但不能据此假设导出的文件会在所有环境中正确渲染。

元数据和容器结构检查可以先安装本地工具，然后运行：

```bash
brew install exiftool libheif
./scripts/check-heic-hdr.sh exported.heic
```

输出中值得关注的信号：

- `AuxiliaryImageType: urn:com:apple:photo:2020:aux:hdrgainmap`
- `HDRGainMapVersion`
- `HDRGainMapHeadroom`
- 带有 HDR gain-map URN 的 `auxC`
- 把 auxiliary gain-map image item 关联到 primary image item 的 `auxl` reference
- `heif-convert --with-aux` 提取出的 auxiliary gain-map image
- `MakerApple` / `Apple` `HDRHeadroom` 和 `HDRGain`，如果当前 WASM encoder build 已包含 MakerNote metadata 路径

排查问题时建议结合应用内 debug gain map 预览和 metadata 检查，区分问题来自 gain map 内容、HEIC auxiliary image 结构，还是平台渲染支持。

## 项目结构

- `src/`：React UI、本地 gain map 预览逻辑、i18n 和 Web Worker 集成。
- `src/workers/bypassWorker.ts`：纯浏览器端预览和 HEIC 导出 pipeline。
- `native/libheif-x265/`：浏览器 WASM HEIC 编码器的 Emscripten bridge。
- `public/encoders/`：由浏览器加载的静态 WASM loader 和编码器模块。
- `scripts/check-heic-hdr.sh`：本地 HEIC metadata 和 auxiliary image 验证脚本。

本项目把 [`toGainMapHDR`](https://github.com/chemharuka/toGainMapHDR) 中的 Swift/CoreImage/Metal 流程重构为可移植的浏览器层实现。

## 条款与许可证

本仓库基于 GNU General Public License version 2 or later 分发。详见 [LICENSE](LICENSE)。

已发布的浏览器 HEIC 编码器链接了 `x265`。`x265` 是 GPL v2 or later，同时其作者也提供商业专有许可选项。编码器还链接了 `libheif`，其库代码为 LGPL。bundled encoder 依赖的许可说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

HEVC 编码和分发可能涉及专利或平台授权义务，具体取决于应用的分发地区和分发方式。本仓库不授予专利权，本 README 也不构成法律建议。

## 商标声明

本项目与 Apple Inc. 没有关联，也未获得其赞助、认可或背书。Apple、Photos、macOS、iOS、iPhone、iPad、Quick Look、Preview 及相关名称是 Apple Inc. 的商标。README 中对这些名称的引用仅用于兼容性说明和技术验证目的。
