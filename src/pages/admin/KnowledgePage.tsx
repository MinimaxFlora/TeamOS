import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Link2,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Presentation,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, describeError } from '../../lib/api'
import { useStore } from '../../lib/store'
import type { KnowledgeDoc, KnowledgeDocKind } from '../../lib/types'
import { formatRelative } from '../../lib/format'
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
import { Checkbox, Field, Input, Select, Textarea } from '../../components/ui/input'

const KIND_META: Record<KnowledgeDocKind, { label: string; icon: typeof FileText }> = {
  doc: { label: '文档', icon: FileText },
  sheet: { label: '表格', icon: FileSpreadsheet },
  slides: { label: '演示稿', icon: Presentation },
  pdf: { label: 'PDF', icon: FileText },
  link: { label: '链接', icon: Link2 },
}

const STATUS_META = {
  ready: { label: '已审批', tone: 'success' as const },
  review: { label: '待审批', tone: 'warning' as const },
}

function expiryText(doc: KnowledgeDoc): string {
  if (doc.status !== 'review' || !doc.expiresAt) return ''
  const left = new Date(doc.expiresAt).getTime() - Date.now()
  if (left <= 0) return '即将自动删除'
  const days = Math.floor(left / 86_400_000)
  const hours = Math.floor((left % 86_400_000) / 3_600_000)
  return days > 0 ? `${days} 天 ${hours} 小时后自动删除` : `${hours} 小时后自动删除`
}

