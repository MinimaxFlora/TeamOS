import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileAudio,
  FileText,
  Loader2,
  Lock,
  Mic,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, describeError } from '../../lib/api'
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
  upload: '录音转写',
  assistant: '助理整理',
}

function localDateTimeValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

export function WorkspaceMeetingsPage() {
  const {
    state,
    currentUser,
    createMeeting,
    toggleMeetingAction,
    deleteMeeting,
    updateMeeting,
    resummarizeMeeting,
  } = useStore()
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
        description="上传会议录音自动转写成文字，再交给已配置的大模型整理摘要、决议与行动项；转写和纪要都可以随时编辑。"
        actions={
          <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> 新建纪要
          </Button>
        }
      />

      <div className="mb-5 flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Mic size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-ink">上传录音或粘贴记录，二者都行</div>
          <p className="mt-0.5 text-[11px] leading-5 text-muted">
            录音在本机服务端用 Whisper 转写，不发送给第三方；转写完成后可以逐字校对，再让模型整理成纪要。含敏感信息的纪要可以标记为保密，仅参与人可见。
          </p>
        </div>
        <Badge tone="outline" className="hidden shrink-0 sm:inline-flex">
          <ShieldCheck size={11} /> 数据留在自己服务器
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
          description="新建一条纪要，上传会议录音或粘贴文字记录，就能得到摘要、决议和带负责人的行动项。"
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
                      <li className="text-[11.5px] text-faint">还没有生成摘要。</li>
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
                    {meeting.audioFileId && (
                      <Badge tone="outline">
                        <FileAudio size={10} /> 有录音
                      </Badge>
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
        onUpdate={updateMeeting}
        onResummarize={resummarizeMeeting}
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
  onUpdate,
  onResummarize,
  canDelete,
}: {
  meeting: MeetingNote | null
  onClose: () => void
  onToggleAction: (meetingId: string, actionId: string) => void
  onDelete: (id: string) => void
  onUpdate: ReturnType<typeof useStore>['updateMeeting']
  onResummarize: ReturnType<typeof useStore>['resummarizeMeeting']
  canDelete: boolean
}) {
  const { state, notify } = useStore()
  const [transcript, setTranscript] = useState('')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const meetingId = meeting?.id

  useEffect(() => {
    setTranscript(meeting?.transcript ?? '')
    setDirty(false)
  }, [meetingId, meeting?.transcript])

  if (!meeting) return null
  const participants = meeting.participantIds
    .map((id) => state.members.find((member) => member.id === id))
    .filter((member): member is NonNullable<typeof member> => Boolean(member))
  const creator = state.members.find((member) => member.id === meeting.createdBy)
  const done = meeting.actions.filter((action) => action.done).length

  const saveTranscript = () => {
    onUpdate(meeting.id, { transcript })
    setDirty(false)
    notify('转写已保存', { tone: 'success' })
  }

  const resummarize = async () => {
    setBusy(true)
    try {
      const result = await onResummarize(meeting.id, transcript)
      if (!result.ok) {
        notify('重新总结失败', { description: result.error, tone: 'danger' })
        return
      }
      setDirty(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={Boolean(meeting)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl">
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

          {meeting.audioFileId && (
            <section className="rounded-lg border border-line bg-raised px-3 py-2.5">
              <div className="mb-2 flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                <FileAudio size={13} className="text-muted" />
                <span className="min-w-0 flex-1 truncate">{meeting.audioName || '会议录音'}</span>
              </div>
              <audio
                controls
                preload="none"
                src={api.fileUrl(meeting.audioFileId, true)}
                className="w-full"
              >
                你的浏览器不支持音频播放。
              </audio>
            </section>
          )}

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
                <li className="text-[12px] text-faint">还没有生成摘要，可以点下方「重新总结」。</li>
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
                还没有识别到行动项，可以检查转写内容后重新总结。
              </p>
            )}
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                <FileText size={13} className="text-muted" /> 转写文字
              </h3>
              <div className="flex items-center gap-1.5">
                {dirty && <span className="text-[10px] text-warning">未保存</span>}
                <Button size="sm" variant="ghost" onClick={saveTranscript} disabled={!dirty}>
                  <Save size={12} /> 保存
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void resummarize()} disabled={busy}>
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  重新总结
                </Button>
              </div>
            </div>
            <Textarea
              value={transcript}
              onChange={(event) => {
                setTranscript(event.target.value)
                setDirty(true)
              }}
              placeholder="转写文字会出现在这里，可以直接修改错别字、补充发言人或删掉无关内容。"
              className="min-h-[220px] font-mono text-[12px] leading-5"
            />
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
  const { state, currentUser, notify } = useStore()
  const activeMembers = state.members.filter((member) => member.status === 'active')
  const [title, setTitle] = useState('')
  const [meetingAt, setMeetingAt] = useState(localDateTimeValue())
  const [duration, setDuration] = useState('30')
  const [participantIds, setParticipantIds] = useState<string[]>(
    currentUser ? [currentUser.id] : [],
  )
  const [confidential, setConfidential] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [audioFileId, setAudioFileId] = useState<string | undefined>()
  const [audioName, setAudioName] = useState<string | undefined>()
  const [uploading, setUploading] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const audioRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setTitle('')
    setMeetingAt(localDateTimeValue())
    setDuration('30')
    setParticipantIds(currentUser ? [currentUser.id] : [])
    setConfidential(false)
    setTranscript('')
    setAudioFileId(undefined)
    setAudioName(undefined)
    setError('')
    setSubmitting(false)
    if (audioRef.current) audioRef.current.value = ''
  }

  const toggleParticipant = (id: string) => {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const handleAudio = async (file: File | null) => {
    if (!file) return
    if (file.size > 200 * 1024 * 1024) {
      setError('录音超过 200 MB，请压缩或分段上传。')
      return
    }
    setError('')
    setUploading(true)
    try {
      const uploaded = await api.uploadFile(file, file.name, 'audio')
      setAudioFileId(uploaded.id)
      setAudioName(uploaded.name)
      setUploading(false)
      setTranscribing(true)
      try {
        const result = await api.transcribeFile(uploaded.id)
        setTranscript(result.text)
        if (result.durationSec) {
          setDuration(String(Math.max(1, Math.round(result.durationSec / 60))))
        }
        if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ''))
        notify('转写完成', {
          description: `识别出 ${result.text.length} 个字，请校对后再生成纪要。`,
          tone: 'success',
        })
      } catch (reason) {
        setError(`转写失败：${describeError(reason)}。你仍然可以手动粘贴文字记录。`)
      }
    } catch (reason) {
      setError(`录音上传失败：${describeError(reason)}`)
    } finally {
      setUploading(false)
      setTranscribing(false)
    }
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
        audioFileId,
        audioName,
        source: audioFileId ? 'upload' : 'paste',
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
      <DialogContent size="xl">
        <DialogHeader
          title="新建会议纪要"
          description="上传录音自动转写，或直接粘贴文字记录；再由已配置的大模型整理摘要、决议与行动项。"
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
                min={1}
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

          <Field
            label="会议录音"
            hint="mp3 / wav / m4a / ogg，单文件 200 MB 内"
          >
            <label
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 text-[12px] transition-colors',
                audioFileId
                  ? 'border-accent-line bg-accent-soft/40'
                  : 'border-line-strong bg-raised hover:border-accent',
              )}
            >
              {uploading || transcribing ? (
                <Loader2 size={14} className="animate-spin text-accent" />
              ) : audioFileId ? (
                <FileAudio size={14} className="text-accent" />
              ) : (
                <Upload size={14} className="text-muted" />
              )}
              <span className="min-w-0 flex-1 truncate text-ink">
                {audioName ??
                  (uploading ? '正在上传录音…' : transcribing ? '正在转写，请稍候…' : '点击选择录音文件')}
              </span>
              {audioFileId && (
                <span className="shrink-0 text-[10.5px] text-faint">已上传</span>
              )}
              <input
                ref={audioRef}
                type="file"
                className="hidden"
                accept=".mp3,.wav,.m4a,.ogg,.webm,.flac,.aac,.mp4"
                disabled={uploading || transcribing}
                onChange={(event) => void handleAudio(event.target.files?.[0] ?? null)}
              />
            </label>
            {audioFileId && (
              <div className="mt-2">
                <audio
                  controls
                  preload="none"
                  src={api.fileUrl(audioFileId, true)}
                  className="w-full"
                />
              </div>
            )}
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
            hint={`${transcript.trim() ? transcript.trim().split(/\r?\n/).filter(Boolean).length : 0} 行 · 可编辑`}
            htmlFor="meeting-transcript"
          >
            <Textarea
              id="meeting-transcript"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="上传录音后会自动转写到这里；也可以直接粘贴会议记录，每行一句。"
              className="min-h-[200px] font-mono text-[12px] leading-5"
            />
          </Field>

          <div className="flex items-start gap-2 rounded-lg bg-raised px-3 py-2 text-[10.5px] leading-4 text-faint">
            <ShieldCheck size={12} className="mt-0.5 shrink-0" />
            录音与转写文字保存在公司自己的服务器；摘要、决议与行动项由已配置的大模型生成，句句来自转写内容。
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
            disabled={
              !title.trim() ||
              !transcript.trim() ||
              submitting ||
              uploading ||
              transcribing
            }
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <ClipboardList size={13} />}
            {submitting ? '模型正在整理…' : '生成纪要'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
