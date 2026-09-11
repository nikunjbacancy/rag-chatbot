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
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md"
            style={{ background: 'linear-gradient(135deg, #016CE1, #011942)' }}
          >
            U
          </div>
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shadow-md border border-gray-100 bg-white overflow-hidden"
          >
            {/* Teal "S" monogram for bot */}
            <span className="text-sm font-black" style={{ color: '#02B3A8' }}>S</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className={clsx('flex flex-col gap-1 max-w-[78%] min-w-0', isUser ? 'items-end' : 'items-start')}>
        <div
          className={clsx(
            'px-4 py-3 rounded-2xl text-sm leading-relaxed break-words shadow-sm',
            isUser
              ? 'text-white rounded-tr-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm',
          )}
          style={isUser ? { background: 'linear-gradient(135deg, #016CE1, #011942)' } : undefined}
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

        <span className="text-[10px] text-gray-400 px-1">{formatTime(message.timestamp)}</span>

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="w-full px-1">
            <SourceCitations sources={message.sources} />
          </div>
        )}
      </div>
    </div>
  )
}
