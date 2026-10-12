"""Safely stop this exact local workbench before copying its folder."""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
URL = f"http://127.0.0.1:{int(os.environ.get('PERSONAL_WORKBENCH_PORT', '18763'))}"


def get_json(path: str) -> dict:
    with urllib.request.urlopen(URL + path, timeout=3) as response:
        return json.load(response)


def main() -> None:
    try:
        health = get_json("/api/health")
    except (OSError, ValueError):
        print("工作台服务已关闭，可以复制整个工具包文件夹。")
        return
    if Path(health.get("installation", "")).resolve() != HERE:
        raise RuntimeError("当前端口正在运行另一份工作台；没有停止它。")
    with urllib.request.urlopen(URL + "/", timeout=3) as response:
        page = response.read(1024 * 1024).decode("utf-8")
    match = re.search(r'<meta name="workbench-token" content="([^"]+)"', page)
    if not match:
        raise RuntimeError("无法读取本机工作台会话信息。")
    request = urllib.request.Request(URL + "/api/shutdown", data=b"{}", method="POST",
                                     headers={"Content-Type": "application/json",
                                              "X-Workbench-Token": match.group(1)})
    with urllib.request.urlopen(request, timeout=5) as response:
        if not json.load(response).get("stopping"):
            raise RuntimeError("工作台未确认退出。")
    for _ in range(30):
        try:
            get_json("/api/health")
        except (OSError, ValueError):
            print("工作台已安全退出。现在可以复制整个工具包文件夹。")
            return
        time.sleep(0.2)
    raise RuntimeError("工作台仍在运行，请稍后重试。")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"准备搬家失败：{exc}", file=sys.stderr)
        raise SystemExit(1)
