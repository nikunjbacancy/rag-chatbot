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
        className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-violet-600 transition-colors group"
      >
        <BookOpenCheck className="w-3.5 h-3.5 text-violet-500 group-hover:text-violet-600" />
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
                    <FileText className="w-3 h-3 text-violet-400 flex-shrink-0" />
                    <span className="text-[11px] font-medium text-gray-700 truncate" title={s.document_name}>
                      {s.document_name}
                    </span>
                  </div>
                  <span className="flex-shrink-0 text-[10px] font-mono text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-md">
                    [{i + 1}]
                  </span>
                </div>

                {s.page_number != null && (
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Hash className="w-2.5 h-2.5" />Page {s.page_number}
                  </div>
                )}

                <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-3 italic border-l-2 border-violet-300 pl-2">
                  {s.chunk_text}
                </p>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">Relevance</span>
                  <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-purple-400 rounded-full" style={{ width: `${pct}%` }} />
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
