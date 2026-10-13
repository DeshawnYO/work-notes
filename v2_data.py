"""Ordered, transactional and additive V2 migrations."""
import json


def migrate(con, stamp):
    con.execute('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
    if con.execute('SELECT 1 FROM schema_migrations WHERE version=2').fetchone():
        migrate_personal_paths(con,stamp)
        migrate_v22(con,stamp)
        migrate_v23(con,stamp)
        migrate_v231(con,stamp)
        migrate_v232(con,stamp)
        return
    # SQLite DDL participates in this transaction. Failed upgrades leave no marker.
    con.execute('SAVEPOINT migration_v2')
    try:
        if 'details_html' not in {r[1] for r in con.execute('PRAGMA table_info(tasks)')}:
            con.execute("ALTER TABLE tasks ADD COLUMN details_html TEXT NOT NULL DEFAULT ''")
        con.execute('''CREATE TABLE IF NOT EXISTS subtasks(
            id TEXT PRIMARY KEY,task_id TEXT NOT NULL,title TEXT NOT NULL,
            details_html TEXT NOT NULL DEFAULT '',completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE)''')
        con.execute('CREATE INDEX IF NOT EXISTS idx_subtasks_parent ON subtasks(task_id,created_at)')
        con.execute('''CREATE TABLE IF NOT EXISTS scratch_notes(
            id TEXT PRIMARY KEY,body_html TEXT NOT NULL,created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,task_id TEXT,source_log_id TEXT UNIQUE,
            FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL)''')
        con.execute('''CREATE TABLE IF NOT EXISTS major_records(
            id TEXT PRIMARY KEY,kind TEXT NOT NULL,title TEXT NOT NULL DEFAULT '',project_id TEXT,
            starts_at TEXT NOT NULL DEFAULT '',ends_at TEXT NOT NULL DEFAULT '',people TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT '待整理',main_html TEXT NOT NULL DEFAULT '',side_html TEXT NOT NULL DEFAULT '',
            extra_html TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,word_revision INTEGER NOT NULL DEFAULT 0,
            file_path TEXT NOT NULL DEFAULT '',file_digest TEXT NOT NULL DEFAULT '',file_project_id TEXT,
            created_at TEXT NOT NULL,updated_at TEXT NOT NULL,saved_at TEXT,
            FOREIGN KEY(project_id) REFERENCES projects(id))''')
        con.execute('''CREATE TABLE IF NOT EXISTS major_history(
            id TEXT PRIMARY KEY,record_id TEXT NOT NULL,revision INTEGER NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL)''')
        # Preserve legacy logs and promote only scratch records to the permanent shelf.
        import html
        for row in con.execute("SELECT id,body,created_at FROM logs WHERE kind='随手记录'"):
            body = '<p>' + html.escape(row['body']).replace('\n', '<br>') + '</p>'
            con.execute('INSERT OR IGNORE INTO scratch_notes VALUES(?,?,?,?,NULL,?)',
                        (row['id'], body, row['created_at'], row['created_at'], row['id']))
        con.execute('INSERT INTO schema_migrations VALUES(2,?)', (stamp,))
        con.execute('RELEASE migration_v2')
    except Exception:
        con.execute('ROLLBACK TO migration_v2')
        con.execute('RELEASE migration_v2')
        raise
    migrate_personal_paths(con,stamp)
    migrate_v22(con,stamp)
    migrate_v23(con,stamp)
    migrate_v231(con,stamp)
    migrate_v232(con,stamp)


def migrate_personal_paths(con,stamp):
    if con.execute('SELECT 1 FROM schema_migrations WHERE version=3').fetchone(): return
    con.execute('SAVEPOINT migration_v3')
    try:
        if 'personal_rel' not in {r[1] for r in con.execute('PRAGMA table_info(major_records)')}:
            con.execute("ALTER TABLE major_records ADD COLUMN personal_rel TEXT NOT NULL DEFAULT ''")
        con.execute('INSERT INTO schema_migrations VALUES(3,?)',(stamp,))
        con.execute('RELEASE migration_v3')
    except Exception:
        con.execute('ROLLBACK TO migration_v3'); con.execute('RELEASE migration_v3'); raise


def migrate_v22(con, stamp):
    if con.execute('SELECT 1 FROM schema_migrations WHERE version=4').fetchone(): return
    con.execute('SAVEPOINT migration_v22')
    try:
        con.execute('''CREATE TABLE IF NOT EXISTS report_inputs(
            report_id TEXT PRIMARY KEY,metadata TEXT NOT NULL,sources TEXT NOT NULL,
            FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE)''')
        con.execute('INSERT INTO schema_migrations VALUES(4,?)',(stamp,))
        con.execute('RELEASE migration_v22')
    except Exception:
        con.execute('ROLLBACK TO migration_v22');con.execute('RELEASE migration_v22');raise


def migrate_v23(con, stamp):
    if con.execute('SELECT 1 FROM schema_migrations WHERE version=5').fetchone(): return
    con.execute('SAVEPOINT migration_v23')
    try:
        con.execute('''CREATE TABLE project_requirements(
            id TEXT PRIMARY KEY, project_id TEXT NOT NULL, number TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
            priority TEXT NOT NULL DEFAULT '中', status TEXT NOT NULL DEFAULT '待确认',
            owner TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', planned_date TEXT NOT NULL DEFAULT '',
            acceptance TEXT NOT NULL DEFAULT '', result TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT NOT NULL DEFAULT '',
            deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY(project_id) REFERENCES projects(id))''')
        con.execute('CREATE INDEX idx_requirements_project ON project_requirements(project_id,deleted_at,updated_at)')
        con.execute('''CREATE TABLE requirement_history(
            id TEXT PRIMARY KEY, requirement_id TEXT NOT NULL, action TEXT NOT NULL,
            snapshot TEXT NOT NULL, created_at TEXT NOT NULL,
            FOREIGN KEY(requirement_id) REFERENCES project_requirements(id))''')
        con.execute('''CREATE TABLE requirement_imports(
            id TEXT PRIMARY KEY, project_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id))''')
        con.execute('''CREATE TABLE requirement_ai_requests(
            id TEXT PRIMARY KEY, project_id TEXT NOT NULL, input_hash TEXT NOT NULL,
            requirement_id TEXT NOT NULL, created_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id),
            FOREIGN KEY(requirement_id) REFERENCES project_requirements(id))''')
        con.execute('INSERT INTO schema_migrations VALUES(5,?)', (stamp,))
        con.execute('RELEASE migration_v23')
    except Exception:
        con.execute('ROLLBACK TO migration_v23');con.execute('RELEASE migration_v23');raise


def migrate_v231(con, stamp):
    if con.execute('SELECT 1 FROM schema_migrations WHERE version=6').fetchone(): return
    con.execute('SAVEPOINT migration_v231')
    try:
        columns = {r[1] for r in con.execute('PRAGMA table_info(project_requirements)')}
        for name, definition in (
            ('month', "TEXT NOT NULL DEFAULT ''"), ('seq', 'INTEGER NOT NULL DEFAULT 0'),
            ('system_name', "TEXT NOT NULL DEFAULT ''"), ('module_name', "TEXT NOT NULL DEFAULT ''"),
            ('proposed_date', "TEXT NOT NULL DEFAULT ''"), ('root_id', "TEXT NOT NULL DEFAULT ''"),
            ('carried_from_id', "TEXT NOT NULL DEFAULT ''")):
            if name not in columns: con.execute('ALTER TABLE project_requirements ADD COLUMN '+name+' '+definition)
        counters = {}
        for raw in con.execute('SELECT * FROM project_requirements ORDER BY created_at,id').fetchall():
            row = dict(raw)
            month = row['created_at'][:7] if len(row['created_at']) >= 7 else stamp[:7]
            key = (row['project_id'], month)
            counters[key] = counters.get(key, 0) + 1
            con.execute('INSERT INTO requirement_history VALUES(?,?,?,?,?)',
                        ('migration6-'+row['id'], row['id'], '旧版字段与状态迁移', json.dumps(row,ensure_ascii=False),stamp))
            requirement_type = {'功能需求':'新功能','Bug':'BUG修复','技术改进':'其他'}.get(row['type'], row['type'])
            priority = {'紧急':'P0','高':'P1','中':'P2','低':'P3'}.get(row['priority'],row['priority'])
            status = {'待确认':'待开启','待处理':'待开启','处理中':'开发中','待验收':'测试中','已完成':'已上线','暂不处理':'已关闭'}.get(row['status'],row['status'])
            con.execute('UPDATE project_requirements SET month=?,seq=?,proposed_date=?,root_id=id,type=?,priority=?,status=?,revision=revision+1 WHERE id=?',
                        (month,counters[key],row['created_at'][:10],requirement_type,priority,status,row['id']))
        con.execute('CREATE UNIQUE INDEX idx_requirements_month_seq ON project_requirements(project_id,month,seq)')
        con.execute('CREATE UNIQUE INDEX idx_requirements_month_root ON project_requirements(project_id,month,root_id)')
        con.execute('''CREATE TABLE requirement_month_confirmations(
            project_id TEXT NOT NULL, month TEXT NOT NULL, confirmed_at TEXT NOT NULL,
            selected_ids TEXT NOT NULL, PRIMARY KEY(project_id,month),
            FOREIGN KEY(project_id) REFERENCES projects(id))''')
        # Pre-upgrade previews use obsolete enums/fields and must be reviewed again.
        con.execute('DELETE FROM requirement_imports')
        con.execute('INSERT INTO schema_migrations VALUES(6,?)',(stamp,))
        con.execute('RELEASE migration_v231')
    except Exception:
        con.execute('ROLLBACK TO migration_v231');con.execute('RELEASE migration_v231');raise


def migrate_v232(con,stamp):
    if con.execute('SELECT 1 FROM schema_migrations WHERE version=7').fetchone():return
    con.execute('SAVEPOINT migration_v232')
    try:
        con.execute('''CREATE TABLE report_jobs(
            id TEXT PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,signature TEXT NOT NULL,
            kind TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,use_ai INTEGER NOT NULL,
            status TEXT NOT NULL,phase TEXT NOT NULL,detail TEXT NOT NULL,
            model_name TEXT NOT NULL DEFAULT '',model_calls INTEGER NOT NULL DEFAULT 0,
            lookup_count INTEGER NOT NULL DEFAULT 0,cancel_requested INTEGER NOT NULL DEFAULT 0,
            report_id TEXT,snapshot TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
            FOREIGN KEY(report_id) REFERENCES reports(id))''')
        con.execute('CREATE INDEX idx_report_jobs_status ON report_jobs(status,created_at)')
        con.execute('INSERT INTO schema_migrations VALUES(7,?)',(stamp,))
        con.execute('RELEASE migration_v232')
    except Exception:
        con.execute('ROLLBACK TO migration_v232');con.execute('RELEASE migration_v232');raise
