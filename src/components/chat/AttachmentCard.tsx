import {
  Download,
  File,
  FileAudio,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Presentation,
} from 'lucide-react'
import type { Attachment, AttachmentKind } from '../../lib/types'
import { api, describeError } from '../../lib/api'
import { useStore } from '../../lib/store'
import { cn } from '../../lib/utils'
import { IconTip } from '../ui/tooltip'

export function kindFromName(name: string): AttachmentKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['doc', 'docx', 'md', 'txt', 'rtf'].includes(ext)) return 'doc'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet'
  if (['ppt', 'pptx', 'key'].includes(ext)) return 'slides'
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext)) return 'image'
  if (['mp3', 'wav', 'm4a', 'ogg', 'mp4', 'mov'].includes(ext)) return 'audio'
  return 'other'
}

const kindStyles: Record<
  AttachmentKind,
  { icon: typeof FileText; className: string }
> = {
  doc: { icon: FileText, className: 'bg-accent-soft text-accent' },
  sheet: { icon: FileSpreadsheet, className: 'bg-success-soft text-success' },
  slides: { icon: Presentation, className: 'bg-warning-soft text-warning' },
  pdf: { icon: FileText, className: 'bg-danger-soft text-danger' },
  image: { icon: ImageIcon, className: 'bg-[#f3eefc] text-[#6b5bd2]' },
  audio: { icon: FileAudio, className: 'bg-sunken text-ink-soft' },
  other: { icon: File, className: 'bg-sunken text-ink-soft' },
}

export function AttachmentCard({
  attachment,
  compact,
}: {
  attachment: Attachment
  compact?: boolean
}) {
  const { notify } = useStore()
  const style = kindStyles[attachment.kind] ?? kindStyles.other
  const Icon = style.icon

  const handleDownload = async () => {
    if (!/^f_[A-Za-z0-9]+$/.test(attachment.id)) {
      notify('这个附件没有上传到服务器', {
        description: '早期消息只保存了文件名；重新上传后即可下载。',
        tone: 'warning',
      })
      return
    }
    try {
      await api.downloadFile(attachment.id, attachment.name)
    } catch (error) {
      notify('下载失败', { description: describeError(error), tone: 'danger' })
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5">
        <span className={cn('inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md', style.className)}>
          <Icon size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] font-medium text-ink">{attachment.name}</div>
          <div className="text-[10px] text-faint">{attachment.size}</div>
        </div>
        <IconTip label="下载附件">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-sunken hover:text-ink"
            aria-label={`下载 ${attachment.name}`}
          >
            <Download size={13} />
          </button>
        </IconTip>
      </div>
    )
  }

  return (
    <div className="flex max-w-[420px] items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2 shadow-card">
      <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', style.className)}>
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-ink">{attachment.name}</div>
        <div className="text-[10.5px] text-faint">{attachment.size} · 已上传</div>
      </div>
      <IconTip label="下载附件">
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-sunken hover:text-ink"
          aria-label={`下载 ${attachment.name}`}
        >
          <Download size={14} />
        </button>
      </IconTip>
    </div>
  )
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
