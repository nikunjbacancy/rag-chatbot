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

function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1 mb-2">
      <span style={{ color: '#016CE1' }}>{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{title}</span>
    </div>
  )
}

function FileTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
    pdf:  { label: 'PDF',  bg: '#fff1f2', color: '#e11d48', border: '#fecdd3' },
    docx: { label: 'DOCX', bg: '#E0EEFD', color: '#016CE1', border: '#bfdbfe' },
    md:   { label: 'MD',   bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
    csv:  { label: 'CSV',  bg: '#f0fdfa', color: '#02B3A8', border: '#99f6e4' },
    txt:  { label: 'TXT',  bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' },
  }
  const e = map[type.toLowerCase()] ?? { label: type.toUpperCase(), bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' }
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border tracking-wide"
      style={{ backgroundColor: e.bg, color: e.color, borderColor: e.border }}>
      {e.label}
    </span>
  )
}

function FileIcon({ type }: { type: string }) {
  const cls = 'w-4 h-4 flex-shrink-0'
  switch (type.toLowerCase()) {
    case 'pdf':  return <FileText        className={cls} style={{ color: '#e11d48' }} />
    case 'docx': return <FileText        className={cls} style={{ color: '#016CE1' }} />
    case 'md':   return <FileText        className={cls} style={{ color: '#16a34a' }} />
    case 'csv':  return <FileSpreadsheet className={cls} style={{ color: '#02B3A8' }} />
    default:     return <FileText        className={cls} style={{ color: '#9ca3af' }} />
  }
}

function StatusPill({ status }: { status: DocumentResponse['status'] }) {
  if (status === 'ready')
    return <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200"><CheckCircle2 className="w-2.5 h-2.5" />Ready</span>
  if (status === 'processing')
    return <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200"><Loader2 className="w-2.5 h-2.5 animate-spin" />Indexing</span>
  return <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200"><AlertCircle className="w-2.5 h-2.5" />Failed</span>
}

interface Props {
  topK: number
  onTopKChange: (v: number) => void
  onClearChat: () => void
}

