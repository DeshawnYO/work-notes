"""Ordered, transactional and additive V2 migrations."""
import json


def migrate(con, stamp):
    con.execute('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
    if con.execute('SELECT 1 FROM schema_migrations WHERE version=2').fetchone():
        migrate_personal_paths(con,stamp)
        migrate_v22(con,stamp)
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
