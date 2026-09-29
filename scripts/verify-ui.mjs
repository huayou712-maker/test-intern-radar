import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const root=resolve('out');
const prefix='/test-intern-radar';
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.xml':'application/xml','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith(prefix+'/')) {res.writeHead(404).end();return;}
  let path=resolve(root,'.'+decodeURIComponent(url.pathname.slice(prefix.length)));
  if(path!==root && !path.startsWith(root+sep)) {res.writeHead(403).end();return;}
  try {
    if((await stat(path)).isDirectory()) path=resolve(path,'index.html');
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});
    res.end(await readFile(path));
  } catch(error) {if(error.code!=='ENOENT')throw error;res.writeHead(404).end();}
});
await new Promise(r=>server.listen(4173,'127.0.0.1',r));
const browser=await chromium.launch(process.env.RADAR_BROWSER?{executablePath:process.env.RADAR_BROWSER}:{});
try {
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const origin=process.env.RADAR_URL || 'http://127.0.0.1:4173/test-intern-radar/';
  await page.goto(origin,{waitUntil:'networkidle'});
  await page.locator('.job-card').first().waitFor();
  const title=await page.locator('.job-title').first().innerText();
  await page.getByLabel('搜索岗位',{exact:true}).fill(title);
  assert((await page.locator('.job-card').count())>0);
  await page.locator('.job-title').first().click();
  await page.getByRole('dialog').waitFor();
  assert((await page.locator('.description').innerText()).length>20);
  assert(/^https:\/\/(www.ncss.cn|www.ciiczhaopin.com)\//.test(await page.locator('.detail-action a').getAttribute('href')));
  await page.getByLabel('关闭岗位详情').click();
  await page.getByLabel('搜索岗位',{exact:true}).fill('不存在的检索条件987654321');
  assert.equal(await page.locator('.job-card').count(),0);
  await page.getByLabel('搜索岗位',{exact:true}).fill('');
  await page.getByRole('button',{name:'Watchlist',exact:true}).click();
  await page.getByLabel(/^关注企业/).fill('');
  await page.getByLabel(/^工作地点/).fill('');
  await page.getByLabel(/^单位性质/).selectOption('all');
  await page.getByLabel('学历为本科、大专或不限').uncheck();
  await page.getByRole('button',{name:'保存关注条件'}).click();
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('radar-watch-v1')).nature),'all');
  for(const name of ['Today','Matches','岗位变化','采集来源']) {
    await page.getByRole('navigation').getByRole('button',{name:new RegExp(name)}).click();
    assert((await page.locator('h1').innerText()).length>0);
  }
  assert.equal(await page.locator('.source-card').count(),3);
  await page.getByRole('navigation').getByRole('button',{name:/全部岗位/}).click();
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'移动端出现横向溢出');
  assert.deepEqual(errors,[]);
  console.log('浏览器验证通过：真实岗位、搜索、详情、Watchlist 保存、导航、移动端布局、无运行错误');
} finally {await browser.close();await new Promise(r=>server.close(r));}
