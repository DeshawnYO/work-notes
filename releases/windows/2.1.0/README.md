# 工作笔记 2.1.0 · Windows x64

最新保留的 Windows 试用包，采用编辑风界面，功能沿用 V2，数据结构版本为 3。

- [下载安装包](https://github.com/DeshawnYO/work-notes/releases/download/installer-v2.1.0/%E5%B7%A5%E4%BD%9C%E7%AC%94%E8%AE%B0-%E5%AE%89%E8%A3%85%E5%8C%85-2.1.0-Windows-x64.exe)（222.13 MiB）
- [对应 GitHub Release](https://github.com/DeshawnYO/work-notes/releases/tag/installer-v2.1.0)
- [发布信息](release.json) · [SHA-256](SHA256.txt) · [非商业许可](LICENSE) · [版权与第三方许可](NOTICE.md)

此目录用于管理已保留的历史安装包。Git 中保留说明和校验信息，安装包二进制存放在 GitHub Releases；作者本地同一目录保留原始 `.exe`。

## 使用与升级

下载 `.exe` 后先核对 SHA-256，再运行安装；安装包内含离线 WebView2 运行环境。程序未签名。首次启动选择自己的数据目录，不使用作者数据。软件使用条款以本目录许可证为准，仅允许许可范围内的非商业用途；随包第三方运行时仍按各自原许可使用。

升级前同时备份数据库和外部项目文件，关闭旧程序后再安装。旧版本仅供追溯；不能直接用旧程序打开新数据并认为可以安全降级。

```powershell
Get-FileHash -LiteralPath '.\工作笔记-安装包-2.1.0-Windows-x64.exe' -Algorithm SHA256
```

应得到：`c32c91686b5d899604c72556fc8c8f20d1481a7107b4fbaae186fb99a4d553e4`。

## 追溯与验收范围

原包字节未修改，构建清单与保留的构建目录逐项匹配，未发现私人数据库、备份或密钥文件。历史包早于 Git 初始化，精确源码提交未知；`installer-v2.1.0` 仅标识本次归档索引，不代表原始构建源码。

本次未重新构建，未进行实际安装、升级、托盘、卸载或新电脑离线验收。只读解包工具不支持这些包所用的 Inno Setup 格式，未完成包内文件直接解包核验。发布保持试用状态，不能据此认定正式安装验收通过。
