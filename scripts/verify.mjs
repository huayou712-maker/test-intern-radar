import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { JobSchema, classify } from '../lib/model.mjs';

const state=JSON.parse(await readFile('data/state.json','utf8'));
assert(state.jobs.length>0,'必须取得真实岗位后才能发布');
assert.equal(new Set(state.jobs.map(j=>j.id)).size,state.jobs.length);
for(const job of state.jobs) {
  JobSchema.parse(job);
  assert(classify(job.title,job.description,job.internship_evidence));
  assert(['www.ciiczhaopin.com','www.ncss.cn','campus.jd.com'].includes(new URL(job.source_url).hostname));
  for(const key of ['first_seen_at','last_seen_at','last_checked_at']) assert(Number.isFinite(Date.parse(job[key])));
}
for(const event of state.events) assert(state.jobs.some(j=>j.id===event.job_id));
assert.equal(new Set(state.events.map(e=>e.id)).size,state.events.length);
assert.deepEqual(JSON.parse(await readFile('public/data/jobs.json','utf8')),state);
const xml=await readFile('public/feed.xml','utf8');
assert.equal(XMLValidator.validate(xml),true);
assert(new XMLParser().parse(xml).rss.channel.title);
console.log(JSON.stringify({verified_records:state.jobs.length,unique_jobs:new Set(state.jobs.map(j=>j.duplicate_group)).size,events:state.events.length,sources:state.sources.map(s=>({name:s.name,status:s.status}))}));
