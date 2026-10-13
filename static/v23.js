/* Monthly project requirement registers, schema-guided AI and reviewed Excel round trips. */
const rqTypes=['新功能','功能优化','BUG修复','其他'];
const rqStatuses=['待开启','设计中','待评审','开发中','测试中','试点中','已上线','已关闭'];
const rqPriorities=['P0','P1','P2','P3'];
const rqFields={title:'需求名称',description:'需求描述',type:'需求类型',system_name:'所属系统',module_name:'所属板块',status:'状态',priority:'优先级',source:'需求来源',proposed_date:'提出时间',planned_date:'需求排期',result:'备注'};
function rqQuickDefault(){return {title:'',description:'',type:'新功能',system_name:'',module_name:'',status:'待开启',priority:'P2',source:'',proposed_date:localDate(new Date()),planned_date:'',result:''}}
function rqQueryDefault(month=localDate(new Date()).slice(0,7)){return {month,search:'',type:'',status:'',priority:'',system_name:'',module_name:'',sort:'seq',deleted:'0',page:1}}
const RQ={pid:null,data:null,error:'',loading:0,query:rqQueryDefault(),quick:rqQuickDefault(),sentence:'',aiOpen:false,requestId:null,busy:false,edit:null,original:'',preview:null,file:null};
RQ.quickBase=JSON.stringify(RQ.quick);RQ.clockMonth=localDate(new Date()).slice(0,7);
function rqResetQuick(){RQ.quick=rqQuickDefault();RQ.quickBase=JSON.stringify(RQ.quick)}
const rqDialog=document.createElement('dialog');rqDialog.id='rq-dialog';rqDialog.setAttribute('aria-label','需求详情');document.body.appendChild(rqDialog);
const rqImportDialog=document.createElement('dialog');rqImportDialog.id='rq-import-dialog';rqImportDialog.setAttribute('aria-label','Excel导入导出');document.body.appendChild(rqImportDialog);
const rqCarryDialog=document.createElement('dialog');rqCarryDialog.id='rq-carry-dialog';rqCarryDialog.setAttribute('aria-label','上月需求递延');document.body.appendChild(rqCarryDialog);
const rqSuggestions=document.createElement('div');rqSuggestions.id='rq-suggestions';rqSuggestions.hidden=true;rqSuggestions.setAttribute('role','listbox');document.body.appendChild(rqSuggestions);
function rqOptions(values,selected,blank=''){return (blank?`<option value="">${esc(blank)}</option>`:'')+values.map(v=>`<option value="${attr(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('')}
function rqParams(){return {project_id:state.project,...RQ.query}}
function rqReset(pid){RQ.pid=pid;RQ.data=null;RQ.pending=null;RQ.error='';RQ.query=rqQueryDefault();rqResetQuick();RQ.sentence='';RQ.aiOpen=false;RQ.requestId=null}
function rqDirty(){return Boolean(RQ.edit&&JSON.stringify(RQ.edit)!==RQ.original||JSON.stringify(RQ.quick)!==RQ.quickBase||RQ.sentence.trim())}
async function rqDiscard(){if(RQ.busy){toast('正在处理需求，请等待完成');return false}if(rqDirty()&&!(await v2Confirm('需求内容尚未保存，是否放弃修改后继续？')))return false;RQ.edit=null;rqResetQuick();RQ.sentence='';RQ.requestId=null;return true}
function rqRender(){const x=document.querySelector('.rq-table-scroll')?.scrollLeft||0;render();const table=document.querySelector('.rq-table-scroll');if(table)table.scrollLeft=x;rqSuggestions.hidden=true}
async function rqLoad(){
  const pid=state.project,query={...rqParams()},ticket=++RQ.loading;RQ.error='';
  try{const data=await api('/api/requirements?'+qs(query));if(ticket!==RQ.loading||state.project!==pid)return;RQ.data=data;RQ.query.page=data.page;if(state.page==='projects'&&state.projectTab==='需求')rqRender()}
  catch(e){if(ticket!==RQ.loading||state.project!==pid)return;RQ.error=e.message;RQ.data=null;if(state.page==='projects'&&state.projectTab==='需求')rqRender();toast(e.message,true)}
}
async function rqMonth(month){if(!/^\d{4}-\d{2}$/.test(month))return;if(!(await rqDiscard())){document.getElementById('rq-month').value=RQ.query.month;return}RQ.query=rqQueryDefault(month);RQ.data=null;await rqLoad()}
function rqShiftMonth(offset){const [y,m]=RQ.query.month.split('-').map(Number),d=new Date(y,m-1+offset,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function rqInput(key,value,mode,id='',rowId=''){
 const common=mode==='quick'?`data-rq-quick="${key}"`:mode==='inline'?`data-rq-inline="${key}" data-id="${rowId}"`:`data-rq-field="${key}" name="${key}"`;
 const suggestion=['system_name','module_name'].includes(key)?`data-rq-suggest="${key}" autocomplete="off"`:'';
 if(['description','result'].includes(key))return `<textarea ${id?`id="${id}"`:''} ${common} maxlength="16000" rows="${mode==='quick'?3:5}" aria-label="${rqFields[key]}" placeholder="${rqFields[key]}" ${RQ.busy?'disabled':''}>${esc(value)}</textarea>`;
 const choices={type:rqTypes,status:rqStatuses,priority:rqPriorities};
 if(choices[key])return `<select ${id?`id="${id}"`:''} ${common} aria-label="${rqFields[key]}" ${RQ.busy?'disabled':''}>${rqOptions(choices[key],value)}</select>`;
 return `<input ${id?`id="${id}"`:''} ${common} ${suggestion} type="${['planned_date','proposed_date'].includes(key)?'date':'text'}" value="${attr(value)}" maxlength="${key==='title'?200:key==='source'?500:120}" placeholder="${rqFields[key]}" aria-label="${rqFields[key]}" ${key==='title'&&mode==='detail'?'required':''} ${RQ.busy?'disabled':''}>`;
}
function rqQuickRow(){return `<tr class="rq-add-row"><td class="rq-sticky-seq"><button class="primary-btn" data-action="rq-quick-save" ${RQ.busy?'disabled':''}>添加</button></td>${Object.keys(rqFields).map(k=>`<td ${k==='title'?'class="rq-sticky-name"':''}>${rqInput(k,RQ.quick[k],'quick',k==='title'?'rq-quick-title':'rq-quick-'+k)}</td>`).join('')}<td><button class="text-btn" data-action="rq-quick-clear">清空</button></td></tr>`}
function rqItemRow(r,deleted){return `<tr data-rq-row="${r.id}"><td class="rq-sticky-seq">${r.seq}</td>${Object.keys(rqFields).map(k=>{
 if(k==='title')return `<td class="rq-sticky-name"><button class="rq-title" data-action="rq-edit" data-id="${r.id}">${esc(r.title)}</button>${r.carried_from_id?'<small class="rq-carried">上月递延</small>':''}</td>`;
 if(!deleted&&['type','status','priority','system_name','module_name'].includes(k))return `<td>${rqInput(k,r[k],'inline','rq-row-'+k+'-'+r.id,r.id)}</td>`;
 return `<td><div class="rq-cell-text ${['description','result'].includes(k)?'rq-multiline':''}">${esc(r[k]||'—')}</div>${k==='planned_date'&&r.overdue?'<small class="rq-overdue">延期</small>':''}</td>`;
 }).join('')}<td><button class="text-btn ${deleted?'':'danger-text'}" data-action="${deleted?'rq-restore':'rq-delete'}" data-id="${r.id}">${deleted?'恢复':'删除'}</button></td></tr>`}
function requirementsView(p){
 if(!p)return '';if(RQ.pid!==p.id)rqReset(p.id);
 if(!RQ.data&&!RQ.error){if(RQ.pending!==p.id){RQ.pending=p.id;void rqLoad().finally(()=>{if(RQ.pending===p.id)RQ.pending=null})}return '<p role="status">正在读取本月需求……</p>'}
 if(RQ.error)return `<p class="rq-error" role="alert">${esc(RQ.error)}</p><button class="outline-btn" data-action="rq-reload">重新读取</button>`;
 const d=RQ.data,deleted=RQ.query.deleted==='1',profile=state.data.models.find(m=>m.id===state.data.active_model),blocked=profile&&p.local_only&&profile.provider!=='ollama';
 const pending=d.carryover.items;
 return `<div class="rq-register"><div class="rq-month-bar"><div class="row"><button class="outline-btn" data-action="rq-month-prev" aria-label="上个月">‹</button><label for="rq-month">需求月份</label><input type="month" id="rq-month" value="${attr(RQ.query.month)}"><button class="outline-btn" data-action="rq-month-next" aria-label="下个月">›</button><button class="text-btn" data-action="rq-month-today">本月</button></div><span class="hint">各月独立保存，历史月份可查看和维护</span></div>
 <div class="rq-stats">${['全部','待开启','设计中','开发中','测试中','已上线','已关闭','延期'].map(s=>`<span>${s}<strong>${d.stats[s]||0}</strong></span>`).join('')}</div>
 ${!deleted&&pending.length?`<section class="rq-carry-banner" role="status"><div><strong>${esc(d.carryover.previous_month)} 有 ${pending.length} 条未上线、未关闭的需求</strong><p>是否递延到 ${esc(RQ.query.month)}？上月记录保留，本月生成关联记录。</p></div><div class="row row-wrap"><button class="primary-btn" data-action="rq-carry-all">一键递延到本月</button><button class="outline-btn" data-action="rq-carry-select">选择需求</button><button class="text-btn" data-action="rq-carry-skip">本月不递延</button></div></section>`:''}
 <div class="rq-toolbar"><div class="row row-wrap"><button class="primary-btn" data-action="rq-new" ${RQ.busy||deleted?'disabled':''}>新增需求</button><button class="outline-btn" data-action="rq-ai-toggle" ${RQ.busy||deleted?'disabled':''}>一句话需求</button><button class="outline-btn" data-action="rq-import" ${RQ.busy?'disabled':''}>导入 Excel</button><button class="outline-btn" data-action="rq-export">导出 Excel</button><button class="text-btn" data-action="rq-deleted">${deleted?'返回需求列表':'已删除'}</button><button class="text-btn" data-action="rq-reload">刷新</button></div></div>
 ${!deleted?`<section class="rq-ai" ${RQ.aiOpen?'':'hidden'}><strong>一句话需求 · ${esc(RQ.query.month)}</strong><form id="rq-ai-form"><label for="rq-sentence" class="sr-only">一句话需求描述</label><textarea id="rq-sentence" maxlength="2000" placeholder="例如：订单列表需要按日期导出 Excel，便于核对订单。" ${RQ.busy?'disabled':''}>${esc(RQ.sentence)}</textarea><div class="spread"><p class="hint">${profile?esc(profile.name)+(profile.provider==='ollama'?' · 本地处理':' · 点击创建后仅发送此处描述至所配置云端模型'):'请先配置并启用模型'}${blocked?' · 本项目仅允许本地模型':''}<br>按需求字段规范整理后自动加入本月表格，补充信息标待确认。</p><button class="primary-btn" type="submit" ${RQ.busy||!profile||blocked?'disabled':''}>${RQ.busy?'正在创建…':'AI 整理并创建'}</button></div></form></section>`:''}
 <div class="rq-filters"><input type="search" id="rq-search" value="${attr(RQ.query.search)}" placeholder="搜索名称、描述、编号" aria-label="搜索需求"><select id="rq-filter-type" aria-label="筛选类型">${rqOptions(rqTypes,RQ.query.type,'全部类型')}</select><select id="rq-filter-status" aria-label="筛选状态">${rqOptions(rqStatuses,RQ.query.status,'全部状态')}</select><select id="rq-filter-priority" aria-label="筛选优先级">${rqOptions(rqPriorities,RQ.query.priority,'全部优先级')}</select><select id="rq-filter-system_name" aria-label="筛选系统">${rqOptions(d.systems,RQ.query.system_name,'全部系统')}</select><select id="rq-filter-module_name" aria-label="筛选板块">${rqOptions(d.modules,RQ.query.module_name,'全部板块')}</select><select id="rq-sort" aria-label="排序">${[['seq','序号顺序'],['updated','最近更新'],['priority','优先级'],['date','需求排期']].map(([k,t])=>`<option value="${k}" ${k===RQ.query.sort?'selected':''}>${t}</option>`).join('')}</select></div>
 <p class="hint rq-scroll-hint">表格可横向滚动查看完整字段；类型、状态、优先级可直接下拉修改，系统和板块支持历史值选择。</p>
 <div class="rq-table-scroll" tabindex="0" aria-label="项目月度需求表格"><table class="rq-table"><colgroup><col class="rq-col-seq"><col class="rq-col-name"><col class="rq-col-description">${Object.keys(rqFields).slice(2).map(k=>`<col class="rq-col-${k}">`).join('')}<col class="rq-col-action"></colgroup><thead><tr><th class="rq-sticky-seq">序号</th>${Object.values(rqFields).map((label,i)=>`<th ${i===0?'class="rq-sticky-name"':''}>${label}</th>`).join('')}<th>操作</th></tr></thead><tbody>${!deleted?rqQuickRow():''}${d.items.map(r=>rqItemRow(r,deleted)).join('')}${!d.items.length?'<tr><td colspan="13" class="rq-empty">本月当前范围暂无需求</td></tr>':''}</tbody></table></div>
 <div class="rq-pagination"><span>${esc(RQ.query.month)} · 共 ${d.total} 条 · 第 ${d.page} / ${d.pages} 页</span><div class="row"><button class="outline-btn" data-action="rq-page" data-offset="-1" ${d.page<=1?'disabled':''}>上一页</button><button class="outline-btn" data-action="rq-page" data-offset="1" ${d.page>=d.pages?'disabled':''}>下一页</button></div></div></div>`;
}
function rqEdit(row=null){
 RQ.edit=row?Object.fromEntries(Object.keys(rqFields).map(k=>[k,row[k]])):rqQuickDefault();RQ.edit.id=row?.id||'';RQ.edit.expected_revision=row?.revision;RQ.edit.project_id=state.project;RQ.edit.month=RQ.query.month;RQ.original=JSON.stringify(RQ.edit);
 rqDialog.innerHTML=`<div class="rq-editor"><div class="spread"><div><h2>${row?'需求详情':'新增需求'}</h2><p class="hint">${esc(RQ.query.month)} ${row?' · 序号 '+row.seq+' · '+esc(row.number):' · '+esc(projectName(state.project))}</p></div><button class="text-btn" data-action="rq-close">关闭</button></div><form id="rq-edit-form"><fieldset ${row?.deleted_at?'disabled':''}><div class="form-grid">${Object.entries(rqFields).map(([k,t])=>`<label class="field ${['title','description','result'].includes(k)?'full':''}">${t}${['title','type'].includes(k)?' *':''}${rqInput(k,RQ.edit[k],'detail','rq-detail-'+k)}</label>`).join('')}</div></fieldset>${row?.owner||row?.acceptance?`<details class="rq-legacy"><summary>原版本保留信息</summary>${row.owner?'<p>负责人：'+esc(row.owner)+'</p>':''}${row.acceptance?'<p class="rq-multiline">验收标准：'+esc(row.acceptance)+'</p>':''}</details>`:''}<div class="form-actions"><button type="button" class="outline-btn" data-action="rq-close">取消</button>${row?.deleted_at?'':'<button type="submit" class="primary-btn">保存需求</button>'}</div><p id="rq-edit-error" role="alert" class="rq-error"></p></form></div>`;rqDialog.showModal();rqDialog.querySelector('[name=title]')?.focus();
}
async function rqClose(){if(RQ.busy)return;if(RQ.edit&&JSON.stringify(RQ.edit)!==RQ.original&&!(await v2Confirm('需求修改尚未保存，是否放弃修改？')))return;RQ.edit=null;rqSuggestions.hidden=true;rqDialog.close()}
async function rqReveal(month){RQ.query=rqQueryDefault(month);RQ.query.sort='updated';await rqLoad()}
async function rqInline(el){if(RQ.busy)return;const row=RQ.data.items.find(r=>r.id===el.dataset.id),key=el.dataset.rqInline,value=el.value;if(!row||row[key]===value)return;RQ.busy=true;el.disabled=true;try{await api('/api/requirements',{method:'POST',body:{project_id:state.project,month:RQ.query.month,id:row.id,expected_revision:row.revision,[key]:value}});await rqLoad()}catch(e){el.value=row[key];toast(e.message,true)}finally{RQ.busy=false;rqRender()}}
function rqShowSuggestions(input,showAll=false){const key=input.dataset.rqSuggest,values=key==='system_name'?RQ.data?.systems:RQ.data?.modules;if(!values)return;const options=values.filter(v=>showAll||!input.value||v.includes(input.value));if(!options.length){rqSuggestions.hidden=true;return}RQ.suggestionInput=input;(input.closest('#rq-dialog')||document.body).appendChild(rqSuggestions);rqSuggestions.innerHTML=options.slice(0,50).map(v=>`<button type="button" role="option" data-rq-suggestion="${attr(v)}">${esc(v)}</button>`).join('');const box=input.getBoundingClientRect();rqSuggestions.style.left=Math.max(8,Math.min(box.left,innerWidth-220))+'px';rqSuggestions.style.top=Math.min(box.bottom+4,innerHeight-180)+'px';rqSuggestions.style.width=Math.max(200,Math.min(box.width,innerWidth-16))+'px';rqSuggestions.hidden=false}
async function rqCarry(items){RQ.busy=true;try{const result=await api('/api/requirements/carryover',{method:'POST',body:{project_id:state.project,month:RQ.query.month,items:items.map(r=>({id:r.id,expected_revision:r.revision}))}});rqCarryDialog.close();await rqLoad();toast(result.moved?`已将 ${result.moved} 条需求递延到本月`:'已确认，本月不再提示上月需求')}finally{RQ.busy=false;rqRender()}}
function rqSelectCarry(){rqCarryDialog.innerHTML=`<div class="modal-inner"><h2>选择上月未完成需求</h2><p>递延到 ${esc(RQ.query.month)}，上月记录保留。</p><div class="rq-carry-list">${RQ.data.carryover.items.map(r=>`<label><input type="checkbox" data-rq-carry-id="${r.id}" checked><span>${r.seq}. ${esc(r.title)}<small>${esc(r.status)}</small></span></label>`).join('')}</div><div class="form-actions"><button class="outline-btn" data-action="rq-carry-close">稍后处理</button><button class="primary-btn" data-action="rq-carry-confirm">确认递延</button></div></div>`;rqCarryDialog.showModal()}

async function rqDownload(path,params){const response=await fetch(path+'?'+qs(params));if(!response.ok){const d=await response.json();throw new Error(d.error||'下载失败')}const blob=await response.blob(),link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;const name=response.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''(.+)$/)?.[1];link.download=name?decodeURIComponent(name):'需求清单.xlsx';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function rqImport(){RQ.preview=null;RQ.file=null;rqImportDialog.innerHTML=`<div class="modal-inner rq-import"><h2>导入本月项目需求 · ${esc(projectName(state.project))} · ${esc(RQ.query.month)}</h2><p>无编号新增，有编号更新当前本月项目需求。先核对预览，再确认写入。</p><div class="row row-wrap"><button class="outline-btn" data-action="rq-template">下载模板</button><label class="outline-btn">选择 Excel<input id="rq-upload" type="file" accept=".xlsx" hidden></label></div><p id="rq-import-error" class="rq-error" role="alert"></p><div id="rq-import-preview"></div><div class="form-actions"><button class="outline-btn" data-action="rq-import-close">关闭</button></div></div>`;rqImportDialog.showModal()}
function rqPreviewView(){const p=RQ.preview,root=document.getElementById('rq-import-preview');if(!p||!root)return;
  root.innerHTML=`<p><strong>新增 ${p.counts.新增} · 更新 ${p.counts.更新} · 异常 ${p.counts.异常}</strong></p><details ${!('title' in p.mapping)||!('type' in p.mapping)?'open':''}><summary>调整 Excel 列对应关系</summary><div class="rq-mapping">${Object.entries(p.fields).map(([k,t])=>`<label>${esc(t)}<select data-rq-map="${k}"><option value="">不导入此字段</option>${p.headers.map((h,i)=>`<option value="${i}" ${p.mapping[k]===i?'selected':''}>${i+1}. ${esc(h||'未命名列')}</option>`).join('')}</select></label>`).join('')}</div><button class="outline-btn" data-action="rq-repreview">重新校验并预览</button></details><div class="rq-import-scroll"><table class="rq-preview-table"><thead><tr><th>导入</th><th>行号</th><th>操作</th><th>需求名称</th><th>校验与修改差异</th></tr></thead><tbody>${p.rows.map(r=>`<tr><td><input type="checkbox" data-rq-import-row="${r.row}" ${r.error?'disabled':'checked'} aria-label="导入第 ${r.row} 行"></td><td>${r.row}</td><td>${r.action}</td><td>${esc(r.title||'—')}</td><td>${r.error?`<span class="rq-error">${esc(r.error)}</span>`:r.warning?`<span class="rq-overdue">${esc(r.warning)}</span>`:''}${Object.keys(r.changes).length?`<details><summary>查看 ${Object.keys(r.changes).length} 项修改</summary>${Object.entries(r.changes).map(([k,v])=>`<div class="rq-diff"><strong>${esc(k)}</strong><del>${esc(v.before||'空')}</del><span>→ ${esc(v.after||'空')}</span></div>`).join('')}</details>`:!r.error&&!r.warning?'校验通过':''}</td></tr>`).join('')}</tbody></table></div>${p.counts.异常?'<label class="rq-valid-only"><input id="rq-valid-only" type="checkbox">仅导入有效行，异常行不写入</label><button class="text-btn" data-action="rq-errors">下载异常清单</button>':''}<div class="form-actions"><button class="primary-btn" data-action="rq-commit" ${!p.counts.新增&&!p.counts.更新?'disabled':''}>确认导入</button></div>`;
}
async function rqPreview(mapping){if(RQ.busy)return;RQ.busy=true;document.getElementById('rq-import-error').textContent='正在读取与校验…';
  try{const params={project_id:state.project,month:RQ.query.month,name:RQ.file.name};if(mapping)params.mapping=JSON.stringify(mapping);RQ.preview=await api('/api/requirements/preview?'+qs(params),{method:'POST',body:RQ.file});rqPreviewView();document.getElementById('rq-import-error').textContent=''}catch(e){RQ.preview=null;document.getElementById('rq-import-preview').innerHTML='';document.getElementById('rq-import-error').textContent=e.message}finally{RQ.busy=false}}

const rqLegacyHandle=handleV2;
handleV2=async function(action,el){
 if(!action.startsWith('rq-'))return rqLegacyHandle(action,el);
 if(action==='rq-close'){await rqClose();return true}
 if(action==='rq-import-close'){if(!RQ.busy){rqImportDialog.close();RQ.preview=null;RQ.file=null}return true}
 if(action==='rq-carry-close'){if(!RQ.busy)rqCarryDialog.close();return true}
 if(RQ.busy)return true;
 if(action==='rq-reload')await rqLoad();
 else if(action==='rq-month-prev')await rqMonth(rqShiftMonth(-1));
 else if(action==='rq-month-next')await rqMonth(rqShiftMonth(1));
 else if(action==='rq-month-today')await rqMonth(localDate(new Date()).slice(0,7));
 else if(action==='rq-new')rqEdit();
 else if(action==='rq-ai-toggle'){RQ.aiOpen=!RQ.aiOpen;rqRender();if(RQ.aiOpen)document.getElementById('rq-sentence')?.focus()}
 else if(action==='rq-edit')rqEdit(RQ.data.items.find(r=>r.id===el.dataset.id));
 else if(action==='rq-page'){RQ.query.page+=Number(el.dataset.offset);await rqLoad()}
 else if(action==='rq-deleted'){if(!(await rqDiscard()))return true;RQ.query.deleted=RQ.query.deleted==='1'?'0':'1';RQ.query.page=1;await rqLoad()}
 else if(action==='rq-delete'||action==='rq-restore'){const r=RQ.data.items.find(r=>r.id===el.dataset.id);if(action==='rq-delete'&&!(await v2Confirm('删除需求“'+r.title+'”？可从本月已删除列表恢复。')))return true;await api('/api/requirements/'+(action==='rq-delete'?'delete':'restore'),{method:'POST',body:{id:r.id,project_id:state.project,expected_revision:r.revision}});await rqLoad();toast(action==='rq-delete'?'需求已删除，可恢复':'需求已恢复')}
 else if(action==='rq-quick-clear'){if(!(await rqDiscard()))return true;rqRender()}
 else if(action==='rq-quick-save'){if(!RQ.quick.title.trim())throw new Error('请输入需求名称');RQ.busy=true;const month=RQ.query.month;try{await api('/api/requirements',{method:'POST',body:{project_id:state.project,month,...RQ.quick}});rqResetQuick();await rqReveal(month);toast('需求已添加到本月表格')}finally{RQ.busy=false;rqRender();document.getElementById('rq-quick-title')?.focus()}}
 else if(action==='rq-carry-all')await rqCarry(RQ.data.carryover.items);
 else if(action==='rq-carry-select')rqSelectCarry();
 else if(action==='rq-carry-skip')await rqCarry([]);
 else if(action==='rq-carry-confirm'){const selected=new Set([...rqCarryDialog.querySelectorAll('[data-rq-carry-id]:checked')].map(c=>c.dataset.rqCarryId));await rqCarry(RQ.data.carryover.items.filter(r=>selected.has(r.id)))}
 else if(action==='rq-import')rqImport();
 else if(action==='rq-export'){rqImportDialog.innerHTML=`<div class="modal-inner"><h2>导出 ${esc(RQ.query.month)} 项目需求</h2><p>当前筛选结果 ${RQ.data.total} 条，包含全部分页和完整字段。</p><div class="form-actions"><button class="outline-btn" data-action="rq-export-current">当前筛选结果</button><button class="primary-btn" data-action="rq-export-all">本月全部需求</button><button class="text-btn" data-action="rq-import-close">取消</button></div></div>`;rqImportDialog.showModal()}
 else if(action==='rq-export-current'||action==='rq-export-all'){await rqDownload('/api/requirements/export',action==='rq-export-all'?{project_id:state.project,month:RQ.query.month}:{...rqParams()});rqImportDialog.close()}
 else if(action==='rq-template')await rqDownload('/api/requirements/template',{project_id:state.project,month:RQ.query.month});
 else if(action==='rq-errors')await rqDownload('/api/requirements/errors',{project_id:state.project,token:RQ.preview.token});
 else if(action==='rq-repreview'){const mapping={};rqImportDialog.querySelectorAll('[data-rq-map]').forEach(s=>{if(s.value!=='')mapping[s.dataset.rqMap]=Number(s.value)});await rqPreview(mapping)}
 else if(action==='rq-commit'){
  const p=RQ.preview,skip_rows=[...rqImportDialog.querySelectorAll('[data-rq-import-row]:not(:checked):not(:disabled)')].map(c=>Number(c.dataset.rqImportRow));RQ.busy=true;setButtonBusy(el,true);
  try{const result=await api('/api/requirements/commit',{method:'POST',body:{project_id:state.project,month:RQ.query.month,token:p.token,valid_only:Boolean(document.getElementById('rq-valid-only')?.checked),skip_rows}}),c=result.counts;
   document.getElementById('rq-import-preview').innerHTML=`<p role="status">导入完成：新增 ${c.新增} 条，更新 ${c.更新} 条，未导入 ${c.未导入} 条。</p>${p.counts.异常?'<button class="outline-btn" data-action="rq-errors">下载异常清单</button>':''}`;await rqLoad();toast('Excel 导入完成');
  }catch(e){document.getElementById('rq-import-error').textContent=e.message}finally{RQ.busy=false;setButtonBusy(el,false);rqRender()}
 }
 return true;
};
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-page],[data-action="select-project"],[data-action="project-tab"],[data-action="delete-project"],[data-action="new-project"],[data-action="v22-return-dossier"]');if(!b||(!rqDirty()&&!RQ.busy))return;e.preventDefault();e.stopImmediatePropagation();if(RQ.busy){toast('正在处理需求，请等待完成');return}void(async()=>{if(await rqDiscard()){rqDialog.close();b.click()}})();
},true);
document.addEventListener('input',e=>{
 if(e.target.dataset.rqField&&RQ.edit)RQ.edit[e.target.dataset.rqField]=e.target.value;
 if(e.target.dataset.rqQuick)RQ.quick[e.target.dataset.rqQuick]=e.target.value;
 if(e.target.dataset.rqSuggest)rqShowSuggestions(e.target);
 if(e.target.id==='rq-sentence'){RQ.sentence=e.target.value;RQ.requestId=null}
 if(e.target.id==='rq-search'){RQ.query.search=e.target.value;RQ.query.page=1;clearTimeout(RQ.searchTimer);RQ.searchTimer=setTimeout(()=>rqLoad(),220)}
});
document.addEventListener('change',e=>{
 if(e.target.dataset.rqField&&RQ.edit)RQ.edit[e.target.dataset.rqField]=e.target.value;
 if(e.target.dataset.rqQuick)RQ.quick[e.target.dataset.rqQuick]=e.target.value;
 if(e.target.dataset.rqInline)void rqInline(e.target);
 if(e.target.id==='rq-month'){void rqMonth(e.target.value);return}
 if(e.target.id.startsWith('rq-filter-')){RQ.query[e.target.id.replace('rq-filter-','')]=e.target.value;RQ.query.page=1;void rqLoad()}
 if(e.target.id==='rq-sort'){RQ.query.sort=e.target.value;RQ.query.page=1;void rqLoad()}
 if(e.target.id==='rq-upload'){const file=e.target.files?.[0];if(file){RQ.file=file;void rqPreview()}e.target.value=''}
 if(e.target.dataset.rqMap){const b=rqImportDialog.querySelector('[data-action="rq-commit"]');if(b)b.disabled=true}
});
document.addEventListener('focusin',e=>{if(e.target.dataset.rqSuggest){rqShowSuggestions(e.target,true);requestAnimationFrame(()=>{if(document.activeElement===e.target)rqShowSuggestions(e.target,true)})}else if(!rqSuggestions.contains(e.target))rqSuggestions.hidden=true});
rqSuggestions.addEventListener('mousedown',e=>e.preventDefault());
rqSuggestions.addEventListener('click',e=>{const b=e.target.closest('[data-rq-suggestion]'),input=RQ.suggestionInput;if(!b||!input?.isConnected)return;input.value=b.dataset.rqSuggestion;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));rqSuggestions.hidden=true});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('[data-rq-suggest],#rq-suggestions'))rqSuggestions.hidden=true});
document.addEventListener('scroll',e=>{if(e.target===rqSuggestions)return;const input=RQ.suggestionInput;if(!rqSuggestions.hidden&&input?.isConnected&&document.activeElement===input){const box=input.getBoundingClientRect();if(box.bottom>0&&box.top<innerHeight)rqShowSuggestions(input,true);else rqSuggestions.hidden=true}},true);
document.addEventListener('submit',async e=>{
 if(!['rq-edit-form','rq-ai-form'].includes(e.target.id))return;e.preventDefault();if(RQ.busy)return;const form=e.target,b=form.querySelector('[type=submit]');RQ.busy=true;setButtonBusy(b,true);
 try{
  if(form.id==='rq-edit-form'){const month=RQ.edit.month;await api('/api/requirements',{method:'POST',body:RQ.edit});RQ.edit=null;rqSuggestions.hidden=true;rqDialog.close();await rqReveal(month);toast('需求已保存')}
  else{const profile=state.data.models.find(m=>m.id===state.data.active_model);if(!RQ.sentence.trim())throw new Error('请输入需求描述');if(!profile)throw new Error('请先启用模型');RQ.requestId??=crypto.randomUUID();const sentence=RQ.sentence,month=RQ.query.month,pid=state.project;rqRender();const row=await api('/api/requirements/ai',{method:'POST',body:{project_id:pid,month,sentence,request_id:RQ.requestId,model_id:profile.id}});RQ.sentence='';RQ.requestId=null;await rqReveal(month);rqEdit(row);toast('需求已自动加入本月表格，请核对AI补充内容')}
 }catch(error){if(form.id==='rq-edit-form')document.getElementById('rq-edit-error').textContent=error.message;else toast(error.message,true)}
 finally{RQ.busy=false;setButtonBusy(b,false);rqDialog.querySelectorAll('fieldset input,fieldset select,fieldset textarea').forEach(x=>{if(!x.closest('fieldset[disabled]'))x.disabled=false});if(state.page==='projects')rqRender()}
});
rqDialog.addEventListener('cancel',e=>{e.preventDefault();void rqClose()});
rqImportDialog.addEventListener('cancel',e=>{if(RQ.busy)e.preventDefault();else{RQ.preview=null;RQ.file=null}});
rqCarryDialog.addEventListener('cancel',e=>{if(RQ.busy)e.preventDefault()});
window.addEventListener('beforeunload',e=>{if(rqDirty()||RQ.busy){e.preventDefault();e.returnValue=''}});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape')rqSuggestions.hidden=true;
 if(e.target.id==='rq-quick-title'&&e.key==='Enter'){e.preventDefault();handleV2('rq-quick-save',document.querySelector('[data-action="rq-quick-save"]')).catch(error=>toast(error.message,true))}
});

function rqCheckMonth(month=localDate(new Date()).slice(0,7)){const previous=RQ.clockMonth;if(month===previous)return;RQ.clockMonth=month;if(state.page==='projects'&&state.projectTab==='需求'&&RQ.query.month===previous){if(rqDirty()||RQ.busy){toast('当前月份已变化，请保存后点击“本月”查看需求');return}RQ.query=rqQueryDefault(month);RQ.data=null;void rqLoad()}}
setInterval(()=>rqCheckMonth(),30000);
window.addEventListener('pageshow',()=>rqCheckMonth());
