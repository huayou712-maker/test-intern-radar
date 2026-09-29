'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Job, Snapshot, Watch } from '../lib/types';
import JobAnalysis from './job-analysis';

const base='/test-intern-radar';
const repo='https://github.com/huayou712-maker/test-intern-radar';
const tabs=[['all','全部岗位','◎'],['today','Today','◷'],['matches','Matches','◇'],['watch','Watchlist','☆'],['history','岗位变化','↗'],['sources','采集来源','◉']];
const date=(value:string|null,full=false)=>value?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',...(full?{hour:'2-digit',minute:'2-digit',hour12:false} as const:{})}).format(new Date(value)):'未公布';
const day=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const stateCompany=(value:string)=>/中央企业|国有|国企|央企/.test(value);
const parts=(value:string)=>value.split(/[,，、\n]/).map(v=>v.trim()).filter(Boolean);
function matches(job:Job,watch:Watch) {
  return (!parts(watch.companies).length || parts(watch.companies).some(v=>job.company.includes(v))) &&
    (!parts(watch.cities).length || parts(watch.cities).some(v=>job.city.includes(v))) &&
    (watch.nature!=='state' || stateCompany(job.company_type)) &&
    (!watch.degree || /本科|大专|不限/.test(job.education)) &&
    (!watch.year || job.graduation_year.includes(watch.year));
}
const display=(value:unknown)=>Array.isArray(value)?value.join(' / '):value===null?'未公布':String(value);
const labels:Record<string,string>={title:'岗位名称',company:'招聘单位',company_type:'单位性质',city:'地点',education:'学历',graduation_year:'毕业年份',publish_date:'发布时间',deadline:'截止日期',skills:'技能',description:'岗位要求',status:'状态'};
const defaultWatch:Watch={companies:'',cities:'北京，成都，西安，南京',nature:'state',degree:true,year:''};
function validWatch(value:unknown):value is Watch {
  if (!value || typeof value!=='object') return false;
  const w=value as Watch;
  return typeof w.companies==='string' && typeof w.cities==='string' && ['state','all'].includes(w.nature) && typeof w.degree==='boolean' && typeof w.year==='string';
}
export default function Radar({initial}:{initial:Snapshot}) {
  const [data,setData]=useState(initial);
  const [tab,setActiveTab]=useState('all');
  const [query,setQuery]=useState('');
  const [city,setCity]=useState('');
  const [nature,setNature]=useState('all');
  const [degree,setDegree]=useState(false);
  const [year,setYear]=useState('');
  const [status,setStatus]=useState('open');
  const [sort,setSort]=useState('new');
  const [source,setSource]=useState('all');
  const setTab=(value:string)=>{setActiveTab(value);if(value==='all')setSource('all');};
  const [selected,setSelected]=useState<string|null>(null);
  const [watch,setWatch]=useState<Watch>(defaultWatch);
  const [draft,setDraft]=useState<Watch>(defaultWatch);
  const [message,setMessage]=useState('');
  const [notice,setNotice]=useState(false);
  const [syncing,setSyncing]=useState(false);
  const [now,setNow]=useState(initial.generated_at || '2026-01-01T00:00:00Z');
  useEffect(()=>{
    setNow(new Date().toISOString());
    const saved=localStorage.getItem('radar-watch-v1');
    if(saved) {
      try { const value=JSON.parse(saved); if(!validWatch(value)) throw new Error('关注条件格式无效'); setWatch(value);setDraft(value); }
      catch { setMessage('已保存的关注条件无法读取，请在 Watchlist 重新保存。'); }
    }
    setSelected(new URLSearchParams(window.location.search).get('job'));
    const timer=setInterval(()=>setNow(new Date().toISOString()),60000);
    return ()=>clearInterval(timer);
  },[]);
  const syncData=useCallback(async(manual=false)=>{
      if(manual)setSyncing(true);
      try {
        const response=await fetch(`${base}/data/jobs.json?at=${Date.now()}`,{cache:'no-store'});
        if(!response.ok) throw new Error('岗位数据获取失败');
        const next:Snapshot=await response.json();
        if(next.version!==1 || !Array.isArray(next.jobs) || !Array.isArray(next.events)) throw new Error('岗位数据格式变化');
        const known=new Set(data.events.map(e=>e.id));
        const fresh=next.events.filter(e=>!known.has(e.id) && next.jobs.some(j=>j.id===e.job_id && matches(j,watch)));
        if(notice && Notification.permission==='granted' && fresh.length) new Notification('测试开发实习岗位雷达',{body:`你的关注条件有 ${fresh.length} 条新增或变化，打开 Matches 查看。`,tag:'test-intern-radar'});
        setData(next);
        if(manual)setMessage('已取得云端最近发布的数据。招聘来源由定时任务采集。');
      } catch(error) {setMessage(`同步失败：${String(error)}。页面保留最近取得的数据。`);}
      finally {if(manual)setSyncing(false);}
  },[data.events,notice,watch]);
  useEffect(()=>{
    const timer=setInterval(()=>void syncData(),120000);
    return ()=>clearInterval(timer);
  },[syncData]);
  const jobs=useMemo(()=>{
    const grouped=new Map<string,Job>();
    for(const job of [...data.jobs].sort((a,b)=>b.last_seen_at.localeCompare(a.last_seen_at))) {
      const key=job.duplicate_group || job.id;
      if(!grouped.has(key)) grouped.set(key,job);
    }
    return [...grouped.values()];
  },[data.jobs]);
  const today=day(now);
  const active=jobs.filter(j=>j.status==='open' && (!j.deadline || j.deadline>=today));
  const todayEvents=data.events.filter(e=>day(e.at)===today);
  const matchesCount=active.filter(j=>matches(j,watch)).length;
  const closing=active.filter(j=>j.deadline && (new Date(j.deadline+'T23:59:59+08:00').getTime()-new Date(now).getTime())<=3*86400000);
  const shown=jobs.filter(job=>{
    const search=[job.title,job.company,job.city,...job.skills].join(' ').toLowerCase();
    const groupIds=data.jobs.filter(j=>j.duplicate_group===job.duplicate_group).map(j=>j.id);
    return (!query || parts(query.replace(/\s+/g,',')).every(term=>search.includes(term.toLowerCase()))) &&
      (!city || job.city.includes(city)) && (nature!=='state' || stateCompany(job.company_type)) &&
      (!degree || /本科|大专|不限/.test(job.education)) && (!year || job.graduation_year.includes(year)) &&
      (source==='all' || data.jobs.some(j=>groupIds.includes(j.id) && j.source===source)) &&
      (status==='all' || (status==='open' ? active.includes(job) : job.status===status)) &&
      (tab!=='matches' || matches(job,watch)) && (tab!=='today' || todayEvents.some(e=>groupIds.includes(e.job_id)) || closing.includes(job));
  }).sort((a,b)=>sort==='deadline'?(a.deadline||'9999').localeCompare(b.deadline||'9999'):b.first_seen_at.localeCompare(a.first_seen_at));
  const detail=data.jobs.find(j=>j.id===selected);
  function exportJobs() {
    const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),filters:{query,city,nature,degree,year,status,source,tab},jobs:shown},null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download='test-intern-jobs.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    setMessage(`已导出当前筛选的 ${shown.length} 个岗位，包含完整要求和来源链接。`);
  }
  const openJob=(job:Job)=>{setSelected(job.id);window.history.replaceState(null,'',`${base}/?job=${encodeURIComponent(job.id)}`);};
  const closeJob=()=>{setSelected(null);window.history.replaceState(null,'',base+'/');};
  const saveWatch=()=>{setWatch(draft);localStorage.setItem('radar-watch-v1',JSON.stringify(draft));setMessage('关注条件已保存在当前浏览器。');};
  const requestNotice=async()=>{
    if(!('Notification' in window)){setMessage('当前浏览器不支持桌面通知，可以订阅 RSS。');return;}
    const permission=await Notification.requestPermission();
    setNotice(permission==='granted');
    setMessage(permission==='granted'?'页面打开期间，将提醒符合关注条件的新变化。':'通知权限未开启。');
  };
  function downloadWatch() {
    const blob=new Blob([JSON.stringify(watch,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='radar-watchlist.json';a.click();URL.revokeObjectURL(url);
  }
  async function importWatch(file:File|undefined) {
    if(!file)return;
    try{const value=JSON.parse(await file.text());if(!validWatch(value))throw new Error('文件格式无效');setDraft(value);setWatch(value);localStorage.setItem('radar-watch-v1',JSON.stringify(value));setMessage('关注条件已导入。');}
    catch{setMessage('导入失败，请选择本站导出的关注条件 JSON 文件。');}
  }
  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href={base+'/'}><span className="radar-mark" aria-hidden="true"><i/></span><span>TEST INTERN<span className="brand-sub">岗位雷达</span></span></a>
      <p className="nav-caption">工作空间</p>
      <nav aria-label="主要导航">{tabs.map(([id,label,icon])=><button key={id} className={tab===id?'nav-item selected':'nav-item'} onClick={()=>{setTab(id);setSelected(null);}}><span aria-hidden="true">{icon}</span>{label}{id==='matches'&&<b>{matchesCount}</b>}</button>)}</nav>
      <div className="sidebar-note"><span className="live-dot"/>公开来源 · 云端检查<p>专注软件测试与测试开发实习</p><small>时间均为北京时间</small></div>
      <div className="sidebar-links"><a href={repo} target="_blank" rel="noreferrer">GitHub ↗</a><a href={base+'/feed.xml'} target="_blank" rel="noreferrer">订阅 RSS ↗</a></div>
    </aside>
    <main>
      <header className="topbar"><span>招聘观察 / <strong>{tabs.find(t=>t[0]===tab)?.[1]}</strong></span><button className="quiet" onClick={requestNotice}>{notice?'通知已开启':'开启网页通知'}</button></header>
      <div className="workspace">
        <div className="page-heading"><div><p className="eyebrow">SOFTWARE QUALITY · INTERNSHIPS</p><h1>{tab==='today'?'今天值得关注':tab==='matches'?'符合你的关注条件':tab==='watch'?'把目标记在这里':tab==='history'?'招聘信息的变化':tab==='sources'?'每条信息，都有出处':'测试开发实习岗位'}</h1><p className="subtitle">{tab==='all'?'从公开招聘信息中发现机会，回到来源页面投递。':tab==='today'?`${today} · 新岗位、要求变化与临近截止` :tab==='matches'?'根据 Watchlist 自动筛选已核验的岗位。':tab==='watch'?'条件之间同时满足，同一输入框内的多个选项满足任意一个。':tab==='sources'?'成功检查时间与采集范围公开可查。':'保存首次发现以来的记录，逐项查看要求如何改变。'}</p></div><div className="updated"><span className="live-dot"/>最近数据生成<strong>{date(data.generated_at,true)}</strong></div></div>
        {message&&<div className="message" role="status">{message}<button aria-label="关闭提示" onClick={()=>setMessage('')}>×</button></div>}
        <section className="sync-panel" aria-label="更新与采集记录">
          <div><strong>定时采集 · 每 30 分钟</strong><p>每小时第 17、47 分钟计划运行，GitHub 可能延迟调度。页面每两分钟同步云端数据。</p>{data.generated_at && Date.parse(now)-Date.parse(data.generated_at)>90*60000 && <p role="alert">数据已超过 90 分钟未更新，请查看云端运行记录；当前页面保留上次采集结果。</p>}</div>
          <div className="sync-evidence"><span>本轮检查候选 <b>{data.sources.reduce((sum,source)=>sum+source.scanned,0)}</b> 条</span><span>接入 <b>{data.sources.length}</b> 个来源 · <a href={base+'/data/jobs.json'} target="_blank" rel="noreferrer">查看采集数据 ↗</a></span><a href={repo+'/actions'} target="_blank" rel="noreferrer">查看每次运行记录 ↗</a></div>
          <button disabled={syncing} onClick={()=>void syncData(true)}>{syncing?'正在同步…':'同步最新数据'}</button>
        </section>
        {['all','today','matches'].includes(tab)&&<section className="source-tools" aria-label="来源筛选与导出"><label>招聘来源 <select aria-label="招聘来源" value={source} onChange={e=>setSource(e.target.value)}><option value="all">全部来源</option>{data.sources.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button onClick={exportJobs} disabled={!shown.length}>导出筛选岗位 JSON</button><span>保存完整正文、核验时间和投递链接</span></section>}
        <div className="stats-grid"><div><span>已核验在招</span><b>{active.length}</b><small>合并完全相同的重复记录</small></div><div><span>今日新增</span><b>{jobs.filter(j=>day(j.first_seen_at)===today).length}</b><small>以首次发现时间计算</small></div><div><span>与你匹配</span><b>{matchesCount}</b><small>符合当前关注条件</small></div><div><span>三天内截止</span><b>{closing.length}</b><small>只计算明确公布的日期</small></div></div>
        {tab==='watch'?<section className="settings-panel"><h2>我的关注条件</h2><p>保存在当前浏览器；可以导出后在其他设备导入。</p><div className="form-grid"><label>关注企业<input value={draft.companies} onChange={e=>setDraft({...draft,companies:e.target.value})} placeholder="中国电信，中国移动，中国电子"/><small>留空表示全部企业；支持名称包含匹配</small></label><label>工作地点<input value={draft.cities} onChange={e=>setDraft({...draft,cities:e.target.value})} placeholder="北京，成都，西安，南京"/><small>使用逗号分隔，留空表示全国</small></label><label>单位性质<select value={draft.nature} onChange={e=>setDraft({...draft,nature:e.target.value})}><option value="all">全部单位</option><option value="state">国企 / 央企（来源明确标注）</option></select></label><label>毕业年份<input value={draft.year} onChange={e=>setDraft({...draft,year:e.target.value})} placeholder="例如 2027，留空表示全部"/></label><label className="check"><input type="checkbox" checked={draft.degree} onChange={e=>setDraft({...draft,degree:e.target.checked})}/>学历为本科、大专或不限</label></div><div className="actions"><button className="primary" onClick={saveWatch}>保存关注条件</button><button onClick={downloadWatch}>导出条件</button><label className="file-button">导入条件<input type="file" accept="application/json,.json" onChange={e=>importWatch(e.target.files?.[0])}/></label></div><p className="muted">通知仅在本网页打开且浏览器允许时发送。RSS 可供支持后台通知的阅读器订阅。</p></section>:
        tab==='sources'?<section className="source-grid">{data.sources.map(source=><article className="source-card" key={source.id}><div className="row"><h2>{source.name}</h2><span className={'badge '+(source.status==='ok'?'verified':'warning')}>{source.status==='ok'?'采集成功':source.status==='partial'?'部分完成':'采集失败'}</span></div><p>{source.scope}</p><dl><dt>最近尝试</dt><dd>{date(source.checked_at,true)}</dd><dt>最近成功</dt><dd>{date(source.last_success_at,true)}</dd><dt>核验候选 / 匹配记录</dt><dd>{source.scanned} / {source.matched}</dd></dl>{source.error&&<details><summary>无法核验的记录</summary><p className="error">{source.error}</p></details>}<a href={source.url} target="_blank" rel="noreferrer">访问来源 ↗</a></article>)}<article className="source-card"><h2>采集说明</h2><p>云端计划每 30 分钟检查一次，任务可能排队。来源报错时保留已有数据；搜索中未再次出现的岗位标记为“待核验”。</p><p>网站展示的是当前接入来源和搜索范围内发现的岗位。单位性质以来源标注为依据，委托代招的实际用人单位性质单独核验。</p><a href={repo+'/actions'} target="_blank" rel="noreferrer">查看运行记录 ↗</a></article></section>:
        tab==='history'?<section className="history-list">{[...data.events].reverse().slice(0,200).map(event=>{const job=data.jobs.find(j=>j.id===event.job_id);return job?<article key={event.id} className="history-event"><time>{date(event.at,true)}</time><div><span className="badge">{event.type==='new'?'NEW':event.type==='deadline'?'DUE':'UPD'}</span><button className="text-button" onClick={()=>openJob(job)}>{job.company} · {job.title}</button>{event.changes.map(change=><details key={change.field}><summary>{labels[change.field] || change.field}发生变化</summary><div className="before">{display(change.before)}</div><div className="after">{display(change.after)}</div></details>)}</div></article>:null;})}{!data.events.length&&<div className="empty"><h2>尚未产生变化记录</h2><p>首次采集后将记录新岗位，后续核验会保留字段变化。</p></div>}</section>:
        <section className="jobs-panel"><div className="filterbar"><label className="search"><span aria-hidden="true">⌕</span><input aria-label="搜索岗位" placeholder="搜索岗位、企业或技能…" value={query} onChange={e=>setQuery(e.target.value)}/></label><input className="city-input" aria-label="工作地点" placeholder="全国 / 输入城市" value={city} onChange={e=>setCity(e.target.value)}/><select aria-label="单位性质" value={nature} onChange={e=>setNature(e.target.value)}><option value="all">全部单位</option><option value="state">国企 / 央企</option></select><select aria-label="岗位状态" value={status} onChange={e=>setStatus(e.target.value)}><option value="open">已核验在招</option><option value="all">全部状态</option><option value="unverified">待核验</option><option value="closed">已关闭</option></select></div><div className="filter-secondary"><label className="check"><input type="checkbox" checked={degree} onChange={e=>setDegree(e.target.checked)}/>本科可投</label><input aria-label="毕业年份" className="year-input" placeholder="毕业年份" value={year} onChange={e=>setYear(e.target.value)}/><span className="result-count">{shown.length} 个岗位</span><select aria-label="排序方式" value={sort} onChange={e=>setSort(e.target.value)}><option value="new">最近发现优先</option><option value="deadline">截止时间优先</option></select></div><div className="job-list">{shown.map(job=><article className="job-card" key={job.id}><div className="company-avatar" aria-hidden="true">{job.company.slice(0,2)}</div><div className="job-main"><div className="job-company">{job.company}<span className={'badge '+(stateCompany(job.company_type)?'state':'')}>{job.company_type}</span></div><button className="job-title" onClick={()=>openJob(job)}>{job.title}</button><p className="job-meta">{job.city || '地点未公布'}<i/>实习<i/>{job.education}{job.graduation_year.length>0&&<> <i/>{job.graduation_year.join(' / ')} 届</>}</p><div className="skills">{job.skills.slice(0,5).map(skill=><span key={skill}>{skill}</span>)}</div><p className="provenance">{job.source_name} · {date(job.last_seen_at,true)} 核验</p></div><div className="job-side"><span className={'badge '+(job.status!=='open'?'warning':'verified')}>{job.status==='unverified'?'待核验':job.status==='closed'?'CLOSED':day(job.first_seen_at)===today?'NEW':'已核验'}</span><span className="deadline">{job.deadline?`${job.deadline} 截止`:'截止时间未公布'}</span><button className="text-button" onClick={()=>openJob(job)}>查看岗位 →</button></div></article>)}</div>{!shown.length&&<div className="empty"><span aria-hidden="true">◎</span><h2>当前条件下没有已确认的岗位</h2><p>{tab==='matches'?'可以在 Watchlist 调整城市、企业或单位性质。':'可以调整搜索条件，并在“采集来源”查看实际覆盖范围。'}</p><button onClick={()=>{setQuery('');setCity('');setNature('all');setDegree(false);setYear('');setStatus('all');setTab('all');}}>查看全部记录</button></div>}</section>}
        <footer className="page-footer"><span>依据公开招聘页面 · 要求与投递状态以来源为准</span><a href={repo+'/actions'} target="_blank" rel="noreferrer">云端运行记录 ↗</a></footer>
      </div>
    </main>
    {detail&&<div className="detail-backdrop" onClick={closeJob}>
      <section role="dialog" aria-modal="true" aria-label="岗位详情" className="detail-panel" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')closeJob();}}>
        <div className="detail-top"><span>岗位详情</span><button autoFocus aria-label="关闭岗位详情" onClick={closeJob}>×</button></div>
        <div className="detail-content">
          <p className="eyebrow">{detail.company}</p><h2>{detail.title}</h2><span className="badge verified">{detail.status==='open'?'最近核验可访问':detail.status==='closed'?'已关闭':'待重新核验'}</span>
          <dl className="detail-fields"><dt>单位性质</dt><dd>{detail.company_type}</dd><dt>工作地点</dt><dd>{detail.city || '未公布'}</dd><dt>招聘类型</dt><dd>实习</dd><dt>学历要求</dt><dd>{detail.education}</dd><dt>毕业年份</dt><dd>{detail.graduation_year.join(' / ') || '未公布'}</dd><dt>来源发布时间</dt><dd>{detail.publish_date?new Date(detail.publish_date).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}):'未公布'}</dd><dt>截止日期</dt><dd>{detail.deadline || '未公布'}</dd></dl>
          <JobAnalysis job={detail}/>
          <h3>岗位要求</h3><div className="description">{detail.description.replace(/([；。])(?=\d+[、.])/g,'$1\n\n').replace(/【/g,'\n\n【')}</div>
          <h3>技能</h3><div className="skills">{detail.skills.map(skill=><span key={skill}>{skill}</span>)}</div>
          <h3>识别依据</h3><p className="evidence">实习：{detail.internship_evidence}<br/>软件测试：{detail.software_evidence.join('、')}<br/>{detail.company_type_evidence}</p>
          <h3>来源与记录</h3><p className="evidence">{detail.source_name}<br/>首次发现 {date(detail.first_seen_at,true)}<br/>最近确认 {date(detail.last_seen_at,true)}<br/>最近检查 {date(detail.last_checked_at,true)}<br/>{detail.status_reason}</p>
          {data.jobs.filter(j=>j.duplicate_group===detail.duplicate_group && j.id!==detail.id).map(j=><p key={j.id}><a href={j.source_url} target="_blank" rel="noreferrer">相同岗位的其他来源：{j.source_name} ↗</a></p>)}
          <h3>该岗位的变化</h3>{data.events.filter(e=>e.job_id===detail.id).reverse().map(event=><div className="detail-event" key={event.id}><small>{date(event.at,true)} · {event.type==='new'?'首次发现':event.type==='deadline'?'即将截止':'字段更新'}</small>{event.changes.map(change=><details key={change.field}><summary>{labels[change.field] || change.field}</summary><div className="before">{display(change.before)}</div><div className="after">{display(change.after)}</div></details>)}</div>)}
        </div>
        <div className="detail-action"><a className="primary" href={detail.source_url} target="_blank" rel="noreferrer">查看招聘来源页面 ↗</a><small>在来源网站确认要求并投递</small></div>
      </section>
    </div>}
  </div>;
}
