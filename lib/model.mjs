import { z } from 'zod';
import { createHash } from 'node:crypto';

export const JobSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), company: z.string().min(1),
  company_type: z.string(), company_type_evidence: z.string(),
  city: z.string(), job_type: z.literal('实习'), graduation_year: z.array(z.string()),
  education: z.string(), publish_date: z.string().nullable(), deadline: z.string().nullable(),
  source_updated_at: z.string().nullable().optional(),
  skills: z.array(z.string()), description: z.string().min(20),
  source: z.string(), source_name: z.string(), source_url: z.string().url(),
  internship_evidence: z.string().min(1), software_evidence: z.array(z.string()).min(1),
  first_seen_at: z.string(), last_seen_at: z.string(), last_checked_at: z.string(),
  status: z.enum(['open','unverified','closed']), status_reason: z.string(),
  fingerprint: z.string(), duplicate_group: z.string(),
});
export const clean = value => String(value ?? '').replace(/\s+/g,' ').trim();
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const role = /测试|SDET|QA\b|quality (?:assurance|engineer)|test(?:ing)? (?:engineer|intern)/i;
const excluded = /硬件测试|材料测试|建筑|质检员|检测员|工程质量|电池|电芯|测试夹具|热管理|计量|无损检测|化学检测|产品质量管理/i;
const software = /软件测试|接口测试|自动化测试|测试开发|测试平台|测试工具|功能测试|性能测试|软件质量|API.{0,8}测试|SDET|Selenium|pytest|Appium|JMeter|Postman|Android.{0,8}测试|Web.{0,8}测试/gi;
export function candidate(title) { return role.test(title) && !excluded.test(title); }
export function classify(title, description, explicitInternship = '') {
  if (!candidate(title)) return null;
  const internship = explicitInternship || (title.match(/实习(?:生)?|\bintern(?:ship)?\b/i)?.[0]) ||
    (description.match(/实习(?:时间|期间|岗位|要求|生|至少)|日常实习|暑期实习|\binternship\b/i)?.[0]);
  const evidence = [...new Set((title+' '+description).match(software) || [])];
  const softwareContext=/软件|\bWeb\b|\bAPP\b|前后端|数据库|Python|Java|Selenium|pytest|Appium|Postman|JMeter|SDET/i.test(title+' '+description);
  if (!internship || !evidence.length || !softwareContext) return null;
  return { internship_evidence: internship, software_evidence: evidence };
}
export const tracked = ['title','company','company_type','city','education','graduation_year','publish_date','deadline','skills','description','status'];
export function normalize(input, now) {
  let description = clean(input.description);
  if(description.startsWith('{') && description.endsWith('}')) {
    const content=JSON.parse(description);
    description=clean(Object.values(content).filter(value=>typeof value==='string').join('\n').replace(/\\n/g,'\n'));
  }
  const match = classify(input.title, description, input.internship_evidence);
  if (!match) return null;
  const skills = ['Python','Java','Linux','pytest','Selenium','Appium','JMeter','Postman','SQL','Git','Shell','CI/CD','接口测试','自动化测试','性能测试','测试平台'].filter(term =>
    /[a-z]/i.test(term) ? new RegExp(`(?:^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:$|[^a-z])`,'i').test(description) : description.includes(term));
  const years = [...new Set([...(input.title+' '+description).matchAll(/(20\d{2})(?:\s*届|\s*年.{0,8}毕业)/g)].map(m=>m[1]))];
  const deadlineMatch = description.match(/(?:报名|申请|投递|招聘)?截止(?:日期|时间)?\s*[：:]?\s*(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})/);
  const deadline = deadlineMatch ? `${deadlineMatch[1]}-${deadlineMatch[2].padStart(2,'0')}-${deadlineMatch[3].padStart(2,'0')}` : null;
  const degree = description.match(/(?:本科|硕士|博士|大专)(?:及以上|以上)学历/)?.[0].replace('学历','');
  const job = {
    ...input, description, ...match, job_type:'实习', skills,
    graduation_year:years, education:degree || input.education || '未公布',
    deadline, publish_date:input.publish_date || null,
    first_seen_at:now, last_seen_at:now, last_checked_at:now,
    status:'open', status_reason:'本次成功取得岗位详情',
    fingerprint:'', duplicate_group:'',
  };
  const sourceDate=job.source_updated_at || job.publish_date;
  if(sourceDate && Date.parse(now)-Date.parse(sourceDate)>180*86400000) {
    job.status='unverified';job.status_reason=`来源日期 ${sourceDate.slice(0,10)} 距今超过 180 天，请向招聘单位确认当前招聘状态`;
  }
  if(/校招|应届招聘/.test(job.title) && !/实习|intern/i.test(job.title)) {
    job.status='unverified';job.status_reason='来源标注为实习，岗位标题包含校招；招聘性质需要进一步确认';
  }
  if(job.deadline && Date.parse(job.deadline+'T23:59:59+08:00')<Date.parse(now)) {
    job.status='closed';job.status_reason='来源公布的投递截止日期已经过去';
  }
  job.fingerprint = hash(tracked.map(key=>job[key]));
  job.duplicate_group = hash([clean(job.company),clean(job.title),clean(job.city),description,job.deadline,job.education,years]);
  return JobSchema.parse(job);
}
export function mergeState(previous, results, now) {
  const jobs = new Map(previous.jobs.map(job=>[job.id, job]));
  const events = [...previous.events];
  const sources = results.map(result => {
    const prior = previous.sources.find(s=>s.id===result.id);
    if (!['ok','partial'].includes(result.status)) return { ...result, last_success_at:prior?.last_success_at || null, checked_at:now };
    const seen = new Set();
    for (const found of result.jobs) {
      seen.add(found.id);
      const old = jobs.get(found.id);
      const job = { ...found, first_seen_at:old?.first_seen_at || now };
      jobs.set(job.id, job);
      if (!old) events.push({ id:hash([job.id,now,'new']), job_id:job.id, type:'new', at:now, changes:[] });
      else if (old.fingerprint !== job.fingerprint || old.status !== job.status) {
        const changes = tracked.filter(key=>JSON.stringify(old[key])!==JSON.stringify(job[key])).map(field=>({field,before:old[field],after:job[field]}));
        if (changes.length) events.push({ id:hash([job.id,now,'updated']), job_id:job.id, type:'updated', at:now, changes });
      }
    }
    for (const [id,old] of jobs) if (old.source===result.id && !seen.has(id)) {
      jobs.set(id,{...old,status:'unverified',status_reason:'本次搜索范围内未再次确认；不代表招聘结束',last_checked_at:now});
    }
    const { jobs:unused,...summary } = result;
    return {...summary,matched:seen.size,last_success_at:now,checked_at:now};
  });
  for (const job of jobs.values()) if (job.deadline && job.status==='open') {
    const remaining = (new Date(job.deadline+'T23:59:59+08:00')-new Date(now))/86400000;
    if (remaining>=0 && remaining<=3) {
      const id=hash([job.id,'deadline',job.deadline]);
      if (!events.some(event=>event.id===id)) events.push({id,job_id:job.id,type:'deadline',at:now,changes:[]});
    }
  }
  return {version:1,generated_at:now,jobs:[...jobs.values()],events,sources};
}
