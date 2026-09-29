import type { Job } from '../lib/types';

const dimensions = [
  {label:'自动化与工具开发',pattern:/自动化测试|测试工具|测试框架|测试平台|脚本开发/},
  {label:'接口与性能测试',pattern:/接口测试|性能测试|压测|压力测试|API.{0,8}测试/i},
  {label:'实习时间要求',pattern:/每周|至少.{0,8}[月天]|实习.{0,8}[月天]|到岗/},
  {label:'培养与转正说明',pattern:/导师|带教|培训|转正/},
];

export default function JobAnalysis({job}:{job:Job}) {
  const sentences=job.description.split(/[。；\n]+/).map(value=>value.trim()).filter(Boolean);
  return <section className="job-analysis" aria-label="岗位分析">
    <h3>岗位分析 · 原文依据</h3>
    <p className="evidence">按招聘内容识别工作方向和申请条件，每项保留对应原文。实际工作体验尚无评价资料。</p>
    {dimensions.map(({label,pattern})=>{
      const evidence=sentences.filter(sentence=>pattern.test(sentence));
      return <div className="analysis-item" key={label}><strong>{label}</strong>{evidence.length?<ul>{evidence.slice(0,3).map(sentence=><li key={sentence}>{sentence}</li>)}</ul>:<p>招聘正文未明确说明</p>}</div>;
    })}
    <p className="evidence">投递前需要确认：{[!job.deadline&&'截止日期',!job.graduation_year.length&&'适用毕业年份',!job.city&&'工作地点','导师安排、实际工时和转正条件'].filter(Boolean).join('；')}。</p>
    <a href={job.source_url} target="_blank" rel="noreferrer">核对招聘原文 ↗</a>
  </section>;
}
