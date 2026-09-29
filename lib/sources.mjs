import { load } from 'cheerio';
import robotsParser from 'robots-parser';
import { setTimeout as delay } from 'node:timers/promises';
import { clean, candidate, normalize } from './model.mjs';

const agent='TestInternRadar/1.0 (+https://github.com/huayou712-maker/test-intern-radar)';
const robots = new Map();
export async function get(url) {
  const origin=new URL(url).origin;
  if (!robots.has(origin)) {
    const r=await fetch(origin+'/robots.txt',{headers:{'User-Agent':agent},signal:AbortSignal.timeout(25000)});
    const body=await r.text();
    if (!r.ok && r.status!==404) throw new Error(`robots.txt HTTP ${r.status}`);
    const html=load(body);
    if (r.ok && /text\/html/.test(r.headers.get('content-type')||'') && !/404/.test(html('title').text())) throw new Error('robots.txt 返回了无法核验的 HTML 页面');
    robots.set(origin,robotsParser(origin+'/robots.txt',r.status===404 || /404/.test(html('title').text()) ? '' : body));
  }
  if (robots.get(origin).isAllowed(url,agent)===false) throw new Error('来源 robots.txt 禁止采集该路径');
  await delay(250);
  const response=await fetch(url,{headers:{'User-Agent':agent},signal:AbortSignal.timeout(25000)});
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${new URL(url).pathname}`);
  return response;
}
function description($, selector) {
  const node=$(selector).first().clone();
  node.find('br').replaceWith('\n');
  node.find('script,style,h4,.toreportwechat').remove();
  const text=clean(node.text());
  if (text.length<20) throw new Error(`岗位正文不存在或页面结构变化：${selector}`);
  return text;
}
const terms=['测试','软件测试','测试开发','自动化测试','测试实习','SDET','QA'];
export async function collectCiic(now) {
  const base='https://www.ciiczhaopin.com';
  const listings=new Map();
  let partial=false;
  for (const term of terms) {
    let pages=1;
    for(let page=1;page<=pages;page++) {
      const url=new URL('/position/list',base);
      url.search=new URLSearchParams({keyword:term,page:String(page)}).toString();
      const $=load(await (await get(url.href)).text());
      if (!$('title').text().includes('职位列表')) throw new Error('中智返回非职位列表页面');
      const pager=$('el-pagination').first();
      if (!pager.length && !$('.position-info-item').length && $('body').text().includes('暂时没有符合该搜索条件的职位')) break;
      const total=Number(pager.attr(':total'));
      if (!Number.isFinite(total)) throw new Error('中智分页字段变化');
      pages=Math.min(20,Math.ceil(total/20));
      partial ||= total>400;
      const nodes=$('.position-info-item');
      if (total>0 && !nodes.length) throw new Error('中智职位列表为空但总数非零');
      nodes.each((_,el)=>{
        const card=$(el);
        const title=clean(card.find('.job-name').text());
        if (!candidate(title)) return;
        const id=card.attr('uuid');
        if (!id) throw new Error('中智岗位缺少稳定 ID');
        const company=clean(card.find('.company-text h3').text());
        const nature=card.find('.company-text p span[title]').map((_,x)=>$(x).attr('title')).get().find(x=>/中央企业|国有企业|民营|私企|外商|合资|事业单位/.test(x)) || '未公布';
        const commissioned=card.text().includes('委托代招');
        listings.set(id,{id:'ciic:'+id,title,company,company_type:commissioned?'未核实':nature,company_type_evidence:commissioned?`委托代招，招聘服务机构标注：${nature}`:`中智招聘列表标注：${nature}`,city:clean(card.find('.job-address').text()).split('|').filter((x,i,a)=>a.indexOf(x)===i).join(' · '),education:clean(card.find('.job-education').text()),source:'ciic',source_name:'中智招聘',source_url:base+'/position/detail?uuid='+id});
      });
    }
  }
  const jobs=[];
  const failures=[];
  for(const input of listings.values()) {
    const [result]=await Promise.allSettled([(async()=>{
    const $=load(await (await get(input.source_url)).text());
    const job=normalize({...input,description:description($,'.position-describe')},now);
    if(job) jobs.push(job);
    })()]);
    if(result.status==='rejected') failures.push(`${input.source_url} ${result.reason.message}`);
  }
  if(failures.length===listings.size && listings.size) throw new Error(failures.join('\n'));
  return {id:'ciic',name:'中智招聘',url:base+'/campus/index',status:failures.length?'partial':'ok',error:failures.join('\n'),jobs,scanned:listings.size,scope:`${terms.join(' / ')}，每个关键词最多 400 条；详情无法核验 ${failures.length} 条`,limited:partial || failures.length>0};
}
export async function collectNcss(now) {
  const base='https://www.ncss.cn';
  const listings=new Map();
  for(const term of terms) {
    let pages=1;
    for(let page=1;page<=pages;page++) {
      const url=new URL('/student/jobs/jobslist/ajax/',base);
      url.search=new URLSearchParams({jobName:term,jobType:'03',offset:String(page),limit:'10'}).toString();
      const body=await (await get(url.href)).json();
      if(body.flag!==true || !Array.isArray(body.data?.list)) throw new Error(`国家就业平台列表接口异常：${term} 第 ${page} 页 ${JSON.stringify(body).slice(0,300)}`);
      if (!body.data.list.length) break;
      const count=Number(body.data.pagenation?.count);
      if(!Number.isFinite(count)) throw new Error('国家就业平台分页字段变化');
      pages=Math.min(5,Math.ceil(count/10));
      for(const row of body.data.list) {
        if(!candidate(row.jobName)) continue;
        if(!row.jobId || !row.recName) throw new Error('国家就业平台岗位缺少 ID 或公司名称');
        listings.set(row.jobId,row);
      }
    }
  }
  const jobs=[];
  const failures=[];
  for(const row of listings.values()) {
    const url=base+'/student/jobs/'+encodeURIComponent(row.jobId)+'/detail.html';
    const [result]=await Promise.allSettled([(async()=>{
    const $=load(await (await get(url)).text());
    const text=description($,'.mainContent');
    const type=clean($('body').text()).includes('[实习]')?'来源详情明确标注 [实习]':'';
    const input={id:'ncss:'+row.jobId,title:clean(row.jobName),company:clean(row.recName),company_type:row.recProperty || '未公布',company_type_evidence:'国家大学生就业服务平台标注：'+(row.recProperty || '未公布'),city:clean($('.site-tag').first().text()) || clean(row.areaCodeName),education:row.degreeName || '未公布',publish_date:row.publishDate?new Date(row.publishDate).toISOString():null,description:text,source:'ncss',source_name:row.sourcesNameCh?`国家就业平台 · ${row.sourcesNameCh}`:'国家大学生就业服务平台',source_url:url,internship_evidence:type};
    const job=normalize(input,now);
    if(job) jobs.push(job);
    })()]);
    if(result.status==='rejected') failures.push(`${url} ${result.reason.message}`);
  }
  if(failures.length===listings.size && listings.size) throw new Error(failures.join('\n'));
  return {id:'ncss',name:'国家大学生就业服务平台',url:base+'/student/jobs/index.html',status:failures.length?'partial':'ok',error:failures.join('\n'),jobs,scanned:listings.size,scope:`实习分类搜索 ${terms.join(' / ')}，每个关键词前五页、最多 50 条；详情无法核验 ${failures.length} 条`,limited:true};
}
