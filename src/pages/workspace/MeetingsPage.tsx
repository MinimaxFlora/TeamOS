import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Lock,
  MicOff,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '../../lib/store'
import type { MeetingNote } from '../../lib/types'
import { formatDay } from '../../lib/format'
import { cn } from '../../lib/utils'
import { PageBody, PageHeader } from '../../components/layout/PageHeader'
import { Avatar } from '../../components/ui/avatar'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/ui/dialog'
import { EmptyState } from '../../components/ui/empty-state'
import { Checkbox, Field, Input, Textarea } from '../../components/ui/input'

const SOURCE_LABEL: Record<MeetingNote['source'], string> = {
  paste: '手动粘贴',
  upload: '上传文本',
  assistant: '助理整理',
}

function localDateTimeValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

export function WorkspaceMeetingsPage() {
  const { state, currentUser, createMeeting, toggleMeetingAction, deleteMeeting } = useStore()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const meetings = useMemo(
    () =>
      [...state.meetings].sort(
        (a, b) => new Date(b.meetingAt).getTime() - new Date(a.meetingAt).getTime(),
      ),
    [state.meetings],
  )
  const visible = meetings.filter((meeting) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    const names = meeting.participantIds
      .map((id) => state.members.find((member) => member.id === id)?.name ?? '')
      .join(' ')
    return `${meeting.title} ${meeting.summary.join(' ')} ${names}`.toLowerCase().includes(needle)
  })
  const selected = state.meetings.find((meeting) => meeting.id === selectedId) ?? null

  const openActions = meetings.reduce(
    (sum, meeting) => sum + meeting.actions.filter((action) => !action.done).length,
    0,
  )
  const decisions = meetings.reduce((sum, meeting) => sum + meeting.decisions.length, 0)
  const pendingDelete = state.meetings.find((meeting) => meeting.id === confirmDeleteId)

  return (
    <PageBody>
      <PageHeader
        eyebrow="会议纪要"
        title="开完会，行动项留在公司"
        description="粘贴会议文字记录，由已配置的大模型整理摘要、决议与行动项。不录音、不自动加入会议，只处理你主动提供的文本。"
        actions={
          <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> 新建纪要
          </Button>
        }
      />

      <div className="mb-5 flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
          <MicOff size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-ink">不依赖录音，也不会自动入会</div>
          <p className="mt-0.5 text-[11px] leading-5 text-muted">
            TeamOS 只处理你手动粘贴或上传的文字，摘要与行动项在本地用规则提取，不调用外部模型。含敏感信息的纪要可以标记为保密，仅参与人可见。
          </p>
        </div>
        <Badge tone="outline" className="hidden shrink-0 sm:inline-flex">
          <ShieldCheck size={11} /> 隐私优先
        </Badge>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-2.5">
        {[
          { label: '纪要总数', value: meetings.length, hint: '全部会议记录' },
          { label: '待办行动项', value: openActions, hint: '未标记完成' },
          { label: '已确认决议', value: decisions, hint: '来自文字记录' },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-line bg-surface px-3.5 py-3 shadow-card sm:px-4"
          >
            <div className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint">
              {item.label}
            </div>
            <div className="mt-1 text-[20px] font-semibold tabular text-ink">{item.value}</div>
            <div className="mt-0.5 truncate text-[10.5px] text-muted">{item.hint}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 relative w-full max-w-[320px]">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索会议、摘要或参与人"
          aria-label="搜索会议纪要"
          className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-8 pr-3 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="还没有会议纪要"
          description="新建一条纪要，粘贴会议文字记录，就能得到摘要、决议和带负责人的行动项。"
          action={
            <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={13} /> 新建纪要
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {visible.map((meeting) => {
            const participants = meeting.participantIds
              .map((id) => state.members.find((member) => member.id === id))
              .filter((member): member is NonNullable<typeof member> => Boolean(member))
            const done = meeting.actions.filter((action) => action.done).length
            return (
              <button
                key={meeting.id}
                type="button"
                onClick={() => setSelectedId(meeting.id)}
                className="group flex w-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-shadow hover:shadow-pop focus-visible:outline-2 focus-visible:outline-accent sm:flex-row"
              >
                <div className="flex w-full shrink-0 items-start gap-3 sm:w-[210px]">
                  <span className="inline-flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg border border-line bg-raised text-ink-soft">
                    <span className="text-[9px] font-medium uppercase leading-none text-faint">
                      {new Date(meeting.meetingAt).toLocaleString('zh-CN', { month: 'short' })}
                    </span>
                    <span className="text-[13px] font-semibold leading-tight tabular">
                      {new Date(meeting.meetingAt).getDate()}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-semibold text-ink">
                        {meeting.title}
                      </span>
                      {meeting.confidential && (
                        <Lock size={11} className="shrink-0 text-warning" aria-label="保密会议" />
                      )}
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-faint">
                      {formatDay(meeting.meetingAt)} · {meeting.durationMin} 分钟 ·{' '}
                      {SOURCE_LABEL[meeting.source]}
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      {participants.slice(0, 4).map((member) => (
                        <Avatar
                          key={member.id}
                          name={member.name}
                          color={member.color}
                          size="xs"
                          className="ring-2 ring-surface"
                        />
                      ))}
                      {participants.length > 4 && (
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-sunken px-1 text-[9px] text-muted">
                          +{participants.length - 4}
                        </span>
                      )}
                      <span className="ml-1 truncate text-[10px] text-faint">
                        {participants[0]?.name ?? '未指定参与人'}
                        {participants.length > 1 ? ' 等' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <ul className="space-y-1">
                    {meeting.summary.slice(0, 2).map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-1.5 text-[11.5px] leading-5 text-ink-soft"
                      >
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent/60" />
                        <span className="line-clamp-1">{item}</span>
                      </li>
                    ))}
                    {meeting.summary.length === 0 && (
                      <li className="text-[11.5px] text-faint">文字记录中没有可提取的摘要。</li>
                    )}
                  </ul>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={meeting.actions.length === 0 ? 'neutral' : done === meeting.actions.length ? 'success' : 'accent'}>
                      <ClipboardList size={10} />
                      {meeting.actions.length === 0
                        ? '无行动项'
                        : `${done}/${meeting.actions.length} 行动项已完成`}
                    </Badge>
                    {meeting.decisions.length > 0 && (
                      <Badge tone="neutral">{meeting.decisions.length} 条决议</Badge>
                    )}
                    <ChevronRight
                      size={14}
                      className="ml-auto shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                    />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <MeetingDetailDialog
        meeting={selected}
        onClose={() => setSelectedId(null)}
        onToggleAction={toggleMeetingAction}
        onDelete={(id) => setConfirmDeleteId(id)}
        canDelete={Boolean(
          currentUser &&
            (currentUser.role === 'admin' || currentUser.id === selected?.createdBy),
        )}
      />

      <CreateMeetingDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={createMeeting}
        onCreated={() => setCreateOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
        title="删除这条会议纪要？"
        description={`「${pendingDelete?.title ?? '这条纪要'}」及其行动项会从列表中移除，操作无法撤销。`}
        confirmLabel="删除纪要"
        onConfirm={() => {
          if (confirmDeleteId) deleteMeeting(confirmDeleteId)
          setSelectedId(null)
          setConfirmDeleteId(null)
        }}
      />
    </PageBody>
  )
}

function MeetingDetailDialog({
  meeting,
  onClose,
  onToggleAction,
  onDelete,
  canDelete,
}: {
  meeting: MeetingNote | null
  onClose: () => void
  onToggleAction: (meetingId: string, actionId: string) => void
  onDelete: (id: string) => void
  canDelete: boolean
}) {
  const { state } = useStore()
  if (!meeting) return null
  const participants = meeting.participantIds
    .map((id) => state.members.find((member) => member.id === id))
    .filter((member): member is NonNullable<typeof member> => Boolean(member))
  const creator = state.members.find((member) => member.id === meeting.createdBy)
  const done = meeting.actions.filter((action) => action.done).length

  return (
    <Dialog open={Boolean(meeting)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader
          title={meeting.title}
          description={`${formatDay(meeting.meetingAt)} · ${meeting.durationMin} 分钟 · ${SOURCE_LABEL[meeting.source]}${creator ? ` · 由 ${creator.name} 创建` : ''}`}
          icon={CalendarClock}
        />
        <DialogBody className="space-y-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{SOURCE_LABEL[meeting.source]}</Badge>
            {meeting.confidential && (
              <Badge tone="warning">
                <Lock size={10} /> 保密 · 仅参与人可见
              </Badge>
            )}
            <Badge tone={meeting.actions.length === 0 ? 'neutral' : done === meeting.actions.length ? 'success' : 'accent'}>
              {done}/{meeting.actions.length} 行动项完成
            </Badge>
          </div>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
              <FileText size={13} className="text-muted" /> 摘要
            </h3>
            <ul className="space-y-1.5">
              {meeting.summary.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[12.5px] leading-6 text-ink-soft">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-accent/70" />
                  {item}
                </li>
              ))}
              {meeting.summary.length === 0 && (
                <li className="text-[12px] text-faint">文字记录中没有可提取的摘要。</li>
              )}
            </ul>
          </section>

          {meeting.decisions.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                <CheckCircle2 size={13} className="text-success" /> 决议 · {meeting.decisions.length}
              </h3>
              <ul className="space-y-1.5 rounded-lg border border-line bg-raised px-3 py-2.5">
                {meeting.decisions.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12px] leading-5 text-ink-soft">
                    <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                <ClipboardList size={13} className="text-accent" /> 行动项 · {meeting.actions.length}
              </h3>
              <span className="text-[10.5px] text-faint">点击方框标记完成</span>
            </div>
            {meeting.actions.length > 0 ? (
              <div className="divide-y divide-line rounded-lg border border-line">
                {meeting.actions.map((action) => {
                  const owner = state.members.find((member) => member.id === action.ownerId)
                  return (
                    <div key={action.id} className="flex items-start gap-2.5 px-3 py-2.5">
                      <button
                        type="button"
                        aria-pressed={action.done}
                        aria-label={`${action.done ? '取消完成' : '标记完成'}：${action.text}`}
                        onClick={() => onToggleAction(meeting.id, action.id)}
                        className={cn(
                          'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                          action.done
                            ? 'border-accent bg-accent text-white'
                            : 'border-line-strong bg-surface text-transparent hover:border-accent',
                        )}
                      >
                        <CheckCircle2 size={11} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-[12px] leading-5',
                            action.done ? 'text-faint line-through' : 'text-ink-soft',
                          )}
                        >
                          {action.text}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-faint">
                          {owner ? (
                            <span className="inline-flex items-center gap-1">
                              <Avatar name={owner.name} color={owner.color} size="xs" />
                              {owner.name} · {owner.jobTitle}
                            </span>
                          ) : (
                            <span>负责人待确认</span>
                          )}
                          {action.due && <Badge tone="outline" className="h-[18px] px-1.5 text-[9px]">截止 {action.due}</Badge>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-lg bg-raised px-3 py-2.5 text-[11.5px] leading-5 text-faint">
                这段文字记录里没有出现「负责 / 跟进 / 待办 / 截止」等行动项线索，所以没有生成行动项。
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink">
              <UsersRound size={13} className="text-muted" /> 参与人 · {participants.length}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {participants.map((member) => (
                <span
                  key={member.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised py-1 pl-1 pr-2.5 text-[11px] text-ink-soft"
                >
                  <Avatar name={member.name} color={member.color} size="xs" />
                  {member.name} · {member.jobTitle}
                </span>
              ))}
              {participants.length === 0 && (
                <span className="text-[11.5px] text-faint">未指定参与人。</span>
              )}
            </div>
          </section>

          <p className="rounded-lg bg-raised px-3 py-2 text-[10.5px] leading-4 text-faint">
            摘要、决议与行动项由本地规则从你提供的文字中提取，没有调用真实模型，也不会凭空补全没说过的话。
          </p>
        </DialogBody>
        <DialogFooter className="justify-between">
          <div>
            {canDelete && (
              <Button variant="ghost" size="sm" onClick={() => onDelete(meeting.id)}>
                <Trash2 size={13} /> 删除纪要
              </Button>
            )}
          </div>
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const SAMPLE_TRANSCRIPT = `[10:00] 林知远：今天确认权限中心的角色模型和验收标准。
[10:05] 陈曦：决定采用五类角色，把审计只读单独拆出来。
[10:12] 苏晚：部门隔离需要补验收标准，我负责下周二前给出权限矩阵。
[10:20] 陈曦：我负责周五前补齐部门隔离的测试数据。
[10:28] 林知远：确认审计事件保留 180 天，等法务确认后冻结。
[10:33] 林知远：下周一把结论同步到公司大厅，我来跟进。`

function CreateMeetingDialog({
  open,
  onOpenChange,
  onCreate,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: ReturnType<typeof useStore>['createMeeting']
  onCreated: () => void
}) {
  const { state, currentUser } = useStore()
  const activeMembers = state.members.filter((member) => member.status === 'active')
  const [title, setTitle] = useState('')
  const [meetingAt, setMeetingAt] = useState(localDateTimeValue())
  const [duration, setDuration] = useState('30')
  const [participantIds, setParticipantIds] = useState<string[]>(
    currentUser ? [currentUser.id] : [],
  )
  const [confidential, setConfidential] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setTitle('')
    setMeetingAt(localDateTimeValue())
    setDuration('30')
    setParticipantIds(currentUser ? [currentUser.id] : [])
    setConfidential(false)
    setTranscript('')
    setError('')
    setSubmitting(false)
  }

  const toggleParticipant = (id: string) => {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const submit = async () => {
    setError('')
    setSubmitting(true)
    try {
      const parsed = new Date(meetingAt)
      const result = await onCreate({
        title,
        meetingAt: Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(),
        durationMin: Number(duration) || 30,
        participantIds,
        transcript,
        confidential,
      })
      if (!result.ok) {
        setError(result.error ?? '请检查填写内容。')
        return
      }
      reset()
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent size="lg">
        <DialogHeader
          title="新建会议纪要"
          description="粘贴会议文字记录，由已配置的大模型整理摘要、决议与行动项。不会录音，也不会自动加入会议。"
          icon={CalendarClock}
        />
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_100px]">
            <Field label="会议标题" required htmlFor="meeting-title">
              <Input
                id="meeting-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：企业版权限中心 · 需求评审"
                maxLength={40}
              />
            </Field>
            <Field label="会议时间" htmlFor="meeting-at">
              <Input
                id="meeting-at"
                type="datetime-local"
                value={meetingAt}
                onChange={(event) => setMeetingAt(event.target.value)}
              />
            </Field>
            <Field label="时长（分钟）" htmlFor="meeting-duration">
              <Input
                id="meeting-duration"
                type="number"
                min={5}
                max={480}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </Field>
          </div>

          <Field label="参与人" hint="用于识别行动项负责人">
            <div className="flex flex-wrap gap-1.5">
              {activeMembers.map((member) => {
                const checked = participantIds.includes(member.id)
                return (
                  <label
                    key={member.id}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[11px] transition-colors',
                      checked
                        ? 'border-accent-line bg-accent-soft text-accent-strong'
                        : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleParticipant(member.id)}
                      className="h-3.5 w-3.5"
                    />
                    <Avatar name={member.name} color={member.color} size="xs" />
                    {member.name}
                  </label>
                )
              })}
            </div>
          </Field>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-raised px-3 py-2.5">
            <Checkbox
              checked={confidential}
              onChange={(event) => setConfidential(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="flex items-center gap-1 text-[12px] font-medium text-ink">
                <Lock size={11} className="text-warning" /> 标记为保密
              </span>
              <span className="mt-0.5 block text-[10.5px] leading-4 text-muted">
                保密纪要只在参与人之间可见；管理员仍需审阅时才会访问。
              </span>
            </span>
          </label>

          <Field
            label="会议文字记录"
            required
            hint={`${transcript.trim() ? transcript.trim().split(/\r?\n/).filter(Boolean).length : 0} 行`}
            htmlFor="meeting-transcript"
          >
            <Textarea
              id="meeting-transcript"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder={`粘贴会议记录，每行一句，例如：\n${SAMPLE_TRANSCRIPT}`}
              className="min-h-[180px] font-mono text-[12px] leading-5"
            />
          </Field>

          <div className="flex items-start gap-2 rounded-lg bg-raised px-3 py-2 text-[10.5px] leading-4 text-faint">
            <ShieldCheck size={12} className="mt-0.5 shrink-0" />
            只保存整理后的摘要与行动项，不上传也不保存原始录音；数据随会议记录存放在公司自己的服务端。
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] text-danger">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
          >
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={!title.trim() || !transcript.trim() || submitting}
          >
            <ClipboardList size={13} /> {submitting ? '模型正在整理…' : '生成纪要'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
