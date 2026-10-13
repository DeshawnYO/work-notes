"""Single-user local HTTP server. The desktop launcher opens it in an app window."""
from __future__ import annotations

import io
import json
import os
import secrets
import threading
import time
import traceback
import urllib.parse
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import core
import ai_archive
import project_dossier
import app_version
import major_records
import workbench_v2
import v22_services
import project_requirements
import report_generation

HOST = "127.0.0.1"
PORT = int(os.environ.get("PERSONAL_WORKBENCH_PORT", "18763"))
TOKEN = secrets.token_urlsafe(32)
STATIC = core.HERE / "static"


def run_scheduled():
    """Do one catch-up pass, then check for nightly work while the server runs."""
    while True:
        try:
            hour = int(core.setting("archive_hour", "21"))
            stamp = core.today()
            for project in core.rows("SELECT * FROM projects WHERE deleted_at IS NULL"):
                # Only maintain daily notes for a dossier already saved explicitly.
                # Empty/deleted dossiers must stay empty until the user saves or generates.
                if not core.one("SELECT project_id FROM project_dossiers WHERE project_id=?", (project["id"],)) or core.setting("dossier_deleted_"+project["id"]):
                    continue
                last = (project["last_archive_at"] or "")[:10]
                attempted = core.setting("archive_attempt_" + project["id"])
                due = (datetime.now().hour >= hour) or (last and last < stamp)
                if due and attempted != stamp:
                    core.put_setting("archive_attempt_" + project["id"], stamp)
                    try:
                        core.update_archive(project["id"])
                    except Exception as exc:
                        with core.db() as con:
                            con.execute("UPDATE projects SET archive_status=? WHERE id=?", (f"失败：{type(exc).__name__}", project["id"]))
        except Exception:
            pass
        time.sleep(60)


