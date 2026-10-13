"""Permanent scratch shelf and one-level checklist items."""
import core
import richtext


def scratch(data,nid=None):
    body=richtext.clean(data.get('body_html',''))
    if not richtext.plain(body): raise ValueError('请输入记录内容或粘贴图片')
    stamp=core.now()
    with core.db() as con:
        con.execute('BEGIN IMMEDIATE')
        if nid:
            old=con.execute('SELECT body_html FROM scratch_notes WHERE id=?',(nid,)).fetchone()
            if not old: raise FileNotFoundError('记录不存在')
            if 'expected_body' in data and old['body_html']!=data['expected_body']:
                raise ValueError('记录已在其他页面修改，当前输入保留；请复制内容后重新读取')
            con.execute('UPDATE scratch_notes SET body_html=?,updated_at=? WHERE id=?',(body,stamp,nid))
        else:
            nid=core.uid(); con.execute('INSERT INTO scratch_notes(id,body_html,created_at,updated_at) VALUES(?,?,?,?)',(nid,body,stamp,stamp))
    return core.one('SELECT * FROM scratch_notes WHERE id=?',(nid,))


def convert(nid,data):
    with core.LOCK:
        note=core.one('SELECT * FROM scratch_notes WHERE id=?',(nid,))
        if not note: raise FileNotFoundError('记录不存在')
        if note['task_id'] and core.one('SELECT id FROM tasks WHERE id=?',(note['task_id'],)): return core.one('SELECT * FROM tasks WHERE id=?',(note['task_id'],))
        with core.db() as con:
            stamp=core.now(); tid=core.uid(); day=core.validate_day(data.get('planned_date') or core.today(),True)
            title=richtext.plain(note['body_html']).replace('\n',' ').strip()[:140] or '随手记录'
            con.execute('''INSERT INTO tasks(id,title,details,details_html,planned_date,status,created_at,updated_at)
                           VALUES(?,?,?,?,?,'已安排',?,?)''',(tid,title,richtext.plain(note['body_html']),note['body_html'],day,stamp,stamp))
            con.execute('UPDATE scratch_notes SET task_id=?,updated_at=? WHERE id=?',(tid,stamp,nid))
            return dict(con.execute('SELECT * FROM tasks WHERE id=?',(tid,)).fetchone())


def delete_scratch(nid):
    with core.db() as con:
        if not con.execute('SELECT id FROM scratch_notes WHERE id=?',(nid,)).fetchone(): raise FileNotFoundError('记录不存在')
        con.execute('DELETE FROM scratch_notes WHERE id=?',(nid,))
    return {'deleted':True}


def subtask(data,sid=None):
    with core.db() as con:
        old=dict(con.execute('SELECT * FROM subtasks WHERE id=?',(sid,)).fetchone() or {}) if sid else {}
        if sid and not old: raise FileNotFoundError('子事项不存在')
        tid=old.get('task_id') or data.get('task_id')
        parent=con.execute('SELECT * FROM tasks WHERE id=?',(tid,)).fetchone()
        if not parent: raise FileNotFoundError('父事项不存在')
        if not sid and parent['status'] in ('已完成','已取消'): raise ValueError('请先恢复父事项，再添加子事项')
        title=str(data.get('title',old.get('title',''))).strip()
        if not title: raise ValueError('请输入子事项名称')
        body=richtext.clean(data.get('details_html',old.get('details_html','')))
        complete=int(bool(data.get('completed',old.get('completed',0))))
        if parent['status']=='已完成' and not complete: raise ValueError('请先恢复父事项，再恢复子事项')
        stamp=core.now()
        if sid: con.execute('UPDATE subtasks SET title=?,details_html=?,completed=?,updated_at=? WHERE id=?',(title,body,complete,stamp,sid))
        else:
            sid=core.uid(); con.execute('INSERT INTO subtasks VALUES(?,?,?,?,?,?,?)',(sid,tid,title,body,complete,stamp,stamp))
    return core.one('SELECT * FROM subtasks WHERE id=?',(sid,))


def delete_subtask(sid):
    with core.db() as con:
        con.execute('DELETE FROM subtasks WHERE id=?',(sid,))
    return {'deleted':True}


def delete_model(mid):
    with core.LOCK, core.db() as con:
        if not con.execute('SELECT id FROM model_profiles WHERE id=?',(mid,)).fetchone(): raise FileNotFoundError('模型连接不存在')
        con.execute('DELETE FROM model_profiles WHERE id=?',(mid,))
        con.execute("UPDATE settings SET value='' WHERE key='active_model' AND value=?",(mid,))
    return {'deleted':True,'active_model':core.setting('active_model')}
