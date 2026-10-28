import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Link2,
  Lock,
  MessageSquare,
  Presentation,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../lib/store'
import type { KnowledgeDoc, KnowledgeDocKind } from '../../lib/types'
import { formatRelative } from '../../lib/format'
import { cn, copyText } from '../../lib/utils'
import { PageBody, PageHeader } from '../../components/layout/PageHeader'
import { AgentAvatar, Avatar } from '../../components/ui/avatar'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/ui/dialog'
import { EmptyState } from '../../components/ui/empty-state'

const KIND_META: Record<KnowledgeDocKind, { label: string; icon: typeof FileText }> = {
  doc: { label: '文档', icon: FileText },
  sheet: { label: '表格', icon: FileSpreadsheet },
  slides: { label: '演示稿', icon: Presentation },
  pdf: { label: 'PDF', icon: FileText },
  link: { label: '链接', icon: Link2 },
}

export function WorkspaceKnowledgePage() {
  const { state, currentUser, notify } = useStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [spaceId, setSpaceId] = useState('all')
  const [selected, setSelected] = useState<KnowledgeDoc | null>(null)

  const spaces = state.knowledge
  const readyDocs = useMemo(
    () => state.knowledgeDocs.filter((doc) => doc.status === 'ready'),
    [state.knowledgeDocs],
  )

  const visible = readyDocs
    .filter((doc) => spaceId === 'all' || doc.spaceId === spaceId)
    .filter((doc) => {
      const needle = query.trim().toLowerCase()
      if (!needle) return true
      return `${doc.title} ${doc.summary} ${doc.tags.join(' ')} ${doc.source}`
        .toLowerCase()
        .includes(needle)
    })
    .sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )

  const restrictedCount = readyDocs.filter((doc) => doc.restricted).length

  return (
    <PageBody>
      <PageHeader
        eyebrow="企业知识"
        title="助理回答的依据"
        description="这里的文档都经过管理员审批。助理只在授权范围内引用，并在回答里标注来源；受限空间遵循成员的部门与角色授权。"
        actions={
          currentUser?.role === 'admin' ? (
            <Button size="sm" onClick={() => navigate('/admin/knowledge')}>
              <BookOpen size={14} /> 管理知识库
            </Button>
          ) : (
            <Badge tone="outline" className="h-7 px-2.5">
              <ShieldCheck size={12} /> 已审批才可引用
            </Badge>
          )
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-2.5">
        {[
          { label: '已审批文档', value: readyDocs.length, hint: '助理可引用' },
          { label: '知识空间', value: spaces.length, hint: '按主题隔离' },
          { label: '受限文档', value: restrictedCount, hint: '按权限授权' },
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

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[320px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、摘要、标签或来源"
            aria-label="搜索企业知识"
            className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-8 pr-3 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
        </div>
        <div className="no-scrollbar flex flex-1 items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSpaceId('all')}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
              spaceId === 'all'
                ? 'border-accent-line bg-accent-soft text-accent-strong'
                : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
            )}
          >
            全部空间
          </button>
          {spaces.map((space) => (
            <button
              key={space.id}
              type="button"
              onClick={() => setSpaceId(space.id)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                spaceId === space.id
                  ? 'border-accent-line bg-accent-soft text-accent-strong'
                  : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {space.name}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="没有匹配的文档"
          description={
            readyDocs.length === 0
              ? '管理员还没有审批通过任何知识文档。'
              : '换个空间或关键词试试；待审批的文档不会出现在这里。'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((doc) => {
            const space = spaces.find((item) => item.id === doc.spaceId)
            const owner = state.members.find((member) => member.id === doc.ownerId)
            const KindIcon = KIND_META[doc.kind].icon
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => setSelected(doc)}
                className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-shadow hover:shadow-pop focus-visible:outline-2 focus-visible:outline-accent"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <KindIcon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1.5">
                      <h2 className="line-clamp-2 text-[13.5px] font-semibold leading-5 text-ink">
                        {doc.title}
                      </h2>
                      {doc.restricted && (
                        <Lock size={11} className="mt-1 shrink-0 text-warning" aria-label="受限文档" />
                      )}
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-faint">
                      {space?.name} · {KIND_META[doc.kind].label} · {doc.size}
                    </p>
                  </div>
                </div>

                <p className="mt-2.5 line-clamp-3 flex-1 text-[11.5px] leading-5 text-muted">
                  {doc.summary}
                </p>

                <div className="mt-2.5 flex flex-wrap gap-1">
                  {doc.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-sunken px-1.5 py-0.5 text-[10px] text-ink-soft"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 text-[10.5px] text-faint">
                  <Avatar name={owner?.name ?? '管理员'} color={owner?.color ?? '#4b5b76'} size="xs" />
                  <span className="truncate">{owner?.name ?? '管理员'}</span>
                  <span>·</span>
                  <span className="shrink-0">{formatRelative(doc.updatedAt)}更新</span>
                  <ArrowRight
                    size={12}
                    className="ml-auto shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                  />
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Sparkles size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium text-ink">引用规则</div>
          <p className="mt-0.5 text-[11.5px] leading-5 text-muted">
            助理只能引用已审批文档，并在回答里标注来源与更新时间。受限文档还会校验部门与角色；没有权限时明确说明，而不是猜测。
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            copyText('知识引用规范：只引用已审批文档，并标注来源、更新时间与访问权限校验结果。')
              .then(() => notify('引用说明已复制'))
              .catch(() => notify('复制失败，请手动选择', { tone: 'warning' }))
          }}
        >
          复制引用说明
        </Button>
      </div>

      <KnowledgeDocDialog
        doc={selected}
        onClose={() => setSelected(null)}
        onAsk={(doc) => {
          setSelected(null)
          navigate(`/workspace/chat?draft=${encodeURIComponent(`请引用《${doc.title}》回答：`)}`)
        }}
      />
    </PageBody>
  )
}

function KnowledgeDocDialog({
  doc,
  onClose,
  onAsk,
}: {
  doc: KnowledgeDoc | null
  onClose: () => void
  onAsk: (doc: KnowledgeDoc) => void
}) {
  const { state } = useStore()
  if (!doc) return null
  const space = state.knowledge.find((item) => item.id === doc.spaceId)
  const owner = state.members.find((member) => member.id === doc.ownerId)
  const agents = state.agents.filter(
    (agent) => agent.status === 'published' && agent.knowledge.includes(doc.spaceId),
  )

  return (
    <Dialog open={Boolean(doc)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader
          title={doc.title}
          description={`${space?.name ?? '知识空间'} · ${KIND_META[doc.kind].label} · ${doc.size} · ${formatRelative(doc.updatedAt)}更新`}
          icon={BookOpen}
        />
        <DialogBody className="space-y-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="success" dot>
              已审批
            </Badge>
            {doc.restricted ? (
              <Badge tone="warning">
                <Lock size={10} /> 受限文档
              </Badge>
            ) : (
              <Badge tone="neutral">全员可见</Badge>
            )}
            {doc.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-sunken px-1.5 py-0.5 text-[10.5px] text-ink-soft"
              >
                #{tag}
              </span>
            ))}
          </div>

          <section>
            <h3 className="mb-1.5 text-[12px] font-semibold text-ink">摘要</h3>
            <p className="text-[12.5px] leading-6 text-ink-soft">{doc.summary}</p>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section>
              <h3 className="mb-2 text-[12px] font-semibold text-ink">来源与归属</h3>
              <dl className="space-y-1.5 text-[11.5px]">
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-faint">来源</dt>
                  <dd className="text-right text-ink-soft">{doc.source}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="shrink-0 text-faint">维护人</dt>
                  <dd className="flex items-center gap-1.5 text-ink-soft">
                    <Avatar name={owner?.name ?? '管理员'} color={owner?.color ?? '#4b5b76'} size="xs" />
                    {owner?.name ?? '管理员'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-faint">更新</dt>
                  <dd className="text-right text-ink-soft">{formatRelative(doc.updatedAt)}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-[12px] font-semibold text-ink">可引用它的助理 · {agents.length}</h3>
              {agents.length > 0 ? (
                <div className="space-y-1.5">
                  {agents.slice(0, 4).map((agent) => (
                    <div key={agent.id} className="flex items-center gap-2 text-[11.5px]">
                      <AgentAvatar icon={agent.icon} color={agent.color} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-ink-soft">{agent.name}</span>
                      <span className="shrink-0 text-[10px] text-faint">{agent.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11.5px] leading-5 text-faint">
                  还没有已发布助理绑定这个知识空间。
                </p>
              )}
            </section>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-raised px-3 py-2.5 text-[11px] leading-5 text-muted">
            <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-success" />
            助理回答时会标注来源与更新时间；受限内容只对被授权的成员引用。当前版本索引摘要，不加载原始文件正文。
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" onClick={() => onAsk(doc)}>
            <MessageSquare size={13} /> 在大厅引用提问
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
