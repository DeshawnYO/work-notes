"""Build a movable Windows workbench folder and ZIP from this installation.

Run with the Python installation currently used by the workbench. The produced
folder contains its own Python runtime, a consistent SQLite snapshot, and copies
of all projects registered at build time. This script never alters those sources.
"""
from __future__ import annotations

import argparse
import importlib
import importlib.metadata
import json
import os
import re
import shutil
import sqlite3
import sys
import zipfile
from contextlib import closing
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_OUTPUT = HERE / "dist" / "个人工作台-便携版"
APP_FILES = ("core.py", "server.py", "ai_archive.py", "project_dossier.py", "app_version.py", "v2_data.py", "richtext.py", "major_records.py", "workbench_v2.py", "v22_services.py", "default_templates.py", "project_requirements.py", "report_generation.py", "launcher.py", "prepare_move.py", "build_portable.py",
             "启动工作台.cmd", "启动工作台.vbs", "准备搬家.cmd", "README.md")
RUNTIME_FILES = ("python.exe", "pythonw.exe", "python3.dll", "python314.dll", "vcruntime140.dll", "vcruntime140_1.dll", "LICENSE.txt")
DEPENDENCIES = (
    ("docx", "python-docx"), ("pptx", "python-pptx"),
    ("lxml", "lxml"), ("PIL", "Pillow"),
    ("xlsxwriter", "XlsxWriter"), ("packaging", "packaging"),
    ("typing_extensions", "typing_extensions"),
    ("openpyxl", "openpyxl"), ("et_xmlfile", "et_xmlfile"),
)


def copy_stdlib(source: Path, destination: Path) -> None:
    excluded = {"site-packages", "test", "idlelib", "ensurepip", "venv", "turtledemo"}

    def ignored(folder: str, names: list[str]) -> set[str]:
        skip = {name for name in names if name == "__pycache__" or name.endswith((".pyc", ".pyo"))}
        if Path(folder).resolve() == source.resolve():
            skip |= excluded.intersection(names)
        return skip

    shutil.copytree(source, destination, ignore=ignored)


