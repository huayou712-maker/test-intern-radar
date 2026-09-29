param([ValidateSet('inspect','create','pages','status','dispatch','jobs')][string]$Operation='inspect')
$ErrorActionPreference='Stop'
$env:GIT_TERMINAL_PROMPT='0'
$env:GCM_INTERACTIVE='never'
$raw = "protocol=https`nhost=github.com`nusername=huayou712-maker`n`n" | git credential fill
if ($LASTEXITCODE -ne 0) { throw 'GitHub 凭据不可用。' }
$credential = ConvertFrom-StringData ($raw -join "`n")
if (-not $credential.password) { throw 'GitHub 凭据缺少访问令牌。' }
$headers=@{Authorization="Bearer $($credential.password)";Accept='application/vnd.github+json';'X-GitHub-Api-Version'='2022-11-28'}
$api='https://api.github.com'
$identity=Invoke-RestMethod -Uri "$api/user" -Headers $headers
if ($identity.login -ne 'huayou712-maker') { throw "GitHub 账号不匹配：$($identity.login)" }
$repo='huayou712-maker/test-intern-radar'
if ($Operation -eq 'inspect') { [pscustomobject]@{Login=$identity.login;Repository=$repo} | ConvertTo-Json; exit }
if ($Operation -eq 'create') {
  $existing=Invoke-WebRequest -Uri "$api/repos/$repo" -Headers $headers -SkipHttpErrorCheck
  if ($existing.StatusCode -eq 404) {
    $body=@{name='test-intern-radar';description='测试开发实习岗位雷达：公开招聘来源、岗位变化历史与在线筛选';private=$false;auto_init=$false} | ConvertTo-Json
    $result=Invoke-RestMethod -Uri "$api/user/repos" -Method Post -Headers $headers -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body))
    $result | Select-Object full_name,html_url,private | ConvertTo-Json
  } elseif ($existing.StatusCode -eq 200) { throw '目标仓库已经存在，必须检查内容后继续。' }
  else { throw "GitHub 返回 HTTP $($existing.StatusCode)" }
}
if ($Operation -eq 'pages') {
  $result=Invoke-WebRequest -Uri "$api/repos/$repo/pages" -Headers $headers -SkipHttpErrorCheck
  if ($result.StatusCode -eq 404) {
    Invoke-RestMethod -Uri "$api/repos/$repo/pages" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"build_type":"workflow"}' | Select-Object html_url,status,build_type | ConvertTo-Json
  } elseif ($result.StatusCode -eq 200) { ($result.Content | ConvertFrom-Json) | Select-Object html_url,status,build_type | ConvertTo-Json }
  else { throw "Pages 返回 HTTP $($result.StatusCode)" }
}
if ($Operation -eq 'dispatch') { Invoke-RestMethod -Uri "$api/repos/$repo/actions/workflows/publish.yml/dispatches" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"ref":"main"}' }
if ($Operation -eq 'status') {
  (Invoke-RestMethod -Uri "$api/repos/$repo/actions/runs?per_page=3" -Headers $headers).workflow_runs | Select-Object id,status,conclusion,html_url,head_sha | ConvertTo-Json
}
if ($Operation -eq 'jobs') {
  $run=(Invoke-RestMethod -Uri "$api/repos/$repo/actions/runs?per_page=1" -Headers $headers).workflow_runs[0]
  $jobs=(Invoke-RestMethod -Uri "$api/repos/$repo/actions/runs/$($run.id)/jobs" -Headers $headers).jobs
  $jobs | Select-Object name,status,conclusion,steps | ConvertTo-Json -Depth 6
  foreach ($job in $jobs) {
    if ($job.conclusion -eq 'failure') {
      $log=Invoke-WebRequest -Uri "$api/repos/$repo/actions/jobs/$($job.id)/logs" -Headers $headers
      ($log.Content -split "`n") | Select-Object -Last 90
    }
  }
}
