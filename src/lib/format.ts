const pad = (n: number) => String(n).padStart(2, '0')

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function formatClock(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDay(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (isSameDay(d, now)) return '今天'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(d, yesterday)) return '昨天'
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

export function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (isSameDay(d, now)) return formatClock(iso)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(d, yesterday)) return `昨天 ${formatClock(iso)}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${formatClock(iso)}`
}

export function formatRelative(iso: string) {
  const d = new Date(iso).getTime()
  const diff = Date.now() - d
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hours = Math.floor(min / 60)
  if (hours < 24 && isSameDay(new Date(iso), new Date())) return `${hours} 小时前`
  return formatDay(iso)
}

export function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatDuration(sec?: number) {
  if (sec == null) return '—'
  if (sec < 60) return `${sec} 秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} 分 ${s} 秒` : `${m} 分`
}

export function formatCost(cost?: number) {
  if (cost == null) return '—'
  return `¥ ${cost.toFixed(2)}`
}

export function formatCount(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`
  return String(n)
}

export function todayISO() {
  return new Date().toISOString()
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}
