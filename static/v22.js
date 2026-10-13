/* V2.2: explicit report periods, centralized templates and editable dossiers. */
const V22={settingsTab:new URLSearchParams(location.search).get('tab')==='templates'?'templates':'models',templateKind:'weekly',templateProject:'',templates:null,templateDraft:null,templateOriginal:null,templateLoading:false,reportBusy:false};
const v22LegacySettings=settingsView,v22LegacyArchive=archiveView,v22LegacyProjects=projectsView,v22LegacyHandle=handleV2,v22LegacyPage=page;
function v22TemplateDirty(){return V22.templateDraft!==null&&V22.templateDraft!==V22.templateOriginal}
async function v22DiscardTemplate(){if(!v22TemplateDirty())return true;if(!(await v2Confirm('模板修改尚未保存。是否放弃修改后继续？')))return false;V22.templateDraft=null;V22.templateOriginal=null;return true}
page=function(name){if(v22TemplateDirty()){void(async()=>{if(await v22DiscardTemplate())v22LegacyPage(name)})();return}if(V22.reportBusy){toast('报告正在生成，请等待完成');return}return v22LegacyPage(name)};
function v22Settings(){
  const tabs=`<div class="settings-tabs" role="tablist" aria-label="设置分类">${[['models','模型设置'],['templates','模板设置'],['data','数据设置']].map(([id,text])=>`<button class="tab ${V22.settingsTab===id?'active':''}" role="tab" aria-selected="${V22.settingsTab===id}" data-action="v22-settings-tab" data-tab="${id}">${text}</button>`).join('')}</div>`;
  const old=document.createElement('div');old.innerHTML=v22LegacySettings();
  if(V22.settingsTab!=='templates'){
    const sections=old.querySelectorAll('.settings-card');
    const content=sections[V22.settingsTab==='models'?0:1];
    if(content&&V22.settingsTab==='models')content.querySelector('h2').textContent='模型设置';
    if(content&&V22.settingsTab==='data'){const label=content.querySelector('label[for=archive-hour]');if(label)label.textContent='每日记录归档时间';const hint=content.querySelector('#archive-hour')?.closest('.field')?.nextElementSibling;if(hint)hint.textContent='仅整理已登记的每日记录；项目档案的 AI 生成由你主动触发。周报/月报均需手动指定时间，不在后台自动生成。'}
    return head('设置','管理模型、生成模板与本机数据。')+tabs+`<div class="v22-settings-content">${content?.outerHTML||''}</div>`;
  }
  if(!V22.templates){v22LoadTemplates();return head('设置','管理模型、生成模板与本机数据。')+tabs+'<p role="status">正在读取模板……</p>'}
  const kind=V22.templateKind,t=V22.templates[kind];
  const labels={weekly:'周报模板',monthly:'月报模板',dossier:'项目档案模板'};
  if(V22.templateDraft===null){V22.templateDraft=t.custom;V22.templateOriginal=t.custom}
  return head('设置','管理模型、生成模板与本机数据。')+tabs+`<div class="v22-template-layout"><nav aria-label="模板类型">${Object.entries(labels).map(([id,label])=>`<button class="project-choice ${id===kind?'active':''}" data-action="v22-template-kind" data-kind="${id}">${label}</button>`).join('')}</nav><section class="v22-template-editor"><div class="spread"><h2>${labels[kind]}</h2><span class="hint">当前使用：${esc(t.origin)}</span></div>${kind==='dossier'?`<label class="field">配置范围<select id="v22-template-project"><option value="">全局默认</option>${state.data.projects.map(p=>`<option value="${p.id}" ${p.id===V22.templateProject?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><p class="hint">项目自定义优先于全局；保留原项目模板，清空并保存后恢复继承。模板不限制人工档案保存。</p>`:''}<label for="v22-template-body">自定义模板</label><textarea id="v22-template-body" maxlength="60000" placeholder="留空并保存，使用系统默认或继承全局模板。">${esc(V22.templateDraft)}</textarea><div class="form-actions"><label class="outline-btn">上传模板<input type="file" id="v22-template-upload" accept=".md,.txt" hidden></label><button class="outline-btn" data-action="v22-template-default">采用默认模板</button><button class="outline-btn" data-action="v22-template-clear">恢复默认／继承</button><button class="outline-btn" data-action="v22-template-reload">重新读取</button><button class="primary-btn" data-action="v22-template-save">保存模板</button></div><details><summary>查看当前生效模板</summary><pre class="v22-template-preview">${esc(t.effective)}</pre></details><p class="hint">模板仅影响此后生成的内容，不会改写已保存的报告或档案。自定义报告模板由 AI 应用，事实底稿使用系统基础结构。</p></section></div>`;
}
settingsView=v22Settings;
async function v22LoadTemplates(){if(V22.templateLoading)return;V22.templateLoading=true;try{V22.templates=await api('/api/templates?'+qs({project_id:V22.templateProject}));if(state.page==='settings'&&V22.settingsTab==='templates')render()}catch(e){toast(e.message,true)}finally{V22.templateLoading=false}}
archiveView=function(p){
  if(!state.archive||state.archive.project!==p.id){getArchive(p.id);return '<p role="status">正在读取项目档案……</p>'}
  const a=state.archive;if(a.error)return v22LegacyArchive(p);
  const busy=state.dossierJob?.status==='整理中',edit=state.dossierEdit;
  return `<div class="dossier-toolbar"><div><p class="hint">${a.updated_at?'更新于 '+esc(a.updated_at.slice(0,16).replace('T',' ')):'可以上传、粘贴或一键生成'} · Markdown 保存在项目的 _项目档案 文件夹</p></div><div class="row row-wrap"><button class="outline-btn" data-action="v22-dossier-edit" ${busy?'disabled':''}>${a.body?'编辑档案':'新建 / 粘贴'}</button><label class="outline-btn ${busy?'disabled':''}">上传档案<input type="file" id="v22-dossier-upload" accept=".md,.txt,.docx,.pdf" ${busy?'disabled':''} hidden></label><button class="primary-btn" data-action="v22-dossier-generate" ${busy?'disabled':''}>一键生成档案</button>${a.body?`<button class="text-btn danger-text" data-action="v22-dossier-delete" ${busy?'disabled':''}>删除档案</button>`:'<button class="text-btn" data-action="v22-dossier-restore">恢复已删除档案</button>'}</div></div>${state.dossierJob?`<div class="dossier-job ${state.dossierJob.status==='失败'?'error':''}" role="status"><strong>${esc(state.dossierJob.status)}</strong><span>${esc(state.dossierJob.detail)}</span>${['失败','已中断'].includes(state.dossierJob.status)?'<button class="text-btn" data-action="v22-dossier-generate">重试生成</button>':''}</div>`:''}${edit?`<label class="sr-only" for="dossier-body">完整项目档案正文</label><textarea id="dossier-body" class="dossier-editor v22-dossier-editor">${esc(edit.body)}</textarea><p class="hint">格式与模板不一致也可以保存；保存前保留原版本。</p><div class="form-actions"><button class="outline-btn" data-action="cancel-dossier-edit">取消</button><button class="primary-btn" data-action="v22-dossier-save">保存档案</button></div>`:a.body?`<article class="document-body v22-dossier-reader">${renderMarkdown(a.body)}</article>`:empty('尚无项目档案','上传或粘贴可直接保存；首次 AI 生成会读取项目全部可支持材料。')}`;
};
projectsView=function(){
  const markup=v22LegacyProjects();const container=document.createElement('div');container.innerHTML=markup;
  const subtitle=container.querySelector('.page-head p');if(subtitle)subtitle.textContent='管理项目档案与需求清单，支持 Excel 导入导出。';
  const tabs=container.querySelector('.project-detail>.tabs');
  if(state.projectTab==='文件'||state.personalFiles){if(tabs)tabs.innerHTML='<button class="outline-btn" data-action="v22-return-dossier">返回项目档案</button>';}
  else if(tabs)tabs.innerHTML=['档案','需求'].map(tab=>`<button class="tab ${state.projectTab===tab?'active':''}" data-action="project-tab" data-tab="${tab}">${tab==='档案'?'项目档案':'需求管理'}</button>`).join('');
  return container.innerHTML;
};

function v22ReportDialog(kind){
  const profile=state.data.models.find(x=>x.id===state.data.active_model);
  state.modalKind='v22-report';modalContent.innerHTML=`<div class="modal-inner"><h2>创建报告</h2><form id="v22-report-form"><div class="form-grid"><label class="field full">报告类型<select name="kind"><option value="周报" ${kind==='周报'?'selected':''}>周报</option><option value="月报" ${kind==='月报'?'selected':''}>月报</option></select></label><label class="field">开始日期<input type="date" name="start" max="${localDate(new Date())}" required></label><label class="field">结束日期<input type="date" name="end" max="${localDate(new Date())}" required></label><label class="field full">创建方式<select name="mode" disabled><option value="ai" ${!profile?'disabled':''}>AI 自动生成${profile?' · '+esc(profile.name):'（需先启用模型）'}</option><option value="manual" ${!profile?'selected':''}>手动创建</option></select></label></div><p class="hint">先选择时间范围，再选择创建方式。AI 将在后台总结工作事项；手动创建从空白正文开始。</p><div id="v22-report-preview" role="status"></div><div class="form-actions"><button type="button" class="outline-btn" data-action="close-modal">取消</button><button class="primary-btn" type="submit">${profile?'核对范围与来源':'进入编辑'}</button></div></form></div>`;
  decorateControls(modalContent);modal.showModal();
}
async function v22GenerateDossier(){
  if(dossierDirty()){toast('请先保存档案修改再生成');return}
  const pid=state.project,profile=state.data.models.find(x=>x.id===state.data.active_model),p=state.data.projects.find(x=>x.id===pid);
  if(!profile)throw new Error('请先到模型设置添加并启用模型');
  if(p.local_only&&profile.provider!=='ollama')throw new Error('该项目仅允许本地处理，请启用本地模型');
  const preview=await api('/api/dossier/generate-preview?'+qs({project_id:pid}));
  if(!(await v2Confirm(`${preview.mode==='full'?'当前无档案，将全量检查项目文件':'已有档案，仅读取最近7天更新文件'}。选中 ${preview.selected_files} 个，其中 ${preview.readable_files} 个可提取正文。使用${profile.name}${profile.provider==='online'?'，资料将发送到此云端连接':'，本地处理'}。生成后合并保存档案并保留原版本，是否继续？`)))return;
  if(state.project!==pid)throw new Error('项目已切换，请在目标项目重新操作');
  state.dossierJob=await api('/api/dossier/generate',{method:'POST',body:{project_id:pid,expected_digest:preview.digest}});render();scheduleDossierPoll(pid);
}
handleV2=async function(action,el){
  if(['create-report','generate-week','generate-month'].includes(action)){if(reportDirty()){showModal('unsaved-report',{nextAction:action});return true}v22ReportDialog(action==='generate-month'?'月报':'周报');return true}
  if(action==='save-manual-report'){
    const draft=state.manualReport;if(!draft)return true;setButtonBusy(el,true);
    try{const saved=await api('/api/reports/manual',{method:'POST',body:{...draft,body:state.reportDraft}});state.manualReport=null;state.report=saved.id;state.reportEditing=false;state.reportDraft=null;await load();toast('报告已保存')}finally{setButtonBusy(el,false)}return true;
  }
  if(action==='v22-settings-tab'){if(!(await v22DiscardTemplate()))return true;V22.settingsTab=el.dataset.tab;render();return true}
  if(action==='v22-template-kind'){if(!(await v22DiscardTemplate()))return true;V22.templateKind=el.dataset.kind;V22.templateDraft=null;V22.templateOriginal=null;render();return true}
  if(action==='v22-template-reload'){if(!(await v22DiscardTemplate()))return true;V22.templates=null;V22.templateDraft=null;V22.templateOriginal=null;render();return true}
  if(action==='v22-template-save'){
    const kind=V22.templateKind,t=V22.templates[kind];setButtonBusy(el,true);
    try{const saved=await api('/api/templates',{method:'POST',body:{kind,project_id:kind==='dossier'?V22.templateProject:null,body:V22.templateDraft,expected_digest:t.digest}});V22.templates[kind]=saved;V22.templateDraft=saved.custom;V22.templateOriginal=saved.custom;render();toast('模板已保存，后续生成使用新模板')}finally{setButtonBusy(el,false)}return true;
  }
  if(action==='v22-template-default'||action==='v22-template-clear'){if(v22TemplateDirty()&&!(await v2Confirm('当前模板有未保存修改，是否替换？')))return true;V22.templateDraft=action==='v22-template-clear'?'':V22.templates[V22.templateKind].default;render();return true}
  if(action==='v22-dossier-edit'){if(!state.dossierEdit){const a=state.archive;state.dossierEdit={body:a.body,original:a.body,digest:a.digest}}render();return true}
  if(action==='v22-dossier-save'){setButtonBusy(el,true);try{state.archive=await api('/api/dossier/save',{method:'POST',body:{project_id:state.project,body:state.dossierEdit.body,expected_digest:state.dossierEdit.digest}});state.dossierEdit=null;await load();toast('项目档案已保存，原版本已保留')}finally{setButtonBusy(el,false)}return true}
  if(action==='v22-dossier-delete'){if(dossierDirty())throw new Error('请先保存或取消当前编辑');if(!(await v2Confirm('删除当前项目档案？项目及原始文件保留，删除前档案进入历史版本，可恢复。')))return true;state.archive=await api('/api/dossier/delete',{method:'POST',body:{project_id:state.project,expected_digest:state.archive.digest}});await load();toast('档案已删除，历史版本保留');return true}
  if(action==='v22-dossier-restore'){state.archive=await api('/api/dossier/restore',{method:'POST',body:{project_id:state.project,expected_digest:state.archive.digest}});await load();toast('已恢复删除前档案');return true}
  if(action==='v22-dossier-generate'){await v22GenerateDossier();return true}
  if(action==='v22-return-dossier'){state.personalFiles=false;state.projectTab='档案';state.archive=null;render();return true}
  if(action==='close-modal'&&V22.reportBusy){toast('报告正在生成，请等待完成');return true}
  return v22LegacyHandle(action,el);
};
function v24ReportFormChanged(form){
  form.dataset.reviewed='';delete form.dataset.requestId;document.getElementById('v22-report-preview').innerHTML='';
  form.elements.mode.disabled=!(form.elements.start.value&&form.elements.end.value);
  form.querySelector('[type=submit]').textContent=form.elements.mode.value==='manual'?'进入编辑':'核对范围与来源';
}
document.addEventListener('input',e=>{if(e.target.id==='v22-template-body')V22.templateDraft=e.target.value;const form=e.target.closest('#v22-report-form');if(form)v24ReportFormChanged(form)});
document.addEventListener('change',async e=>{
  if(e.target.id==='v22-template-project'){const pid=e.target.value;if(!(await v22DiscardTemplate())){e.target.value=V22.templateProject;return}V22.templateProject=pid;V22.templates=null;V22.templateDraft=null;render();return}
  if(!['v22-template-upload','v22-dossier-upload'].includes(e.target.id))return;
  const file=e.target.files?.[0];if(!file)return;
  try{
    if(e.target.id==='v22-template-upload'){if(file.size>250000)throw new Error('模板文件过大');const text=await file.text();if(text.length>60000)throw new Error('模板不能超过60000字');if(v22TemplateDirty()&&!(await v2Confirm('上传模板会替换未保存修改，是否继续？')))return;V22.templateDraft=text;render();toast('模板已载入，请核对后保存')}
    else{if(dossierDirty()&&!(await v2Confirm('上传会替换当前未保存编辑，是否继续？')))return;const pid=state.project,original=state.archive,loaded=await api('/api/dossier/upload?'+qs({project_id:pid,name:file.name}),{method:'POST',body:file});if(state.project!==pid)throw new Error('项目已切换，请重新上传');state.dossierEdit={body:loaded.text,original:original.body,digest:original.digest};render();toast('档案已载入编辑区，核对后点击保存；无需模型')}
  }catch(error){toast(error.message,true)}finally{e.target.value=''}
});
document.addEventListener('submit',async e=>{
  if(e.target.id!=='v22-report-form')return;e.preventDefault();if(V22.reportBusy)return;
  const form=e.target,button=form.querySelector('[type=submit]'),data=Object.fromEntries(new FormData(form));data.use_ai=data.mode==='ai';
  setButtonBusy(button,true);
  try{
    if(!data.start||!data.end)throw new Error('请选择时间范围');
    if(data.end<data.start||data.end>localDate(new Date())||(parseDay(data.end)-parseDay(data.start))/86400000>365)throw new Error('请选择有效的时间范围，最多366天，结束日期不能晚于今天');
    if(!data.use_ai){state.manualReport={kind:data.kind,start:data.start,end:data.end,request_id:crypto.randomUUID()};state.report=null;state.reportEditing=true;state.reportDraft='';closeModal();render();document.getElementById('report-body')?.focus();return}
    if(!form.dataset.reviewed){const p=await api('/api/reports/preview?'+qs({kind:data.kind,start:data.start,end:data.end}));if(data.use_ai&&!p.model)throw new Error('请先启用模型或选择事实底稿');if(data.use_ai&&p.cloud_blocked)throw new Error('包含仅本地项目，请使用本地模型或选择事实底稿');document.getElementById('v22-report-preview').innerHTML=`<div class="v22-generation-preview"><strong>${esc(data.start)} 至 ${esc(data.end)}（包含两端日期）</strong><p>${Object.entries(p.counts).map(([name,count])=>esc(name)+' '+count).join(' · ')}</p><p>${esc(p.template_origin)} · ${data.use_ai?esc(p.model.name)+(p.model.provider==='online'?'：确认后资料发送到所配置云端模型':'：本地处理'):'事实底稿，不调用模型'}</p><p class="hint">不预加载项目档案，遇到歧义仅查询相关术语片段；随手想法不能当作完成成果。${!data.use_ai&&p.template_origin!=='系统默认'?'事实底稿使用系统基础结构，不应用自定义模板。':''}</p></div>`;form.dataset.reviewed='yes';button.textContent='确认生成';return}
    V22.reportBusy=true;form.querySelectorAll('input,select').forEach(x=>x.disabled=true);button.textContent='正在提交…';form.dataset.requestId??=crypto.randomUUID();data.request_id=form.dataset.requestId;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{const job=await api('/api/reports/start',{method:'POST',body:data,signal:controller.signal});closeModal();reportJobSubmitted(job);toast('已在后台生成，可继续使用其他功能')}finally{clearTimeout(timer)}
  }catch(error){toast(error.name==='AbortError'?'提交等待超时，请查看后台任务状态后再重试':error.message,true);form.querySelectorAll('input,select').forEach(x=>x.disabled=false);button.textContent=form.dataset.reviewed?'确认生成':'核对范围与来源'}finally{V22.reportBusy=false;setButtonBusy(button,false)}
});
window.addEventListener('beforeunload',e=>{if(v22TemplateDirty()||V22.reportBusy){e.preventDefault();e.returnValue=''}});
modal.addEventListener('cancel',e=>{if(V22.reportBusy){e.preventDefault();toast('报告正在生成，请等待完成')}});
