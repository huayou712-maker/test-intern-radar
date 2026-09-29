import { load } from 'cheerio';

for (const url of process.argv.slice(2)) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  console.log('URL', url, 'STATUS', response.status);
  const text = await response.text();
  if (url.endsWith('.js') || url.endsWith('robots.txt')) { console.log(text.slice(0, 22000)); continue; }
  if (response.headers.get('content-type')?.includes('json')) {
    console.log(text.slice(0, 16000));
    continue;
  }
  const $ = load(text);
  console.log('TITLE', $('title').text());
  console.log('CARDS', $('.position-info-item').map((_, el) => ({ id: $(el).attr('uuid'), text: $(el).text().replace(/\s+/g, ' ').trim() })).get());
  console.log('PAGING', $('el-pagination').toString());
  if (url.includes('/detail')) {
    $('script,style,header,footer').remove();
    console.log('DETAIL', $('body').text().replace(/\s+/g, ' ').slice(0,16000));
    console.log('SECTIONS', $('div[class],section[class]').map((_,el)=>({class:$(el).attr('class'),text:$(el).clone().children().remove().end().text().trim().slice(0,100)})).get().filter(x=>x.text));
    console.log('CONTENT_NODES', $('p,pre,article,section,div').map((_,el)=>({tag:el.tagName,class:$(el).attr('class'),id:$(el).attr('id'),parent:$(el).parent().attr('class'),text:$(el).clone().children().remove().end().text().trim()})).get().filter(x=>x.text.length>150).slice(0,8));
    continue;
  }
  if (process.env.PROBE_COMPACT) continue;
  $('script').each((_, el) => {
    const src = $(el).attr('src');
    if (src) console.log('SCRIPT', new URL(src, url).href);
    else {
      const lines = $(el).text().split('\n');
      const indices = lines.flatMap((line, index) => /Axios\.|axios\.|fetch\(|pageSize|pageIndex|pageNum|postwholenature|jobList|positionList|jobInfo/.test(line) ? [index] : []);
      const shown = new Set();
      for (const index of indices) for (let i = Math.max(0, index - 5); i < Math.min(lines.length, index + 15); i++) {
        if (!shown.has(i)) { console.log(lines[i]); shown.add(i); }
      }
    }
  });
  console.log('LINKS', $('a[href]').map((_, el) => ({ title: $(el).text().trim(), url: $(el).attr('href') })).get().filter(x => /测试|实习|招聘/.test(x.title)).slice(0, 20));
}
