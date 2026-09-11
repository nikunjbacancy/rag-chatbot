'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileText, FileSpreadsheet, Trash2, RefreshCw, AlertCircle,
  CheckCircle2, Loader2, Library, SlidersHorizontal,
  MessageSquareX, Activity, UploadCloud,
} from 'lucide-react'
import { documentsApi, systemApi, DocumentResponse, HealthStatus } from '@/lib/api'
import FileUpload from './FileUpload'
import clsx from 'clsx'

// ── Helpers ────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Sub-components ─────────────────────────────────────────────────

function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1 mb-2">
      <span className="text-violet-400">{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{title}</span>
    </div>
  )
}

function FileTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pdf:  { label: 'PDF',  cls: 'bg-red-50 text-red-500 border-red-200' },
    docx: { label: 'DOCX', cls: 'bg-blue-50 text-blue-500 border-blue-200' },
    md:   { label: 'MD',   cls: 'bg-violet-50 text-violet-500 border-violet-200' },
    csv:  { label: 'CSV',  cls: 'bg-emerald-50 text-emerald-500 border-emerald-200' },
    txt:  { label: 'TXT',  cls: 'bg-gray-50 text-gray-500 border-gray-200' },
  }
  const entry = map[type.toLowerCase()] ?? { label: type.toUpperCase(), cls: 'bg-gray-50 text-gray-500 border-gray-200' }
  return (
    <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded border tracking-wide', entry.cls)}>
      {entry.label}
    </span>
  )
}

function FileIcon({ type }: { type: string }) {
  const cls = 'w-4 h-4 flex-shrink-0'
  switch (type.toLowerCase()) {
    case 'pdf':  return <FileText        className={clsx(cls, 'text-red-400')} />
    case 'docx': return <FileText        className={clsx(cls, 'text-blue-400')} />
    case 'md':   return <FileText        className={clsx(cls, 'text-violet-400')} />
    case 'csv':  return <FileSpreadsheet className={clsx(cls, 'text-emerald-400')} />
    default:     return <FileText        className={clsx(cls, 'text-gray-400')} />
  }
}

function StatusPill({ status }: { status: DocumentResponse['status'] }) {
  if (status === 'ready')
    return <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200"><CheckCircle2 className="w-2.5 h-2.5" />Ready</span>
  if (status === 'processing')
    return <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200"><Loader2 className="w-2.5 h-2.5 animate-spin" />Indexing</span>
  return <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200"><AlertCircle className="w-2.5 h-2.5" />Failed</span>
}

// ── Main component ─────────────────────────────────────────────────

interface Props {
  topK: number
  onTopKChange: (v: number) => void
  onClearChat: () => void
}

