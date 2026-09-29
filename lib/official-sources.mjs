import { get } from './sources.mjs';
import { candidate, clean, normalize } from './model.mjs';

export async function collectJd(now) {
  const url='https://campus.jd.com/api/wx/position/page?type=internship';
  const records=new Map();
  let total=0;
  let scanned=0;
  for(let pageIndex=0;pageIndex<50;pageIndex++) {
    const response=await (await get(url,{
      method:'POST',headers:{'Content-Type':'application/json',Referer:'https://campus.jd.com/'},
      body:JSON.stringify({pageSize:100,pageIndex,parameter:{positionName:'',planIdList:[],jobDirectionCodeList:[],workCityCodeList:[],positionDeptList:[]}}),
    })).json();
    if(response.success!==true || !Array.isArray(response.body?.items) || !Number.isInteger(response.body.totalNumber)) throw new Error('京东实习接口返回结构变化');
    total=response.body.totalNumber;
    const rows=response.body.items;
    if(!rows.length && scanned<total) throw new Error('京东实习接口分页提前结束');
    const before=records.size;
    for(const row of rows) {
      if(!row.reqId || !row.publishId || !row.positionName) throw new Error('京东岗位缺少稳定标识或名称');
      records.set(String(row.publishId),row);
    }
    if(rows.length && records.size===before) throw new Error('京东实习接口重复返回同一页');
    scanned+=rows.length;
    if(scanned>=total) break;
  }
  const jobs=[];
  for(const row of records.values()) {
    if(!candidate(row.positionName)) continue;
    if(!row.workContent || !row.qualification || !Array.isArray(row.requirementVoList)) throw new Error(`京东岗位 ${row.publishId} 缺少正文或城市信息`);
    const city=[...new Set(row.requirementVoList.map(item=>clean(item.workCity)).filter(Boolean))].join(' · ');
    const job=normalize({id:`jd:${row.publishId}`,title:clean(row.positionName),company:'京东',company_type:'未公布',company_type_evidence:'招聘接口未提供单位性质',city,education:clean(row.education)||'未公布',description:`岗位职责：${row.workContent}\n任职要求：${row.qualification}`,publish_date:row.publishTime?new Date(row.publishTime).toISOString():null,source:'jd',source_name:'京东官方校园招聘',source_url:`https://campus.jd.com/#/jobs?reqId=${encodeURIComponent(row.reqId)}`,internship_evidence:'京东官方接口 type=internship 实习分类'},now);
    if(job) jobs.push(job);
  }
  return {id:'jd',name:'京东官方校园招聘',url:'https://campus.jd.com/',status:'ok',jobs,scanned,scope:`官方实习分类；取得 ${records.size} 条发布记录，接口总数 ${total}；按测试岗位规则筛选，保留原始发布日期`,limited:scanned<total};
}
