# 工作笔记 1.0.0 · Windows x64

初始 Windows 桌面试用版本。建议优先选择最新的 2.1.0；本版本仅用于历史追溯。

- [下载安装包](https://github.com/DeshawnYO/work-notes/releases/download/installer-v1.0.0/Work-Notes-1.0.0-Windows-x64.exe)（222.12 MiB）
- [对应 GitHub Release](https://github.com/DeshawnYO/work-notes/releases/tag/installer-v1.0.0)
- [发布信息](release.json) · [SHA-256](SHA256.txt) · [非商业许可](LICENSE) · [版权与第三方许可](NOTICE.md)

此目录用于管理已保留的历史安装包。Git 中保留说明和校验信息，安装包二进制存放在 GitHub Releases；作者本地同一目录保留原始 `.exe`（工作笔记-安装包-1.0.0-Windows-x64.exe）；公开附件使用 ASCII 文件名 `Work-Notes-1.0.0-Windows-x64.exe`，内容和校验值相同。SHA256.txt 按公开下载文件名记录。

## 使用与升级

下载 `.exe` 后先核对 SHA-256，再运行安装；安装包内含离线 WebView2 运行环境。程序未签名。首次启动选择自己的数据目录，不使用作者数据。软件使用条款以本目录许可证为准，仅允许许可范围内的非商业用途；随包第三方运行时仍按各自原许可使用。

升级前同时备份数据库和外部项目文件，关闭旧程序后再安装。旧版本仅供追溯；不能直接用旧程序打开新数据并认为可以安全降级。

```powershell
Get-FileHash -LiteralPath '.\Work-Notes-1.0.0-Windows-x64.exe' -Algorithm SHA256
```

应得到：`47e456f3a28809694fb4aa76303d13f620cbc7190e8f88e54aa4608b22d5fdd4`。

## 追溯与验收范围

原包字节未修改，构建清单与保留的构建目录逐项匹配，未发现私人数据库、备份或密钥文件。历史包早于 Git 初始化，精确源码提交未知；`installer-v1.0.0` 仅标识本次归档索引，不代表原始构建源码。

本次未重新构建，未进行实际安装、升级、托盘、卸载或新电脑离线验收。只读解包工具不支持这些包所用的 Inno Setup 格式，未完成包内文件直接解包核验。发布保持试用状态，不能据此认定正式安装验收通过。