class Handler(BaseHTTPRequestHandler):
    server_version = "PersonalWorkbench/2.0"

    def log_message(self, fmt, *args):
        try:
            with (core.DATA / "server.log").open("a", encoding="utf-8") as log:
                log.write(f"{core.now()} {fmt % args}\n")
        except OSError:
            pass

    def send_data(self, value, status=200, content_type="application/json; charset=utf-8", extra=None):
        if isinstance(value, (dict, list)):
            payload = json.dumps(value, ensure_ascii=False, default=str).encode("utf-8")
        elif isinstance(value, str):
            payload = value.encode("utf-8")
        else:
            payload = value
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'")
        if extra:
            for key, item in extra.items():
                self.send_header(key, item)
        self.end_headers()
        self.wfile.write(payload)

    def error(self, exc):
        status = 404 if isinstance(exc, FileNotFoundError) else 400 if isinstance(exc, ValueError) else 500
        message = str(exc) if status != 500 else "操作未完成，请检查本地文件与服务状态"
        self.log_message("error %s %s", type(exc).__name__, str(exc)[:200])
        self.send_data({"error": message}, status)

    def get_query(self):
        parsed = urllib.parse.urlsplit(self.path)
        query = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query, keep_blank_values=True).items()}
        return parsed.path, query

    def read_body(self, max_bytes=25 * 1024 * 1024):
        size = int(self.headers.get("Content-Length", "0"))
        if size > max_bytes or size < 0:
            raise ValueError("文件超过本次操作允许大小")
        return self.rfile.read(size)

    def read_json(self):
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            raise ValueError("请求格式不正确")
        return json.loads(self.read_body().decode("utf-8"))

    def authorized(self):
        host = self.headers.get("Host", "")
        if host not in (f"{HOST}:{PORT}", f"localhost:{PORT}"):
            self.send_data({"error": "无效的访问地址"}, 403)
            return False
        if self.command in ("POST", "PATCH", "DELETE"):
            origin = self.headers.get("Origin", "")
            if origin and origin not in (f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"):
                self.send_data({"error": "请求来源不可信"}, 403)
                return False
            if self.headers.get("X-Workbench-Token") != TOKEN:
                self.send_data({"error": "会话已失效，请刷新工作台"}, 403)
                return False
        return True

    def do_GET(self):
        if not self.authorized():
            return
        path, query = self.get_query()
        try:
            if path == "/":
                page = (STATIC / "index.html").read_text(encoding="utf-8").replace("__SESSION_TOKEN__", TOKEN)
                return self.send_data(page, content_type="text/html; charset=utf-8")
            if path == '/app-icon.png':
                return self.send_data((STATIC/'app-icon.png').read_bytes(),content_type='image/png')
            if path in ("/app.js", "/v2.js", "/v22.js", "/v23.js", "/report-jobs.js", "/style.css"):
                mime = "text/javascript; charset=utf-8" if path.endswith(".js") else "text/css; charset=utf-8"
                return self.send_data((STATIC / path[1:]).read_bytes(), content_type=mime)
            if path == "/api/health":
                return self.send_data({"app": "personal-workbench", "version": 2, "product_version":app_version.VERSION, "schema_version":app_version.SCHEMA_VERSION, "revision": app_version.REVISION, "installation": str(core.HERE), "data_dir": str(core.DATA)})
            if path == '/api/requirements':
                return self.send_data(project_requirements.list_items(query))
            if path in ('/api/requirements/export', '/api/requirements/template', '/api/requirements/errors'):
                if path.endswith('/errors'):
                    body, name = project_requirements.error_workbook(query.get('project_id',''), query.get('token',''))
                else:
                    body, name = project_requirements.export(query, template=path.endswith('/template'))
                return self.send_data(body, content_type=project_requirements.XLSX_MIME,
                                      extra={'Content-Disposition': "attachment; filename*=UTF-8''" + urllib.parse.quote(name)})
            if path == '/api/desktop/busy':
                jobs = core.rows("SELECT id,status FROM ai_archive_jobs WHERE status IN ('排队中','运行中','取消中')")
                jobs += core.rows("SELECT id,status FROM dossier_jobs WHERE status='整理中'")
                jobs += core.rows("SELECT id,status FROM report_jobs WHERE status IN ('排队中','运行中','取消中')")
                return self.send_data({"busy": bool(jobs)})
            if path == '/api/report-jobs':
                return self.send_data(report_generation.list_jobs())
            if path == '/api/report-jobs/status':
                return self.send_data(report_generation.get_job(query.get('id','')))
            if path == '/api/reports/list':
                return self.send_data({'reports':core.rows('SELECT * FROM reports ORDER BY created_at DESC,rowid DESC')})
            if path == "/api/bootstrap":
                result = {"today": core.today(), "week_start": core.week_start(),
                          "removed_projects":core.rows('SELECT id,name FROM projects WHERE deleted_at IS NOT NULL'),
                          "projects": core.rows("SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY name"),
                          "goals": core.rows("SELECT * FROM goals ORDER BY week_start DESC,created_at DESC"),
                          "tasks": core.rows("SELECT * FROM tasks ORDER BY updated_at DESC"),
                          "carryover": core.carryover_state(),
                          "logs": core.rows("SELECT * FROM logs ORDER BY event_date DESC,created_at DESC LIMIT 200"),
                          "project_items": core.rows("SELECT * FROM project_items ORDER BY updated_at DESC"),
                          "reports": core.rows("SELECT * FROM reports ORDER BY created_at DESC,rowid DESC"),
                          "models": core.model_list(),
                          "active_model": core.setting("active_model"),
                          "archive_hour": core.setting("archive_hour", "21"),
                          "portable_mode": core.PORTABLE_MODE, "data_dir": str(core.DATA),
                          "subtasks":core.rows('SELECT * FROM subtasks ORDER BY created_at,id'),
                          "scratch_notes":core.rows('SELECT * FROM scratch_notes ORDER BY created_at DESC,id'),
                          "product_version":app_version.VERSION}
                return self.send_data(result)
            if path == '/api/major':
                return self.send_data(major_records.list_records())
            if path == '/api/major/record':
                return self.send_data(major_records.get(query.get('id','')))
            if path == '/api/major/location':
                return self.send_data(major_records.location(query.get('id','')))
            if path == '/api/personal-files':
                return self.send_data(major_records.personal_files(query.get('dir','')))
            if path == '/api/major/download':
                loc=major_records.location(query.get('id',''))
                return self.send_data(Path(loc['full_path']).read_bytes(),content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    extra={'Content-Disposition':"attachment; filename*=UTF-8''"+urllib.parse.quote(loc['file_name'])})
            if path == '/api/templates':
                return self.send_data(v22_services.templates(query.get('project_id') or None))
            if path == '/api/reports/preview':
                return self.send_data(v22_services.report_preview(query.get('kind'),query.get('start'),query.get('end')))
            if path == '/api/reports/sources':
                return self.send_data(v22_services.report_sources(query.get('id','')))
            if path == '/api/dossier/generate-preview':
                return self.send_data(v22_services.dossier_preview(query.get('project_id','')))
            if path == '/api/dossier':
                return self.send_data(project_dossier.read(query.get('project_id','')))
            if path == '/api/dossier/job':
                return self.send_data(project_dossier.status(query.get('id','')))
            if path == "/api/logs/month":
                month = query.get("month", core.today()[:7])
                project_id = query.get("project_id", "")
                return self.send_data({"month": month, "logs": core.month_logs(month, project_id),
                                       "tasks": core.month_task_activity(month, project_id)})
            if path == "/api/logs/export":
                month = query.get("month", core.today()[:7])
                body = core.month_logs_markdown(month, query.get("project_id", ""))
                name = f"工作记录-{month}.md"
                return self.send_data(body, content_type="text/markdown; charset=utf-8",
                                      extra={"Content-Disposition": f"attachment; filename*=UTF-8''{urllib.parse.quote(name)}"})
            if path == "/api/files":
                return self.send_data(core.file_tree(query.get("project_id", ""), query.get("dir", "")))
            if path == "/api/file":
                return self.send_data(core.read_file(query.get("project_id", ""), query.get("path", "")))
            if path == "/api/archives":
                project = core.one("SELECT * FROM projects WHERE id=?", (query.get("project_id", ""),))
                if not project:
                    raise FileNotFoundError("项目不存在")
                archive = Path(project["root"]) / core.ARCHIVE_DIR
                main = archive / "项目档案.md"
                manual = archive / "人工补充.md"
                index = archive / "文件索引.md"
                return self.send_data({"body": main.read_text(encoding="utf-8") if main.exists() else "",
                                       "manual": manual.read_text(encoding="utf-8") if manual.exists() else "",
                                       "status": project["archive_status"], "updated_at": project["last_archive_at"],
                                       "has_index": index.is_file()})
            if path == "/api/archive/ai/index":
                project = core.one("SELECT * FROM projects WHERE id=?", (query.get("project_id", ""),))
                if not project:
                    raise FileNotFoundError("项目不存在")
                index = Path(project["root"]) / core.ARCHIVE_DIR / "文件索引.md"
                if not index.is_file():
                    raise FileNotFoundError("尚未生成文件索引")
                name = f"{project['name']}-文件索引.md"
                return self.send_data(index.read_bytes(), content_type="text/markdown; charset=utf-8",
                                      extra={"Content-Disposition": f"attachment; filename*=UTF-8''{urllib.parse.quote(name)}"})
            if path == "/api/archive/ai/preview":
                return self.send_data(ai_archive.preview(query.get("project_id", ""), query.get("mode", "")))
            if path == "/api/archive/ai/status":
                pid = query.get("project_id", "")
                if not core.one("SELECT id FROM projects WHERE id=?", (pid,)):
                    raise FileNotFoundError("项目不存在")
                return self.send_data({"job": ai_archive.latest_job(pid)})
            if path == "/api/ollama/models":
                return self.send_data({"models": core.available_ollama()})
            if path.startswith("/api/report-export/"):
                rid = path.rsplit("/", 1)[1]
                report = core.one("SELECT * FROM reports WHERE id=?", (rid,))
                if not report:
                    raise FileNotFoundError("报告不存在")
                name = f"{report['kind']}-{report['period_start']}.md"
                return self.send_data(report["body"], content_type="text/markdown; charset=utf-8",
                                      extra={"Content-Disposition": f"attachment; filename*=UTF-8''{urllib.parse.quote(name)}"})
            if path.startswith("/api/report-export-docx/"):
                rid = path.rsplit("/", 1)[1]
                report = core.one("SELECT * FROM reports WHERE id=?", (rid,))
                if not report:
                    raise FileNotFoundError("报告不存在")
                name = f"{report['kind']}-{report['period_start']}.docx"
                return self.send_data(core.report_docx(report), content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                      extra={"Content-Disposition": f"attachment; filename*=UTF-8''{urllib.parse.quote(name)}"})
            raise FileNotFoundError("页面不存在")
        except Exception as exc:
            self.error(exc)

    def do_POST(self):
        self.mutate()

    def do_PATCH(self):
        self.mutate()

    def do_DELETE(self):
        self.mutate()

    def mutate(self):
        if not self.authorized():
            return
        path, query = self.get_query()
        try:
            if path == '/api/requirements/preview' and self.command == 'POST':
                mapping = json.loads(query['mapping']) if 'mapping' in query else None
                return self.send_data(project_requirements.preview(query.get('project_id',''), query.get('name',''), self.read_body(10*1024*1024), mapping,query.get('month')))
            if path == "/api/folder-picker":
                import tkinter as tk
                from tkinter import filedialog
                root = tk.Tk()
                root.withdraw()
                root.attributes("-topmost", True)
                try:
                    choice = filedialog.askdirectory(title="选择项目文件夹", mustexist=True, parent=root)
                finally:
                    root.destroy()
                return self.send_data({"path": choice})
            if path == "/api/folders/list":
                data = self.read_json()
                return self.send_data(core.browse_folders(str(data.get("path") or "")))
            if path == "/api/file/upload":
                pid = query.get("project_id", "")
                rel = query.get("path", "")
                return self.send_data(core.save_file(pid, rel, self.read_body(), overwrite=False))
            if path == '/api/dossier/upload':
                project_dossier.project(query.get('project_id',''))
                return self.send_data(project_dossier.extract_upload(query.get('name',''),self.read_body()))
            if path == '/api/major/import':
                return self.send_data(major_records.import_file(query.get('name',''),self.read_body(16*1024*1024)))
            data = self.read_json() if self.command != "DELETE" else {}
            if path == '/api/reports/start' and self.command == 'POST':
                return self.send_data(report_generation.start_report(data))
            if path == '/api/reports/manual' and self.command == 'POST':
                return self.send_data(report_generation.save_manual_report(data))
            if path == '/api/report-jobs/cancel' and self.command == 'POST':
                return self.send_data(report_generation.cancel_job(data))
            if path == '/api/requirements' and self.command == 'POST':
                return self.send_data(project_requirements.save(data))
            if path == '/api/requirements/delete' and self.command == 'POST':
                return self.send_data(project_requirements.remove_or_restore(data))
            if path == '/api/requirements/restore' and self.command == 'POST':
                return self.send_data(project_requirements.remove_or_restore(data, restore=True))
            if path == '/api/requirements/commit' and self.command == 'POST':
                return self.send_data(project_requirements.commit(data))
            if path == '/api/requirements/ai' and self.command == 'POST':
                return self.send_data(project_requirements.create_with_ai(data))
            if path == '/api/requirements/carryover' and self.command == 'POST':
                return self.send_data(project_requirements.carryover(data))
            if path == '/api/major' and self.command=='POST':
                return self.send_data(major_records.create(data))
            if path.startswith('/api/major/draft/') and self.command=='PATCH':
                return self.send_data(major_records.draft(path.rsplit('/',1)[-1],data))
            if path.startswith('/api/major/save/') and self.command=='POST':
                return self.send_data(major_records.save_word(path.rsplit('/',1)[-1],data))
            if path.startswith('/api/major/generate/') and self.command=='POST':
                return self.send_data(major_records.generate(path.rsplit('/',1)[-1],data))
            if path.startswith('/api/major/delete/') and self.command=='POST':
                return self.send_data(major_records.delete(path.rsplit('/',1)[-1],data.get('expected_revision')))
            if path == '/api/scratch' and self.command=='POST':
                return self.send_data(workbench_v2.scratch(data))
            if path.startswith('/api/scratch/convert/') and self.command=='POST':
                return self.send_data(workbench_v2.convert(path.rsplit('/',1)[-1],data))
            if path.startswith('/api/scratch/') and self.command=='PATCH':
                return self.send_data(workbench_v2.scratch(data,path.rsplit('/',1)[-1]))
            if path.startswith('/api/scratch/') and self.command=='DELETE':
                return self.send_data(workbench_v2.delete_scratch(path.rsplit('/',1)[-1]))
            if path == '/api/subtasks' and self.command=='POST':
                return self.send_data(workbench_v2.subtask(data))
            if path.startswith('/api/subtasks/') and self.command=='PATCH':
                return self.send_data(workbench_v2.subtask(data,path.rsplit('/',1)[-1]))
            if path.startswith('/api/subtasks/') and self.command=='DELETE':
                return self.send_data(workbench_v2.delete_subtask(path.rsplit('/',1)[-1]))
            if path.startswith('/api/models/') and self.command=='DELETE':
                return self.send_data(workbench_v2.delete_model(path.rsplit('/',1)[-1]))
            if path.startswith('/api/projects/') and self.command=='DELETE':
                return self.send_data(core.delete_project(path.rsplit('/',1)[-1]))
            if path == '/api/templates':
                return self.send_data(v22_services.save_template(data))
            if path == '/api/dossier/save':
                return self.send_data(project_dossier.save(data['project_id'],data['body'],data['expected_digest']))
            if path == '/api/dossier/delete':
                return self.send_data(v22_services.delete_dossier(data['project_id'],data['expected_digest']))
            if path == '/api/dossier/restore':
                return self.send_data(v22_services.restore_dossier(data['project_id'],data['expected_digest']))
            if path == '/api/dossier/generate':
                return self.send_data(v22_services.start_dossier(data['project_id'],data['expected_digest']))
            if path == '/api/dossier/section':
                return self.send_data(project_dossier.save_section(data['project_id'],data['index'],data['body'],data['expected_digest']))
            if path == '/api/dossier/start':
                return self.send_data(project_dossier.start(data['project_id'],data['kind'],data['text']))
            if path == "/api/projects" and self.command == "POST":
                return self.send_data(core.create_project(data))
            if path.startswith("/api/projects/") and self.command == "PATCH":
                return self.send_data(core.update_project(path.rsplit("/", 1)[1], data))
            if path == "/api/goals" and self.command == "POST":
                return self.send_data(core.create_goal(data))
            if path.startswith("/api/goals/") and self.command == "PATCH":
                return self.send_data(core.update_goal(path.rsplit("/", 1)[1], data))
            if path == "/api/tasks" and self.command == "POST":
                return self.send_data(core.create_task(data))
            if path == "/api/tasks/carryover" and self.command == "POST":
                return self.send_data(core.confirm_carryover(data))
            if path.startswith("/api/tasks/") and self.command == "PATCH":
                return self.send_data(core.update_task(path.rsplit("/", 1)[1], data))
            if path.startswith("/api/tasks/") and self.command == "DELETE":
                return self.send_data(core.delete_task(path.rsplit("/", 1)[1]))
            if path == "/api/logs" and self.command == "POST":
                return self.send_data(core.create_log(data))
            if path.startswith("/api/logs/") and self.command == "PATCH":
                return self.send_data(core.update_log(path.rsplit("/", 1)[1], data))
            if path == "/api/project-items" and self.command == "POST":
                return self.send_data(core.create_project_item(data))
            if path.startswith("/api/project-items/") and self.command == "PATCH":
                return self.send_data(core.update_project_item(path.rsplit("/", 1)[1], data))
            if path == "/api/file/save":
                return self.send_data(core.save_file(data["project_id"], data["path"], data["body"].encode("utf-8"), expected_ns=data.get("expected_ns")))
            if path == "/api/file/new":
                return self.send_data(core.create_document(data["project_id"], data["path"]))
            if path == "/api/file/mkdir":
                return self.send_data(core.create_folder(data["project_id"], data["path"]))
            if path == "/api/file/rename":
                return self.send_data(core.rename_file(data["project_id"], data["old"], data["new"]))
            if path == "/api/file/delete":
                return self.send_data(core.delete_file(data["project_id"], data["path"]))
            if path == "/api/file/open":
                return self.send_data(core.open_native(data["project_id"], data["path"]))
            if path == "/api/scan":
                return self.send_data(core.scan_project(data["project_id"]))
            if path == "/api/archive/run":
                return self.send_data(core.update_archive(data["project_id"], force=bool(data.get("force"))))
            if path == "/api/archive/ai/start":
                return self.send_data(ai_archive.start(data["project_id"], data["mode"]))
            if path == "/api/archive/ai/cancel":
                return self.send_data(ai_archive.cancel(data["project_id"]))
            if path == "/api/archive/manual":
                project = core.one("SELECT * FROM projects WHERE id=?", (data["project_id"],))
                if not project:
                    raise FileNotFoundError("项目不存在")
                target = Path(project["root"]) / core.ARCHIVE_DIR / "人工补充.md"
                core.atomic_write(target, str(data.get("body") or "").encode("utf-8"))
                return self.send_data({"saved": True})
            if path == "/api/reports":
                return self.send_data(core.generate_report(data["kind"], period_start=data.get("start"), period_end=data.get("end"), use_ai=data.get("use_ai", True)))
            if path.startswith("/api/reports/") and self.command == "PATCH":
                rid = path.rsplit("/", 1)[1]
                with core.db() as con:
                    con.execute("UPDATE reports SET body=? WHERE id=?", (str(data.get("body") or ""), rid))
                return self.send_data(core.one("SELECT * FROM reports WHERE id=?", (rid,)))
            if path == "/api/models":
                return self.send_data(core.create_profile(data))
            if path == "/api/models/activate":
                if data.get("id") and not core.one("SELECT id FROM model_profiles WHERE id=?", (data["id"],)):
                    raise ValueError("模型配置不存在")
                core.put_setting("active_model", data.get("id") or "")
                return self.send_data({"active_model": core.setting("active_model")})
            if path == "/api/models/test":
                profile = core.one("SELECT * FROM model_profiles WHERE id=?", (data.get("id"),))
                if not profile:
                    raise FileNotFoundError("模型配置不存在")
                answer = core.call_model(profile, "请仅回复：连接成功")
                return self.send_data({"answer": answer[:200]})
            if path == "/api/settings":
                hour = int(data.get("archive_hour"))
                if hour < 0 or hour > 23:
                    raise ValueError("晚间更新时间应在 0 至 23 点")
                core.put_setting("archive_hour", str(hour))
                return self.send_data({"archive_hour": str(hour)})
            if path == "/api/backup":
                return self.send_data(core.backup_data())
            if path == "/api/shutdown":
                self.send_data({"stopping": True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return
            raise FileNotFoundError("接口不存在")
        except Exception as exc:
            self.error(exc)


def main():
    core.init_db()
    major_records.recover()
    report_generation.recover_jobs()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    if os.environ.get('PERSONAL_WORKBENCH_DISABLE_SCHEDULER') != '1':
        threading.Thread(target=run_scheduled, daemon=True).start()
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
