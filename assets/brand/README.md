# 工作笔记图标资源

2026-10-15：采用作者确认的“小狗与小黄鸭”形象，并按最新要求仅保留绿色圆形主体。圆形外透明，没有白色圆角矩形或白色外圈。

## 文件与规格

| 文件 | 用途 | 规格 |
| --- | --- | --- |
| `work-notes.ico` | Windows EXE、窗口、托盘、安装包 | 10 帧；16、20、24、32、40、48、64、96、128、256 px；32 位 RGBA |
| `work-notes.png` | 通用 PNG 主图 | 1024×1024；RGBA；圆外透明 |
| `../../static/app-icon.png` | 当前网页左侧品牌图标 | 128×128；RGBA；实际显示尺寸由页面控制 |
| `sources/dog-duck-selected.png` | 原始选定方案留档 | 原始圆角矩形版，勿直接作最终图标 |
| `sources/dog-duck-circle-source.png` | 圆形版生成源图 | 保留原始生成文件，构建脚本清理边界并规范输出 |

ICO 小于 256 px 的帧使用 32 位 DIB，256 px 使用 PNG 压缩。每个尺寸独立从主图缩小，不把低清图放大。主图留 32 px（3.125%）透明安全区，圆形可见直径约 960 px。圆形边缘抗锯齿，白色毛发保持不透明；不要用白色作为透明色。

这是一套光栅图标，不是 SVG 矢量图。16–24 px 下以轮廓和棕黄配色辨识，细毛发不会完整显示。尺寸与透明度处理参照 [Microsoft 的 Windows 图标说明](https://learn.microsoft.com/en-us/windows/win32/menurc/about-icons)。

## 现有项目接入

现有构建入口已经读取上述固定文件名，业务程序无需额外改动：

- `packaging/windows/build_installer.py`：复制品牌资源，并通过 C# 编译器 `/win32icon:` 嵌入 EXE。
- `packaging/windows/WorkNotes.cs`：从程序目录的 `work-notes.ico` 加载窗口与托盘图标。
- `packaging/windows/work-notes.iss`：`SetupIconFile` 指向 ICO；快捷方式读取 EXE 中的图标。
- `static/index.html`：品牌图片读取 `/app-icon.png`。

本次仅更新源码资源。历史安装包及日常安装程序仍是各自原有图标，后续按版本规则构建新安装包时才会采用新图标。不要直接改写或替换已发布的 EXE；这也会使已有数字签名失效。

## 重新生成

构建资源时需要 Pillow，应用正常运行不需要新增依赖。当前环境使用 `C:\Python314\python.exe`，Pillow 12.3.0。以下输出目录必须尚不存在，脚本拒绝覆盖已有交付：

```powershell
& 'C:\Python314\python.exe' -B -X utf8 scripts/build_brand_icons.py --output '.local/brand-icons-new' --sync-source
```

不带 `--sync-source` 时仅生成独立输出，不修改源码资源。脚本生成 ICO、多尺寸 PNG、明暗背景预览和 SHA-256 清单，且不会导入业务模块、启动服务、读取用户数据库或调用模型。
