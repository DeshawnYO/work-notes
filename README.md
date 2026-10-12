# 工作笔记 · Work Notes

一个以本机文件和数据为中心的个人工作管理工具：把今日待办、工作记录、项目档案与工作报告放在一起，减少重复整理。

当前产品源码版本 **2.1.0**。首次公开源码标签 **`v2.1.0-source.1`** 标识源码快照，不代表已验收的安装包发布。见 [版本规则](VERSIONING.md) 与 [更新记录](CHANGELOG.md)。

**仅允许非商业用途。** 自有代码、文档和品牌资源采用 [PolyForm Noncommercial 1.0.0](LICENSE)，版权范围见 [NOTICE.md](NOTICE.md)。允许在许可范围内阅读、研究、修改、分享与共创；商业用途不在本许可授权范围内。第三方组件保留原有许可。

## 功能

- **今日工作**：周目标、月目标、四象限待办、单层子事项、昨日未完成事项顺延、常驻随手记录。
- **工作记录**：按日期和项目查看工作事实，编辑记录并导出。
- **重大汇报**：会议逐字稿与纪要、工作汇报图文编辑、Word 归档；分别展示草稿与文件同步状态。
- **项目管理**：接入本地项目目录，按自定义模板整理档案，保留历史版本与外部修改冲突检查。
- **工作报告**：生成、编辑、导出周报与月报；未配置模型时仍可使用事实底稿。
- **可选 AI**：本机 Ollama 或兼容 Chat Completions 的 HTTPS 接口；可限制项目仅本地处理，AI 结果需要人工核对。

V2.1 使用纸白、细分割线与陶土色点缀的编辑风界面。基础工作管理不需要模型账号。

## 技术与支持范围

| 部分 | 实现 / 状态 |
| --- | --- |
| 本地服务与数据 | Python、SQLite；服务只监听本机回环地址 |
| 页面 | 原生 HTML / CSS / JavaScript，无前端依赖安装步骤 |
| Windows 桌面 | C# WinForms + WebView2，主要使用环境为 Windows 10/11 x64 |
| 协作 | GitHub 代码共创；应用仍为本机单用户工具，无云端同步 |

## 下载安装

最新保留的 Windows x64 安装包为 **2.1.0 试用版**，见 [安装包与历史版本](releases/README.md)。选择对应版本的下载链接，核对校验值后安装。仅允许非商业用途。

升级前同时备份数据库及外部项目文件。历史包没有精确 Git 源码提交记录，本次未重新构建或完成实际安装验收，详见各版本说明。

## 从源码运行

建议使用 **Windows x64、Python 3.14**。源码可直接通过浏览器访问；Windows 安装包构建另有运行时及工具要求。Node.js 仅用于开发时检查 JavaScript。

在克隆目录打开 PowerShell，安装文档处理依赖：

```powershell
python -m pip install -r requirements.txt
```

使用独立数据、独立项目目录和端口，关闭自动调度：

```powershell
$devRoot = Join-Path (Get-Location) '.local/community-dev'
New-Item -ItemType Directory -Force -Path "$devRoot/data", "$devRoot/projects" | Out-Null
$env:PERSONAL_WORKBENCH_DATA_DIR = "$devRoot/data"
$env:PERSONAL_WORKBENCH_PORT = '18766'
$env:PERSONAL_WORKBENCH_DISABLE_SCHEDULER = '1'
python -B -X utf8 server.py
```

访问 <http://127.0.0.1:18766/>；若端口占用，换一个空闲本机端口。结束时按 Ctrl+C 并关闭专用终端。测试项目只接入此次 `.local/community-dev/projects/` 下的子目录，不用真实工作资料测试。

服务会在指定目录创建数据库。首次运行保持模型未配置即可使用基础功能。关闭调度器不阻止主动 AI 调用；验证时使用模拟结果，避免调用真实云模型。

旧 `启动工作台` 入口及 `build_portable.py` 用于历史本机/私人迁移流程，可能沿用已有数据库或复制接入项目；开发请使用上述隔离方式。

## 目录与文档

```text
根目录 Python 文件    业务、数据、服务与旧启动/迁移入口
static/               页面、交互与样式源码
scripts/              样式生成、隔离开发入口与资源同步
packaging/windows/    Windows 窗口及安装构建源码
packaging/harmonyos/  未完成的鸿蒙工程骨架
assets/brand/         品牌资源
vendor/               pypdf 及原有许可证
docs/                 开发手册、设计规范、需求方向与发布规则
releases/             按版本组织的安装包目录、下载链接与校验信息
```

- [发布管理](docs/发布管理.md)：版本目录、安装包附件、校验与升级。
- [目录说明](docs/目录说明.md)：公开文件与本地归档边界。
- [贡献指南](CONTRIBUTING.md)：Fork、分支、验证与 Pull Request。
- [开发手册](docs/开发手册.md)：模块、数据隔离、构建与验证；部分历史资料仅保留在作者本地。
- [设计规范](docs/DESIGN.md)：当前 V2.1 规则。
- [需求方向草稿](docs/requirements/V2.0.md)：历史方向，不代表细节均已确认。
- [Agent 工作约定](AGENTS.md)：使用编码助手前阅读。
- [安全反馈](SECURITY.md)：敏感问题的报告方式。

`static/style.css` 为生成文件。修改五份样式源码后执行 `python -B scripts/build_notebook_styles.py`，同时提交生成文件。

## 共创与数据边界

欢迎 Issue、功能建议、文档改进和代码 PR。先提出问题，再 Fork、建立功能分支，完成必要验证后提交 Pull Request，由维护者审核合并。公开仓库不向所有人开放直接写入主分支。贡献按同一非商业许可提供，详见 [贡献指南](CONTRIBUTING.md)。

数据库、密钥、真实项目、备份、历史对话、验收材料与运行时不纳入源码仓库。安装包二进制作为 GitHub Release 附件，版本说明与校验值保留在 releases/。数据库备份不等于项目文件备份；项目 Word 和档案可能位于外部目录。

模型密钥由当前 Windows 用户账户保护。云端模型在相应操作中使用所选资料，并受项目本地处理限制约束。保留本机访问、会话校验、未保存保护及历史记录机制。

首次源码快照保持原有范围。历史安装包现已单独归档，精确构建源码未知；后续新构建应记录实际源码提交。源码检查、构建清单核对不等于实际安装、升级、托盘、卸载或新电脑离线验收。