export default function DocumentManager({ topK, onTopKChange, onClearChat }: Props) {
  const [documents, setDocuments]   = useState<DocumentResponse[]>([])
  const [loading, setLoading]       = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [docError, setDocError]     = useState<string | null>(null)
  const [health, setHealth]         = useState<HealthStatus | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const pollRef                     = useRef<NodeJS.Timeout | null>(null)
  const healthRef                   = useRef<NodeJS.Timeout | null>(null)

  // ── Documents ──────────────────────────────────────────────────

  const fetchDocs = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const data = await documentsApi.list()
      setDocuments(data.documents)
      setDocError(null)
    } catch (e: any) {
      setDocError(e.message || 'Failed to load documents')
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDocs(true) }, [fetchDocs])

  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'processing')
    if (hasProcessing && !pollRef.current) {
      pollRef.current = setInterval(() => fetchDocs(), 3000)
    } else if (!hasProcessing && pollRef.current) {
      clearInterval(pollRef.current); pollRef.current = null
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [documents, fetchDocs])

  const handleUpload = useCallback((doc: DocumentResponse) => {
    setDocuments(prev => [doc, ...prev])
    if (!pollRef.current) pollRef.current = setInterval(() => fetchDocs(), 3000)
  }, [fetchDocs])

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id)
    try {
      await documentsApi.delete(id)
      setDocuments(prev => prev.filter(d => d.id !== id))
    } catch (e: any) {
      setDocError(e.message || 'Delete failed')
      setTimeout(() => setDocError(null), 4000)
    } finally {
      setDeletingId(null)
    }
  }, [])

  // ── Health polling ─────────────────────────────────────────────

  const fetchHealth = useCallback(async () => {
    try { setHealth(await systemApi.health()) } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchHealth()
    healthRef.current = setInterval(fetchHealth, 30_000)
    return () => { if (healthRef.current) clearInterval(healthRef.current) }
  }, [fetchHealth])

  // ── Clear conversation ─────────────────────────────────────────

  const handleClearClick = () => {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return }
    onClearChat()
    setConfirmClear(false)
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 p-4 pb-6">

      {/* ══ Knowledge Base ══════════════════════════════════════ */}
      <section>
        <SectionLabel icon={<UploadCloud className="w-3.5 h-3.5" />} title="Knowledge Base" />
        <FileUpload onUploadComplete={handleUpload} />
      </section>

      <div className="border-t border-gray-100" />

      {/* ══ Indexed Documents ═══════════════════════════════════ */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel icon={<Library className="w-3.5 h-3.5" />} title="Indexed Documents" />
          <div className="flex items-center gap-1.5">
            {documents.length > 0 && (
              <span className="text-[10px] bg-violet-100 text-violet-600 border border-violet-200 rounded-full px-2 py-0.5 font-medium">
                {documents.length}
              </span>
            )}
            <button
              onClick={() => fetchDocs(false)}
              className="p-1 rounded-lg text-gray-400 hover:text-violet-500 hover:bg-violet-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {docError && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{docError}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <FileText className="w-7 h-7 mx-auto mb-2 opacity-25" />
            <p className="text-xs">No documents indexed yet</p>
            <p className="text-[11px] mt-0.5 opacity-60">Upload a file above to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map(doc => (
              <div
                key={doc.id}
                className={clsx(
                  'group flex items-start gap-3 p-3 rounded-xl border transition-all',
                  doc.status === 'ready'      && 'border-gray-200 bg-white hover:bg-violet-50 hover:border-violet-200',
                  doc.status === 'processing' && 'border-amber-200 bg-amber-50',
                  doc.status === 'failed'     && 'border-red-200 bg-red-50',
                )}
              >
                <div className="mt-0.5"><FileIcon type={doc.file_type} /></div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate leading-snug" title={doc.filename}>
                    {doc.filename}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <FileTypeBadge type={doc.file_type} />
                    <StatusPill status={doc.status} />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-gray-400">{formatBytes(doc.size_bytes)}</span>
                    {doc.status === 'ready' && doc.chunk_count > 0 && (
                      <span className="text-[10px] text-gray-400">{doc.chunk_count} chunks</span>
                    )}
                    <span className="text-[10px] text-gray-300">{timeAgo(doc.created_at)}</span>
                  </div>
                  {doc.status === 'failed' && doc.error_message && (
                    <p className="text-[10px] text-red-500 mt-1 line-clamp-2">{doc.error_message}</p>
                  )}
                </div>

                <button
                  onClick={() => handleDelete(doc.id)}
                  disabled={deletingId === doc.id}
                  className="flex-shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-40"
                >
                  {deletingId === doc.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2  className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="border-t border-gray-100" />

      {/* ══ Retrieval Settings ══════════════════════════════════ */}
      <section>
        <SectionLabel icon={<SlidersHorizontal className="w-3.5 h-3.5" />} title="Retrieval Settings" />

        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-700">Context chunks</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Passages retrieved per question</p>
            </div>
            <span className="text-sm font-bold text-violet-600 bg-violet-50 border border-violet-200 w-8 h-8 rounded-lg flex items-center justify-center">
              {topK}
            </span>
          </div>

          <input
            type="range"
            min={1}
            max={15}
            step={1}
            value={topK}
            onChange={e => onTopKChange(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #7c3aed ${((topK - 1) / 14) * 100}%, #e5e7eb ${((topK - 1) / 14) * 100}%)`,
              accentColor: '#7c3aed',
            }}
          />

          <div className="flex justify-between text-[9px] text-gray-400 font-medium">
            <span>1 · Precise</span>
            <span>15 · Broad</span>
          </div>
        </div>
      </section>

      <div className="border-t border-gray-100" />

      {/* ══ Chat Controls ═══════════════════════════════════════ */}
      <section>
        <SectionLabel icon={<MessageSquareX className="w-3.5 h-3.5" />} title="Chat Controls" />

        <button
          onClick={handleClearClick}
          className={clsx(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-medium transition-all',
            confirmClear
              ? 'bg-red-500 border-red-500 text-white hover:bg-red-600'
              : 'bg-white border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-500 hover:bg-red-50',
          )}
        >
          <MessageSquareX className="w-3.5 h-3.5" />
          {confirmClear ? 'Tap again to confirm' : 'Clear Conversation'}
        </button>
        <p className="text-[10px] text-gray-400 text-center mt-1.5">
          Removes all messages from the current session
        </p>
      </section>

      <div className="border-t border-gray-100" />

      {/* ══ System Status ═══════════════════════════════════════ */}
      <section>
        <SectionLabel icon={<Activity className="w-3.5 h-3.5" />} title="System Status" />

        <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden text-xs">
          <StatusRow
            label="Vector store"
            value={health ? 'Ready' : '—'}
            valueClass={health ? 'text-emerald-600' : 'text-gray-400'}
            dot={health ? 'bg-emerald-400' : 'bg-gray-300'}
          />
          <StatusRow
            label="Documents"
            value={health ? String(health.collection_stats.total_documents) : '—'}
          />
          <StatusRow
            label="Chunks indexed"
            value={health ? String(health.collection_stats.total_chunks) : '—'}
          />
          <StatusRow
            label="Language model"
            value={health?.model ?? '—'}
            mono
          />
          <StatusRow
            label="Embedding model"
            value={health?.embedding_model ?? '—'}
            mono
          />
        </div>
      </section>
    </div>
  )
}

function StatusRow({
  label,
  value,
  valueClass = 'text-gray-700',
  dot,
  mono = false,
}: {
  label: string
  value: string
  valueClass?: string
  dot?: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-[11px] text-gray-500">{label}</span>
      <div className="flex items-center gap-1.5">
        {dot && <span className={clsx('w-1.5 h-1.5 rounded-full', dot)} />}
        <span className={clsx('text-[11px] font-medium', mono && 'font-mono', valueClass)}>
          {value}
        </span>
      </div>
    </div>
  )
}
