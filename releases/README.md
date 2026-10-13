# 安装包与版本目录

按产品版本管理 Windows 安装包、更新说明和校验值。最新公开预发布版本为 **2.4.0**，目前均为试用版本。

| 版本 | 说明 | Windows x64 安装包 |
| --- | --- | --- |
| [2.4.0](windows/2.4.0/) | 月度项目需求与Excel、一句话需求、后台报告与手动创建、随手记录就地编辑/复制；数据结构7，预发布。 | [下载](https://github.com/DeshawnYO/work-notes/releases/download/v2.4.0/Work-Notes-2.4.0-Windows-x64.exe) |
| [2.2.0-beta.2](windows/2.2.0-beta.2/) | 自选报告时间、集中模板、自由档案编辑及全量/近7天生成；数据结构4，预发布。 | [下载](https://github.com/DeshawnYO/work-notes/releases/download/v2.2.0-beta.2/Work-Notes-2.2.0-beta.2-Windows-x64.exe) |
| [1.0.0](windows/1.0.0/) | 初始 Windows 桌面试用版本。本版本仅用于历史追溯。 | [下载](https://github.com/DeshawnYO/work-notes/releases/download/installer-v1.0.0/Work-Notes-1.0.0-Windows-x64.exe) |
| [2.0.0-beta.1](windows/2.0.0-beta.1/) | V2 首个试用包，增加随手记录、单层子事项、重大汇报与 Word 归档，数据结构版本为 2。 | [下载](https://github.com/DeshawnYO/work-notes/releases/download/installer-v2.0.0-beta.1/Work-Notes-2.0.0-beta.1-Windows-x64.exe) |
| [2.0.0-beta.2](windows/2.0.0-beta.2/) | V2 后续试用包，沿用 V2 功能，数据结构版本为 3。 | [下载](https://github.com/DeshawnYO/work-notes/releases/download/installer-v2.0.0-beta.2/Work-Notes-2.0.0-beta.2-Windows-x64.exe) |
| [2.1.0](windows/2.1.0/) | V2.1 Windows 历史试用包，采用编辑风界面，功能沿用 V2，数据结构版本为 3。 | [下载](https://github.com/DeshawnYO/work-notes/releases/download/installer-v2.1.0/Work-Notes-2.1.0-Windows-x64.exe) |

每个版本目录含 `README.md`、`release.json`、`SHA256.txt`、`LICENSE`、`NOTICE.md`。作者本地同目录另有 `.exe`；公开二进制附件放在各版本 GitHub Release，避免超过 GitHub 普通 Git 文件的 100 MiB 上限。

安装包不可覆盖；修订安装包必须增加版本号。首次公开源码标签 `v2.1.0-source.1` 保持原有范围，历史安装包使用 `installer-v<版本>` 标签，其原始源码提交未知。发布与升级规则见 [发布管理](../docs/发布管理.md) 和 [版本规则](../VERSIONING.md)。仅允许非商业用途。
