# Changelog

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
