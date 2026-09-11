'use client'

import { useState, useRef, useEffect, useCallback, MutableRefObject } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Send, Sparkles, Zap, BookOpen, Brain, Search } from 'lucide-react'
import { chatApi, ChatMessage, Source } from '@/lib/api'
import MessageBubble from './MessageBubble'
import clsx from 'clsx'

const EXAMPLE_PROMPTS = [
  { icon: <BookOpen className="w-3.5 h-3.5" />, text: 'Summarise the key topics in my documents' },
  { icon: <Search className="w-3.5 h-3.5" />,   text: 'What are the main findings or conclusions?' },
  { icon: <Brain className="w-3.5 h-3.5" />,    text: 'Explain the most important concepts' },
  { icon: <Zap className="w-3.5 h-3.5" />,      text: 'List the action items or next steps' },
]

interface UIMessage extends ChatMessage {
  id: string
  isStreaming?: boolean
}

function makeUserMsg(content: string): UIMessage {
  return { id: uuidv4(), role: 'user', content, timestamp: new Date().toISOString() }
}
function makeAssistantPlaceholder(): UIMessage {
  return { id: uuidv4(), role: 'assistant', content: '', timestamp: new Date().toISOString(), isStreaming: true, sources: [] }
}

interface Props {
  topK: number
  clearChatRef: MutableRefObject<() => void>
}

export default function ChatInterface({ topK, clearChatRef }: Props) {
  const [messages, setMessages]         = useState<UIMessage[]>([])
  const [inputValue, setInputValue]     = useState('')
  const [isStreaming, setIsStreaming]   = useState(false)
  const [conversationId, setConversationId] = useState<string>(() => uuidv4())
  const [error, setError]               = useState<string | null>(null)

  const bottomRef         = useRef<HTMLDivElement>(null)
  const inputRef          = useRef<HTMLTextAreaElement>(null)
  const assistantMsgIdRef = useRef<string | null>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleClear = useCallback(async () => {
    try { if (messages.length > 0) await chatApi.deleteConversation(conversationId).catch(() => {}) }
    finally {
      setMessages([])
      setConversationId(uuidv4())
      setError(null)
      setIsStreaming(false)
      assistantMsgIdRef.current = null
    }
  }, [conversationId, messages.length])

  // Expose clear to sidebar via ref
  useEffect(() => { clearChatRef.current = handleClear }, [handleClear, clearChatRef])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim()
    if (!trimmed || isStreaming) return

    setInputValue('')
    setError(null)
    if (inputRef.current) inputRef.current.style.height = 'auto'

    const userMsg = makeUserMsg(trimmed)
    const assistantPlaceholder = makeAssistantPlaceholder()
    assistantMsgIdRef.current = assistantPlaceholder.id

    setMessages(prev => [...prev, userMsg, assistantPlaceholder])
    setIsStreaming(true)

    try {
      const returnedId = await chatApi.streamMessage(
        { message: trimmed, conversation_id: conversationId, top_k: topK },
        (token: string) => setMessages(prev => prev.map(m =>
          m.id === assistantMsgIdRef.current ? { ...m, content: m.content + token } : m
        )),
        (sources: Source[]) => setMessages(prev => prev.map(m =>
          m.id === assistantMsgIdRef.current ? { ...m, sources } : m
        )),
        () => {
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgIdRef.current ? { ...m, isStreaming: false } : m
          ))
          setIsStreaming(false)
          assistantMsgIdRef.current = null
        },
        (errMsg: string) => {
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgIdRef.current
              ? { ...m, content: `Sorry, an error occurred: ${errMsg}`, isStreaming: false }
              : m
          ))
          setError(errMsg)
          setIsStreaming(false)
        },
      )
      if (returnedId && returnedId !== conversationId) setConversationId(returnedId)
    } catch (err: any) {
      const msg = err.message || 'Failed to connect to the backend.'
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgIdRef.current
          ? { ...m, content: `Something went wrong: ${msg}`, isStreaming: false }
          : m
      ))
      setError(msg)
      setIsStreaming(false)
      assistantMsgIdRef.current = null
    }
  }, [inputValue, isStreaming, conversationId, topK])

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 flex-shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-500 shadow-sm shadow-violet-400/50" />
          <span className="text-xs text-gray-500">
            {messages.length === 0
              ? 'New conversation'
              : `${Math.ceil(messages.length / 2)} exchange${messages.length > 2 ? 's' : ''}`}
          </span>
        </div>
        <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md font-mono">
          top-k · {topK}
        </span>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-7 text-center px-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full blur-2xl bg-violet-400/20 scale-150" />
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-xl shadow-violet-300/40 border border-violet-200">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3c-1.5 0-2.9.4-4.1 1.1L12 8l4.1-3.9C14.9 3.4 13.5 3 12 3z" fill="#e9d5ff"/>
                  <path d="M5 7.9L9 12l-4 4.1C3.4 14.9 3 12 3 12s.4-2.9 2-4.1z" fill="#c4b5fd" opacity="0.8"/>
                  <path d="M19 7.9C20.6 9.1 21 10.5 21 12s-.6 2.9-2 4.1L15 12l4-4.1z" fill="#c4b5fd" opacity="0.8"/>
                  <path d="M12 21c1.5 0 2.9-.4 4.1-1.1L12 16l-4.1 3.9C9.1 20.6 10.5 21 12 21z" fill="#e9d5ff"/>
                </svg>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900">Hello, I'm SageBot</h2>
              <p className="text-sm text-gray-500 mt-2 max-w-md leading-relaxed">
                Upload documents in the panel and ask me anything about them.
                I'll retrieve the most relevant information and cite my sources.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
              {EXAMPLE_PROMPTS.map(({ icon, text }) => (
                <button
                  key={text}
                  onClick={() => { setInputValue(text); inputRef.current?.focus() }}
                  className="flex items-center gap-2.5 text-left px-4 py-3 rounded-xl border border-gray-200 bg-white hover:bg-violet-50 hover:border-violet-300 transition-all text-xs text-gray-600 hover:text-violet-700 group shadow-sm"
                >
                  <span className="text-violet-500 group-hover:text-violet-600 flex-shrink-0">{icon}</span>
                  {text}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-violet-400" />
              Hybrid vector + BM25 retrieval · Source citations · Streaming responses
            </p>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} isStreaming={msg.isStreaming ?? false} />
          ))
        )}

        {error && (
          <div className="mx-auto max-w-md text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-center">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 px-5 pb-5 pt-3 border-t border-gray-200 bg-white">
        <div className={clsx(
          'flex items-end gap-3 rounded-2xl px-4 py-3 border transition-all duration-200',
          'bg-white border-gray-200',
          'focus-within:border-violet-400 focus-within:shadow-lg focus-within:shadow-violet-100',
        )}>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Ask a question about your documents… (Enter to send)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 resize-none outline-none min-h-[1.4rem] max-h-40 overflow-y-auto disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isStreaming}
            className={clsx(
              'flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all',
              inputValue.trim() && !isStreaming
                ? 'bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white shadow-md shadow-violet-300/50'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed',
            )}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-2">
          Powered by Gemini · RAG pipeline · answers grounded in your documents
        </p>
      </div>
    </div>
  )
}
