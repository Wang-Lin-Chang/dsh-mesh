// dsh-mesh/war-law.mjs —— 军法：声明式规则集（数据不是代码）
// 对齐 story-spec 的 RANGE_CHECK / ASSET_NON_NEGATIVE 语义：只拦确定违反，零误杀
export const militaryLaw = [
  { id: 'RANGE_SEVERITY', check: (r) => r.keyNumbers.severity >= 0 && r.keyNumbers.severity <= 100, why: 'severity 越界 [0,100]' },
  { id: 'SUMMARY_BOUND', check: (r) => typeof r.summary === 'string' && r.summary.length <= 100, why: 'summary 超百字' },
  { id: 'REQUEST_CONSISTENT', check: (r) => r.keyNumbers.severity > 80 ? r.request === '建议增援' : r.request === '常规记录', why: 'request 与 severity 矛盾' },
  { id: 'TASK_MATCH', check: (r) => Number(r.taskId) === r.keyNumbers.task, why: 'taskId 与 keyNumbers.task 不符' },
]

// 军法审判：返回违规条款（空数组 = 放行）
export const courtMartial = (report) => militaryLaw.filter(rule => !rule.check(report)).map(rule => rule)
