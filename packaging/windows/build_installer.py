"""Build a clean offline Windows installer without copying private data/projects."""
from pathlib import Path
import hashlib,importlib,importlib.metadata,json,shutil,subprocess,sys,re
from datetime import datetime
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
import build_portable
import app_version

def main():
    output=ROOT/'releases/windows'/app_version.VERSION
    package=output/('工作笔记-安装包-'+app_version.VERSION+'-Windows-x64.exe')
    if package.exists(): raise RuntimeError('此版本安装包已存在，请增加版本号，不能覆盖：'+str(package))
    stage=ROOT/('build/windows-app-'+app_version.VERSION+'-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
    stage.mkdir(parents=True,exist_ok=False)
    backend=stage/'backend';backend.mkdir(exist_ok=True)
    for name in ('core.py','server.py','ai_archive.py','project_dossier.py','desktop_backend.py','data_storage.py','app_version.py','v2_data.py','richtext.py','major_records.py','workbench_v2.py','v22_services.py','default_templates.py','project_requirements.py','report_generation.py'):
        shutil.copy2(ROOT/name,backend/name)
    for name in ('static','vendor'):
        shutil.copytree(ROOT/name,backend/name,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    (backend/'installed.marker').write_text('Work Notes installed application. Data lives outside this directory.\n',encoding='utf-8')
    runtime=backend/'runtime'
    if not runtime.exists():build_portable.copy_runtime(runtime)
    site=runtime/'Lib/site-packages'
    for module_name,dist_name in (('openpyxl','openpyxl'),('et_xmlfile','et_xmlfile'),('xlrd','xlrd')):
        mod=importlib.import_module(module_name);source=Path(mod.__file__).resolve().parent
        shutil.copytree(source,site/source.name,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        metadata=Path(importlib.metadata.distribution(dist_name)._path)
        shutil.copytree(metadata,site/metadata.name,dirs_exist_ok=True)
    for name in ('work-notes.ico','work-notes.png'):shutil.copy2(ROOT/'assets/brand'/name,stage/name)
    tools=ROOT/'build/tools/webview2'
    for name in ('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll'):
        shutil.copy2(tools/name,stage/name)
    compiler=Path(r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe')
    generated=stage/'WorkNotes.generated.cs'
    source=(ROOT/'packaging/windows/WorkNotes.cs').read_text(encoding='utf-8-sig')
    source=re.sub(r'(Assembly(?:File)?Version\(")[^"]+("\))',lambda m:m[1]+app_version.ASSEMBLY_VERSION+m[2],source)
    generated.write_text(source,encoding='utf-8-sig')
    subprocess.run([str(compiler),'/nologo','/target:winexe','/platform:x64','/optimize+','/codepage:65001',
        '/win32icon:'+str(stage/'work-notes.ico'),'/out:'+str(stage/'工作笔记.exe'),
        '/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll','/r:System.Net.Http.dll',
        '/r:'+str(stage/'Microsoft.Web.WebView2.Core.dll'),'/r:'+str(stage/'Microsoft.Web.WebView2.WinForms.dll'),
        str(generated)],check=True)
    generated.unlink()
    (stage/'工作笔记.exe.config').write_text('''<?xml version="1.0" encoding="utf-8"?><configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.6.2"/></startup></configuration>''',encoding='utf-8')
    notice=f'''工作笔记 {app_version.VERSION}\n\n适用 Windows 10（1607及以上）/11 64位。\n报告先总结工作事项，不预加载完整档案；有歧义时仅查询相关片段。后台生成显示状态，可继续使用其他功能，支持取消及失败重试。\n新增每项目按月独立需求管理：首行新增、完整需求描述、类型/状态/优先级下拉修改、系统与板块历史值选择、上月未完成需求递延、Excel预览导入导出。\n“一句话需求”携带明确JSON字段规范与示例，兼容常见模型返回，补齐可选字段后自动入表；保留原句及待确认建议，遵守项目仅本地处理限制。\n保留项目档案、工作记录、工作报告、重大汇报 Word 归档和个人待办。团队共享不在本版范围。\n安装包包含 Python 和离线 WebView2 运行环境，基础功能无需联网。\n首次启动需选择程序目录之外的数据存储文件夹。可创建新数据、打开已有数据或迁移旧版 data 文件夹。\n升级前同时备份数据库和项目文件。数据结构迁移7新增后台报告任务表，保留旧报告及来源。迁移6增加月度、系统/板块及提出时间，按创建月份保存旧需求并映射枚举，原字段与历史保留；旧版不能按新字段继续维护。回退前另行保存新需求和升级前备份。\n正式 Word 保存在项目目录；数据库备份不含项目 Word 与档案。\n升级和卸载程序不会删除数据目录。关闭窗口后驻留系统托盘，右键可完整退出。\n联网模型由使用者配置 API Key。本地模型需另行安装 Ollama 及模型。\n本安装包不含制作者的个人记录、项目材料或密钥。\n源码和独立数据流程已验证；实际安装升级、真实模型效果与新电脑离线运行未验收。\n'''
    (stage/'安装说明.txt').write_text(notice,encoding='utf-8-sig')
    for notice_name in ('LICENSE','NOTICE.md'):
        shutil.copy2(ROOT/notice_name,stage/notice_name)
    licenses=stage/'第三方许可';licenses.mkdir(exist_ok=True)
    if (tools/'LICENSE.txt').exists():shutil.copy2(tools/'LICENSE.txt',licenses/'WebView2-SDK.txt')
    shutil.copy2(backend/'runtime/LICENSE.txt',licenses/'Python.txt')
    (licenses/'说明.txt').write_text('运行环境依赖的许可证和包元数据位于 backend/runtime/Lib/site-packages/*dist-info。WebView2 运行环境由微软原始签名安装程序安装，遵循其许可条款。\n',encoding='utf-8')
    # Fail closed if a future change accidentally adds private databases or project folders.
    for file in stage.rglob('*'):
        if file.suffix.lower() in ('.sqlite','.sqlite3','.db') or file.name in ('portable.marker','projects','data'):
            raise RuntimeError('发布目录含用户数据或项目：'+str(file.relative_to(stage)))
    manifest={str(file.relative_to(stage)).replace('\\','/'):{'size':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
              for file in sorted(stage.rglob('*')) if file.is_file()}
    output.mkdir(parents=True,exist_ok=True)
    (output/'程序文件清单.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (output/'构建信息.json').write_text(json.dumps({'version':app_version.VERSION,'revision':app_version.REVISION,'schema_version':app_version.SCHEMA_VERSION,'stage':str(stage),'python':sys.version,'source_commit':None,'dependencies':{name:importlib.metadata.version(name) for _,name in build_portable.DEPENDENCIES}},ensure_ascii=False,indent=2),encoding='utf-8')
    if '--stage-only' in sys.argv:
        print(json.dumps({'stage':str(stage),'installer_rebuilt':False},ensure_ascii=False));return
    with (output/'构建日志.txt').open('w',encoding='utf-8') as log:
        subprocess.run([str(ROOT/'build/tools/Inno/ISCC.exe'),'/DAppSource='+str(stage),'/DOutputPath='+str(output),
            '/DProductVersion='+app_version.VERSION,
            '/DWebViewInstaller='+str(ROOT/'build/downloads/MicrosoftEdgeWebView2RuntimeInstallerX64.exe'),str(ROOT/'packaging/windows/work-notes.iss')],check=True,stdout=log,stderr=subprocess.STDOUT)
    print(json.dumps({'stage':str(stage),'output':str(output),'private_data_included':False},ensure_ascii=False))

if __name__=='__main__':main()
