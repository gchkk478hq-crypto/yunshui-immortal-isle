# 云水仙洲 · 山水有灵

可在浏览器中探索的实时 3D 仙岛：山水、园林、琴阁、飞瀑、小鹿与小犬。

**在线体验：https://gchkk478hq-crypto.github.io/yunshui-immortal-isle/**

首次打开需加载约 40 MB 资源，请耐心等待。建议使用电脑上的现代浏览器并开启硬件加速；需要 WebGL 2。当前画质固定为精致档，实际流畅度取决于设备。

## 操作

拖动旋转视角，滚轮缩放，点击底部地点按钮切换镜头。点击湖面、花树、小鹿或小犬互动。右上角可开启声音、切换昼夜。

## 下载到自己的电脑

点击仓库 **Code → Download ZIP**，解压整个文件夹。安装 Python 3 后，在解压目录运行：

- macOS / Linux：`python3 serve.py --open`
- Windows：`py -3 serve.py --open`（也可使用 `python serve.py --open`）

macOS 也可双击 `启动云水仙洲.command`。命令行方式可避免压缩包解压后执行权限不同造成的问题。
浏览器地址会显示在终端，通常为 `http://127.0.0.1:4173/`。按 Ctrl+C 关闭本机服务。不要直接双击 HTML 文件。

下载版包含已构建的 `dist/`，观看不需要 Node.js 或 Blender。

## 源码与模型

- `src/`：Three.js + TypeScript 交互场景。
- `public/assets/models/`：GLB 模型。
- `asset_sources/`：Blender 工程及模型生成脚本。
- `dist/`：可直接部署的网页成品。

开发需要 Node.js 22 或更新版本：

```sh
npm ci
npm run dev
npm run build
npm test
```

Blender 工程可单独打开编辑；实时互动、音效、天气及部分动画由网页代码实现。修改源码或模型后需要重新构建并更新 `dist/`。

## GitHub Pages 发布

仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
提交到 `main` 后，工作流会发布 `dist/` 中的现有成品；也可在 Actions 中手动运行 Deploy GitHub Pages。

## 资源说明

Three.js 使用 MIT 许可，详见 `THIRD_PARTY_LICENSES/three-MIT.txt`。资源来源记录见 `docs/licenses.md`。
本仓库未附原始设计参考图。项目自身暂未另行指定开源许可证；公开展示不代表额外授予代码或美术资产的使用许可。
