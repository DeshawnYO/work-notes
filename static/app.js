const TOKEN = document.querySelector('meta[name="workbench-token"]').content;
const main = document.getElementById('app-main');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modal-content');
const toastBox = document.getElementById('toast');
const initialPage = new URLSearchParams(location.search).get('page');
const state = {data:null,page:initialPage==='tasks'?'inbox':['home','major','inbox','projects','reports','settings'].includes(initialPage)?initialPage:'home',date:localDate(new Date()),project:null,projectTab:'档案',dir:'',file:null,fileData:null,archive:null,archiveJob:null,manualReport:null,report:null,reportEditing:false,reportDraft:null,homeLogDraft:'',homeLogProject:'',recordProject:'',recordMonth:monthOf(localDate(new Date())).slice(0,7),recordLogs:null,recordTasks:null,recordDay:null,modalKind:'',editing:null,quickKind:'task',quickInterrupt:false,archiveSection:0,dossierEdit:null,dossierJob:null,quickDraft:'',quickQuadrant:'?',quickGoalId:''};
let archivePollTimer=null;
state.homeWeek=weekOf(state.date);state.carryoverDay=null;state.carryoverOpen=false;state.carryoverSelection=null;
let pageEnterUntil=0;
let calendarDay=localDate(new Date()),calendarRefreshPromise=null,calendarResumePending=false;
const names = {major:'重大汇报',home:'今日工作',inbox:'工作记录',projects:'项目管理',reports:'工作报告',settings:'设置'};
const weekday = ['周日','周一','周二','周三','周四','周五','周六'];

function localDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function parseDay(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function addDays(s,n){const d=parseDay(s);d.setDate(d.getDate()+n);return localDate(d)}
function weekOf(s){const d=parseDay(s);d.setDate(d.getDate()-((d.getDay()+6)%7));return localDate(d)}
function monthOf(s){return s.slice(0,7)+'-01'}
function humanDay(s){const d=parseDay(s);return `${d.getMonth()+1}月${d.getDate()}日`}
function esc(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function attr(s){return esc(s)}
function readableStatus(value){const s=String(value||'待更新');return s.startsWith('失败')?'整理未完成，请查看项目详情':s}
// A deliberately small Markdown reader: HTML is escaped and links allow only safe schemes.
function markdownInline(value){
  const tokens=[];let text=esc(value);
  text=text.replace(/`([^`]+)`/g,(_,code)=>{tokens.push(`<code>${code}</code>`);return `\u0001${tokens.length-1}\u0002`});
  text=text.replace(/!?\[([^\]]+)\]\(([^\s)]+)\)/g,(whole,label,url)=>{
    if(whole.startsWith('!'))return label;
    if(!/^(https?:\/\/|mailto:|#)/i.test(url))return label;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  text=text.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/~~([^~]+)~~/g,'<del>$1</del>');
  return text.replace(/\u0001(\d+)\u0002/g,(_,n)=>tokens[Number(n)]||'');
}
function renderMarkdown(value){
  const lines=String(value??'').replace(/\r\n?/g,'\n').split('\n');let html=[],paragraph=[],list=null,code=null,quote=[];
  const flushParagraph=()=>{if(paragraph.length){html.push(`<p>${paragraph.map(markdownInline).join('<br>')}</p>`);paragraph=[]}};
  const closeList=()=>{if(list){html.push(`</${list}>`);list=null}};
  const closeQuote=()=>{if(quote.length){html.push(`<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`);quote=[]}};
  const boundary=()=>{flushParagraph();closeList();closeQuote()};
  const cells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim());
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(code!==null){if(/^\s*```/.test(line)){html.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);code=null}else code.push(line);continue}
    if(/^\s*```/.test(line)){boundary();code=[];continue}
    if(/^\s*$/.test(line)){boundary();continue}
    const heading=line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if(heading){boundary();const n=heading[1].length;html.push(`<h${n}>${markdownInline(heading[2])}</h${n}>`);continue}
    if(/^\s{0,3}(---+|\*\*\*+|___+)\s*$/.test(line)){boundary();html.push('<hr>');continue}
    if(/^\s*>/.test(line)){flushParagraph();closeList();quote.push(line.replace(/^\s*>\s?/,''));continue}else closeQuote();
    if(line.includes('|')&&i+1<lines.length&&/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){
      boundary();const header=cells(line);i++;
      let rows=[];while(i+1<lines.length&&lines[i+1].includes('|')&&lines[i+1].trim())rows.push(cells(lines[++i]));
      html.push(`<div class="document-table"><table><thead><tr>${header.map(c=>`<th>${markdownInline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${header.map((_,j)=>`<td>${markdownInline(row[j]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue;
    }
    const item=line.match(/^\s*(?:([-+*])|\d+[.)])\s+(.+)$/);
    if(item){flushParagraph();const kind=item[1]?'ul':'ol';if(list!==kind){closeList();const start=kind==='ol'?Math.min(1000000,Number(line.match(/\d+/)[0])||1):1;html.push(`<${kind}${kind==='ol'?` start="${start}"`:''}>`);list=kind}
      const check=item[2].match(/^\[([ xX])\]\s+(.*)$/);
      html.push(`<li>${check?`<input type="checkbox" disabled ${check[1].toLowerCase()==='x'?'checked':''}>${markdownInline(check[2])}`:markdownInline(item[2])}</li>`);continue;
    }
    closeList();paragraph.push(line);
  }
  boundary();if(code!==null)html.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);return html.join('\n');
}
function qs(params){return new URLSearchParams(params).toString()}
function projectName(id){return state.data.projects.find(p=>p.id===id)?.name||((state.data.removed_projects||[]).find(p=>p.id===id)?.name?((state.data.removed_projects||[]).find(p=>p.id===id).name+'（已移出）'):'未归属')}
function goalName(id){return state.data.goals.find(g=>g.id===id)?.title||''}
function uiIcon(name,extra=''){return `<svg class="ui-icon ${extra}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`}
function toast(message,isError=false){toastBox.innerHTML=uiIcon(isError?'alert':'check-circle')+`<span>${esc(message)}</span>`;toastBox.className=isError?'error':'';toastBox.style.display='flex';clearTimeout(toast.timer);toast.timer=setTimeout(()=>toastBox.style.display='none',4100)}
function setButtonBusy(button,busy){if(!button)return;button.disabled=busy;button.classList?.toggle('is-busy',busy);if(busy)button.setAttribute?.('aria-busy','true');else button.removeAttribute?.('aria-busy')}
function decorateControls(root){
  const actions={'new-project':'plus','new-goal':'plus','new-month-goal':'plus','new-log':'plus','new-day-log':'plus','new-day-task':'plus','goal-task':'plus','edit-log':'edit','edit-goal':'edit','edit-record-task':'edit','edit-project':'info','edit-dossier':'edit','edit-report':'edit','delete-project':'trash','delete-task':'trash','save-home-log':'save','save-dossier':'save','save-report':'save','save-settings':'save','backup':'download','download-report':'download','download-report-docx':'download','export-record-month':'download','dossier-template':'template','dossier-material':'upload','retry-dossier':'refresh','reload-dossier':'refresh','generate-week':'spark','generate-month':'spark','new-model':'plus','test-model':'link','detect-ollama':'refresh','activate-model':'check','disable-model':'close','toggle-goal':'check','close-report':'back','cancel-report-edit':'close','cancel-dossier-edit':'close','close-modal':'close','discard-dossier':'back','discard-report':'back','pick-folder':'projects','browse-folder':'projects','choose-folder':'check','close-folder-browser':'close'};
  root.querySelectorAll('button').forEach(button=>{
    if(button.querySelector('.ui-icon')||button.matches('.goal-title,.task-title,.daily-task-title,.project-choice,.record-day-card,.day-btn,.priority-chip,.dossier-tab'))return;
    let name=actions[button.dataset.action];
    if(button.dataset.action==='record-month')name=Number(button.dataset.offset)<0?'chevron-left':'chevron-right';
    if(button.dataset.page)name='chevron-right';
    if(button.matches('[type="submit"]'))name=button.closest('#quick-form')?'plus':button.closest('#modal-form')&&['delete-project','delete-task','delete-file'].includes(state.modalKind)?'trash':button.closest('#modal-form')&&['dossier-template','dossier-material'].includes(state.modalKind)?'spark':'save';
    if(button.dataset.action==='open-report')name='reports';
    if(button.dataset.action==='close-modal'&&button.textContent==='继续编辑')name='edit';
    if(!name)return;
    if(button.classList.contains('icon-button'))button.textContent='';
    else if(button.firstChild?.nodeType===3)button.firstChild.textContent=button.firstChild.textContent.replace(/^[＋+]\s*/,'');
    button.insertAdjacentHTML('afterbegin',uiIcon(name));button.classList.add('with-icon');
  });
  const sections={'随手记录':'edit','等待反馈':'clock','今天的工作记录':'records','项目档案':'projects','今日事项':'quadrants'};
  root.querySelectorAll('.label-row .section-title,.matrix-head h2').forEach(title=>{const name=sections[title.textContent];if(name){title.insertAdjacentHTML('afterbegin',uiIcon(name,'section-icon'));title.classList.add('section-with-icon')}});
}
async function api(url,options={}){
  const method=options.method||'GET';const headers={...(options.headers||{})};
  if(method!=='GET')headers['X-Workbench-Token']=TOKEN;
  let body=options.body;
  if(body!==undefined&&!(body instanceof Blob)&&!(body instanceof ArrayBuffer)){headers['Content-Type']='application/json';body=JSON.stringify(body)}
  const response=await fetch(url,{method,headers,body,signal:options.signal});
  const data=await response.json().catch(()=>({error:'服务响应无法读取'}));
  if(!response.ok)throw new Error(data.error||`操作失败（${response.status}）`);
  return data;
}
async function load(){state.data=await api('/api/bootstrap');if(!state.project&&state.data.projects.length)state.project=state.data.projects[0].id;if(state.page==='inbox')await loadMonthRecords();else render()}
async function mutate(url,body,method='POST',message='已保存'){const result=await api(url,{method,body});await load();if(message)toast(message);return result}
async function loadMonthRecords(){const month=state.recordMonth,project=state.recordProject;state.recordLogs=null;state.recordTasks=null;render();try{const result=await api('/api/logs/month?'+qs({month,project_id:project}));if(month!==state.recordMonth||project!==state.recordProject)return;state.recordLogs=result.logs;state.recordTasks=result.tasks||[];if(!state.recordDay||!state.recordDay.startsWith(month))state.recordDay=[...result.logs,...state.recordTasks].map(item=>item.event_date).sort().at(-1)||(month===localDate(new Date()).slice(0,7)?localDate(new Date()):month+'-01');render()}catch(e){state.recordLogs=[];state.recordTasks=[];render();toast(e.message||'读取工作记录失败',true)}}
function selectHomeDate(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||localDate(parseDay(day))!==day)return;state.date=day;state.homeWeek=weekOf(day);if(state.quickGoalId){const goal=state.data?.goals.find(g=>g.id===state.quickGoalId);if(goal&&goal.week_start!==(goal.period_kind==='月'?monthOf(day):weekOf(day)))state.quickGoalId=''}render()}
function selectToday(){const today=localDate(new Date());state.date=today;state.homeWeek=weekOf(today);if(state.carryoverDay!==today){state.carryoverDay=today;state.carryoverOpen=false;state.carryoverSelection=null}if(state.recordMonth!==today.slice(0,7)){state.recordLogs=null;state.recordTasks=null}state.recordMonth=today.slice(0,7);state.recordDay=today;if(state.quickGoalId){const goal=state.data?.goals.find(g=>g.id===state.quickGoalId);if(goal&&goal.week_start!==(goal.period_kind==='月'?monthOf(today):weekOf(today)))state.quickGoalId=''}return today}
async function refreshCurrentDay(resume=false){
  if(document.visibilityState==='hidden')return;
  const today=localDate(new Date());
  if(!resume&&!calendarResumePending&&today===calendarDay)return;
  calendarDay=today;state.date=today;
  // Inline edits live in the DOM; defer replacement until the user saves or cancels.
  if(state.page==='inbox'&&document.querySelector('.daily-task-edit')){calendarResumePending=true;return}
  calendarResumePending=false;selectToday();
  if(!state.data||!['home','inbox'].includes(state.page))return;
  render();
  if(calendarRefreshPromise)return calendarRefreshPromise;
  calendarRefreshPromise=(async()=>{
    try{const data=await api('/api/bootstrap');state.data=data;if(document.visibilityState==='hidden')return;
      if(state.page==='home')render();
      else if(state.page==='inbox'&&!document.querySelector('.daily-task-edit'))await loadMonthRecords();
    }catch(e){toast('日期已更新，工作内容刷新失败：'+(e.message||'请检查本地服务'),true)}
    finally{calendarRefreshPromise=null}
  })();
  return calendarRefreshPromise;
}
function resumeCurrentDay(){refreshCurrentDay(true)}
function page(name){if(state.page==='major'&&name!=='major'){void leaveMajor(name);return}if(dossierDirty()){showModal('unsaved-dossier',{nextPage:name});return}if(reportDirty()){showModal('unsaved-report',{nextPage:name});return}if(['home','inbox'].includes(name)){selectToday();calendarResumePending=false}state.page=name;clearTimeout(archivePollTimer);if(name==='projects'&&state.projectTab==='档案')state.archive=null;history.replaceState(null,'',name==='home'?'/':'/?page='+encodeURIComponent(name));render();if(name==='inbox')loadMonthRecords();document.getElementById('page-scroll')?.scrollTo({top:0,behavior:'instant'});document.getElementById('page-scroll')?.focus({preventScroll:true})}
function head(title,subtitle,actions=''){return `<div class="page-head"><div><div class="eyebrow">${new Date().getFullYear()} · 工作笔记 ${esc(state.data?.product_version||'2.3')}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="head-actions">${actions}</div></div>`}
function empty(title,description,button=''){return `<div class="empty-page"><svg class="empty-notebook" viewBox="0 0 100 90" aria-hidden="true" focusable="false"><path class="empty-page-shadow" d="M23 18h51v57H23Z"/><path d="M17 13h51v57H17Z"/><path d="M27 13v57M21 22h10M21 33h10M21 44h10M21 55h10M36 28h23M36 37h23M36 46h15M58 13v14l5-3 5 3V13"/><path class="empty-pencil" d="m65 62 14-31 6 3-14 31-6 4v-7Zm12-27 6 3"/></svg><strong>${title}</strong><span>${description}</span>${button}</div>`}
function selectProjects(selected='',blank='不关联项目'){return `<option value="">${blank}</option>`+state.data.projects.map(p=>`<option value="${p.id}" ${selected===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}
function renderPaper(markup){
  const changed=main.dataset.view!==state.page;
  if(changed)pageEnterUntil=performance.now()+240;
  const previousScroll=document.getElementById('page-scroll')?.scrollTop||0;
  const focused=document.activeElement;
  const previousFocus=main.contains(focused)?focused.id:null;
  const focusKey=main.contains(focused)&&focused.matches('[data-action]')?['action','id','q','index','date','offset'].map(key=>focused.dataset[key]||'').join('|'):null;
  const selection=previousFocus&&(focused.tagName==='TEXTAREA'||['text','search'].includes(focused.type))?[focused.selectionStart,focused.selectionEnd]:null;
  main.className='page-'+state.page;main.dataset.view=state.page;main.innerHTML=markup;
  const heading=main.querySelector('.page-head');
  if(heading?.querySelector('h1'))heading.querySelector('h1').id='page-title';
  const content=document.createElement('div');content.id='page-scroll';content.className='page-scroll'+(performance.now()<pageEnterUntil?' page-enter':'');
  content.tabIndex=0;content.setAttribute('role','region');content.setAttribute('aria-label',names[state.page]+'正文');
  [...main.childNodes].forEach(child=>{if(child!==heading)content.appendChild(child)});main.appendChild(content);
  if(state.page==='settings'){const add=content.querySelector('[data-action="new-model"]');if(add)heading.querySelector('.head-actions').appendChild(add)}
  if(state.page==='reports'){heading.querySelector('[data-action="generate-week"]')?.classList.replace('outline-btn','primary-btn');heading.querySelector('[data-action="generate-month"]')?.classList.replace('primary-btn','outline-btn')}
  decorateControls(main);
  if(!changed){content.scrollTop=previousScroll;const target=previousFocus?document.getElementById(previousFocus):focusKey&&[...main.querySelectorAll('[data-action]')].find(button=>['action','id','q','index','date','offset'].map(key=>button.dataset[key]||'').join('|')===focusKey);if(target){target.focus({preventScroll:true});if(selection)target.setSelectionRange(...selection)}}
}
function render(){if(!state.data)return;document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===state.page);if(b.closest('.sidebar')){if(b.dataset.page===state.page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}});renderPaper(({home:homeView,major:majorView,inbox:inboxView,projects:projectsView,reports:reportsView,settings:settingsView}[state.page])())}

function homeView(){
  const monday=state.homeWeek||weekOf(state.date),month=monthOf(state.date),thisWeek=monday===weekOf(localDate(new Date()));
  const weekGoals=state.data.goals.filter(g=>(g.period_kind||'周')==='周'&&g.week_start===monday&&g.status!=='已取消');
  const monthGoals=state.data.goals.filter(g=>g.period_kind==='月'&&g.week_start===month&&g.status!=='已取消');
  const visible=state.data.tasks.filter(t=>t.status!=='已取消'),active=visible.filter(t=>t.status!=='已完成');
  const todays=visible.filter(t=>t.planned_date===state.date||t.completed_at?.slice(0,10)===state.date||(!t.planned_date&&t.due_date&&(t.status==='已完成'?t.due_date===state.date:t.due_date<=state.date)));
  const openFirst=(a,b)=>Number(a.status==='已完成')-Number(b.status==='已完成');
  const known=todays.filter(t=>t.important!==null&&t.urgent!==null).sort(openFirst),unknown=todays.filter(t=>t.important===null||t.urgent===null).sort(openFirst);
  const waiting=active.filter(t=>t.status==='等待反馈'||t.status==='受阻'),todayLogs=state.data.logs.filter(l=>l.event_date===state.date);
  const qdefs=[['11','重要紧急','近期要处理'],['10','重要不紧急','为关键目标留出时间'],['01','不重要紧急','尽快处理或跟进'],['00','不重要不紧急','批量处理或暂存']];
  const qchoices=[['?','待判断'],...qdefs];
  const quick=`<section class="quick-compose panel" aria-label="添加今日事项"><form id="quick-form" class="quick-form"><label class="sr-only" for="quick-title">事项名称</label><input id="quick-title" name="title" required autocomplete="off" value="${attr(state.quickDraft)}" placeholder="记下今天要做的事…"><label class="sr-only" for="quick-project">关联事项项目</label><select id="quick-project">${selectProjects(state.quickProjectId,'暂不关联项目')}</select><button class="primary-btn" type="submit">添加</button></form>
  <div class="quick-settings"><label class="quick-interrupt"><input id="quick-interrupt" type="checkbox" ${state.quickInterrupt?'checked':''}> 临时事项</label><div class="quick-priorities" aria-label="事项优先级"><span class="quick-priority-caption">优先级</span>${qchoices.map(([q,label])=>`<button type="button" class="priority-chip ${state.quickQuadrant===q?'active':''}" data-action="quick-priority" data-q="${q}" aria-pressed="${state.quickQuadrant===q}">${label}</button>`).join('')}</div></div>
  ${state.quickGoalId?`<div class="quick-context">关联目标：${esc(goalName(state.quickGoalId))}<button type="button" data-action="clear-quick-goal" aria-label="取消关联目标">×</button></div>`:''}</section>`;
  const notes=`<section class="panel"><div class="panel-body"><div class="label-row"><h2 class="section-title">今天的工作记录</h2><button class="text-btn" data-page="inbox">查看全部</button></div>${todayLogs.length?todayLogs.slice(0,4).map(l=>`<div class="context-item"><strong>${esc(l.body)}</strong><small>${esc(projectName(l.project_id))} · ${esc(l.kind)} · <button class="text-btn" data-action="edit-log" data-id="${l.id}">编辑</button></small></div>`).join(''):'<div class="empty-sm">记下沟通结论与今天的进展。</div>'}</div></section>`;
  return head('今日工作','先确定方向，再安排今天。',`<span class="head-date">${humanDay(state.date)}<small>${weekday[parseDay(state.date).getDay()]}</small></span>`)+`<div class="home-layout"><div class="home-main">
  <section class="panel goals-panel"><div class="goals-column"><div class="goals-heading"><div><h2>${thisWeek?'本周目标':'周目标'}</h2><span class="period-caption">${humanDay(monday)} — ${humanDay(addDays(monday,6))}</span></div><button class="text-btn" data-action="new-goal">＋ 添加</button></div><div class="goal-list">${weekGoals.length?weekGoals.map(goalCard).join(''):`<div class="empty-sm">${thisWeek?'本周':'这一周'}要交付什么结果？</div>`}</div></div><div class="goals-column"><div class="goals-heading"><div><h2>本月方向</h2><span class="period-caption">${parseDay(month).getMonth()+1} 月目标</span></div><button class="text-btn" data-action="new-month-goal">＋ 添加</button></div><div class="goal-list">${monthGoals.length?monthGoals.map(goalCard).join(''):'<div class="empty-sm">记下一件本月要达成的事。</div>'}</div></div></section>
  <div class="day-strip" aria-label="选择工作日期"><button class="outline-btn week-nav" data-action="home-week" data-offset="-1">${uiIcon('chevron-left')}上一周</button><div class="week-days">${Array.from({length:7},(_,i)=>{const day=addDays(monday,i);return `<button class="day-btn ${day===state.date?'active':''}" data-action="select-day" data-date="${day}" aria-label="${day} ${weekday[parseDay(day).getDay()]}" aria-pressed="${day===state.date}"><span>${weekday[parseDay(day).getDay()]}</span><strong>${parseDay(day).getDate()}</strong></button>`}).join('')}</div><button class="outline-btn week-nav" data-action="home-week" data-offset="1">下一周${uiIcon('chevron-right')}</button><div class="date-extra"><input aria-label="选择日期" type="date" id="home-date" value="${state.date}"></div></div>${carryoverView()}${quick}
  <section class="panel"><div class="matrix-head spread"><div><h2>今日事项</h2><p>${humanDay(state.date)} 的事项与已到期工作</p></div><span class="matrix-total">${todays.filter(t=>t.status!=='已完成').length} 项待推进 · ${todays.filter(t=>t.status==='已完成').length} 项已完成</span></div><div class="matrix">${qdefs.map(([q,title,desc])=>`<div class="quadrant" data-q="${q}"><div class="quad-head"><div class="quad-label"><span class="quad-dot"></span>${title}</div><span class="quad-count">${known.filter(t=>String(t.important)+String(t.urgent)===q).length}</span></div><div class="task-list">${known.filter(t=>String(t.important)+String(t.urgent)===q).map(taskCard).join('')||`<div class="empty-sm">${desc}</div>`}</div></div>`).join('')}</div>
  <div class="undecided"><div class="undecided-title">待判断 <span>${unknown.length}</span></div>${unknown.map(t=>`<div class="undecided-row ${t.status==='已完成'?'completed':''}"><div class="task-card-head"><input type="checkbox" aria-label="${t.status==='已完成'?'恢复':'完成'} ${attr(t.title)}" data-action="toggle-record-task" data-id="${t.id}" ${t.status==='已完成'?'checked':''}><button class="task-title" data-action="edit-task" data-id="${t.id}">${esc(t.title)}</button></div><div class="undecided-actions">${qdefs.map(([q,label])=>`<button class="priority-chip" data-action="classify-task" data-id="${t.id}" data-q="${q}">${label}</button>`).join('')}</div>${childrenView(t)}</div>`).join('')||'<span class="muted">所有事项都已归类。</span>'}</div></section></div>
  ${scratchView()}</div>`;
}
function carryoverView(){
  const info=state.data.carryover;
  if(!info||info.confirmed||!info.tasks?.length||info.date!==localDate(new Date())||state.date!==info.date)return '';
  if(state.carryoverDay!==info.date){state.carryoverDay=info.date;state.carryoverOpen=false;state.carryoverSelection=null}
  const chosen=new Set(state.carryoverSelection===null||state.carryoverSelection===undefined?info.tasks.map(t=>t.id):state.carryoverSelection);
  const count=info.tasks.filter(t=>chosen.has(t.id)).length;
  return `<section class="carryover-notice ${state.carryoverOpen?'expanded':''}" aria-label="昨日未完成事项"><button type="button" class="carryover-toggle" data-action="toggle-carryover" aria-expanded="${state.carryoverOpen}" aria-controls="carryover-list">${uiIcon('clock')}<span><strong>你昨天有 ${info.tasks.length} 项未完成的待办事项</strong><small>是否要加入到今天的待办事项当中？</small></span>${uiIcon('chevron-right','carryover-chevron')}</button>${state.carryoverOpen?`<div id="carryover-list" class="carryover-list"><div class="carryover-list-tools"><span>已选择 ${count} / ${info.tasks.length} 项</span><div><button type="button" class="text-btn" data-action="carryover-select-all">全选</button><button type="button" class="text-btn" data-action="carryover-clear">清空</button></div></div>${info.tasks.map(t=>`<label class="carryover-item" for="carryover-${attr(t.id)}"><input id="carryover-${attr(t.id)}" type="checkbox" data-carryover-id="${attr(t.id)}" ${chosen.has(t.id)?'checked':''}><span><strong>${esc(t.title)}</strong><small>${esc(projectName(t.project_id))} · ${esc(t.status)}${t.important!==null&&t.urgent!==null?' · '+esc((t.important?'重要':'不重要')+(t.urgent?'紧急':'不紧急')):''}</small></span></label>`).join('')}<div class="carryover-confirm"><p>未选择的事项保留在原日期，不会删除。确认后今天不再提示。</p><button type="button" class="primary-btn" data-action="confirm-carryover">${count?`加入今天（${count} 项）并确认`:'暂不加入，确认'}</button></div></div>`:''}</section>`;
}
function goalCard(g){const taskCount=state.data.tasks.filter(t=>t.goal_id===g.id).length;return `<div class="goal-card ${g.status==='已完成'?'done':''}"><button class="goal-title" data-action="edit-goal" data-id="${g.id}">${esc(g.title)}</button><div class="goal-line"><span class="goal-project">${esc(projectName(g.project_id))}</span><span class="goal-status">${esc(g.status)}</span></div><details class="goal-tools"><summary aria-label="目标操作：${attr(g.title)}">···</summary><div class="goal-actions"><button class="text-btn" data-action="goal-task" data-id="${g.id}">＋ 今日动作</button><button class="text-btn" data-action="edit-goal" data-id="${g.id}">编辑目标</button><button class="text-btn" data-action="toggle-goal" data-id="${g.id}">${g.status==='已完成'?'重开目标':'完成目标'}</button><span class="goal-task-count">${taskCount} 项关联事项</span></div></details></div>`}
function taskCard(t){const done=t.status==='已完成';const pills=[t.project_id?`<span class="pill project">${esc(projectName(t.project_id))}</span>`:'',t.goal_id?`<span class="pill">目标：${esc(goalName(t.goal_id))}</span>`:'',t.is_interrupt?'<span class="pill interrupt">临时插单</span>':'',t.status==='等待反馈'?'<span class="pill wait">等待反馈</span>':'',t.due_date?`<span class="pill">截止 ${esc(t.due_date.slice(5))}</span>`:''].join('');return `<div class="task-card ${done?'completed':''}"><div class="task-card-head"><input type="checkbox" aria-label="${done?'恢复':'完成'} ${attr(t.title)}" data-action="toggle-record-task" data-id="${t.id}" ${done?'checked':''}><button class="task-title" data-action="edit-task" data-id="${t.id}">${esc(t.title)}</button></div><div class="task-meta">${pills}</div>${childrenView(t)}</div>`}

function dailyTaskRow(t){const done=t.status==='已完成';return `<article class="daily-task ${done?'completed':''}"><input type="checkbox" class="daily-task-checkbox" data-action="toggle-record-task" data-id="${attr(t.id)}" aria-label="${done?'恢复未完成':'标记完成'}：${attr(t.title)}" ${done?'checked':''}><div class="daily-task-content"><button type="button" class="daily-task-title" data-action="edit-record-task" data-id="${attr(t.id)}">${esc(t.title)}</button><div class="daily-task-meta"><span>${esc(projectName(t.project_id))}</span><span>${esc(t.is_interrupt?'临时插单':'事项')}</span><span>${esc(t.status)}</span>${t.due_date?`<span>截止 ${esc(t.due_date)}</span>`:''}</div>${t.details?`<div class="record-task-details document-body">${t.details_html?safeRich(t.details_html):esc(t.details)}</div>`:''}${childrenView(t)}</div><div class="daily-task-actions"><button type="button" class="text-btn" data-action="edit-record-task" data-id="${attr(t.id)}">编辑</button><button type="button" class="text-btn danger-text" data-action="delete-task" data-id="${attr(t.id)}">删除</button></div></article>`}

function inboxView(){
  const month=state.recordMonth,logs=state.recordLogs,tasks=state.recordTasks;
  const first=parseDay(month+'-01'),daysInMonth=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
  const byDay=new Map();for(const log of logs||[]){if(!byDay.has(log.event_date))byDay.set(log.event_date,[]);byDay.get(log.event_date).push(log)}
  const taskByDay=new Map();for(const task of tasks||[]){if(!taskByDay.has(task.event_date))taskByDay.set(task.event_date,[]);taskByDay.get(task.event_date).push(task)}
  const chosen=state.recordDay?.startsWith(month)?state.recordDay:month+'-01';
  const dayLogs=byDay.get(chosen)||[],dayTasks=taskByDay.get(chosen)||[];
  const openTasks=dayTasks.filter(t=>t.status!=='已完成'),doneTasks=dayTasks.filter(t=>t.status==='已完成');
  const activeDays=new Set([...byDay.keys(),...taskByDay.keys()]).size;
  const monthTitle=`${first.getFullYear()} 年 ${first.getMonth()+1} 月`;
  return head('工作记录','每天在工作台记下的进展，都会汇到这里。按日回看，也可以导出整月记录。',`<button class="primary-btn" data-action="new-log">＋ 记一条工作</button>`)+
  `<div class="journal-layout"><section class="record-month-panel panel"><div class="record-month-head"><div><span class="eyebrow">月份索引</span><h2>${monthTitle}</h2><p>${logs===null?'正在读取记录……':`有内容 ${activeDays} 天 · ${logs.length} 条记录 · ${tasks.length} 项事项动态`}</p></div><div class="record-month-controls"><button type="button" class="outline-btn icon-button" data-action="record-month" data-offset="-1" aria-label="上一个月">‹</button><input id="record-month-input" type="month" value="${month}" aria-label="选择工作记录月份"><button type="button" class="outline-btn icon-button" data-action="record-month" data-offset="1" aria-label="下一个月">›</button></div></div>
  <div class="record-toolbar"><label>项目 <select id="record-filter" aria-label="按项目筛选记录">${selectProjects(state.recordProject,'全部项目')}</select></label><button type="button" class="outline-btn" data-action="export-record-month" ${logs===null?'disabled':''}>导出整月 Markdown</button></div>
  <div class="record-weekdays" aria-hidden="true">${['一','二','三','四','五','六','日'].map(d=>`<span>周${d}</span>`).join('')}</div>
  <div class="record-calendar">${Array.from({length:(first.getDay()+6)%7},()=>'<span class="record-spacer" aria-hidden="true"></span>').join('')}${Array.from({length:daysInMonth},(_,index)=>{const day=`${month}-${String(index+1).padStart(2,'0')}`;const entries=byDay.get(day)||[],items=taskByDay.get(day)||[];const preview=[...entries.map(l=>({text:l.body,done:false})),...items.map(t=>({text:t.title,done:t.status==='已完成'}))];const note=[entries.length?`${entries.length} 记`:null,items.length?`${items.length} 事`:null].filter(Boolean).join(' · ');return `<button type="button" class="record-day-card ${day===chosen?'selected':''} ${preview.length?'has-records':''}" data-action="record-day" data-date="${day}" aria-label="${day}，${entries.length} 条记录，${items.length} 项事项动态"><span class="record-day-top"><strong>${index+1}</strong><small>${note||''}</small></span><span class="record-day-preview">${preview.length?preview.slice(0,2).map(item=>`<span class="${item.done?'completed-preview':''}">${esc(item.text)}</span>`).join(''):day===localDate(new Date())?'<span>＋ 记录今天</span>':''}</span></button>`}).join('')}</div></section>
  <section class="record-detail panel"><div class="record-detail-head"><div><span class="eyebrow">每日笔记</span><h2>${esc(chosen)} · ${weekday[parseDay(chosen).getDay()]}</h2><p>${dayLogs.length} 条记录 · ${dayTasks.length} 项事项${state.recordProject?' · '+esc(projectName(state.recordProject)):''}</p></div><div class="record-detail-actions"><button type="button" class="text-btn" data-action="new-day-log" data-date="${chosen}">＋ 记录这一天</button><button type="button" class="outline-btn" data-action="new-day-task" data-date="${chosen}">＋ 添加事项</button></div></div><div class="record-detail-list">${logs===null?'<p class="empty-sm">正在读取……</p>':dayLogs.map(l=>`<article class="record-detail-item"><div class="record-detail-meta"><span class="pill project">${esc(projectName(l.project_id))}</span><span>${esc(l.kind)}</span><button type="button" class="text-btn" data-action="edit-log" data-id="${l.id}">编辑</button></div><p>${esc(l.body)}</p></article>`).join('')+(openTasks.length?`<div class="daily-task-group-label">待推进 · ${openTasks.length}</div>${openTasks.map(dailyTaskRow).join('')}`:'')+(doneTasks.length?`<div class="daily-task-group-label completed-label">已完成 · ${doneTasks.length}</div>${doneTasks.map(dailyTaskRow).join('')}`:'')||'<p class="empty-sm">这一天还没有内容。点击“记录这一天”或“添加事项”开始。</p>'}</div></section></div>`;
}

function dossierDirty(){return state.dossierEdit&&state.dossierEdit.body!==state.dossierEdit.original}
function projectsView(){
  const projects=state.data.projects,p=state.personalFiles?null:projects.find(x=>x.id===state.project);
  if(!p&&!state.personalFiles&&projects.length){state.project=projects[0].id;return projectsView()}
  const heading=head('项目管理','管理项目档案与本机文件，查看会议和汇报的实际保存位置。',`<button class="primary-btn" data-action="new-project">＋ 新增项目</button>`);
  if(!p&&!state.personalFiles)return heading+empty('还没有项目','接入一个已有项目文件夹，建立第一份档案。','<button class="primary-btn" data-action="new-project">新增项目</button>');
  return heading+`<div class="content-grid"><div class="panel sidebar-panel">${projects.map(x=>`<button class="project-choice ${x.id===state.project&&!state.personalFiles?'active':''}" data-action="select-project" data-id="${x.id}"><strong>${esc(x.name)}</strong><small>${esc(readableStatus(x.archive_status))}</small></button>`).join('')}${state.personalFiles?'<div class="project-choice active"><strong>未关联项目</strong><small>个人会议与汇报</small></div>':''}</div><section class="panel project-detail"><div class="panel-body dossier-project-head"><div><h2 class="section-title">${p?esc(p.name):'未关联项目'}</h2><p class="path-line">${p?esc(p.root):esc(state.data.data_dir+' / 个人记录 / 未关联项目')}</p></div>${p?`<div class="row row-wrap"><button class="text-btn" data-action="edit-project">项目信息</button><button class="text-btn danger-text" data-action="delete-project" ${state.dossierJob?.status==='整理中'?'disabled':''}>删除项目</button></div>`:''}</div><div class="tabs">${p?`<button class="tab ${state.projectTab==='档案'?'active':''}" data-action="project-tab" data-tab="档案">项目档案</button>`:''}<button class="tab ${state.projectTab==='文件'||state.personalFiles?'active':''}" data-action="project-tab" data-tab="文件">文件管理</button></div><div id="project-content">${state.projectTab==='文件'||state.personalFiles?filesView(p):state.projectTab==='需求'?requirementsView(p):archiveView(p)}</div></section></div>`
}
function archiveView(p){
  if(!state.archive||state.archive.project!==p.id){getArchive(p.id);return '<div class="project-detail-body"><p class="muted">正在读取项目档案……</p></div>'}
  const a=state.archive;if(a.error)return `<div class="project-detail-body"><p class="error-message">${esc(a.error)}</p><button class="outline-btn" data-action="reload-dossier">重新读取</button></div>`;
  const busy=state.dossierJob?.status==='整理中',parts=a.sections;
  state.archiveSection=Math.min(state.archiveSection,parts.length-1);const index=state.archiveSection,section=parts[index],edit=state.dossierEdit;
  return `<div class="dossier-toolbar"><div><span class="dossier-template-state">${a.template?'按项目模板组织':'尚未设置模板'}</span><p class="hint">${a.updated_at?'更新于 '+esc(a.updated_at.slice(0,16).replace('T',' ')):'可先编辑现有内容，再设置模板'}</p></div><div class="row row-wrap"><button class="outline-btn" data-action="dossier-template" ${busy?'disabled':''}>${a.template?'管理模板':'设置模板'}</button><button class="primary-btn" data-action="dossier-material" ${busy||!a.template?'disabled':''}>上传 / 粘贴资料</button></div></div>
  ${state.dossierJob?`<div class="dossier-job ${state.dossierJob.status==='失败'?'error':''}" role="status"><strong>${uiIcon(busy?'clock':state.dossierJob.status==='成功'?'check-circle':'alert')}${esc(state.dossierJob.status)}</strong><span>${esc(state.dossierJob.detail)}</span>${['失败','已中断'].includes(state.dossierJob.status)?'<button class="text-btn" data-action="retry-dossier">修改后重试</button>':''}</div>`:''}
  ${a.preamble?`<div class="document-body dossier-intro">${renderMarkdown(a.preamble)}</div>`:''}
  <div class="dossier-tabs" role="tablist" aria-label="档案章节">${parts.map((part,i)=>`<button type="button" role="tab" id="dossier-tab-${i}" aria-controls="dossier-panel" aria-selected="${index===i}" tabindex="${index===i?0:-1}" class="dossier-tab ${index===i?'active':''}" data-action="dossier-section" data-index="${i}"><span>${String(i+1).padStart(2,'0')}</span>${esc(part.title)}</button>`).join('')}</div>
  <section class="dossier-section" id="dossier-panel" role="tabpanel" aria-labelledby="dossier-tab-${index}"><div class="spread dossier-section-head"><h3>${esc(section.title)}</h3>${edit?'':`<button class="text-btn" data-action="edit-dossier" ${busy?'disabled':''}>编辑本节</button>`}</div>${edit?`<label class="sr-only" for="dossier-body">本节正文</label><textarea id="dossier-body" class="dossier-editor">${esc(edit.body)}</textarea><p class="hint">本节可使用二级及更低标题；保存会保留原版本。</p><div class="form-actions"><button class="outline-btn" data-action="cancel-dossier-edit">取消</button><button class="primary-btn" data-action="save-dossier">保存本节</button></div>`:`<div class="document-body">${renderMarkdown(section.body||'本节尚待补充。')}</div>`}</section>
  ${a.manual?`<details class="dossier-legacy-notes"><summary>原人工补充</summary><p class="hint">模型整理时会一起参考，原文件独立保留。</p><div class="document-body">${renderMarkdown(a.manual)}</div></details>`:''}`;
}
async function getArchive(pid){try{const a=await api('/api/dossier?'+qs({project_id:pid}));if(state.project!==pid||state.page!=='projects')return;state.archive=a;state.dossierJob=a.job;render();scheduleDossierPoll(pid)}catch(e){if(state.project===pid&&state.page==='projects'){state.archive={project:pid,error:e.message};render()}}}
function scheduleDossierPoll(pid){clearTimeout(archivePollTimer);if(state.dossierJob?.status!=='整理中')return;archivePollTimer=setTimeout(async()=>{if(state.project!==pid||state.page!=='projects')return;try{state.dossierJob=await api('/api/dossier/job?'+qs({id:state.dossierJob.id}));if(state.dossierJob.status!=='整理中'){state.archive=null;await load();toast(state.dossierJob.detail,state.dossierJob.status==='失败');return}render();scheduleDossierPoll(pid)}catch(e){toast(e.message,true)}},1400)}
function reportDirty(){return state.reportEditing&&(state.manualReport?!!state.reportDraft?.trim():state.reportDraft!==null&&state.reportDraft!==state.data?.reports.find(r=>r.id===state.report)?.body)}
function reportsView(){
  const manual=state.manualReport,selected=manual?{kind:manual.kind,period_start:manual.start,period_end:addDays(manual.end,1),body:''}:state.data.reports.find(r=>r.id===state.report);
  const heading=head('工作报告','保存与查看周报、月报。',`<button class="primary-btn" data-action="create-report">创建报告</button>`);
  if(!selected)return heading+`<div class="report-index">${state.data.reports.map(r=>`<div class="report-list-row"><span class="report-type ${r.kind==='月报'?'monthly':'weekly'}">${esc(r.kind)}</span><div class="report-list-meta"><strong>${esc(r.period_start)} 至 ${esc(addDays(r.period_end,-1))}</strong><small>创建于 ${esc(r.created_at.slice(0,16).replace('T',' '))}</small></div><button class="report-arrow" data-action="open-report" data-id="${r.id}" aria-label="查看${attr(r.kind)} ${attr(r.period_start)}至${attr(addDays(r.period_end,-1))}">${uiIcon('chevron-right')}</button></div>`).join('')||empty('还没有报告','点击创建报告，可由 AI 生成，也可以手动编写。')}</div>`;
  return heading+`<article class="report-sheet"><div class="spread report-heading"><div><h2 class="section-title">${esc(selected.kind)}${manual?' · 手动创建':''}</h2><div class="report-period">${esc(selected.period_start)} — ${esc(addDays(selected.period_end,-1))}</div><p class="hint">${manual?'输入正文后点击保存，报告才会加入清单。':state.reportEditing?'修改后请保存，下载使用已保存版本。':'可编辑或下载已保存的报告。'}</p></div><div class="row report-actions">${state.reportEditing?'':`<button class="primary-btn" data-action="edit-report">编辑正文</button>`}${manual?'':`<button class="outline-btn" data-action="download-report">下载 Markdown</button><button class="outline-btn" data-action="download-report-docx">下载 Word</button>`}<button class="outline-btn" data-action="close-report">返回列表</button></div></div>${state.reportEditing?`<textarea class="report-textarea" id="report-body" maxlength="250000" aria-label="报告正文" placeholder="输入报告内容…">${esc(state.reportDraft??selected.body)}</textarea><div class="form-actions report-edit-actions"><button class="outline-btn" data-action="${manual?'close-report':'cancel-report-edit'}">${manual?'取消创建':'取消修改'}</button><button class="primary-btn" data-action="${manual?'save-manual-report':'save-report'}">${manual?'保存报告':'保存修改'}</button></div>`:`<div class="report-reader document-body">${renderMarkdown(selected.body)}</div>`}</article>`;
}
function settingsView(){const active=state.data.active_model;return head('设置','配置模型、自动整理时点与数据备份。记录与档案编辑不依赖模型。')+`<div class="settings-grid"><section class="panel settings-card"><h2>模型连接</h2><p class="hint">云端 API Key 由 Windows 加密后保存在本机。Ollama 连接本机模型，严格本地项目不会自动切换到云端。</p><div>${state.data.models.map(m=>`<div class="model-row spread"><div><strong>${esc(m.name)}</strong><div class="hint">${m.provider==='ollama'?'Ollama 本地':'云端 API'} · ${esc(m.model)}${active===m.id?' · 当前使用':''}</div></div><div class="row">${active!==m.id?`<button class="text-btn" data-action="activate-model" data-id="${m.id}">设为当前</button>`:''}<button class="text-btn" data-action="test-model" data-id="${m.id}">测试</button><button class="text-btn danger-text" data-action="delete-model" data-id="${m.id}">删除</button></div></div>`).join('')||'<p class="muted">尚未配置模型。项目档案和报告仍可根据已记录事实生成。</p>'}</div><div class="row row-wrap" style="margin-top:15px"><button class="primary-btn" data-action="new-model">＋ 添加连接</button><button class="outline-btn" data-action="detect-ollama">检测 Ollama</button>${active?'<button class="quiet-btn" data-action="disable-model">停用模型</button>':''}</div></section><section class="panel settings-card"><h2>自动整理与数据</h2>${state.data.data_dir?`<div class="field"><label>数据存储位置</label><p class="hint" style="overflow-wrap:anywhere">${esc(state.data.data_dir)}</p></div>`:''}<div class="field"><label for="archive-hour">每日档案更新时点</label><select id="archive-hour">${Array.from({length:24},(_,i)=>`<option value="${i}" ${String(i)===state.data.archive_hour?'selected':''}>${String(i).padStart(2,'0')}:00</option>`).join('')}</select></div><p class="hint">工作台运行时到点更新；关机或退出后，下次启动补上最近一次。项目文件不会被搬迁。</p><div class="row row-wrap"><button class="primary-btn" data-action="save-settings">保存设置</button><button class="outline-btn" data-action="backup">备份工作台数据</button></div><p class="hint">备份只包含工作台数据库。原项目文件夹请用日常文件备份方式单独保存。</p></section></div>`}

function showModal(kind,data={}){
  state.modalKind=kind;state.editing=data;
  let title='',sub='',fields='';
  if(kind==='unsaved-dossier'){modalContent.innerHTML=`<div class="modal-inner"><h2 id="modal-title">本节修改尚未保存</h2><p>继续编辑，或放弃本次修改后离开。</p><div class="form-actions"><button type="button" class="outline-btn" data-action="close-modal">继续编辑</button><button type="button" class="danger-btn" data-action="discard-dossier">放弃修改</button></div></div>`;modal.setAttribute('aria-labelledby','modal-title');decorateControls(modalContent);modal.showModal();return}
  if(kind==='unsaved-report'){modalContent.innerHTML=`<div class="modal-inner"><h2 id="modal-title">正文尚未保存</h2><p>这份报告有未保存的修改。可以继续编辑，或放弃修改后离开。</p><div class="form-actions"><button type="button" class="outline-btn" data-action="close-modal">继续编辑</button><button type="button" class="danger-btn" data-action="discard-report">放弃修改</button></div></div>`;modal.setAttribute('aria-labelledby','modal-title');decorateControls(modalContent);modal.showModal();return}
  if(kind==='task'){
    title=data.id?'编辑事项':data.is_interrupt?'记录临时插单':'新建事项';sub='先写清楚这件事。优先级、日期和项目都可以稍后补充。';
    const q=data.important===null||data.important===undefined||data.urgent===null||data.urgent===undefined?'?':String(data.important)+String(data.urgent);
    fields=`<div class="field full"><label>事项名称 *</label><input name="title" type="text" value="${attr(data.title||'')}" required autofocus placeholder="例如：确认需求评审结论"></div><div class="field full"><label>补充说明 / 当前进度</label>${rte('task-details',data.details_html||richFromText(data.details),'做到哪里、下一步是什么，可粘贴图片',true)}</div><div class="field"><label>关联项目</label><select name="project_id">${selectProjects(data.project_id||'')}</select></div><div class="field"><label>关联目标</label><select name="goal_id"><option value="">不关联目标</option>${state.data.goals.filter(g=>g.status!=='已取消').map(g=>`<option value="${g.id}" ${g.id===data.goal_id?'selected':''}>${g.period_kind==='月'?'月':'周'} · ${esc(g.title)}</option>`).join('')}</select></div><div class="field"><label>重要与紧急</label><select name="quadrant"><option value="?" ${q==='?'?'selected':''}>待判断</option><option value="11" ${q==='11'?'selected':''}>重要紧急</option><option value="10" ${q==='10'?'selected':''}>重要不紧急</option><option value="01" ${q==='01'?'selected':''}>不重要紧急</option><option value="00" ${q==='00'?'selected':''}>不重要不紧急</option></select></div><div class="field"><label>状态</label><select name="status">${['待安排','已安排','进行中','等待反馈','受阻','已完成','已取消'].map(s=>`<option value="${s}" ${s===(data.status||'待安排')?'selected':''}>${s}</option>`).join('')}</select></div><div class="field"><label>计划日期</label><input name="planned_date" type="date" value="${attr(data.planned_date||state.date)}"></div><div class="field"><label>真实截止日期</label><input name="due_date" type="date" value="${attr(data.due_date||'')}"></div><div class="field"><label>下次跟进日期</label><input name="followup_date" type="date" value="${attr(data.followup_date||'')}"></div><label class="checkbox-row full"><input type="checkbox" name="is_interrupt" ${data.is_interrupt?'checked':''}> 这是临时插入的工作</label>`;
  }else if(kind==='goal'){
    title=data.id?`编辑${data.period_kind==='月'?'本月':'本周'}目标`:`添加${data.period_kind==='月'?'本月':'本周'}目标`;sub='写清楚要达成的结果，详细事项可以随后关联。';fields=`<div class="field full"><label>目标名称 *</label><input name="title" required autofocus value="${attr(data.title||'')}" placeholder="例如：完成需求方案评审"></div><div class="field full"><label>所属项目</label><select name="project_id">${selectProjects(data.project_id||'')}</select></div>`;
    if(!data.id&&data.period_kind!=='月'&&data.week_start){title=data.week_start===weekOf(localDate(new Date()))?'添加本周目标':'添加周目标';sub=`目标所属周：${data.week_start} 至 ${addDays(data.week_start,6)}。写清楚要达成的结果。`}
  }else if(kind==='log'){
    title=data.id?'编辑工作记录':'随手记录';sub='工作进展、已完成的协调、临时要求都可以直接记录。';fields=`<div class="field full"><label>记录内容 *</label><textarea name="body" rows="5" required autofocus placeholder="发生了什么、结果是什么、还需要跟进什么">${esc(data.body||'')}</textarea></div><div class="field"><label>关联项目</label><select name="project_id">${selectProjects(data.project_id||'','先不关联')}</select></div><div class="field"><label>发生日期</label><input name="event_date" type="date" value="${attr(data.event_date||state.date)}"></div><div class="field full"><label>记录类型</label><select name="kind">${['随手记录','工作进展','结果记录','会议纪要','决策与变更','个人复盘'].map(x=>`<option value="${x}" ${x===(data.kind||'随手记录')?'selected':''}>${x}</option>`).join('')}</select></div>`;
  }else if(kind==='project'){
    title='接入本地项目文件夹';sub='使用原有文件夹和文件。工作台会在里面创建“_项目档案”。';fields=`<div class="field full"><label for="project-root">项目文件夹路径 *</label><div class="row folder-input-row"><input name="root" id="project-root" required placeholder="选择或粘贴文件夹路径"><button type="button" class="outline-btn" data-action="pick-folder">浏览文件夹</button></div><div id="folder-browser" class="folder-browser" hidden></div></div><div class="field full"><label>项目名称</label><input name="name" placeholder="不填写则使用文件夹名"></div><div class="field full"><label>项目背景</label><textarea name="background" rows="2" placeholder="可以稍后补充"></textarea></div><div class="field full"><label>项目目标</label><textarea name="objective" rows="2" placeholder="可以稍后补充"></textarea></div><label class="checkbox-row full"><input type="checkbox" name="local_only"> 项目内容只交给本地模型处理</label>`;
    if(state.data.portable_mode)fields+=`<label class="checkbox-row full"><input type="checkbox" name="copy_into_workspace" checked> 复制到工具包内，换电脑时一起带走</label><p class="hint full">勾选后工作台管理的是工具包内的副本；原文件夹不会同步更新。</p>`;
  }else if(kind==='project-edit'){
    title='编辑项目信息';sub='背景与目标会显示在项目档案里。';fields=`<div class="field full"><label>项目名称</label><input name="name" required value="${attr(data.name||'')}"></div><div class="field full"><label>背景</label><textarea name="background" rows="3">${esc(data.background||'')}</textarea></div><div class="field full"><label>目标</label><textarea name="objective" rows="3">${esc(data.objective||'')}</textarea></div><label class="checkbox-row full"><input type="checkbox" name="local_only" ${data.local_only?'checked':''}> 只交给本地模型处理</label>`;
  }else if(kind==='delete-project'){
    title='删除项目';sub='从项目列表移除，并停止自动整理。本地文件、档案和历史工作记录保留；重新接入同一文件夹可恢复项目。';fields=`<div class="field full delete-warning">${esc(data.name)}</div>`;
  }else if(kind==='dossier-template'||kind==='dossier-material'){
    const profile=state.data.models.find(m=>m.id===state.data.active_model),cloud=profile?.provider==='online';
    title=kind==='dossier-template'?'设置项目档案模板':'补充项目资料';sub=kind==='dossier-template'?'上传模板或粘贴文本。模型会规范标题层级，并把现有档案按模板重新组织。':'上传资料或粘贴文本。模型会合并已有内容，按当前模板更新档案。';
    fields=`<div class="field full"><label for="dossier-upload">选择文件（可选）</label><input id="dossier-upload" type="file" accept=".md,.txt,.docx,.pdf"><p class="hint">支持Markdown、TXT、Word或有文字的PDF，最大16MB。</p></div><div class="field full"><label for="dossier-input">${kind==='dossier-template'?'模板正文':'资料正文'} *</label><textarea id="dossier-input" name="text" rows="10" required maxlength="60000" placeholder="${kind==='dossier-template'?'粘贴模板，主要章节将作为一级标题…':'粘贴项目背景、需求、评审结论或进展…'}">${esc(data.text??(kind==='dossier-template'?state.archive?.template||'':''))}</textarea></div><p class="hint full model-boundary">${profile?'本次使用：'+esc(profile.name)+' · '+(cloud?'云端模型。点击整理后，模板、档案、原人工补充和输入内容会发送到该连接。':'本地模型，内容留在本机。'):'尚未配置模型，请先到设置添加并启用连接。'} 原档案版本会保留。${state.data.projects.find(p=>p.id===state.project)?.local_only&&cloud?'此项目仅允许本地处理，请先切换本地模型。':''}</p>`;
  }else if(kind==='project-item'){
    title=data.id?'编辑项目台账':'登记项目推进';sub='把交付节点、风险、问题、决策和他人承诺单独跟进，结果由你确认。';fields=`<div class="field"><label>类型</label><select name="kind">${['里程碑','风险','问题','决策','跟进'].map(x=>`<option value="${x}" ${x===(data.kind||'里程碑')?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>状态</label><select name="status">${['待确认','进行中','等待反馈','受阻','已完成','已关闭','已取消'].map(x=>`<option value="${x}" ${x===(data.status||'待确认')?'selected':''}>${x}</option>`).join('')}</select></div><div class="field full"><label>标题 *</label><input name="title" required autofocus value="${attr(data.title||'')}" placeholder="例如：确认验收范围与负责人"></div><div class="field full"><label>背景 / 验收条件 / 影响与触发信号</label><textarea name="details" rows="3">${esc(data.details||'')}</textarea></div><div class="field"><label>负责人 / 跟进人</label><input name="owner" value="${attr(data.owner||'')}" placeholder="姓名或团队"></div><div class="field"><label>目标 / 复查日期</label><input name="due_date" type="date" value="${attr(data.due_date||'')}"></div><div class="field full"><label>实际结果 / 决策结论</label><textarea name="outcome" rows="3" placeholder="未确认时请留空">${esc(data.outcome||'')}</textarea></div>`;
  }else if(kind==='model'){
    title='添加模型连接';sub='云端需要 API Key；Ollama 选择本机已安装的模型。';fields=`<div class="field"><label>连接名称 *</label><input name="name" required placeholder="例如：本地整理"></div><div class="field"><label>连接方式</label><select name="provider" id="model-provider"><option value="ollama">Ollama 本地</option><option value="online">云端 API</option></select></div><div class="field full"><label>API 地址</label><input name="base_url" value="http://127.0.0.1:11434" placeholder="本地为 http://127.0.0.1:11434"></div><div class="field full"><label>模型名称 *</label><input name="model" required placeholder="填写实际可用的模型标识"></div><div class="field full" id="model-key-field" hidden><label>API Key</label><input name="api_key" type="password" autocomplete="off" placeholder="只保存在本机加密配置中"></div>`;
  }else if(kind==='manual'){
    title='人工补充项目档案';sub='这部分保存在项目目录内，自动整理不会覆盖。';fields=`<div class="field full"><label>补充内容</label><textarea name="body" rows="13">${esc(data.body||'')}</textarea></div>`;
  }else if(['new-file','new-folder','rename-file'].includes(kind)){
    title=kind==='new-file'?'新建文件':kind==='new-folder'?'新建文件夹':'重命名';sub=kind==='new-file'?'支持 .md、.txt、.docx、.pptx。Word 和 PPT 文件会生成有效的空白文档。':'';fields=`<div class="field full"><label>${kind==='rename-file'?'新名称':'名称'} *</label><input name="name" required autofocus value="${attr(data.name||'')}" placeholder="${kind==='new-file'?'例如：会议纪要.md':'请输入名称'}"></div>`;
  }else if(kind==='delete-file'){
    title='删除项目文件';sub='确认后会把文件移入 Windows 回收站，可从回收站恢复。';fields=`<div class="field full delete-warning">${esc(data.path||'')}</div>`;
  }else if(kind==='delete-task'){
    title='删除事项';sub='确认后将从工作台和工作记录中移除这条事项及其子事项。';fields=`<div class="field full delete-warning">${esc(data.title||'')}</div>`;
  }else if(kind==='ai-load'){
    const activeModel=state.data.models.find(item=>item.id===state.data.active_model);
    title=data.mode==='full'?'AI 全量加载项目文件':'AI 增量加载近 3 天文件';sub=`任务会在后台运行，完成后自动更新项目档案。${activeModel?.provider==='online'?'当前选择的是云端模型，可读取的文件正文会发送至已配置的模型 API。':'当前选择的是本地模型。'}模型调用可能耗时并产生费用。`;fields=`<div class="field full ai-preview"><strong>本次预计检查 ${data.selected_files} 个文件</strong><p>项目目录共 ${data.total_files} 个文件；其中 ${data.readable_candidates} 个文件可尝试提取正文，${data.index_only_candidates} 个仅登记路径或因超过 ${data.limit_mb} MB 无法提取。${data.inaccessible_paths?`其中 ${data.inaccessible_paths} 个路径无法访问。`:''}${data.deleted_files?`另发现 ${data.deleted_files} 个已移出或删除的文件。`:''}</p><p>全量文件清单将保存到项目的“_项目档案/文件索引.md”。无法读取的内容不会作为已理解的事实。</p></div>`;
  }
  modalContent.innerHTML=`<div class="modal-inner"><h2>${title}</h2><p>${sub}</p><form id="modal-form"><div class="form-grid">${fields}</div><div class="form-actions"><button type="button" class="outline-btn" data-action="close-modal">取消</button><button type="submit" class="${['delete-file','delete-task','delete-project'].includes(kind)?'danger-btn':'primary-btn'}">${kind==='delete-project'?'删除项目':kind==='dossier-template'?'格式化模板并更新档案':kind==='dossier-material'?'按模板整理并更新':kind==='delete-file'?'移入回收站':kind==='delete-task'?'确认删除':kind==='ai-load'?'开始加载':kind==='task'&&data.id?'保存修改':'保存'}</button></div></form></div>`;
  const heading=modalContent.querySelector('h2');if(heading){heading.id='modal-title';modal.setAttribute('aria-labelledby','modal-title')}
  modalContent.querySelectorAll('.field').forEach((field,index)=>{const label=field.querySelector('label'),control=field.querySelector('input,textarea,select');if(label&&control){if(!control.id)control.id='modal-field-'+index;label.htmlFor=control.id}});
  decorateControls(modalContent);modal.showModal();
  setTimeout(()=>modal.querySelector('[autofocus]')?.focus(),30);
}
function closeModal(){modal.close();state.modalKind='';state.editing=null}
async function browseFolder(path=''){
  const browser=modal.querySelector('#folder-browser');if(!browser)return;
  browser.hidden=false;browser.innerHTML='<p class="hint">正在读取本机文件夹……</p>';
  try{
    const result=await api('/api/folders/list',{method:'POST',body:{path}});
    browser.innerHTML=`<div class="folder-browser-head"><strong>选择项目文件夹</strong><button type="button" class="text-btn" data-action="close-folder-browser">收起</button></div><div class="folder-drives">${result.drives.map(d=>`<button type="button" class="folder-drive" data-action="browse-folder" data-path="${attr(d)}">${esc(d)}</button>`).join('')}</div><div class="folder-location">${result.parent?`<button type="button" class="text-btn" data-action="browse-folder" data-path="${attr(result.parent)}">← 上一级</button>`:''}<span title="${attr(result.path)}">${esc(result.path)}</span></div><div class="folder-entries">${result.folders.map(item=>`<button type="button" class="folder-entry" data-action="browse-folder" data-path="${attr(item.path)}"><span aria-hidden="true">▤</span><span>${esc(item.name)}</span><span aria-hidden="true">›</span></button>`).join('')||'<p class="empty-sm">这里没有子文件夹，可以直接选择当前文件夹。</p>'}</div><button type="button" class="primary-btn folder-choose" data-action="choose-folder" data-path="${attr(result.path)}">选择当前文件夹</button>`;
  }catch(e){browser.innerHTML=`<p class="folder-error">${esc(e.message||'读取文件夹失败')}</p><button type="button" class="text-btn" data-action="browse-folder" data-path="">返回默认位置</button>`}
}
async function submitModal(form){const d=Object.fromEntries(new FormData(form));const k=state.modalKind;let result;
  if(k==='task'){
    d.details_html=safeRich(document.getElementById('task-details').innerHTML);const q=d.quadrant;delete d.quadrant;d.important=q==='?'?null:Number(q[0]);d.urgent=q==='?'?null:Number(q[1]);d.is_interrupt=Boolean(form.elements.is_interrupt.checked);
    if(state.editing.id)result=await api('/api/tasks/'+state.editing.id,{method:'PATCH',body:d});else result=await api('/api/tasks',{method:'POST',body:d});
  }else if(k==='goal'){result=state.editing.id?await api('/api/goals/'+state.editing.id,{method:'PATCH',body:d}):await api('/api/goals',{method:'POST',body:{...d,period_kind:state.editing.period_kind||'周',week_start:state.editing.week_start||(state.editing.period_kind==='月'?monthOf(state.date):weekOf(state.date))}})}
  else if(k==='log'){result=state.editing.id?await api('/api/logs/'+state.editing.id,{method:'PATCH',body:d}):await api('/api/logs',{method:'POST',body:d})}
  else if(k==='project'){d.local_only=form.elements.local_only.checked;d.copy_into_workspace=Boolean(form.elements.copy_into_workspace?.checked);result=await api('/api/projects',{method:'POST',body:d});state.project=result.id;state.projectTab='档案';state.archive=null}
  else if(k==='project-edit'){d.local_only=form.elements.local_only.checked;result=await api('/api/projects/'+state.project,{method:'PATCH',body:d});state.archive=null}
  else if(k==='delete-project'){result=await api('/api/projects/'+state.project,{method:'DELETE'});state.project=null;state.archive=null;state.dossierJob=null;state.dossierEdit=null;state.archiveSection=0}
  else if(k==='dossier-template'||k==='dossier-material'){result=await api('/api/dossier/start',{method:'POST',body:{project_id:state.project,kind:k==='dossier-template'?'template':'material',text:d.text}});state.dossierJob=result;state.archive=null}
  else if(k==='project-item'){d.project_id=state.project;result=state.editing.id?await api('/api/project-items/'+state.editing.id,{method:'PATCH',body:d}):await api('/api/project-items',{method:'POST',body:d});state.archive=null}
  else if(k==='model'){result=await api('/api/models',{method:'POST',body:d})}
  else if(k==='manual'){result=await api('/api/archive/manual',{method:'POST',body:{project_id:state.project,body:d.body}});state.archive=null}
  else if(k==='delete-file'){result=await api('/api/file/delete',{method:'POST',body:{project_id:state.project,path:state.editing.path}});state.file=null;state.fileData=null}
  else if(k==='delete-task'){result=await api('/api/tasks/'+state.editing.id,{method:'DELETE'})}
  else if(k==='ai-load'){result=await api('/api/archive/ai/start',{method:'POST',body:{project_id:state.project,mode:state.editing.mode}});state.archiveJob=result}
  else if(['new-file','new-folder','rename-file'].includes(k)){
    const name=d.name.trim();if(!name||name.includes('/')||name.includes('\\'))throw new Error('名称不能包含路径分隔符');
    const rel=(state.dir?state.dir+'/':'')+name;
    if(k==='new-file')result=await api('/api/file/new',{method:'POST',body:{project_id:state.project,path:rel}});
    else if(k==='new-folder')result=await api('/api/file/mkdir',{method:'POST',body:{project_id:state.project,path:rel}});
    else{const current=state.file;const oldName=current.split('/').pop();const parent=current.slice(0,current.length-oldName.length);result=await api('/api/file/rename',{method:'POST',body:{project_id:state.project,old:current,new:parent+name}});state.file=result.path;state.fileData=null}
  }
  closeModal();await load();if(k==='dossier-template'||k==='dossier-material')scheduleDossierPoll(state.project);toast(k==='delete-project'?'项目已移出，本地文件与历史记录保留':k==='dossier-template'||k==='dossier-material'?'正在整理，完成后更新档案':k==='delete-file'?'已移入系统回收站':k==='delete-task'?'事项已删除':k==='ai-load'?(result.status==='无新增'?'近 3 天没有新的文件变化':'AI 加载已开始，可在档案页查看进度'):'已保存');return result;
}

function focusQuick(kind,goal=null){state.quickKind=kind;state.quickGoalId=goal?.id||'';if(goal)state.quickProjectId=goal.project_id||'';if(state.page!=='home')page('home');else render();const input=document.getElementById('quick-title');input?.focus();input?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'})}
async function saveQuick(form){
  const title=form.elements.title.value.trim();if(!title)throw new Error('先写下事项');
  const project_id=document.getElementById('quick-project')?.value||'',q=state.quickQuadrant;state.quickProjectId=project_id;
  await api('/api/tasks',{method:'POST',body:{title,project_id,goal_id:state.quickGoalId||'',planned_date:state.date,is_interrupt:state.quickInterrupt,important:q==='?'?null:Number(q[0]),urgent:q==='?'?null:Number(q[1])}});
  state.quickGoalId='';state.quickDraft='';state.quickQuadrant='?';state.quickInterrupt=false;await load();document.getElementById('quick-title')?.focus();toast('今日事项已添加');
}

async function handle(action,el){
  if(await handleV2(action,el))return;
  if(['generate-week','generate-month'].includes(action)&&reportDirty())return showModal('unsaved-report',{nextAction:action});
  if(action==='close-modal')return closeModal();
  if(action==='new-task')return focusQuick('task');
  if(action==='new-interrupt')return focusQuick('interrupt');
  if(action==='new-goal')return showModal('goal',{period_kind:'周',week_start:state.homeWeek||weekOf(state.date)});
  if(action==='new-month-goal')return showModal('goal',{period_kind:'月'});
  if(action==='home-week')return selectHomeDate(addDays(state.date,Number(el.dataset.offset)*7));
  if(action==='select-day')return selectHomeDate(el.dataset.date);
  if(action==='toggle-carryover'){state.carryoverOpen=!state.carryoverOpen;return render()}
  if(action==='carryover-select-all'){state.carryoverSelection=state.data.carryover.tasks.map(t=>t.id);return render()}
  if(action==='carryover-clear'){state.carryoverSelection=[];return render()}
  if(action==='confirm-carryover'){
    const info=state.data.carryover,selected=new Set(state.carryoverSelection??info.tasks.map(t=>t.id));
    try{const result=await api('/api/tasks/carryover',{method:'POST',body:{date:info.date,task_ids:info.tasks.filter(t=>selected.has(t.id)).map(t=>t.id)}});info.confirmed=true;state.carryoverOpen=false;await load();toast(result.moved?`已将 ${result.moved} 项待办加入今天`:'已确认，今天不再提示昨日事项')}
    catch(e){state.carryoverSelection=null;try{await load()}catch{}throw e}return;
  }
  if(action==='quick-kind'){state.quickKind=el.dataset.kind;state.quickGoalId='';render();document.getElementById('quick-title')?.focus();return}
  if(action==='clear-quick-goal'){state.quickGoalId='';render();document.getElementById('quick-title')?.focus();return}
  if(action==='quick-priority'){state.quickQuadrant=el.dataset.q;document.querySelectorAll('.quick-priorities .priority-chip').forEach(b=>{const chosen=b.dataset.q===state.quickQuadrant;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',chosen)});return}
  if(action==='classify-task'){const q=el.dataset.q;return mutate('/api/tasks/'+el.dataset.id,{important:Number(q[0]),urgent:Number(q[1])},'PATCH','已归类')}
  if(action==='new-log')return showModal('log',{event_date:state.page==='inbox'?state.recordDay:state.date});
  if(action==='new-day-log')return showModal('log',{event_date:el.dataset.date});
  if(action==='new-day-task')return showModal('task',{planned_date:el.dataset.date,project_id:state.recordProject,status:'已安排'});
  if(action==='record-day'){state.recordDay=el.dataset.date;render();if(matchMedia('(max-width:850px)').matches)document.querySelector('.record-detail')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});return}
  if(action==='record-month'){const first=parseDay(state.recordMonth+'-01');first.setMonth(first.getMonth()+Number(el.dataset.offset));state.recordMonth=localDate(first).slice(0,7);state.recordDay=null;return loadMonthRecords()}
  if(action==='export-record-month'){window.location.href='/api/logs/export?'+qs({month:state.recordMonth,project_id:state.recordProject});return}
  if(action==='new-project')return showModal('project');
  if(action==='new-model')return showModal('model');
  if(action==='goal-task'){const g=state.data.goals.find(x=>x.id===el.dataset.id);return focusQuick('task',g)}
  if(action==='edit-goal'){const g=state.data.goals.find(x=>x.id===el.dataset.id);return showModal('goal',g)}
  if(action==='toggle-goal'){const g=state.data.goals.find(x=>x.id===el.dataset.id);return mutate('/api/goals/'+g.id,{status:g.status==='已完成'?'进行中':'已完成'},'PATCH')}
  if(action==='edit-log'){const l=(state.recordLogs||[]).find(x=>x.id===el.dataset.id)||state.data.logs.find(x=>x.id===el.dataset.id);if(!l)throw new Error('记录已更新，请刷新页面');return showModal('log',l)}
  if(action==='edit-task'){const t=state.data.tasks.find(x=>x.id===el.dataset.id);return showModal('task',t)}
  if(action==='edit-record-task')return showModal('task',state.data.tasks.find(x=>x.id===el.dataset.id));
  if(action==='legacy-edit-record-task'){const t=state.data.tasks.find(x=>x.id===el.dataset.id);if(!t)throw new Error('事项已更新，请刷新页面');const row=el.closest('.daily-task');row.classList.add('editing');row.querySelector('.daily-task-content').innerHTML=`<form class="daily-task-edit" data-id="${attr(t.id)}"><input name="title" aria-label="事项名称" required value="${attr(t.title)}"><textarea name="details" aria-label="事项说明" rows="2" placeholder="补充说明或进度（可选）">${esc(t.details||'')}</textarea><div class="daily-task-edit-actions"><button type="submit" class="primary-btn">保存</button><button type="button" class="text-btn" data-action="cancel-record-edit">取消</button><button type="button" class="text-btn" data-action="edit-task" data-id="${attr(t.id)}">更多设置</button></div></form>`;row.querySelector('[name=title]').focus();return}
  if(action==='cancel-record-edit')return render();
  if(action==='delete-task'){const t=state.data.tasks.find(x=>x.id===el.dataset.id);if(!t)throw new Error('事项已更新，请刷新页面');return showModal('delete-task',t)}
  if(action==='toggle-record-task'){const t=state.data.tasks.find(x=>x.id===el.dataset.id);if(!t)throw new Error('事项已更新，请刷新页面');const done=el.checked;return mutate('/api/tasks/'+t.id,{status:done?'已完成':t.planned_date?'已安排':'待安排'},'PATCH',done?'事项已完成':'已恢复为未完成')}
  if(action==='complete-task')return mutate('/api/tasks/'+el.dataset.id,{status:'已完成'},'PATCH','事项已完成');
  if(action==='save-home-log'){const body=document.getElementById('home-log-body').value;const project_id=document.getElementById('home-log-project').value;const result=await api('/api/logs',{method:'POST',body:{body,project_id,event_date:state.date}});state.homeLogDraft='';await load();toast('记录已保存');return result}
  if(['select-project','dossier-section','dossier-template','dossier-material','delete-project'].includes(action)&&dossierDirty())return showModal('unsaved-dossier',{nextAction:action,dataset:{...el.dataset}});
  if(action==='discard-dossier'){const destination=state.editing;closeModal();state.dossierEdit=null;if(destination.nextPage)return page(destination.nextPage);if(destination.nextAction)return handle(destination.nextAction,{dataset:destination.dataset||{}});return render()}
  if(action==='select-project'){state.personalFiles=false;state.fileListing=null;state.fileData=null;state.dir='';clearTimeout(archivePollTimer);state.project=el.dataset.id;state.archive=null;state.archiveSection=0;state.dossierJob=null;state.dossierEdit=null;return render()}
  if(action==='edit-project')return showModal('project-edit',state.data.projects.find(p=>p.id===state.project));
  if(action==='delete-project')return showModal('delete-project',state.data.projects.find(p=>p.id===state.project));
  if(action==='dossier-template'||action==='dossier-material')return showModal(action);
  if(action==='dossier-section'){state.archiveSection=Number(el.dataset.index);state.dossierEdit=null;render();document.getElementById('dossier-tab-'+state.archiveSection)?.focus({preventScroll:true});return}
  if(action==='retry-dossier')return showModal(state.dossierJob.kind==='template'?'dossier-template':'dossier-material',{text:state.dossierJob.source_text||''});
  if(action==='reload-dossier'){state.archive=null;return render()}
  if(action==='edit-dossier'){const index=state.archiveSection,body=state.archive.sections[index].body;state.dossierEdit={index,body,original:body,digest:state.archive.digest};render();document.getElementById('dossier-body')?.focus();return}
  if(action==='cancel-dossier-edit'){if(dossierDirty())return showModal('unsaved-dossier',{});state.dossierEdit=null;return render()}
  if(action==='save-dossier'){setButtonBusy(el,true);try{state.archive=await api('/api/dossier/section',{method:'POST',body:{project_id:state.project,index:state.dossierEdit.index,body:state.dossierEdit.body,expected_digest:state.dossierEdit.digest}});state.dossierEdit=null;await load();toast('本节已保存，原版本已保留')}finally{setButtonBusy(el,false)}return}
  if(action==='generate-week'||action==='generate-month'){toast('正在整理报告……');const r=await api('/api/reports',{method:'POST',body:{kind:action==='generate-week'?'周报':'月报',anchor:localDate(new Date())}});state.report=r.id;state.reportEditing=false;state.reportDraft=null;await load();toast('报告草稿已生成');return}
  if(action==='open-report'){state.manualReport=null;state.report=el.dataset.id;state.reportEditing=false;state.reportDraft=null;return render()}
  if(action==='edit-report'){state.reportEditing=true;state.reportDraft=state.data.reports.find(r=>r.id===state.report)?.body||'';render();document.getElementById('report-body')?.focus();return}
  if(action==='cancel-report-edit'){if(state.reportDraft!==state.data.reports.find(r=>r.id===state.report)?.body)return showModal('unsaved-report',{cancelEdit:true});state.reportEditing=false;state.reportDraft=null;return render()}
  if(action==='discard-report'){const destination=state.editing;closeModal();if(state.manualReport)state.report=null;state.manualReport=null;state.reportEditing=false;state.reportDraft=null;if(destination?.nextPage)return page(destination.nextPage);if(destination?.nextAction)return handle(destination.nextAction);if(destination?.closeReport)state.report=null;return render()}
  if(action==='close-report'){if(reportDirty())return showModal('unsaved-report',{closeReport:true});state.manualReport=null;state.report=null;state.reportEditing=false;state.reportDraft=null;return render()}
  if(action==='save-report'){const button=el;setButtonBusy(button,true);try{await api('/api/reports/'+state.report,{method:'PATCH',body:{body:document.getElementById('report-body').value}});state.reportEditing=false;state.reportDraft=null;await load();toast('报告修改已保存')}finally{setButtonBusy(button,false)}return}
  if(action==='download-report'){window.location.href='/api/report-export/'+state.report;return}
  if(action==='download-report-docx'){window.location.href='/api/report-export-docx/'+state.report;return}
  if(action==='activate-model')return mutate('/api/models/activate',{id:el.dataset.id},'POST','已切换模型');
  if(action==='disable-model')return mutate('/api/models/activate',{id:''},'POST','已停用模型');
  if(action==='test-model'){toast('正在测试连接……');const r=await api('/api/models/test',{method:'POST',body:{id:el.dataset.id}});toast(`测试返回：${r.answer||'空响应'}`);return}
  if(action==='detect-ollama'){const r=await api('/api/ollama/models');toast(r.models.length?`本机模型：${r.models.join('、')}`:'Ollama 已连接，但没有发现本地模型');return}
  if(action==='save-settings')return mutate('/api/settings',{archive_hour:document.getElementById('archive-hour').value},'POST','更新时点已保存');
  if(action==='backup'){const r=await api('/api/backup',{method:'POST',body:{}});toast(`已备份工作台数据：${r.path}`);return}
  if(action==='pick-folder')return browseFolder(modal.querySelector('#project-root')?.value||'');
  if(action==='browse-folder')return browseFolder(el.dataset.path);
  if(action==='close-folder-browser'){modal.querySelector('#folder-browser').hidden=true;return}
  if(action==='choose-folder'){modal.querySelector('#project-root').value=el.dataset.path;const name=modal.querySelector('[name=name]');if(name&&!name.value)name.value=el.dataset.path.split(/[\\/]/).filter(Boolean).pop()||'';modal.querySelector('#folder-browser').hidden=true;return}
}

document.addEventListener('click',async event=>{
  const pageButton=event.target.closest('[data-page]');if(pageButton){if(pageButton.dataset.page==='reports'&&!reportDirty()){state.manualReport=null;state.report=null;state.reportEditing=false;state.reportDraft=null}if(pageButton.dataset.page==='projects'){state.personalFiles=false;state.projectTab='档案'}if(pageButton.dataset.projectTab)state.projectTab=pageButton.dataset.projectTab;page(pageButton.dataset.page);return}
  const actionButton=event.target.closest('[data-action]');if(!actionButton||actionButton.disabled)return;
  const waiting=['confirm-carryover','toggle-goal','classify-task','save-home-log','save-dossier','generate-week','generate-month','save-report','activate-model','disable-model','test-model','detect-ollama','save-settings','backup','pick-folder','browse-folder'].includes(actionButton.dataset.action);
  if(waiting)setButtonBusy(actionButton,true);
  try{await handle(actionButton.dataset.action,actionButton)}catch(e){if(actionButton.dataset.action==='toggle-record-task')actionButton.checked=!actionButton.checked;toast(e.message||'操作失败',true)}finally{if(waiting)setButtonBusy(actionButton,false)}
});
document.addEventListener('change',event=>{
  if(event.target.id==='home-date'){selectHomeDate(event.target.value);return}
  if(event.target.dataset.carryoverId){const info=state.data.carryover;const selected=new Set(state.carryoverSelection??info.tasks.map(t=>t.id));if(event.target.checked)selected.add(event.target.dataset.carryoverId);else selected.delete(event.target.dataset.carryoverId);state.carryoverSelection=[...selected];render();return}
  if(event.target.id==='quick-project'){state.quickProjectId=event.target.value}
  if(event.target.id==='quick-interrupt')state.quickInterrupt=event.target.checked;
  if(event.target.id==='home-log-project')state.homeLogProject=event.target.value;
  if(event.target.id==='record-filter'){state.recordProject=event.target.value;loadMonthRecords()}
  if(event.target.id==='record-month-input'){state.recordMonth=event.target.value;state.recordDay=null;loadMonthRecords()}
  if(event.target.id==='model-provider'){
    const online=event.target.value==='online';modal.querySelector('#model-key-field').hidden=!online;
    const address=modal.querySelector('[name=base_url]');address.value=online?'': 'http://127.0.0.1:11434';
  }
});
document.addEventListener('change',async event=>{
  if(event.target.id!=='dossier-upload')return;const file=event.target.files?.[0];if(!file)return;
  const submit=modal.querySelector('[type=submit]');setButtonBusy(submit,true);
  try{const result=await api('/api/dossier/upload?'+qs({project_id:state.project,name:file.name}),{method:'POST',body:file});document.getElementById('dossier-input').value=result.text;toast('文件正文已读取，请核对后开始整理')}catch(e){toast(e.message,true)}finally{setButtonBusy(submit,false);event.target.value=''}
});
document.addEventListener('input',event=>{if(event.target.id==='quick-title')state.quickDraft=event.target.value;if(event.target.id==='home-log-body')state.homeLogDraft=event.target.value;if(event.target.id==='report-body')state.reportDraft=event.target.value;if(event.target.id==='dossier-body'&&state.dossierEdit)state.dossierEdit.body=event.target.value});
window.addEventListener('beforeunload',event=>{if(dossierDirty()||reportDirty()){event.preventDefault();event.returnValue=''}});
document.addEventListener('submit',async event=>{if(event.target.classList.contains('daily-task-edit')){event.preventDefault();const form=event.target,submit=form.querySelector('[type=submit]');setButtonBusy(submit,true);try{await mutate('/api/tasks/'+form.dataset.id,{title:form.elements.title.value,details:form.elements.details.value},'PATCH','事项已更新')}catch(e){toast(e.message||'保存失败',true);setButtonBusy(submit,false)}return}if(event.target.id==='quick-form'){event.preventDefault();const submit=event.target.querySelector('[type=submit]');setButtonBusy(submit,true);try{await saveQuick(event.target)}catch(e){toast(e.message||'保存失败',true)}finally{setButtonBusy(submit,false)}return}if(event.target.id!=='modal-form')return;event.preventDefault();const submit=event.target.querySelector('[type=submit]');setButtonBusy(submit,true);try{await submitModal(event.target)}catch(e){toast(e.message||'保存失败',true)}finally{setButtonBusy(submit,false)}});


document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();focusQuick('task')}});
window.addEventListener('focus',resumeCurrentDay);
window.addEventListener('pageshow',resumeCurrentDay);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resumeCurrentDay()});
setInterval(()=>refreshCurrentDay(),30000);
window.addEventListener('DOMContentLoaded',()=>load().catch(e=>{renderPaper(head(names[state.page],'')+empty('工作台暂时无法启动',esc(e.message)));toast(e.message,true)}));

document.addEventListener('keydown',event=>{const tab=event.target.closest('.dossier-tab');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll('.dossier-tab')];let index=tabs.indexOf(tab);index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;handle('dossier-section',tabs[index]).catch(e=>toast(e.message,true))});
