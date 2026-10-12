"""First-run data validation and transactional migration; no model/scheduler imports."""
from __future__ import annotations
import argparse,json,os,shutil,sqlite3,tempfile,uuid
from contextlib import closing
from datetime import datetime
from pathlib import Path

REQUIRED=('settings','projects','tasks','goals','logs','reports')
MANAGED=('backups','exports','attachments','个人记录','.major-recovery')

def inspect_data(folder):
    root=Path(folder).expanduser().resolve()
    database=root/'workbench.sqlite3'
    if not database.is_file():raise ValueError('请选择含有 workbench.sqlite3 的工作台数据文件夹')
    with closing(sqlite3.connect(database.as_uri()+'?mode=ro',uri=True,timeout=30)) as con:
        if con.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise ValueError('数据文件完整性检查未通过，请使用备份恢复')
        tables={r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not set(REQUIRED).issubset(tables):raise ValueError('该文件不是完整的工作笔记数据，请重新选择')
        counts={table:con.execute(f'SELECT count(*) FROM {table}').fetchone()[0] for table in REQUIRED}
    return {'data_dir':str(root),'counts':counts}

def writable_folder(folder):
    root=Path(folder).expanduser().resolve()
    # Keep personal data out of application binaries, which may be replaced on upgrade.
    program_root=Path(__file__).resolve().parent
    if (program_root/'installed.marker').is_file() and (root==program_root.parent or program_root.parent in root.parents):
        raise ValueError('请选择程序安装目录以外的数据文件夹，便于升级及卸载后保留记录')
    root.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryFile(dir=root) as probe:probe.write(b'work-notes')
    return root

def safe_copytree(source,destination):
    if source.is_symlink() or source.is_junction():raise ValueError('备份或附件文件夹为链接，请先检查来源')
    source=source.resolve()
    for base,dirs,files in os.walk(source,followlinks=False):
        for name in dirs+files:
            item=Path(base)/name
            if item.is_symlink() or item.is_junction():raise ValueError('数据目录含链接，迁移前请检查：'+name)
    shutil.copytree(source,destination)

def initialize_data(folder):
    root=writable_folder(folder)
    if (root/'workbench.sqlite3').exists():raise ValueError('这里已有工作数据，请选择“打开已有数据”，不会覆盖原记录')
    os.environ['PERSONAL_WORKBENCH_DATA_DIR']=str(root)
    import core
    core.DATA=root;core.DB_PATH=root/'workbench.sqlite3';core.init_db()
    return inspect_data(root)

def migrate_data(source,destination):
    source=Path(source).expanduser().resolve()
    before=inspect_data(source)
    target=writable_folder(destination)
    if source==target:raise ValueError('迁移来源和目标相同；如需直接使用，请选择“打开已有数据”')
    if source in target.parents or target in source.parents:raise ValueError('来源和目标不能互相包含，请选择独立的数据目录')
    if (target/'workbench.sqlite3').exists() or any((target/name).exists() for name in MANAGED):
        raise ValueError('目标已有工作数据或备份文件夹，请选择新目录，避免覆盖')
    stage=Path(tempfile.mkdtemp(prefix='.worknotes-migration-',dir=target)).resolve()
    assert stage.parent==target and stage.name.startswith('.worknotes-migration-')
    moved=[];database_moved=False
    try:
        database=stage/'workbench.sqlite3'
        with closing(sqlite3.connect((source/'workbench.sqlite3').as_uri()+'?mode=ro',uri=True,timeout=30)) as src, closing(sqlite3.connect(database)) as dst:
            src.backup(dst)
        snapshot=inspect_data(stage)
        # The snapshot, rather than the live source, is authoritative during migration.
        for name in MANAGED:
            if (source/name).is_dir():safe_copytree(source/name,stage/name)
        backups=stage/'backups';backups.mkdir(exist_ok=True)
        shutil.copy2(database,backups/('迁移前-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:6]+'.sqlite3'))
        with closing(sqlite3.connect(database)) as con:
            if con.execute("SELECT 1 FROM sqlite_master WHERE name='portable_project_paths'").fetchone():
                # Retain actual project roots; a new application must never rebind them to its own folder.
                con.execute('DELETE FROM portable_project_paths');con.commit()
            if con.execute("SELECT 1 FROM sqlite_master WHERE name='major_records'").fetchone():
                for rid,path in con.execute("SELECT id,file_path FROM major_records WHERE file_project_id IS NULL AND file_path!=''").fetchall():
                    try: relative=Path(path).resolve().relative_to(source)
                    except ValueError: continue
                    con.execute('UPDATE major_records SET file_path=? WHERE id=?',(str(target/relative),rid))
                con.commit()
        recovery=stage/'.major-recovery'
        if recovery.is_dir():
            for journal in recovery.glob('*.json'):
                info=json.loads(journal.read_text(encoding='utf-8'))
                for key in ('old','new'):
                    if not info.get(key): continue
                    try: relative=Path(info[key]).resolve().relative_to(source)
                    except ValueError: continue
                    info[key]=str(target/relative)
                journal.write_text(json.dumps(info,ensure_ascii=False),encoding='utf-8')
        if inspect_data(stage)['counts']!=snapshot['counts']:raise ValueError('迁移后记录数量不一致，旧数据已保留')
        for name in MANAGED:
            if (stage/name).exists():
                (stage/name).rename(target/name);moved.append(name)
        database.rename(target/'workbench.sqlite3')
        database_moved=True
        return {**inspect_data(target),'source_dir':str(source),'migrated':True,'counts_at_start':before['counts']}
    except Exception:
        if database_moved:(target/'workbench.sqlite3').rename(stage/'workbench.sqlite3')
        for name in reversed(moved):
            if (target/name).exists() and not (stage/name).exists():(target/name).rename(stage/name)
        raise
    finally:
        assert stage.parent==target and stage.name.startswith('.worknotes-migration-')
        shutil.rmtree(stage)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['inspect','create','migrate'])
    parser.add_argument('--target',required=True)
    parser.add_argument('--source')
    args=parser.parse_args()
    try:
        if args.action=='inspect':result=inspect_data(writable_folder(args.target))
        elif args.action=='create':result=initialize_data(args.target)
        else:
            if not args.source:raise ValueError('请选择旧数据来源')
            result=migrate_data(args.source,args.target)
        print(json.dumps({'ok':True,**result},ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({'ok':False,'error':str(exc)},ensure_ascii=False));raise SystemExit(1)

if __name__=='__main__':main()