export default function DocumentManager({ topK, onTopKChange, onClearChat }: Props) {
  const [documents, setDocuments]       = useState<DocumentResponse[]>([])
  const [loading, setLoading]           = useState(true)
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  const [docError, setDocError]         = useState<string | null>(null)
  const [health, setHealth]             = useState<HealthStatus | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const pollRef                         = useRef<NodeJS.Timeout | null>(null)
  const healthRef                       = useRef<NodeJS.Timeout | null>(null)

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

  const fetchHealth = useCallback(async () => {
    try { setHealth(await systemApi.health()) } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchHealth()
    healthRef.current = setInterval(fetchHealth, 30_000)
    return () => { if (healthRef.current) clearInterval(healthRef.current) }
  }, [fetchHealth])

  const handleClearClick = () => {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return }
    onClearChat()
    setConfirmClear(false)
  }

  const sliderPct = ((topK - 1) / 14) * 100

  return (
    <div className="flex flex-col gap-5 p-4 pb-6">

      {/* ══ Knowledge Base ══ */}
      <section>
        <SectionLabel icon={<UploadCloud className="w-3.5 h-3.5" />} title="Knowledge Base" />
        <FileUpload onUploadComplete={handleUpload} />
      </section>

      <div className="border-t border-gray-100" />

      {/* ══ Indexed Documents ══ */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel icon={<Library className="w-3.5 h-3.5" />} title="Indexed Documents" />
          <div className="flex items-center gap-1.5">
            {documents.length > 0 && (
              <span className="text-[10px] rounded-full px-2 py-0.5 font-medium border"
                style={{ backgroundColor: '#E0EEFD', color: '#016CE1', borderColor: 'rgba(1,108,225,0.25)' }}>
                {documents.length}
              </span>
            )}
            <button
              onClick={() => fetchDocs(false)}
              className="p-1 rounded-lg text-gray-400 transition-colors"
              title="Refresh"
              onMouseEnter={e => { e.currentTarget.style.color = '#016CE1'; e.currentTarget.style.backgroundColor = '#E0EEFD' }}
              onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.backgroundColor = '' }}
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
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#016CE1' }} />
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
                  doc.status === 'ready'      && 'border-gray-200 bg-white',
                  doc.status === 'processing' && 'border-amber-200 bg-amber-50',
                  doc.status === 'failed'     && 'border-red-200 bg-red-50',
                )}
                onMouseEnter={e => {
                  if (doc.status === 'ready') {
                    e.currentTarget.style.backgroundColor = '#E0EEFD'
                    e.currentTarget.style.borderColor = '#016CE1'
                  }
                }}
                onMouseLeave={e => {
                  if (doc.status === 'ready') {
                    e.currentTarget.style.backgroundColor = ''
                    e.currentTarget.style.borderColor = ''
                  }
                }}
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

      {/* ══ Retrieval Settings ══ */}
      <section>
        <SectionLabel icon={<SlidersHorizontal className="w-3.5 h-3.5" />} title="Retrieval Settings" />

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-700">Context chunks</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Passages retrieved per question</p>
            </div>
            <span className="text-sm font-bold w-8 h-8 rounded-lg flex items-center justify-center border"
              style={{ backgroundColor: '#E0EEFD', color: '#016CE1', borderColor: 'rgba(1,108,225,0.25)' }}>
              {topK}
            </span>
          </div>

          <input
            type="range"
            min={1} max={15} step={1}
            value={topK}
            onChange={e => onTopKChange(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #016CE1 ${sliderPct}%, #e5e7eb ${sliderPct}%)`,
              accentColor: '#016CE1',
            }}
          />

          <div className="flex justify-between text-[9px] text-gray-400 font-medium">
            <span>1 · Precise</span>
            <span>15 · Broad</span>
          </div>
        </div>
      </section>

      <div className="border-t border-gray-100" />

      {/* ══ Chat Controls ══ */}
      <section>
        <SectionLabel icon={<MessageSquareX className="w-3.5 h-3.5" />} title="Chat Controls" />

        <button
          onClick={handleClearClick}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-medium transition-all"
          style={confirmClear
            ? { backgroundColor: '#ef4444', borderColor: '#ef4444', color: 'white' }
            : { backgroundColor: 'white', borderColor: '#e5e7eb', color: '#374151' }
          }
          onMouseEnter={e => {
            if (!confirmClear) {
              e.currentTarget.style.borderColor = '#fca5a5'
              e.currentTarget.style.color = '#ef4444'
              e.currentTarget.style.backgroundColor = '#fff1f2'
            }
          }}
          onMouseLeave={e => {
            if (!confirmClear) {
              e.currentTarget.style.borderColor = '#e5e7eb'
              e.currentTarget.style.color = '#374151'
              e.currentTarget.style.backgroundColor = 'white'
            }
          }}
        >
          <MessageSquareX className="w-3.5 h-3.5" />
          {confirmClear ? 'Tap again to confirm' : 'Clear Conversation'}
        </button>
        <p className="text-[10px] text-gray-400 text-center mt-1.5">
          Removes all messages from the current session
        </p>
      </section>

      <div className="border-t border-gray-100" />

      {/* ══ System Status ══ */}
      <section>
        <SectionLabel icon={<Activity className="w-3.5 h-3.5" />} title="System Status" />

        <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden text-xs bg-gray-50">
          <StatusRow
            label="Vector store"
            value={health ? 'Ready' : '—'}
            valueStyle={health ? { color: '#02B3A8' } : { color: '#9ca3af' }}
            dot={health ? '#02B3A8' : '#d1d5db'}
          />
          <StatusRow label="Documents" value={health ? String(health.collection_stats.total_documents) : '—'} />
          <StatusRow label="Chunks indexed" value={health ? String(health.collection_stats.total_chunks) : '—'} />
          <StatusRow label="Language model" value={health?.model ?? '—'} mono />
          <StatusRow label="Embedding model" value={health?.embedding_model ?? '—'} mono />
        </div>
      </section>
    </div>
  )
}

function StatusRow({
  label, value, valueStyle, dot, mono = false,
}: {
  label: string
  value: string
  valueStyle?: React.CSSProperties
  dot?: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-[11px] text-gray-500">{label}</span>
      <div className="flex items-center gap-1.5">
        {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot }} />}
        <span className={clsx('text-[11px] font-medium text-gray-700', mono && 'font-mono')} style={valueStyle}>
          {value}
        </span>
      </div>
    </div>
  )
}
