// dsh-mesh/mesh-core.mjs —— Multi-Agent Mesh 核心：文件即消息 + 租约锁 + dead-letter + 三证据收养
// 对齐 asmfs-spec：任务=文件；claim=O_EXCL 租约锁；崩溃=锁残留；收养=三证据判定后任务进 dead-letter 重派
// 租约超时（leaseMs）= 死循环/死锁检测；心跳=锁 mtime touch（witness 同款观测式心跳）
import * as fs from 'node:fs'
import * as path from 'node:path'

export class MeshCore {
  constructor(root, { leaseMs = 3000, heartbeatMs = 800 } = {}) {
    this.root = root
    this.leaseMs = leaseMs
    this.heartbeatMs = heartbeatMs
    for (const d of ['intent-queue', 'agents', 'shared/dead-letter', 'shared/consensus', 'done']) {
      fs.mkdirSync(path.join(root, d), { recursive: true })
    }
  }

  // ---------- 任务（文件即消息）----------
  enqueue(id, payload) {
    const f = path.join(this.root, 'intent-queue', `task-${id}.json`)
    fs.writeFileSync(f + '.tmp', JSON.stringify({ id, payload, at: Date.now() }), { flag: 'wx' })
    fs.renameSync(f + '.tmp', f)   // 原子发布（半写文件不可见——asmfs 相位窗口教训）
    return id
  }
  pending() {
    return fs.readdirSync(path.join(this.root, 'intent-queue')).filter(f => f.endsWith('.json')).map(f => f.replace(/^task-/, '').replace(/\.json$/, ''))
  }

  // ---------- claim：O_EXCL 租约锁（内容 = agentId:pid:startSec）----------
  claim(taskId, agentId, pid, startSec) {
    const lock = path.join(this.root, 'intent-queue', `task-${taskId}.lock`)
    try {
      fs.writeFileSync(lock, `${agentId}:${pid}:${startSec}`, { flag: 'wx' })
      return true
    } catch { return false }
  }
  readLock(taskId) {
    try { return fs.readFileSync(path.join(this.root, 'intent-queue', `task-${taskId}.lock`), 'utf-8').trim() } catch { return '' }
  }
  lockAgeMs(taskId) {
    try { return Date.now() - fs.statSync(path.join(this.root, 'intent-queue', `task-${taskId}.lock`)).mtimeMs } catch { return Infinity }
  }
  heartbeat(taskId) {
    try {
      const p = path.join(this.root, 'intent-queue', `task-${taskId}.lock`)
      const now = new Date()
      fs.utimesSync(p, now, now)
      return true
    } catch { return false }
  }
  release(taskId) {
    try { fs.unlinkSync(path.join(this.root, 'intent-queue', `task-${taskId}.lock`)); return true } catch { return false }
  }

  // ---------- 完成：任务 → done ----------
  finish(taskId, result) {
    const from = path.join(this.root, 'intent-queue', `task-${taskId}.json`)
    fs.renameSync(from, path.join(this.root, 'done', `task-${taskId}.json`))
    fs.writeFileSync(path.join(this.root, 'done', `task-${taskId}.result.json`), JSON.stringify({ result, at: Date.now() }))
  }

  // ---------- 收养判定（三证据）：pid 死 + startSec 比对 + 租约超时 ----------
  isAgentAlive(pid) {
    try { process.kill(pid, 0); return true } catch { return false }
  }
  procStartSec(pid) {
    try {
      const { execFileSync } = require('node:child_process')
      const out = execFileSync('powershell', ['-NoProfile', '-Command', `[int](Get-Date -Date (Get-Process -Id ${pid}).StartTime.ToUniversalTime() -UFormat %s)`], { timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
      const t = Number(out)
      return Number.isFinite(t) && t > 0 ? t : undefined
    } catch { return undefined }
  }

  /** 收养扫描：锁残留的任务 → 三证据判定持有者死/超时 → 移 dead-letter → 重新入队 */
  sweep() {
    const adopted = []
    for (const f of fs.readdirSync(path.join(this.root, 'intent-queue'))) {
      if (!f.endsWith('.lock')) continue
      const taskId = f.replace(/^task-/, '').replace(/\.lock$/, '')
      const m = /^(.+):(\d+):(\d+)$/.exec(this.readLock(taskId))
      if (m === null) continue
      const [_, agentId, pidStr, startSecStr] = m
      const pid = Number(pidStr)
      let dead = !this.isAgentAlive(pid)
      if (!dead) {
        const cur = this.procStartSec(pid)
        if (cur !== undefined && cur !== Number(startSecStr)) dead = true   // PID 复用
      }
      const stale = this.lockAgeMs(taskId) > this.leaseMs
      if (dead || stale) {
        // 任务移 dead-letter（保存现场）→ 重新入队（新实例可收养）
        const dl = path.join(this.root, 'shared/dead-letter', `task-${taskId}.json`)
        const src = path.join(this.root, 'intent-queue', `task-${taskId}.json`)
        try { fs.copyFileSync(src, dl) } catch {}
        try { fs.unlinkSync(path.join(this.root, 'intent-queue', `task-${taskId}.lock`)) } catch {}
        adopted.push({ taskId, agentId, reason: stale && !dead ? 'lease-timeout (死循环/死锁)' : dead ? 'agent-dead (三证据)' : 'unknown' })
      }
    }
    return adopted
  }
}
