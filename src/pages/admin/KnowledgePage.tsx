import {
  BookOpen,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  FileText,
  Link2,
  Lock,
  Plus,
  Presentation,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../../lib/store'
import type { KnowledgeDocKind } from '../../lib/types'
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

export function AdminKnowledgePage() {
  const { state, approveKnowledgeDoc, deleteKnowledgeDoc } = useStore()
  const [query, setQuery] = useState('')
  const [spaceId, setSpaceId] = useState('all')
  const [status, setStatus] = useState<'all' | 'ready' | 'review'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const docs = state.knowledgeDocs
  const reviewCount = docs.filter((doc) => doc.status === 'review').length
  const restrictedCount = docs.filter((doc) => doc.restricted).length
  const pendingDelete = docs.find((doc) => doc.id === deleteId)

  const visible = docs
    .filter((doc) => spaceId === 'all' || doc.spaceId === spaceId)
    .filter((doc) => status === 'all' || doc.status === status)
    .filter((doc) => {
      const needle = query.trim().toLowerCase()
      if (!needle) return true
      return `${doc.title} ${doc.summary} ${doc.tags.join(' ')} ${doc.source}`
        .toLowerCase()
        .includes(needle)
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  return (
    <PageBody>
      <PageHeader
        eyebrow="管理后台 · 知识库"
        title="企业知识"
        description="文档经管理员审批后才会进入助理的知识范围。按空间隔离主题与权限，助理回答必须带来源。"
        actions={
          <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> 新增文档
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {[
          { label: '知识文档', value: docs.length, hint: `${docs.filter((doc) => doc.status === 'ready').length} 篇已审批`, icon: BookOpen },
          { label: '待审批', value: reviewCount, hint: '审批后才可引用', icon: Clock3 },
          { label: '知识空间', value: state.knowledge.length, hint: '按主题与权限隔离', icon: ShieldCheck },
          { label: '受限文档', value: restrictedCount, hint: '按部门与角色授权', icon: Lock },
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
            placeholder="搜索标题、标签或来源"
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
          title="没有匹配的文档"
          description="换个关键词、空间或状态试试，也可以新增一篇文档进入审批队列。"
          action={
            <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
              <Plus size={13} /> 新增文档
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_130px_120px_110px_130px] gap-3 border-b border-line bg-raised px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-faint md:grid">
            <span>文档</span>
            <span>空间</span>
            <span>维护人</span>
            <span>状态</span>
            <span className="text-right">操作</span>
          </div>
          <div className="divide-y divide-line">
            {visible.map((doc) => {
              const space = state.knowledge.find((item) => item.id === doc.spaceId)
              const owner = state.members.find((member) => member.id === doc.ownerId)
              const KindIcon = KIND_META[doc.kind].icon
              const meta = STATUS_META[doc.status]
              return (
                <div
                  key={doc.id}
                  className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_130px_120px_110px_130px] md:items-center md:gap-3"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-muted">
                      <KindIcon size={15} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-ink">
                          {doc.title}
                        </span>
                        {doc.restricted && (
                          <Lock size={10} className="shrink-0 text-warning" aria-label="受限文档" />
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[10.5px] leading-4 text-muted">
                        {doc.summary}
                      </p>
                      <p className="mt-0.5 text-[9.5px] text-faint">
                        {KIND_META[doc.kind].label} · {doc.size} ·{' '}
                        {formatRelative(doc.updatedAt)}更新
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
                    {doc.status === 'review' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => approveKnowledgeDoc(doc.id)}
                      >
                        <CheckCircle2 size={12} /> 通过
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
          当前版本保存文档摘要与元数据，不上传原始文件；受限文档会按成员角色与归属校验。审批、删除动作都会写入审计记录。
        </p>
      </div>

      <AddKnowledgeDocDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => setAddOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="删除这篇知识文档？"
        description={`「${pendingDelete?.title ?? '这篇文档'}」将不再被助理引用；已经产生的历史引用与审计记录不受影响。`}
        confirmLabel="删除文档"
        onConfirm={() => {
          if (deleteId) deleteKnowledgeDoc(deleteId)
          setDeleteId(null)
        }}
      />
    </PageBody>
  )
}

function AddKnowledgeDocDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const { state, createKnowledgeDoc } = useStore()
  const [spaceId, setSpaceId] = useState(state.knowledge[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [tags, setTags] = useState('')
  const [kind, setKind] = useState<KnowledgeDocKind>('doc')
  const [restricted, setRestricted] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setSpaceId(state.knowledge[0]?.id ?? '')
    setTitle('')
    setSummary('')
    setTags('')
    setKind('doc')
    setRestricted(false)
    setError('')
  }

  const submit = () => {
    setError('')
    const result = createKnowledgeDoc({
      spaceId,
      title,
      summary,
      tags: tags.split(/[,，\s]+/),
      kind,
      restricted,
    })
    if (!result.ok) {
      setError(result.error ?? '请检查填写内容。')
      return
    }
    reset()
    onCreated()
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
          title="新增知识文档"
          description="录入摘要与元数据，提交后进入审批队列。审批通过前，助理不会引用这篇文档。"
          icon={BookOpen}
        />
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="知识空间" required htmlFor="doc-space">
              <Select
                id="doc-space"
                value={spaceId}
                onChange={(event) => setSpaceId(event.target.value)}
              >
                {state.knowledge.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="文档类型" htmlFor="doc-kind">
              <Select
                id="doc-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as KnowledgeDocKind)}
              >
                {Object.entries(KIND_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="标题" required htmlFor="doc-title">
            <Input
              id="doc-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：2027 报价与折扣规则"
              maxLength={60}
            />
          </Field>

          <Field
            label="摘要"
            hint={`${summary.length}/240`}
            htmlFor="doc-summary"
          >
            <Textarea
              id="doc-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value.slice(0, 240))}
              placeholder="这篇文档解决什么问题？助理应该在什么场景引用它？请写清关键结论与限制。"
              className="min-h-[100px]"
            />
          </Field>

          <Field label="标签" hint="用逗号分隔" htmlFor="doc-tags">
            <Input
              id="doc-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="例如：报价, 折扣, 审批"
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-raised px-3 py-2.5">
            <Checkbox
              checked={restricted}
              onChange={(event) => setRestricted(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="flex items-center gap-1 text-[12px] font-medium text-ink">
                <Lock size={11} className="text-warning" /> 受限文档
              </span>
              <span className="mt-0.5 block text-[10.5px] leading-4 text-muted">
                只有被授权的成员与助理可以引用；引用时仍会校验部门与角色。
              </span>
            </span>
          </label>

          <div className="flex items-start gap-2 rounded-lg bg-raised px-3 py-2 text-[10.5px] leading-4 text-faint">
            <ShieldCheck size={12} className="mt-0.5 shrink-0" />
            当前版本保存摘要索引，不上传原始文件；检索会按助理绑定的知识空间与成员权限过滤。
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
          <Button variant="primary" onClick={submit} disabled={!title.trim()}>
            <Plus size={13} /> 提交审批
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
