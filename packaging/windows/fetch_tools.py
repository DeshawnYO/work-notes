"""Fetch pinned/recorded build dependencies, never user's project files."""
from pathlib import Path
import hashlib,json,urllib.request,zipfile

ROOT=Path(__file__).resolve().parents[2]
DOWNLOADS=ROOT/'build/downloads'
DOWNLOADS.mkdir(parents=True,exist_ok=True)
def download(url,name):
    path=DOWNLOADS/name
    if not path.is_file():
        request=urllib.request.Request(url,headers={'User-Agent':'WorkNotes-Build/1.0'})
        with urllib.request.urlopen(request,timeout=120) as response, path.with_suffix(path.suffix+'.part').open('wb') as output:
            while chunk:=response.read(1024*1024):output.write(chunk)
        path.with_suffix(path.suffix+'.part').replace(path)
    print(json.dumps({'file':name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()},ensure_ascii=False),flush=True)
    return path

download('https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe','innosetup-6.7.3.exe')
download('https://go.microsoft.com/fwlink/?linkid=2124701','MicrosoftEdgeWebView2RuntimeInstallerX64.exe')
language=download('https://raw.githubusercontent.com/kira-96/Inno-Setup-Chinese-Simplified-Translation/main/ChineseSimplified.isl','ChineseSimplified.isl')
(ROOT/'packaging/windows/ChineseSimplified.isl').write_bytes(language.read_bytes())
with urllib.request.urlopen('https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/index.json',timeout=60) as response:
    versions=json.load(response)['versions']
version=next(v for v in reversed(versions) if '-' not in v)
package=download(f'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/{version}/microsoft.web.webview2.{version}.nupkg',f'webview2-{version}.nupkg')
target=ROOT/'build/tools/webview2'
target.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(package) as archive:
    for name in ['lib/net462/Microsoft.Web.WebView2.Core.dll','lib/net462/Microsoft.Web.WebView2.WinForms.dll','runtimes/win-x64/native/WebView2Loader.dll','LICENSE.txt']:
        if name in archive.namelist():(target/Path(name).name).write_bytes(archive.read(name))
(target/'version.txt').write_text(version,encoding='utf-8')
