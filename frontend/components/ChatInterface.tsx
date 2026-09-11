'use client'

import { useState, useRef, useEffect, useCallback, MutableRefObject } from 'react'
import Image from 'next/image'
import { v4 as uuidv4 } from 'uuid'
import { Send, Sparkles, Zap, BookOpen, Brain, Search, Loader2 } from 'lucide-react'
import { chatApi, ChatMessage, Source } from '@/lib/api'
import MessageBubble from './MessageBubble'
import clsx from 'clsx'

const EXAMPLE_PROMPTS = [
  {
    icon: <BookOpen className="w-3.5 h-3.5" />,
    title: 'Key Topics',
    hint: 'Get a high-level overview of your documents',
    prompt: 'Summarise the key topics in my documents',
  },
  {
    icon: <Search className="w-3.5 h-3.5" />,
    title: 'Main Findings',
    hint: 'What conclusions or results were drawn?',
    prompt: 'What are the main findings or conclusions?',
  },
  {
    icon: <Brain className="w-3.5 h-3.5" />,
    title: 'Core Concepts',
    hint: 'Break down the most important ideas',
    prompt: 'Explain the most important concepts',
  },
  {
    icon: <Zap className="w-3.5 h-3.5" />,
    title: 'Action Items',
    hint: 'Extract next steps and tasks to act on',
    prompt: 'List the action items or next steps',
  },
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
  const [inputFocused, setInputFocused] = useState(false)

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
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#016CE1' }} />
          <span className="text-xs text-gray-500">
            {messages.length === 0
              ? 'New conversation'
              : `${Math.ceil(messages.length / 2)} exchange${messages.length > 2 ? 's' : ''}`}
          </span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md font-medium"
          style={{ backgroundColor: '#E0EEFD', color: '#016CE1' }}>
          top-k · {topK}
        </span>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-7 text-center px-6">

            {/* Logo */}
            <Image
              src="/logo.png"
              alt="SageBot"
              width={92}
              height={92}
              className="object-contain"
            />

            {/* Hero text */}
            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#011942' }}>
                Hello, I'm SageBot
              </h2>
              <p className="text-sm font-medium" style={{ color: '#02B3A8' }}>
                Your AI assistant for intelligent document Q&amp;A
              </p>
              <p className="text-xs text-gray-400 mt-2 max-w-sm mx-auto leading-relaxed">
                Upload a document in the panel, then ask me anything —
                I'll find the most relevant passages and cite every source.
              </p>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 w-full max-w-md">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[11px] text-gray-400 font-medium tracking-wide">Try asking</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Prompt cards */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
              {EXAMPLE_PROMPTS.map(({ icon, title, hint, prompt }) => (
                <button
                  key={prompt}
                  onClick={() => { setInputValue(prompt); inputRef.current?.focus() }}
                  className="flex flex-col items-start gap-2.5 text-left p-4 rounded-xl border border-gray-200 bg-white shadow-sm transition-all"
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#016CE1'
                    e.currentTarget.style.backgroundColor = '#E0EEFD'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = ''
                    e.currentTarget.style.backgroundColor = ''
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#E0EEFD' }}
                  >
                    <span style={{ color: '#016CE1' }}>{icon}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{hint}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Feature pills */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {[
                { icon: <Search className="w-3 h-3" />, label: 'Hybrid Search' },
                { icon: <Sparkles className="w-3 h-3" />, label: 'Source Citations' },
                { icon: <Zap className="w-3 h-3" />, label: 'Live Streaming' },
              ].map(({ icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border"
                  style={{ backgroundColor: '#E0EEFD', color: '#016CE1', borderColor: 'rgba(1,108,225,0.2)' }}
                >
                  {icon}{label}
                </span>
              ))}
            </div>

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
      <div className="flex-shrink-0 px-4 pb-4 pt-3 border-t border-gray-200 bg-white">
        <div
          className="rounded-2xl border bg-white transition-all duration-200 overflow-hidden"
          style={{
            borderColor: inputFocused ? '#016CE1' : '#e5e7eb',
            boxShadow: inputFocused
              ? '0 0 0 3px rgba(1,108,225,0.10), 0 1px 4px rgba(0,0,0,0.06)'
              : '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            disabled={isStreaming}
            placeholder="Ask anything about your documents…"
            rows={1}
            className="w-full px-4 pt-3.5 pb-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 resize-none outline-none min-h-[2.2rem] max-h-40 overflow-y-auto disabled:opacity-60"
          />

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
            {isStreaming ? (
              <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: '#016CE1' }}>
                <Loader2 className="w-3 h-3 animate-spin" />
                Generating response…
              </span>
            ) : (
              <span className="text-[11px] text-gray-400">
                ↵ Send &nbsp;·&nbsp; ⇧↵ New line
              </span>
            )}

            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isStreaming}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: inputValue.trim() && !isStreaming
                  ? 'linear-gradient(135deg, #016CE1, #011942)'
                  : '#f3f4f6',
                color: inputValue.trim() && !isStreaming ? '#ffffff' : '#9ca3af',
              }}
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
