# Changelog

## [0.3.1] - 2026-08-17

### Fixed

- sweep 假阳性诊断链：release 偶发失败导致锁残留 → 扫描轮询在激烈 churn 下变慢 → 残留锁超租约 → 健康工人被误判"死循环/死锁"。修复：release 5 次忙等重试 + sweep 区分"任务已完成的锁残留"（只清锁不诬告）+ TOCTOU 跳过（锁在判定瞬间消失不再误判）。

## [0.3.0] - 2026-08-17

### Added

- 千脑联邦：federal-brain（任期锁 + 租约判死 + O_EXCL 换脑）+ federation-experiment 四实验（杀主席换脑 1641ms / 决策 90/90 零丢失 / 杀候补无感 / 脑池换血）。
- 混沌引擎：chaos-engine（战场体检重建 → 随机 kill -9 自己 → 补位自愈 → 恢复验证 + 混沌报告历史账本；侦察兵案 744ms、主席案 1636ms 自愈）。

## [0.2.0] - 2026-08-17

### Added

- 战报协议：scout-worker（侦察兵）+ brain-worker（脑进程）+ war-law（军法声明式规则）。
- army-experiment：一脑三十兵真进程实测（压缩比 98.8% · 军法 2/2 拦截 0 误杀 · 决策=全文真值 · kill -9 收养重派 120/120）。

## [0.1.0] - 2026-08-17

### Added

- MeshCore: file-as-message intent queue, O_EXCL lease locks (agentId:pid:startSec), dead-letter adoption, three-evidence sweep (pid dead + startSec match + lease timeout).
- agent-worker: sharded pipeline worker with heartbeat + hang mode.
- Real-process experiments: fault isolation (40/40 with mid-stream kill -9), deadlock detection (lease timeout), message durability (10/10 vs RPC 0/10).
- CI core test: 9 assertions.

### Fixed

- Worker lock release after finish (residual locks misread as timeouts).
- Busy-loop hang simulation (event-loop-blocking, heartbeats genuinely stop).
