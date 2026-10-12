"""Double-click launcher for the local workbench."""
from __future__ import annotations

import ctypes
import json
import os
import re
import subprocess
import sys
import time
import traceback
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
PORT = int(os.environ.get("PERSONAL_WORKBENCH_PORT", "18763"))
URL = f"http://127.0.0.1:{PORT}"
from app_version import REVISION
EDGE = next((path for path in (
    Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe",
    Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Microsoft/Edge/Application/msedge.exe",
) if path.is_file()), None)


def message(value):
    ctypes.windll.user32.MessageBoxW(None, value, "个人工作台", 0x10)


def ready():
    try:
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(URL + "/api/health", timeout=1.5) as reply:
            data = json.loads(reply.read())
        installation = data.get("installation")
        return data.get("app") == "personal-workbench" and data.get('revision')==REVISION and bool(installation) and Path(installation).resolve() == HERE
    except Exception:
        return False


def stop_outdated_server():
    """Only a user launch may replace this installation's idle, outdated backend."""
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def read(path):
        with opener.open(URL+path,timeout=3) as reply:return json.loads(reply.read())
    try:health=read('/api/health')
    except Exception:return True
    if health.get('app')!='personal-workbench' or Path(health.get('installation','')).resolve()!=HERE:
        message('工作台端口被其他程序占用，请先关闭另一份工作台。');return False
    if health.get('revision')==REVISION:return True
    try:
        def idle():
            for project in read('/api/bootstrap')['projects']:
                result=read('/api/archive/ai/status?project_id='+project['id'])
                if result.get('job') and result['job']['status'] in ('排队中','运行中','取消中'):
                    return False
            return True
        if not idle():
            message('项目资料正在加载，请等加载完成后再打开新版工作台。');return False
        with opener.open(URL+'/',timeout=3) as reply:page=reply.read().decode('utf-8')
        token=re.search(r'<meta name="workbench-token" content="([^"]+)"',page)
        if not token:raise RuntimeError('无法核对工作台会话')
        latest=read('/api/health')
        if latest.get('app')!='personal-workbench' or latest.get('installation')!=health.get('installation'):raise RuntimeError('后台程序已经改变')
        if latest.get('revision')==REVISION:return True
        if not idle():
            message('项目资料正在加载，请等加载完成后再打开新版工作台。');return False
        request=urllib.request.Request(URL+'/api/shutdown',data=b'{}',method='POST',headers={'Content-Type':'application/json','X-Workbench-Token':token[1]})
        with opener.open(request,timeout=5) as reply:
            if not json.loads(reply.read()).get('stopping'):raise RuntimeError('旧后台未确认退出')
        for _ in range(30):
            try:read('/api/health')
            except OSError:return True
            time.sleep(.2)
        raise RuntimeError('旧后台尚未退出')
    except Exception:
        message('新版页面已安装，但旧后台尚未退出。请保存正在编辑的内容，关闭旧后台后再打开工作台。');return False


def main():
    if not ready():
        if not stop_outdated_server():return
        logfile = (HERE / "data" / "startup.log")
        logfile.parent.mkdir(exist_ok=True)
        creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        with logfile.open("ab") as log:
            python_flags = ["-s", "-E", "-B"] if (HERE / "portable.marker").is_file() else ["-B"]
            server_env = os.environ.copy()
            # The prior bundle currently holds the user's live database. Keep using it
            # while the source workbench is being refined, without replacing either copy.
            prior_data = HERE / "dist" / "个人工作台-便携版" / "data"
            if not (HERE / "portable.marker").is_file() and (prior_data / "workbench.sqlite3").is_file():
                server_env["PERSONAL_WORKBENCH_DATA_DIR"] = str(prior_data)
            subprocess.Popen([sys.executable, *python_flags, str(HERE / "server.py")], cwd=HERE,
                             stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                             creationflags=creation_flags, env=server_env)
        for _ in range(50):
            if ready():
                break
            time.sleep(.2)
    if not ready():
        message("工作台服务未启动。请查看 data\\startup.log；若电脑上还有另一份工作台在运行，请先关闭旧副本占用的 18763 端口。")
        return
    if EDGE:
        try:
            browser = subprocess.Popen([str(EDGE), "--app=" + URL, "--window-size=1420,930"],
                                       cwd=HERE, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            time.sleep(.6)
            if browser.poll() is None or browser.returncode == 0:
                return
        except OSError:
            pass
    os.startfile(URL)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logfile = HERE / "data" / "startup.log"
        try:
            logfile.parent.mkdir(exist_ok=True)
            with logfile.open("a", encoding="utf-8") as log:
                traceback.print_exc(file=log)
        except Exception:
            pass
        message(f"工作台启动失败，请查看 {logfile}。")
        sys.exit(1)
