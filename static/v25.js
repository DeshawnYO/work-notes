/* V2.5: daily organization, explicit sidebar preference and quadrant movement. */
const V25={organizationOpen:false,organization:null,organizationError:'',loading:false,run:null,filter:'',busy:false,settingsDraft:null,dragId:null,moving:false};
const v25Settings=settingsView,v25Projects=projectsView,v25Handle=handleV2;
function organizationConfig(){return V25.settingsDraft||state.data.auto_organize}
function v25SettingsDirty(){const a=V25.settingsDraft,b=state.data?.auto_organize;return Boolean(a&&b&&(a.enabled!==b.enabled||String(a.archive_hour)!==String(b.archive_hour)||a.project_ids.join('|')!==b.project_ids.join('|')))}
function organizationFields(){
  const c=organizationConfig();
  return `<label class="v25-switch"><input id="auto-organize-enabled" type="checkbox" role="switch" ${c.enabled?'checked':''}><span><strong>每日自动整理项目数据</strong><small>默认关闭 · 仅在工作笔记运行时整理</small></span></label>
  <div class="field"><label for="archive-hour">每日整理时间</label><select id="archive-hour">${Array.from({length:24},(_,h)=>`<option value="${h}" ${String(h)===String(c.archive_hour)?'selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('')}</select></div>
  <fieldset class="v25-project-checks"><legend>整理项目范围</legend><p class="hint">勾选后保存；同一范围也用于手动整理。</p>${state.data.projects.map(p=>`<label><input type="checkbox" data-organize-project="${attr(p.id)}" ${c.project_ids.includes(p.id)?'checked':''}><span>${esc(p.name)}</span></label>`).join('')||'<p class="hint">请先添加项目。</p>'}</fieldset>
  <p class="hint">汇总工作台已登记的当日事项、工作记录与需求更新，在项目的「_项目档案 / 每日进展」中保存独立结果。自动整理关闭后仍可手动运行。退出后会在下次启动时补齐最近一个整理日。</p>
  <div class="row row-wrap"><button class="primary-btn" data-action="save-organization-settings">保存设置</button><button class="outline-btn" data-action="open-organization">查看整理结果</button><button class="outline-btn" data-action="backup">备份工作台数据</button></div>
  <p class="hint">此功能在本机整理已登记事实，不调用模型。项目档案的 AI 生成仍由你主动触发。数据库备份不包含外部项目文件。</p>`;
}
settingsView=function(){
  const markup=v25Settings();
  if(V22.settingsTab!=='data')return markup;
  const box=document.createElement('div');box.innerHTML=markup;
  const card=box.querySelector('.settings-card');
  if(card)card.innerHTML=`<h2>自动整理与数据</h2><div class="field"><label>数据存储位置</label><p class="hint v25-wrap">${esc(state.data.data_dir)}</p></div>`+organizationFields();
  return box.innerHTML;
};
async function loadOrganization(){
  if(V25.loading)return;V25.loading=true;V25.organizationError='';const filter=V25.filter;
  try{const result=await api('/api/organization?'+qs({project_id:filter}));if(filter===V25.filter)V25.organization=result;}
  catch(e){V25.organizationError=e.message}
  finally{V25.loading=false;if(filter!==V25.filter){void loadOrganization()}else if(state.page==='projects'&&V25.organizationOpen)render()}
}
function organizationView(){
  if(!V25.organization&&!V25.loading&&!V25.organizationError)void loadOrganization();
  const config=state.data.auto_organize,runs=V25.organization?.runs||[],selected=config.project_ids.map(projectName);
  return head('自动整理数据','集中查看各项目的每日整理结果与失败原因。',`<button class="outline-btn" data-action="close-organization">返回项目文档</button><button class="primary-btn" data-action="run-organization" ${V25.busy?'disabled':''}>${uiIcon('refresh')} ${V25.busy?'正在整理…':'自动整理数据'}</button>`)+
  `<section class="panel v25-organization-summary"><div><strong>每日自动整理 · ${config.enabled?'已开启':'已关闭'}</strong><p class="hint">${config.enabled?'每日 '+String(config.archive_hour).padStart(2,'0')+':00 · ':''}已选 ${selected.length} 个项目${selected.length?'：'+esc(selected.join('、')):''}</p></div><button class="outline-btn" data-action="organization-settings">设置整理范围</button></section>
  <div class="v25-organization-tools"><label>项目 <select id="organization-filter" aria-label="筛选整理结果项目"><option value="">全部项目</option>${[...state.data.projects,...(state.data.removed_projects||[])].map(p=>`<option value="${attr(p.id)}" ${V25.filter===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><button class="text-btn" data-action="refresh-organization">刷新结果</button><span class="hint">最近 200 次整理 · 仅汇总本机已登记事实</span></div>
  ${V25.organizationError?`<p class="error" role="alert">${esc(V25.organizationError)}</p>`:''}
  <div class="v25-organization-layout"><section class="panel v25-run-list" aria-label="整理记录">${V25.loading?'<p role="status">正在读取整理记录…</p>':runs.map(r=>`<button class="v25-run ${V25.run?.id===r.id?'active':''}" data-action="view-organization-run" data-id="${attr(r.id)}"><span class="spread"><strong>${esc(r.project_name)}</strong><span class="${r.status==='失败'?'danger-text':''}">${esc(r.status)}</span></span><span>${esc(r.event_date)} · ${esc(r.trigger)}整理</span><small>${esc(r.created_at.slice(0,19).replace('T',' '))}</small>${r.error?`<small class="danger-text">${esc(r.error)}</small>`:''}</button>`).join('')||empty('暂无整理结果','选择项目并保存后，可点击「自动整理数据」立即整理。')}</section>
  <section class="panel v25-run-detail">${V25.run?`<div class="v25-run-heading"><h2>${esc(projectName(V25.run.project_id))} · ${esc(V25.run.event_date)}</h2><p class="hint">${esc(V25.run.trigger)}整理 · ${esc(V25.run.status)}</p>${V25.run.file_path?`<p class="hint v25-wrap">${esc(V25.run.file_path)}</p>`:''}${V25.run.error?`<p class="danger-text" role="alert">${esc(V25.run.error)}。检查项目目录后，可重新点击「自动整理数据」。</p>`:''}</div><article class="document-body">${renderMarkdown(V25.run.body)}</article>`:empty('选择一条整理记录','查看结果正文、保存位置或失败原因。')}</section></div>`;
}
projectsView=function(){
  if(V25.organizationOpen)return organizationView();
  const box=document.createElement('div');box.innerHTML=v25Projects();
  box.querySelector('.head-actions')?.insertAdjacentHTML('afterbegin','<button class="outline-btn" data-action="open-organization">'+uiIcon('refresh')+'自动整理数据</button>');
  return box.innerHTML;
};
handleV2=async function(action,el){
  if(action==='save-organization-settings'){
    setButtonBusy(el,true);
    try{const c=organizationConfig();const saved=await api('/api/organization/settings',{method:'POST',body:c});V25.settingsDraft=null;state.data.auto_organize=saved;state.data.archive_hour=saved.archive_hour;render();toast('自动整理设置已保存')}finally{setButtonBusy(el,false)}return true;
  }
  if(action==='open-organization'){
    if(dossierDirty()||rqDirty()){toast('请先保存或取消当前项目的修改');return true}
    V25.organizationOpen=true;V25.organization=null;V25.organizationError='';state.page='projects';render();return true;
  }
  if(action==='close-organization'){V25.organizationOpen=false;render();return true}
  if(action==='organization-settings'){V22.settingsTab='data';page('settings');return true}
  if(action==='refresh-organization'){await loadOrganization();return true}
  if(action==='view-organization-run'){V25.run=await api('/api/organization/run?'+qs({id:el.dataset.id}));render();return true}
  if(action==='run-organization'){
    if(V25.busy)return true;V25.busy=true;render();
    try{const result=await api('/api/organization/run',{method:'POST',body:{}});V25.run=result.runs[0]||null;await loadOrganization();const failed=result.runs.filter(r=>r.status==='失败').length;toast(`整理完成：${result.runs.length-failed} 个成功${failed?'，'+failed+' 个失败，请查看原因':''}`,Boolean(failed))}
    finally{V25.busy=false;render()}return true;
  }
  return v25Handle(action,el);
};
document.addEventListener('change',event=>{
  const input=event.target;
  if(input.id==='auto-organize-enabled'||input.id==='archive-hour'||input.dataset.organizeProject){
    V25.settingsDraft={enabled:document.getElementById('auto-organize-enabled').checked,archive_hour:document.getElementById('archive-hour').value,project_ids:[...document.querySelectorAll('[data-organize-project]:checked')].map(x=>x.dataset.organizeProject)};
  }
  if(input.id==='organization-filter'){V25.filter=input.value;V25.run=null;void loadOrganization()}
});
window.addEventListener('beforeunload',event=>{if(v25SettingsDirty()){event.preventDefault();event.returnValue=''}});

const sidebarToggle=document.getElementById('sidebar-toggle');
let sidebarPreference=null;
try{sidebarPreference=localStorage.getItem('work-notes-sidebar')}catch{}
function applySidebar(){
  const collapsed=sidebarPreference===null?matchMedia('(max-width:1180px)').matches:sidebarPreference==='collapsed';
  document.body.classList.toggle('sidebar-collapsed',collapsed);
  sidebarToggle.setAttribute('aria-expanded',String(!collapsed));
  sidebarToggle.title=sidebarToggle.ariaLabel=collapsed?'展开菜单':'收起菜单';
  sidebarToggle.querySelector('use').setAttribute('href',collapsed?'#i-chevron-right':'#i-chevron-left');
}
applySidebar();
matchMedia('(max-width:1180px)').addEventListener('change',applySidebar);
sidebarToggle.addEventListener('click',()=>{sidebarPreference=document.body.classList.contains('sidebar-collapsed')?'expanded':'collapsed';try{localStorage.setItem('work-notes-sidebar',sidebarPreference)}catch{}applySidebar()});

function clearQuadrantDrag(){document.querySelectorAll('.quadrant.drag-over,.task-card.dragging').forEach(x=>x.classList.remove('drag-over','dragging'));V25.dragId=null}
document.addEventListener('dragstart',event=>{
  const card=event.target.closest('.task-card[data-task-id]');
  if(!card||!card.closest('.quadrant')||V25.moving)return;
  if(event.target.closest('input,textarea,[contenteditable="true"]')){event.preventDefault();return}
  V25.dragId=card.dataset.taskId;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-work-notes-task',V25.dragId);card.classList.add('dragging');
});
document.addEventListener('dragover',event=>{
  const quadrant=event.target.closest('.quadrant');if(!quadrant||!V25.dragId||V25.moving)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';document.querySelectorAll('.quadrant.drag-over').forEach(q=>{if(q!==quadrant)q.classList.remove('drag-over')});quadrant.classList.add('drag-over');
});
document.addEventListener('dragleave',event=>{const q=event.target.closest('.quadrant');if(q&&!q.contains(event.relatedTarget))q.classList.remove('drag-over')});
document.addEventListener('dragend',clearQuadrantDrag);
document.addEventListener('drop',async event=>{
  const quadrant=event.target.closest('.quadrant'),tid=V25.dragId;
  if(!quadrant||!tid||V25.moving)return;
  event.preventDefault();const q=quadrant.dataset.q;clearQuadrantDrag();
  const task=state.data.tasks.find(t=>t.id===tid);if(!task||String(task.important)+String(task.urgent)===q)return;
  V25.moving=true;
  try{await mutate('/api/tasks/'+encodeURIComponent(tid),{important:Number(q[0]),urgent:Number(q[1])},'PATCH','已调整事项象限')}
  catch(e){toast('调整失败：'+e.message,true)}finally{V25.moving=false}
});
