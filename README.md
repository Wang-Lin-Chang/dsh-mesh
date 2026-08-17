# dsh-mesh

> Multi-Agent Mesh: crash-isolated multi-agent coordination where **files are the messages** and adoption replaces all-hands-on-deck failure. One agent dies — the others never notice. Built on asmfs-spec + O_EXCL leases + three-evidence adoption.
>
> 多 Agent 崩溃隔离网：**文件即消息**，收养代替陪葬。一个 Agent 崩了——其他 Agent 毫无感知。基于 asmfs-spec + O_EXCL 租约 + 三证据收养。

[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![ci](https://github.com/Wang-Lin-Chang/dsh-mesh/actions/workflows/ci.yml/badge.svg)](https://github.com/Wang-Lin-Chang/dsh-mesh/actions/workflows/ci.yml)

## 为什么存在 / Why this exists

CrewAI / AutoGen / LangGraph 的多 Agent 协作是**同生共死**：一个 Agent 崩溃或死循环，整个 workflow 陪葬，没有跨 Agent 故障隔离，也没有崩溃后的局部收养。

本项目的答案：共享状态空间 + 崩溃隔离。

```
agent-mesh/
├── intent-queue/          # 任务队列（文件即消息——比 RPC 抗崩：崩了消息还在磁盘）
│   ├── task-N.json        # 任务 = 文件（原子发布：tmp+rename）
│   └── task-N.lock        # O_EXCL 租约锁（内容 = agentId:pid:startSec）
├── shared/
│   ├── dead-letter/       # 崩溃 Agent 的未完成任务（收养现场）
│   └── consensus/         # 跨进程决策锁
├── done/                  # 完成区（任务 + 结果）
└── agents/                # 每个 Agent 的独立日志/证据
```

- **崩溃隔离**：Agent A 崩溃 → Agent B/C 继续跑 → 新实例扫 dead-letter 收养（三证据：pid 死 + startSec 比对 + 租约超时）
- **文件即消息**：通信 = 写文件，崩溃瞬间未消费消息 100% 在磁盘
- **死循环/死锁检测**：租约超时（锁 mtime + 心跳停）→ 判死 → 任务重派
- **防 PID 复用**：租约锁内容含 startSec，收养时启动时间比对

## 实测判决 / Measured

| 实验 | 判决 |
|---|---|
| EXP-1 故障隔离（真进程 3-worker 分片流水线，kill -9 中游）| 其余零感知 + 任务 40/40 完成（dead-letter 收养重派）|
| EXP-2 死循环（占锁卡死、心跳停）| 租约超时判死 + 任务重派 + 6/6 完成 |
| EXP-3 消息抗崩（对照组：RPC 内存消息）| 磁盘消息 10/10 恢复 vs RPC 0/10 |

真进程实验装置：`mesh-experiment.mjs`（本机实测）；CI 核心测试：`mesh-test.mjs`（9 断言，三平台）。

## 诚实边界 / Honest boundaries

- 单机共享文件系统（跨机器需共享磁盘 + 网络文件系统，未实测不声称）。
- at-least-once 派发（崩溃窗口可能重复处理——幂等性由任务自身保证）。
- 租约超时是"判死阈值"，不是精确死因——autopsy 报告记录判定依据。
- 真进程 kill 实验在 Windows 本机实测；CI 跑核心断言。

## License

Apache-2.0