export function AdminKnowledgePage() {
  const { state, approveKnowledgeDoc, deleteKnowledgeDoc, notify } = useStore()
  const [query, setQuery] = useState('')
  const [spaceId, setSpaceId] = useState('all')
  const [status, setStatus] = useState<'all' | 'ready' | 'review'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const docs = state.knowledgeDocs
  const reviewCount = docs.filter((doc) => doc.status === 'review').length
  const restrictedCount = docs.filter((doc) => doc.restricted).length
  const pendingDelete = docs.find((doc) => doc.id === deleteId)
  const editing = docs.find((doc) => doc.id === editId) ?? null

  const visible = docs
    .filter((doc) => spaceId === 'all' || doc.spaceId === spaceId)
    .filter((doc) => status === 'all' || doc.status === status)
    .filter((doc) => {
      const needle = query.trim().toLowerCase()
      if (!needle) return true
      return `${doc.title} ${doc.summary} ${doc.tags.join(' ')} ${doc.source} ${doc.fileName ?? ''}`
        .toLowerCase()
        .includes(needle)
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  const approve = async (doc: KnowledgeDoc) => {
    setBusyId(doc.id)
    const result = await approveKnowledgeDoc(doc.id)
    setBusyId(null)
    if (!result.ok) notify('审批失败', { description: result.error, tone: 'danger' })
  }

  const download = async (doc: KnowledgeDoc) => {
    if (!doc.fileId) {
      notify('没有原始文件', { description: '这篇文档只有文字内容，可以直接点「编辑」查看。', tone: 'warning' })
      return
    }
    try {
      await api.downloadFile(doc.fileId, doc.fileName || doc.title)
    } catch (error) {
      notify('下载失败', { description: describeError(error), tone: 'danger' })
    }
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="管理后台 · 知识库"
        title="企业知识"
        description="员工通过 @ 助理归档的文件、管理员上传的资料都会进入审批队列。审批通过后助理才能引用；7 天内未审批的文件会自动删除。"
        actions={
          <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> 上传知识
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {[
          { label: '知识文档', value: docs.length, hint: `${docs.filter((doc) => doc.status === 'ready').length} 篇已审批`, icon: BookOpen },
          { label: '待审批', value: reviewCount, hint: '7 天内不审批将删除', icon: Clock3 },
          { label: '知识空间', value: state.knowledge.length, hint: '按主题与权限隔离', icon: ShieldCheck },
          { label: '受限文档', value: restrictedCount, hint: '只有作者与管理员可见', icon: Lock },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-card"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint">
                {item.label}
              </span>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-raised text-muted">
                <item.icon size={13} />
              </span>
            </div>
            <div className="mt-1.5 text-[24px] font-semibold leading-8 tabular text-ink">
              {item.value}
            </div>
            <div className="mt-0.5 truncate text-[10.5px] text-muted">{item.hint}</div>
          </div>
        ))}
      </div>

      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        {state.knowledge.map((space) => {
          const count = docs.filter((doc) => doc.spaceId === space.id).length
          const agents = state.agents.filter(
            (agent) => agent.status === 'published' && agent.knowledge.includes(space.id),
          ).length
          return (
            <button
              key={space.id}
              type="button"
              onClick={() => setSpaceId(spaceId === space.id ? 'all' : space.id)}
              className={cn(
                'rounded-xl border px-3.5 py-3 text-left transition-colors',
                spaceId === space.id
                  ? 'border-accent-line bg-accent-soft/60'
                  : 'border-line bg-surface shadow-card hover:border-line-strong',
              )}
            >
              <div className="flex items-center gap-1.5">
                <BookOpen size={12} className="shrink-0 text-muted" />
                <span className="truncate text-[12px] font-medium text-ink">{space.name}</span>
                {space.restricted && <Lock size={10} className="ml-auto shrink-0 text-warning" />}
              </div>
              <div className="mt-1.5 text-[17px] font-semibold tabular text-ink">
                {count}
                <span className="ml-1 text-[10px] font-normal text-muted">篇</span>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-faint">{agents} 个助理可引用</div>
            </button>
          )
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[300px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、文件名、标签或来源"
            aria-label="搜索知识文档"
            className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-8 pr-3 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { key: 'all', label: '全部状态' },
            { key: 'ready', label: '已审批' },
            { key: 'review', label: '待审批' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setStatus(item.key as typeof status)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                status === item.key
                  ? 'border-accent-line bg-accent-soft text-accent-strong'
                  : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-faint">{visible.length} 篇</span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="知识库里还没有文件"
          description="员工在公司大厅上传文件并 @ 通用助理说「归档」，或由管理员在这里直接上传。审批通过后助理才能检索。"
          action={
            <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
              <Plus size={13} /> 上传知识
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_120px_110px_100px_150px] gap-3 border-b border-line bg-raised px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-faint md:grid">
            <span>文件</span>
            <span>空间</span>
            <span>提交人</span>
            <span>状态</span>
            <span className="text-right">操作</span>
          </div>
          <div className="divide-y divide-line">
            {visible.map((doc) => {
              const space = state.knowledge.find((item) => item.id === doc.spaceId)
              const owner = state.members.find((member) => member.id === doc.ownerId)
              const KindIcon = KIND_META[doc.kind]?.icon ?? FileText
              const meta = STATUS_META[doc.status]
              return (
                <div
                  key={doc.id}
                  className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_120px_110px_100px_150px] md:items-center md:gap-3"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-muted">
                      <KindIcon size={15} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditId(doc.id)}
                          className="truncate text-left text-[12.5px] font-medium text-ink hover:text-accent-strong hover:underline"
                        >
                          {doc.title}
                        </button>
                        {doc.restricted && (
                          <Lock size={10} className="shrink-0 text-warning" aria-label="受限文档" />
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[10.5px] leading-4 text-muted">
                        {doc.summary || doc.fileName || doc.source}
                      </p>
                      <p className="mt-0.5 text-[9.5px] text-faint">
                        {doc.fileName ? `${doc.fileName} · ` : ''}
                        {KIND_META[doc.kind]?.label ?? '文档'} · {doc.size} ·{' '}
                        {formatRelative(doc.updatedAt)}更新
                        {doc.status === 'review' && expiryText(doc) ? ` · ${expiryText(doc)}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-ink-soft md:block">
                    <span className="text-faint md:hidden">空间</span>
                    {space?.name ?? '—'}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                    <Avatar name={owner?.name ?? '管理员'} color={owner?.color ?? '#4b5b76'} size="xs" />
                    <span className="truncate">{owner?.name ?? '管理员'}</span>
                  </div>

                  <div>
                    <Badge tone={meta.tone} dot>
                      {meta.label}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1 md:justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditId(doc.id)}
                      aria-label={`编辑 ${doc.title}`}
                    >
                      <Pencil size={12} /> 编辑
                    </Button>
                    <Button
                      size="iconSm"
                      variant="ghost"
                      onClick={() => void download(doc)}
                      aria-label={`下载 ${doc.title}`}
                    >
                      <Download size={13} />
                    </Button>
                    {doc.status === 'review' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void approve(doc)}
                        disabled={busyId === doc.id}
                      >
                        {busyId === doc.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                        通过
                      </Button>
                    )}
                    <Button
                      size="iconSm"
                      variant="ghost"
                      onClick={() => setDeleteId(doc.id)}
                      aria-label={`删除 ${doc.title}`}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[11px] leading-5 text-muted shadow-card">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-muted" />
        <p>
          文件原件保存在服务器磁盘，管理员可以预览、编辑正文并下载到本地。待审批条目会在 7 天后连同原件自动删除；
          审批与删除动作都会写入审计记录。
        </p>
      </div>

      <UploadKnowledgeDialog open={addOpen} onClose={() => setAddOpen(false)} />

      {editing && <KnowledgeEditorDialog doc={editing} onClose={() => setEditId(null)} />}

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="删除这条知识？"
        description={`「${pendingDelete?.title ?? '这条知识'}」会被移除，关联的原始文件也会删除；已经产生的历史对话不受影响。`}
        confirmLabel="删除"
        onConfirm={() => {
          if (deleteId) void deleteKnowledgeDoc(deleteId)
          setDeleteId(null)
        }}
      />
    </PageBody>
  )
}

function UploadKnowledgeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, createKnowledgeDoc } = useStore()
  const [spaceId, setSpaceId] = useState(state.knowledge[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [tags, setTags] = useState('')
  const [restricted, setRestricted] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setSpaceId(state.knowledge[0]?.id ?? '')
  }, [open, state.knowledge])

  const reset = () => {
    setTitle('')
    setSummary('')
    setTags('')
    setRestricted(false)
    setFile(null)
    setContent('')
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const submit = async () => {
    setError('')
    if (!title.trim()) {
      setError('请填写标题。')
      return
    }
    if (!file && !content.trim()) {
      setError('请选择文件，或直接粘贴正文（会自动生成 .md 文件保存）。')
      return
    }
    setBusy(true)
    try {
      let fileId: string | undefined
      if (file) {
        const uploaded = await api.uploadFile(file, file.name, 'knowledge')
        fileId = uploaded.id
      }
      const result = await createKnowledgeDoc({
        spaceId,
        title,
        summary,
        tags: tags.split(/[,，\s]+/),
        restricted,
        fileId,
        content: file ? undefined : content,
      })
      if (!result.ok) {
        setError(result.error ?? '提交失败。')
        return
      }
      reset()
      onClose()
    } catch (reason) {
      setError(describeError(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onClose()
      }}
    >
      <DialogContent size="lg">
        <DialogHeader
          title="上传知识文件"
          description="支持 PDF、Word、Excel、PPT、图片与纯文本，单个文件不超过 50 MB。提交后进入审批队列。"
          icon={Upload}
        />
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="知识空间" required htmlFor="doc-space">
              <Select id="doc-space" value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>
                {state.knowledge.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="标题" required htmlFor="doc-title">
              <Input
                id="doc-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：2027 报价与折扣规则"
                maxLength={80}
              />
            </Field>
          </div>

          <Field label="文件" htmlFor="doc-file" hint="也可以只在下面粘贴正文">
            <label
              htmlFor="doc-file"
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong bg-raised px-3 py-2.5 text-[12px] text-muted hover:border-accent"
            >
              <Upload size={14} />
              {file ? (
                <span className="truncate text-ink">{file.name}（{(file.size / 1024).toFixed(0)} KB）</span>
              ) : (
                <span>点击选择文件</span>
              )}
              <input
                ref={inputRef}
                id="doc-file"
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.gif"
                onChange={(event) => {
                  const picked = event.target.files?.[0] ?? null
                  setFile(picked)
                  if (picked && !title.trim()) {
                    setTitle(picked.name.replace(/\.[^.]+$/, ''))
                  }
                }}
              />
              {file && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault()
                    setFile(null)
                    if (inputRef.current) inputRef.current.value = ''
                  }}
                  className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded text-faint hover:bg-sunken hover:text-ink"
                  aria-label="移除文件"
                >
                  <X size={12} />
                </button>
              )}
            </label>
          </Field>

          {!file && (
            <Field label="粘贴正文" htmlFor="doc-content" hint="纯文本或 Markdown">
              <Textarea
                id="doc-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="把制度、流程、产品说明直接粘贴进来，提交时会保存为 .md 文件。"
                className="min-h-[130px] font-mono text-[12px]"
              />
            </Field>
          )}

          <Field label="摘要" hint="可选，帮助助理判断何时引用" htmlFor="doc-summary">
            <Textarea
              id="doc-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value.slice(0, 400))}
              placeholder="这份资料解决什么问题？关键结论与限制是什么？"
              className="min-h-[80px]"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="标签" hint="用逗号分隔" htmlFor="doc-tags">
              <Input
                id="doc-tags"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="报价, 折扣, 审批"
              />
            </Field>
            <label className="flex cursor-pointer items-start gap-2 self-end rounded-lg border border-line bg-raised px-3 py-2">
              <Checkbox
                checked={restricted}
                onChange={(event) => setRestricted(event.target.checked)}
                className="mt-0.5"
              />
              <span className="text-[11px] leading-4 text-muted">
                受限文档：只有提交人与管理员可以查看和下载。
              </span>
            </label>
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
              onClose()
            }}
          >
            取消
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {busy ? '正在提交…' : '提交审批'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function KnowledgeEditorDialog({ doc, onClose }: { doc: KnowledgeDoc; onClose: () => void }) {
  const { state, updateKnowledgeDoc, approveKnowledgeDoc, notify } = useStore()
  const [title, setTitle] = useState(doc.title)
  const [summary, setSummary] = useState(doc.summary)
  const [tags, setTags] = useState(doc.tags.join(', '))
  const [spaceId, setSpaceId] = useState(doc.spaceId)
  const [restricted, setRestricted] = useState(doc.restricted)
  const [content, setContent] = useState(doc.content ?? '')
  const [loadingText, setLoadingText] = useState(false)
  const [saving, setSaving] = useState(false)
  const [textError, setTextError] = useState('')

  useEffect(() => {
    if (doc.content || !doc.fileId) return
    let cancelled = false
    setLoadingText(true)
    api
      .fileText(doc.fileId)
      .then((result) => {
        if (!cancelled) setContent(result.text)
      })
      .catch((error) => {
        if (!cancelled) setTextError(describeError(error))
      })
      .finally(() => {
        if (!cancelled) setLoadingText(false)
      })
    return () => {
      cancelled = true
    }
  }, [doc.content, doc.fileId])

  const save = async () => {
    setSaving(true)
    try {
      const result = await updateKnowledgeDoc(doc.id, {
        title,
        summary,
        content,
        tags: tags.split(/[,，\s]+/).filter(Boolean),
        restricted,
        spaceId,
      })
      if (!result.ok) {
        notify('保存失败', { description: result.error, tone: 'danger' })
        return
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const isImage = doc.fileName ? /\.(png|jpe?g|webp|gif)$/i.test(doc.fileName) : false
  const isPdf = doc.fileName ? /\.pdf$/i.test(doc.fileName) : false

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl">
        <DialogHeader
          title={`编辑 · ${doc.title}`}
          description="修改标题、正文后保存；已审批文档会立即用新正文参与检索。原件仍可下载。"
          icon={Pencil}
        />
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="标题" required htmlFor="edit-title">
              <Input id="edit-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
            </Field>
            <Field label="知识空间" htmlFor="edit-space">
              <Select id="edit-space" value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>
                {state.knowledge.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="标签" htmlFor="edit-tags">
              <Input id="edit-tags" value={tags} onChange={(event) => setTags(event.target.value)} />
            </Field>
          </div>

          <Field label="摘要" htmlFor="edit-summary">
            <Textarea
              id="edit-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value.slice(0, 400))}
              className="min-h-[70px]"
            />
          </Field>

          <div className="rounded-lg border border-line bg-raised px-3 py-2.5 text-[11px] text-muted">
            <div className="flex flex-wrap items-center gap-2">
              <FileText size={13} />
              <span className="truncate text-ink">{doc.fileName || '（无原始文件）'}</span>
              <span className="text-faint">· {doc.size}</span>
              <span className="ml-auto flex items-center gap-1.5">
                {doc.fileId && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void api.downloadFile(doc.fileId!, doc.fileName || doc.title).catch((error) =>
                      notify('下载失败', { description: describeError(error), tone: 'danger' }),
                    )}
                  >
                    <Download size={12} /> 下载到本地
                  </Button>
                )}
                {doc.status === 'review' && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      const result = await approveKnowledgeDoc(doc.id)
                      if (!result.ok) notify('审批失败', { description: result.error, tone: 'danger' })
                      else onClose()
                    }}
                  >
                    <CheckCircle2 size={12} /> 通过审批
                  </Button>
                )}
              </span>
            </div>
            {doc.fileId && (isImage || isPdf) && (
              <div className="mt-2 overflow-hidden rounded-md border border-line bg-surface">
                {isImage ? (
                  <img
                    src={api.fileUrl(doc.fileId, true)}
                    alt={doc.title}
                    className="max-h-[320px] w-auto"
                  />
                ) : (
                  <iframe
                    src={api.fileUrl(doc.fileId, true)}
                    title={doc.title}
                    className="h-[320px] w-full"
                  />
                )}
              </div>
            )}
          </div>

          <Field
            label="正文（参与检索的内容）"
            hint={loadingText ? '正在提取文件文字…' : `${content.length} 字`}
            htmlFor="edit-content"
          >
            <Textarea
              id="edit-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-[260px] font-mono text-[12px] leading-5"
              placeholder="这里是从文件提取出来的正文，可以直接编辑或补充说明。"
            />
          </Field>

          {textError && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-[11px] text-warning">
              无法读取文件文字：{textError}（扫描件 PDF 需要先做 OCR）
            </p>
          )}

          <label className="flex cursor-pointer items-start gap-2">
            <Checkbox
              checked={restricted}
              onChange={(event) => setRestricted(event.target.checked)}
              className="mt-0.5"
            />
            <span className="text-[11px] leading-4 text-muted">受限文档：只有提交人与管理员可以查看。</span>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving || !title.trim()}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {saving ? '保存中…' : '保存修改'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
