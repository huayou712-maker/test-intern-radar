import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { inspect: { type: 'boolean', default: false } },
  allowPositionals: false,
});

const tokenFile = process.env.GITHUB_TOKEN_FILE;
assert(tokenFile, '必须设置 GITHUB_TOKEN_FILE，指定 GitHub 访问令牌文件。');
const token = (await readFile(tokenFile, 'utf8')).trim();
assert(token && !/\s/.test(token), 'GitHub 访问令牌文件内容无效。');

const api = 'https://api.github.com/repos/huayou712-maker/test-intern-radar';
const workflow = `${api}/actions/workflows/publish.yml`;
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2026-03-10',
  'User-Agent': 'test-intern-radar-cloud-trigger',
};

async function request(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200, `GitHub ${method} 请求失败：HTTP ${response.status}`);
  return response.json();
}

const definition = await request(workflow);
assert.equal(definition.state, 'active', 'GitHub 采集工作流必须处于启用状态。');
assert.equal(definition.path, '.github/workflows/publish.yml', 'GitHub 工作流文件路径不匹配。');

const runs = await request(`${workflow}/runs?branch=main&per_page=100`);
assert(Array.isArray(runs.workflow_runs), 'GitHub 运行记录格式无效。');
for (const run of runs.workflow_runs) {
  assert(Number.isInteger(run.id) && typeof run.status === 'string', 'GitHub 任务状态格式无效。');
}

const active = runs.workflow_runs.find(run => run.status !== 'completed');
if (active) {
  console.log(JSON.stringify({ at: new Date().toISOString(), action: 'running', run_id: active.id, status: active.status }));
} else if (values.inspect) {
  console.log(JSON.stringify({ at: new Date().toISOString(), action: 'ready', workflow: definition.name, last_run_id: runs.workflow_runs[0]?.id ?? null }));
} else {
  const result = await request(`${workflow}/dispatches`, 'POST', { ref: 'main' });
  assert(Number.isInteger(result.workflow_run_id), 'GitHub 未返回新采集任务的编号。');
  console.log(JSON.stringify({ at: new Date().toISOString(), action: 'dispatched', run_id: result.workflow_run_id }));
}
