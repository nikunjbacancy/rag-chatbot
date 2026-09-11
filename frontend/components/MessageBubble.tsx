'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatMessage } from '@/lib/api'
import SourceCitations from './SourceCitations'
import clsx from 'clsx'

interface MessageBubbleProps {
  message: ChatMessage
  isStreaming?: boolean
}

function formatTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

export default function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={clsx('flex gap-3 animate-fade-in', isUser ? 'flex-row-reverse' : 'flex-row')}>

      {/* Avatar */}
      <div className="flex-shrink-0 mt-0.5">
        {isUser ? (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white text-xs font-bold shadow-md shadow-violet-300/40">
            U
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shadow-md shadow-violet-300/40 border border-violet-200">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 3c-1.5 0-2.9.4-4.1 1.1L12 8l4.1-3.9C14.9 3.4 13.5 3 12 3z" fill="#e9d5ff"/>
              <path d="M5 7.9L9 12l-4 4.1C3.4 14.9 3 12 3 12s.4-2.9 1-4.1z" fill="#ddd6fe" opacity="0.9"/>
              <path d="M19 7.9C19.6 9.1 20 10.5 20 12s-.4 2.9-1 4.1L15 12l4-4.1z" fill="#ddd6fe" opacity="0.9"/>
              <path d="M12 21c1.5 0 2.9-.4 4.1-1.1L12 16l-4.1 3.9C9.1 20.6 10.5 21 12 21z" fill="#e9d5ff"/>
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className={clsx('flex flex-col gap-1 max-w-[78%] min-w-0', isUser ? 'items-end' : 'items-start')}>
        <div
          className={clsx(
            'px-4 py-3 rounded-2xl text-sm leading-relaxed break-words shadow-sm',
            isUser
              ? 'bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-tr-sm shadow-violet-200'
              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-gray-100',
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className={clsx('prose-chat', isStreaming && !message.content && 'min-h-[1.5rem]')}>
              {message.content ? (
                <div>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              ) : isStreaming ? (
                <div className="flex items-center gap-1.5 py-1">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-gray-400 px-1">{formatTime(message.timestamp)}</span>

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="w-full px-1">
            <SourceCitations sources={message.sources} />
          </div>
        )}
      </div>
    </div>
  )
}
