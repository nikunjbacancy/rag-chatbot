'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, BookOpenCheck, FileText, Hash } from 'lucide-react'
import { Source } from '@/lib/api'

export default function SourceCitations({ sources }: { sources: Source[] }) {
  const [expanded, setExpanded] = useState(false)
  if (!sources || sources.length === 0) return null

  return (
    <div className="mt-2.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-gray-400 transition-colors group"
        onMouseEnter={e => e.currentTarget.style.color = '#016CE1'}
        onMouseLeave={e => e.currentTarget.style.color = ''}
      >
        <BookOpenCheck className="w-3.5 h-3.5" style={{ color: '#016CE1' }} />
        <span>{sources.length} source{sources.length !== 1 ? 's' : ''} used</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-2.5 space-y-2">
          {sources.map((s, i) => {
            const pct = Math.max(8, Math.min(100, Math.round(s.relevance_score * 3000)))
            return (
              <div
                key={`${s.document_id}-${i}`}
                className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2 animate-fade-in"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText className="w-3 h-3 flex-shrink-0" style={{ color: '#016CE1' }} />
                    <span className="text-[11px] font-medium text-gray-700 truncate" title={s.document_name}>
                      {s.document_name}
                    </span>
                  </div>
                  <span className="flex-shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-md border font-medium"
                    style={{ color: '#016CE1', backgroundColor: '#E0EEFD', borderColor: 'rgba(1,108,225,0.25)' }}>
                    [{i + 1}]
                  </span>
                </div>

                {s.page_number != null && (
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Hash className="w-2.5 h-2.5" />Page {s.page_number}
                  </div>
                )}

                <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-3 italic pl-2"
                  style={{ borderLeft: '2px solid #02B3A8' }}>
                  {s.chunk_text}
                </p>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">Relevance</span>
                  <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: 'linear-gradient(to right, #016CE1, #02B3A8)' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
