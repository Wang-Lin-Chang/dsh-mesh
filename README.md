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

## 一脑千军 / One brain, a thousand troops

主流多 Agent 困境：**大脑上下文爆炸**（千军交全文 → 读入 O(千军×千字)）、星型拓扑单点瓶颈、子 Agent 一次性无身份、状态共享竞争、故障全场陪葬。

本项目的战报协议：**小弟干活，只交百字战报，不交全文**。

| 角色 | 职责 |
|---|---|
| 脑进程 `brain-worker.mjs` | 不领任务、不读全文，只读 `shared/reports/` 战报流 → 军法先行 → 决策落 `shared/consensus/decision.json` |
| 侦察兵 `scout-worker.mjs` | 领任务 → 产千字级全文情报（本地存档、不上报）→ 交百字结构化战报 `{summary≤100字, keyNumbers, stateChanges, request}` |
| 军法 `war-law.mjs` | 声明式规则集（RANGE_SEVERITY / SUMMARY_BOUND / REQUEST_CONSISTENT / TASK_MATCH）——只拦确定违反，零误杀 |

| 实验 | 判决 |
|---|---|
| EXP-1 上下文经济学（30 侦察兵 × 90 任务）| 全文 1838.5 KB 存档不上报 → 脑进程实读战报 22.6 KB，压缩比 **98.8%**（目标 ≥90%）|
| EXP-2 军法拦截 | 2 份伪造战报混入战报流 → 脑进程实审全拦（3 条 + 1 条违规）；90 份真报 0 误杀 |
| EXP-3 决策正确性 | 脑进程凭战报判"最大威胁 = 任务 57 / 威胁度 100"——与读全文真值一致（压缩不损决策）|
| EXP-4 千军容错 | 30 兵中 1 兵 kill -9（持锁任务悬空）→ 三证据收养 → 重派 → 120/120 完成，余 29 兵 0 条 error 日志 |

真进程实验装置：`army-experiment.mjs`（本机实测）。

## 千脑联邦 / Federation of brains

上一节的"大脑"仍是单点——脑进程崩了谁来做决策？答案：**没有单一大脑，只有任期轮换**。

| 部件 | 职责 |
|---|---|
| 任期锁 `shared/consensus/term.lock` | O_EXCL 锁（brainId:pid:startSec:term）——主席不是任命，是抢来的；心跳 touch，租约 1.5s 判死 |
| 联邦脑 `federal-brain.mjs` | 候补轮询任期锁：主席死了 → 租约过期 → O_EXCL 抢锁 → 新任期；决策文书 `decrees/decree-<term>.json` |
| 混沌引擎 `chaos-engine.mjs` | 战场体检（脑死补脑、兵缺补兵、无场建场）→ 主动随机 kill -9 自己 → 补位自愈 → 验证恢复 → 混沌报告 + 历史账本 |

| 实验 | 判决 |
|---|---|
| EXP-1 杀主席换脑 | kill -9 首任主席（term 1）→ 租约判死 → 候补抢任期 2，换脑 **1641 ms**（预算 5s）|
| EXP-2 决策续流 | 新主席 decree-2 覆盖 90/90 战报，verdict = 全文真值（换脑不损决策）|
| EXP-3 杀候补无感 | kill -9 候补脑 → 任期锁不变、主席心跳不断（候补可随意死）|
| EXP-4 脑池换血 | 三脑轮杀 + 新脑 delta 补位 → 接任 term 3（脑可死、可增，无单点）|
| 混沌·侦察兵案 | 随机 kill -9 持锁侦察兵 → 三证据收养 → 补位兵接手 → 任务完成，**744 ms** 自愈 |
| 混沌·主席案 | 随机 kill -9 主席 → 补位脑接任新任期，**1636 ms** 自愈，任务零丢失 |

诚实边界：本实现是崩溃容错换脑（crash-fault tolerance），不是完整拜占庭容错——没有签名、没有 2/3 背书，那些留作下一步，不冒认未实测的结论。

## 诚实边界 / Honest boundaries

- 单机共享文件系统（跨机器需共享磁盘 + 网络文件系统，未实测不声称）。
- at-least-once 派发（崩溃窗口可能重复处理——幂等性由任务自身保证）。
- 租约超时是"判死阈值"，不是精确死因——autopsy 报告记录判定依据。
- 真进程 kill 实验在 Windows 本机实测；CI 跑核心断言。

## License

Apache-2.0
