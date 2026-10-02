# 云服务器自动采集

Ubuntu 24.04 上使用 systemd 定时触发 GitHub Actions。服务器需要能够访问 `api.github.com` 和 `nodejs.org`。

以 root 账号执行 `deploy/install-runtime.sh`，安装经过 SHA-256 校验的 Node.js 24.21.0。运行程序位于 `/opt/test-intern-radar/runtime`。

`test-intern-radar-trigger.timer` 在每小时第 17、47 分钟启动触发程序。服务器启动一分钟后也会检查一次；服务器暂停期间的计划任务在恢复后检查一次。

`cloud-trigger.mjs` 检查 `main` 分支上的采集任务。已有任务等待或运行时，程序记录任务编号；空闲时启动 `publish.yml`。GitHub 完成招聘来源采集、数据验证、网页构建和发布。

## 安装文件

使用 root 账号将文件安装到以下位置：

- `scripts/cloud-trigger.mjs` → `/opt/test-intern-radar/cloud-trigger.mjs`，权限 `0644`。
- `deploy/test-intern-radar-trigger.service` → `/etc/systemd/system/test-intern-radar-trigger.service`，权限 `0644`。
- `deploy/test-intern-radar-trigger.timer` → `/etc/systemd/system/test-intern-radar-trigger.timer`，权限 `0644`。
- GitHub 访问令牌 → `/etc/test-intern-radar/github-token`，权限 `0600`。

GitHub 访问令牌需要目标仓库的 Actions 读写权限。systemd 通过 `LoadCredential` 向触发进程提供令牌文件。`/etc/test-intern-radar` 目录权限设置为 `0700`。

## 启用与验证

安装文件后，在服务器执行：

```bash
systemd-analyze verify /etc/systemd/system/test-intern-radar-trigger.service /etc/systemd/system/test-intern-radar-trigger.timer
systemctl daemon-reload
systemctl start test-intern-radar-trigger.service
systemctl enable --now test-intern-radar-trigger.timer
systemctl list-timers test-intern-radar-trigger.timer --all
journalctl -u test-intern-radar-trigger.service -n 20 --no-pager
```

日志中的 `action=dispatched` 表示 GitHub 接受采集请求，`run_id` 为任务编号。`action=running` 表示已经存在采集任务。触发成功之后，需要核对该任务的采集与发布结果，以及公开数据的 `generated_at`。

HTTP 请求失败或返回数据格式无效时，触发程序立即返回失败，systemd 记录退出状态。可以通过 `journalctl` 查看错误。

需要立即重新采集时，可以执行 `systemctl start test-intern-radar-trigger.service`。
