/* Persistent background report status; polling never replaces a user's active editor. */
const REPORT_TASKS={jobs:[],loaded:false,loading:false,error:'',timer:null,dismissed:new Set(),seen:new Map()};
const reportTaskBar=document.createElement('aside');reportTaskBar.id='report-task-bar';reportTaskBar.setAttribute('aria-label','后台报告生成');document.body.appendChild(reportTaskBar);
const reportActive=job=>['排队中','运行中','取消中'].includes(job.status);
function reportTaskActions(job){
 if(job.status==='成功')return `<button class="text-btn" data-action="report-task-open" data-id="${job.id}">查看报告</button>`;
 if(reportActive(job))return `<button class="text-btn" data-action="report-task-cancel" data-id="${job.id}" ${job.status==='取消中'?'disabled':''}>取消生成</button>`;
 return `<button class="text-btn" data-action="report-task-retry" data-id="${job.id}">重新生成</button>`;
}
function reportTaskCard(job,compact=false){
 const elapsed=Math.max(0,Math.round((Date.now()-Date.parse(job.created_at))/1000));
 return `<div class="report-task-card ${reportActive(job)?'is-running':''} ${['失败','已中断'].includes(job.status)?'has-error':''}"><div class="spread"><strong>${esc(job.kind)} · ${esc(job.status)}</strong><span class="hint">${esc(job.start_date)} 至 ${esc(job.end_date)}</span></div><p>${esc(job.phase)}${job.detail&&job.detail!==job.phase?'：'+esc(job.detail):''}</p><div class="spread"><small>${job.model_name?esc(job.model_name)+' · ':''}模型调用 ${job.model_calls} 次${job.lookup_count?' · 按需查词 '+job.lookup_count+' 次':''}${reportActive(job)?' · 已等待 '+(elapsed<60?elapsed+'秒':Math.floor(elapsed/60)+'分'+elapsed%60+'秒'):''}</small><div class="row">${reportTaskActions(job)}${compact&&!reportActive(job)?`<button class="text-btn" data-action="report-task-dismiss" data-id="${job.id}">收起</button>`:''}</div></div></div>`;
}
function reportTaskList(){
 if(!REPORT_TASKS.loaded)return '<section id="report-task-list"><p class="hint">正在检查后台报告任务…</p></section>';
 const jobs=REPORT_TASKS.jobs.slice(0,6);
 return `<section id="report-task-list" aria-label="报告生成任务">${REPORT_TASKS.error?`<p class="report-task-error">${esc(REPORT_TASKS.error)} <button class="text-btn" data-action="report-task-refresh">重新检查</button></p>`:''}${jobs.length?`<h2 class="section-title">生成状态</h2>${jobs.map(j=>reportTaskCard(j)).join('')}`:''}</section>`;
}
function reportTaskRender(){
 const current=document.getElementById('report-task-list');
 if(current){const temp=document.createElement('div');temp.innerHTML=reportTaskList();current.replaceWith(temp.firstElementChild)}
 const job=REPORT_TASKS.jobs.find(reportActive)||REPORT_TASKS.jobs.find(j=>!REPORT_TASKS.dismissed.has(j.id));
 reportTaskBar.hidden=!job;
 reportTaskBar.innerHTML=job?reportTaskCard(job,true)+(REPORT_TASKS.error?`<p class="report-task-error">状态读取失败，可重新检查。<button class="text-btn" data-action="report-task-refresh">重新检查</button></p>`:''):'';
}
async function reportTaskRefreshSaved(){
 const result=await api('/api/reports/list');
 if(!state.data)return;
 const editing=state.data.reports.find(r=>r.id===state.report);
 state.data.reports=result.reports;
 if(editing&&!state.data.reports.some(r=>r.id===editing.id))state.data.reports.push(editing);
 // Refresh the report index only if no body/modal edit can be disturbed.
 if(state.page==='reports'&&!state.report&&!state.reportEditing&&!modal.open)render();
}
function reportJobSubmitted(job){
 REPORT_TASKS.loaded=true;REPORT_TASKS.jobs=[job,...REPORT_TASKS.jobs.filter(j=>j.id!==job.id)];REPORT_TASKS.dismissed.delete(job.id);
 REPORT_TASKS.seen.set(job.id,reportActive(job)?job.status:'排队中');reportTaskRender();void reportTasksPoll();
}
async function reportTasksPoll(){
 if(REPORT_TASKS.loading)return;
 REPORT_TASKS.loading=true;clearTimeout(REPORT_TASKS.timer);
 try{
  const result=await api('/api/report-jobs');let refresh=false;
  for(const job of result.jobs){
   const before=REPORT_TASKS.seen.get(job.id);
   if(REPORT_TASKS.loaded&&job.status==='成功'&&before!=='成功'){refresh=true;toast(job.kind+'已生成，可查看报告')}
   if(REPORT_TASKS.loaded&&['失败','已中断'].includes(job.status)&&before&&before!==job.status)toast(job.kind+'生成失败，详情保留在生成状态中',true);
   if(!REPORT_TASKS.loaded&&!reportActive(job))REPORT_TASKS.dismissed.add(job.id);
   REPORT_TASKS.seen.set(job.id,job.status);
  }
  REPORT_TASKS.jobs=result.jobs;REPORT_TASKS.loaded=true;REPORT_TASKS.error='';
  if(refresh)await reportTaskRefreshSaved();
 }catch(e){REPORT_TASKS.error=e.message}
 finally{REPORT_TASKS.loading=false;reportTaskRender();REPORT_TASKS.timer=setTimeout(reportTasksPoll,REPORT_TASKS.jobs.some(reportActive)?1500:10000)}
}
const reportTaskOldHandle=handleV2;
handleV2=async function(action,el){
 if(!action.startsWith('report-task-'))return reportTaskOldHandle(action,el);
 const job=REPORT_TASKS.jobs.find(j=>j.id===el.dataset.id);
 if(action==='report-task-refresh'){await reportTasksPoll();return true}
 if(!job)return true;
 if(action==='report-task-dismiss'){REPORT_TASKS.dismissed.add(job.id);reportTaskRender()}
 if(action==='report-task-cancel'){setButtonBusy(el,true);try{await api('/api/report-jobs/cancel',{method:'POST',body:{id:job.id}});await reportTasksPoll()}finally{setButtonBusy(el,false)}}
 if(action==='report-task-retry'){
  if(REPORT_TASKS.jobs.some(reportActive)){toast('已有报告在生成，可等待完成或取消后重试');return true}
  if(reportDirty()){toast('请先保存或取消当前报告编辑');return true}
  v22ReportDialog(job.kind);const form=document.getElementById('v22-report-form');form.elements.start.value=job.start_date;form.elements.end.value=job.end_date;form.elements.mode.value=job.use_ai?'ai':'manual';v24ReportFormChanged(form);
 }
 if(action==='report-task-open'){
  if(state.reportEditing){toast('请先保存或取消当前报告编辑');return true}
  if(typeof rqDirty==='function'&&rqDirty()){toast('请先保存当前需求输入，再打开报告');return true}
  if(dossierDirty()||typeof v22TemplateDirty==='function'&&v22TemplateDirty()){toast('请先保存当前修改，再打开报告');return true}
  await reportTaskRefreshSaved();state.manualReport=null;state.report=job.report_id;state.reportEditing=false;state.reportDraft=null;page('reports');
 }
 return true;
};
const reportTaskOldRender=render;
render=function(){reportTaskOldRender();reportTaskRender()};
window.addEventListener('DOMContentLoaded',()=>void reportTasksPoll());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void reportTasksPoll()});
