"""Opt-in local daily snapshots. Never invoke a model or replace human dossiers."""
from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta
from pathlib import Path

import core

RUN_LOCK = threading.Lock()


def settings():
    selected = json.loads(core.setting('auto_organize_projects', '[]'))
    active = {p['id'] for p in core.rows('SELECT id FROM projects WHERE deleted_at IS NULL')}
    return {'enabled': core.setting('auto_organize_enabled', '0') == '1',
            'project_ids': [pid for pid in selected if pid in active],
            'archive_hour': core.setting('archive_hour', '21')}


def save_settings(data):
    enabled = data.get('enabled')
    ids = data.get('project_ids')
    if not isinstance(enabled, bool) or not isinstance(ids, list) or any(not isinstance(x, str) for x in ids):
        raise ValueError('请设置自动整理开关与项目范围')
    ids = list(dict.fromkeys(ids))
    active = {p['id'] for p in core.rows('SELECT id FROM projects WHERE deleted_at IS NULL')}
    if any(pid not in active for pid in ids):raise ValueError('所选项目已变化，请刷新后重新选择')
    try:hour = int(data.get('archive_hour'))
    except (TypeError, ValueError):raise ValueError('更新时间应在 0 至 23 点')
    if not 0 <= hour <= 23:raise ValueError('更新时间应在 0 至 23 点')
    with core.db() as con:
        for key, value in [('auto_organize_enabled', '1' if enabled else '0'),
                           ('auto_organize_projects', json.dumps(ids)), ('archive_hour', str(hour))]:
            con.execute('INSERT OR REPLACE INTO settings VALUES(?,?)', (key, value))
    return settings()


def list_runs(query):
    pid = query.get('project_id', '')
    sql = '''SELECT r.id,r.project_id,p.name AS project_name,r.event_date,r.trigger,r.status,
             r.file_path,r.error,r.created_at FROM organization_runs r
             JOIN projects p ON p.id=r.project_id'''
    return {'settings': settings(), 'runs': core.rows(sql + (' WHERE r.project_id=?' if pid else '') +
            ' ORDER BY r.created_at DESC,r.rowid DESC LIMIT 200', (pid,) if pid else ())}


def get_run(rid):
    result = core.one('SELECT * FROM organization_runs WHERE id=?', (rid,))
    if not result:raise FileNotFoundError('整理记录不存在')
    return result


def snapshot(project, day):
    pid = project['id']
    logs = core.rows('SELECT * FROM logs WHERE project_id=? AND event_date=? ORDER BY created_at,id', (pid, day))
    tasks = {t['id']: t for t in core.month_task_activity(day[:7], pid) if t['event_date'] == day}
    requirements = core.rows('''SELECT * FROM project_requirements WHERE project_id=?
        AND deleted_at IS NULL AND substr(updated_at,1,10)=? ORDER BY seq,id''', (pid, day))
    lines = [f"# {day}｜{project['name']}", '', '本地事实整理；仅汇总工作台中已登记的数据。', '', '## 工作事项', '']
    for t in tasks.values():
        lines += [f"- {t['title']}（{t['status']}） [事项 {t['id']}]", t['details'] or '', '']
    if not tasks:lines += ['当日无工作事项。', '']
    lines += ['## 工作记录', '']
    for log in logs:lines += [f"- {log['kind']} [记录 {log['id']}]", log['body'], '']
    if not logs:lines += ['当日无工作记录。', '']
    lines += ['## 需求更新', '']
    for r in requirements:lines += [f"- {r['title']}（{r['status']}） [需求 {r['id']}]", r['description'], '']
    if not requirements:lines += ['当日无需求更新。', '']
    return '\n'.join(lines)


def run(trigger='手动', day=None):
    if not RUN_LOCK.acquire(blocking=False):raise ValueError('正在整理数据，请稍后查看结果')
    try:
        config = settings()
        if trigger == '自动' and not config['enabled']:return {'runs': []}
        ids = config['project_ids']
        if not ids:
            if trigger == '自动':return {'runs': []}
            raise ValueError('请先在自动整理设置中选择项目并保存')
        day = day or core.today()
        results = []
        for pid in ids:
            # Recheck between projects so disabling stops the remaining batch.
            current = settings()
            if pid not in current['project_ids'] or (trigger == '自动' and not current['enabled']):continue
            if trigger == '自动' and core.one("SELECT id FROM organization_runs WHERE project_id=? AND event_date=? AND trigger='自动'", (pid, day)):continue
            project = core.one('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', (pid,))
            if not project:continue
            rid, stamp = core.uid(), core.now()
            body, path, error, status = '', '', '', '成功'
            try:
                root = Path(project['root'])
                if not root.is_dir():raise FileNotFoundError('项目文件夹暂不可用')
                body = snapshot(project, day)
                # A new file per pass preserves earlier output and all manual edits.
                target = root / core.ARCHIVE_DIR / '每日进展' / f'{day}-整理-{rid}.md'
                if not target.resolve().is_relative_to(root.resolve()):
                    raise ValueError('每日进展目录指向项目范围之外，请检查目录链接')
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('x', encoding='utf-8') as output:output.write(body)
                path = str(target)
            except Exception as exc:
                status, error = '失败', str(exc)
            with core.db() as con:
                con.execute('INSERT INTO organization_runs VALUES(?,?,?,?,?,?,?,?,?)',
                            (rid, pid, day, trigger, status, body, path, error, stamp))
            results.append(get_run(rid))
        return {'runs': results}
    finally:RUN_LOCK.release()


def scheduled_once(moment=None):
    config = settings()
    if not config['enabled']:return {'runs': []}
    moment = moment or datetime.now()
    day = (moment if moment.hour >= int(config['archive_hour']) else moment - timedelta(days=1)).date().isoformat()
    return run('自动', day)