def copy_runtime(destination: Path) -> dict[str, str]:
    base = Path(sys.base_prefix).resolve()
    if sys.version_info[:2] != (3, 14) or sys.maxsize <= 2**32:
        raise RuntimeError("当前构建脚本需要本机的 64 位 Python 3.14")
    destination.mkdir()
    for filename in RUNTIME_FILES:
        src = base / filename
        if not src.is_file():
            raise RuntimeError(f"Python 运行文件缺失：{src}")
        shutil.copy2(src, destination / filename)
    shutil.copytree(base / "DLLs", destination / "DLLs")
    shutil.copytree(base / "tcl", destination / "tcl")
    copy_stdlib(base / "Lib", destination / "Lib")
    site = destination / "Lib" / "site-packages"
    site.mkdir()
    versions = {}
    for module_name, distribution_name in DEPENDENCIES:
        module = importlib.import_module(module_name)
        source = Path(module.__file__).resolve()
        if source.name == "__init__.py":
            shutil.copytree(source.parent, site / source.parent.name,
                            ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo"))
        else:
            shutil.copy2(source, site / source.name)
        dist = importlib.metadata.distribution(distribution_name)
        metadata_dir = Path(dist._path)
        if metadata_dir.is_dir():
            shutil.copytree(metadata_dir, site / metadata_dir.name)
        versions[distribution_name] = dist.version
    return versions


def reject_links(folder: Path) -> None:
    if folder.is_symlink():
        raise RuntimeError(f"项目目录是链接，无法安全打包：{folder}")
    for base, directories, files in os.walk(folder, followlinks=False):
        for name in directories + files:
            path = Path(base) / name
            if path.is_symlink():
                raise RuntimeError(f"项目包含链接，无法安全打包：{path}")


def snapshot_data(destination: Path) -> dict[str, int]:
    import core

    if not core.DB_PATH.is_file():
        core.init_db()
    destination.mkdir()
    with closing(sqlite3.connect(core.DB_PATH)) as source, closing(sqlite3.connect(destination / "workbench.sqlite3")) as target:
        source.backup(target)
    for item in core.DATA.iterdir():
        if item.name == "workbench.sqlite3" or item.name.startswith("workbench.sqlite3-") or item.suffix == ".log":
            continue
        if item.is_symlink():
            raise RuntimeError(f"数据目录包含链接：{item}")
        if item.is_dir():
            shutil.copytree(item, destination / item.name)
        elif item.is_file():
            shutil.copy2(item, destination / item.name)
    return {"source_projects": len(core.rows("SELECT id FROM projects"))}


def bundle_projects(folder: Path) -> dict[str, int]:
    database = folder / "data" / "workbench.sqlite3"
    project_folder = folder / "projects"
    project_folder.mkdir()
    with closing(sqlite3.connect(database)) as con:
        con.execute("CREATE TABLE IF NOT EXISTS portable_project_paths(project_id TEXT PRIMARY KEY,rel_path TEXT NOT NULL)")
        projects = con.execute("SELECT id,name,root FROM projects").fetchall()
        for project_id, name, root_text in projects:
            source = Path(root_text).resolve()
            if not source.is_dir():
                raise RuntimeError(f"项目目录不存在，不能生成完整工具包：{name}（{source}）")
            if folder in source.parents or source == folder:
                raise RuntimeError(f"项目目录位于正在构建的工具包内：{source}")
            reject_links(source)
            safe_name = re.sub(r'[^\w\-\u4e00-\u9fff]+', '-', name).strip('-')[:55] or "项目"
            target = project_folder / f"{project_id[:8]}-{safe_name}"
            shutil.copytree(source, target)
            relative = target.relative_to(folder).as_posix()
            con.execute("UPDATE projects SET root=? WHERE id=?", (str(target.resolve()), project_id))
            con.execute("INSERT INTO portable_project_paths VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET rel_path=excluded.rel_path",
                        (project_id, relative))
        # Windows DPAPI is tied to the old user account. Do not ship unusable
        # encrypted cloud credentials to the next PC.
        cloud_count = con.execute("SELECT count(*) FROM model_profiles WHERE provider='online'").fetchone()[0]
        con.execute("DELETE FROM model_profiles WHERE provider='online'")
        active = con.execute("SELECT value FROM settings WHERE key='active_model'").fetchone()
        if active and active[0] and not con.execute("SELECT 1 FROM model_profiles WHERE id=?", (active[0],)).fetchone():
            con.execute("UPDATE settings SET value='' WHERE key='active_model'")
        con.commit()
        con.execute("PRAGMA journal_mode=DELETE")
    return {"bundled_projects": len(projects), "cloud_connections_to_reconfigure": cloud_count}


def create_zip(folder: Path, target: Path) -> None:
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                archive.write(path, Path(folder.name) / path.relative_to(folder))


def main() -> None:
    parser = argparse.ArgumentParser(description="生成可复制的 Windows 个人工作台工具包")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    output = args.output.resolve()
    building = output.with_name(output.name + ".building")
    archive = output.with_suffix(".zip")
    if any(path.exists() for path in (output, building, archive)):
        raise SystemExit(f"目标已存在，为保护已有数据没有覆盖：{output}")
    building.mkdir(parents=True)
    try:
        for filename in APP_FILES:
            shutil.copy2(HERE / filename, building / filename)
        shutil.copytree(HERE / "static", building / "static",
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        if (HERE / 'vendor').is_dir():
            shutil.copytree(HERE / 'vendor', building / 'vendor',
                            ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        (building / "portable.marker").write_text("Portable Windows workbench\n", encoding="utf-8")
        versions = copy_runtime(building / "runtime")
        stats = snapshot_data(building / "data")
        stats.update(bundle_projects(building))
        manifest = {"built_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                    "python": sys.version.split()[0], "dependencies": versions, **stats}
        (building / "打包清单.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        building.rename(output)
        create_zip(output, archive)
        print(json.dumps({"folder": str(output), "zip": str(archive), **stats}, ensure_ascii=False))
    except Exception:
        # The incomplete build remains visible for diagnosis. Existing outputs
        # and source workbench data are never removed or replaced.
        raise


if __name__ == "__main__":
    main()
