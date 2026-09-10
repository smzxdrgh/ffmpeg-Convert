# ffmpeg-Convert

FFmpeg 驱动的桌面级媒体转换工作台：图片 / 动图 / 视频 / 音频任意互转，支持无损与有损质量体系、滤镜、损坏检查与流式批量处理。

基于 **Electron + FFmpeg**，无需命令行即可完成各类媒体格式转换，并内置质量调优、滤镜、完整性检查等一站式能力。

---

## ✨ 功能特性

### 🎨 图片互转
- **8 种格式任意互转**：WEBP / PNG / JPG / AVIF / GIF / BMP / TIFF / JPEG-XL
- **统一质量体系**：无损 / 有损双模式，百分比比例尺实时对应专有参数
  - AVIF → CRF（0–63），WebP → quality（0–100），JPEG-XL → distance（0–15）
  - 无损格式默认最高画质，有损默认质量与体积平衡点
- **AVIF 感知质量标注**：基于 LPIPS 实测的 7 档参考条（CRF ≤ 26 为视觉无损极限）
- 尺寸调整、压缩目标门槛、输出通过后自动删除原文件

### 🎞 动图 / 视频互转
- GIF / WebP 动图 / APNG ↔ MP4 / WebM / MKV / MOV / AVI 任意互转
- 动图：调色板颜色数、帧率、尺寸、循环控制
- 视频：编码器（H.264 / VP9 / AV1）、CRF、预设、音频流参数

### 🎵 音频转换
- MP3 / AAC / Opus / Vorbis / FLAC / WAV 互转
- 比特率、采样率、编码器控制

### 🖼 动图工坊
- 图片序列一键编排成 GIF / WebP 动图，可调帧率、缩放、循环

### ⚙️ 滤镜工作台
- 17 种内置 FFmpeg 滤镜：缩放、裁剪、旋转、模糊、反色、色相偏移、亮度/对比度/饱和度、文字叠加、边缘检测、噪点等
- 可视化参数配置与命令预览

### 🛡 文件完整性检查
- 快速 / 完整双模式损坏检测
- 损坏文件单独罗列，支持**手动确认修复**（重封装 → 重编码两级抢救，绝不自动覆盖原文件）
- 一键删除全部损坏文件

### 📁 流式批处理
- 大文件夹**流式枚举**：每批仅读取固定数量文件（50–1000 可选），数十万文件不卡界面
- 多文件夹拖放支持、忽略格式过滤（23 种格式可勾选）
- 各功能视图支持「从文件夹批处理导入」与「持续自动导入处理」自动循环

### 🚀 性能与工程
- 自动多核并行 / 自定义线程数
- GPU 硬件加速：CUDA / D3D11VA / Intel QSV / DXVA2
- FFmpeg 引擎路径可选可存，设置保存与恢复，能力扫描（格式 / 编解码器 / 滤镜 / 硬件加速清单）
- 三态控制：开始 / 停止 / 重新开始 + 断点继续；全队列分批开关；深色工作台界面

---

## 📦 安装

### 环境要求
- **Windows 10 / 11**
- **Node.js**（≥ 18，含 npm）
- **FFmpeg**（建议完整构建，含 ffmpeg.exe 与 ffprobe.exe）

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/你的用户名/ffmpeg-Convert.git
cd ffmpeg-Convert

# 2. 安装依赖
npm install

# 3. 启动
npm start
或双击index.html在默认浏览器中打开界面
或双击启动FFmpeg工作台.bat以独立窗口打开界面
```

### FFmpeg 配置

首次启动后，在「偏好设置」中：

1. 点击「选择 ffmpeg.exe」定位你的 FFmpeg 可执行文件（或直接输入完整路径）
2. 点击「检测有效性」，状态显示「有效」即完成
3. 路径自动保存，下次启动直接使用

> 未配置时默认尝试 `G:\ffmpeg\bin\ffmpeg.exe`，未找到会在界面上提示。

---

## 🖥 界面视图

| 视图 | 功能 |
|------|------|
| 图片转换 | 8 格式互转 + 统一质量体系 |
| 动图工坊 | 图片序列 → 动图 |
| 媒体互转 | 动图 / 视频任意互转 |
| 音频转换 | 音频格式互转 |
| 滤镜工作台 | 17 种滤镜可视化应用 |
| 能力扫描 | 引擎格式 / 编码 / 滤镜 / 硬件加速清单 |
| 完整性检查 | 损坏检测 + 修复 + 删除 |
| 文件夹批处理 | 流式批处理文件源管理 |
| 偏好设置 | 引擎路径 / 设置保存恢复 |

---

## 🛠 技术栈

- **Electron 31** — 桌面应用框架
- **FFmpeg** — 媒体处理引擎（通过子进程调用）
- **原生 JavaScript / HTML / CSS** — 零前端框架依赖

---

## 📜 许可

[MIT](LICENSE)

```
MIT License

Copyright (c) 2026 Anewcov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
