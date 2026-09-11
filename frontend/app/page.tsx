'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import ChatInterface from '@/components/ChatInterface'
import DocumentManager from '@/components/DocumentManager'

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [topK, setTopK] = useState(5)
  const clearChatRef = useRef<() => void>(() => {})

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 bg-white flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="SageBot"
            width={44}
            height={44}
            className="rounded-xl object-contain"
            priority
          />
          <div>
            <h1 className="text-sm font-bold tracking-wide" style={{ color: '#011942' }}>SageBot</h1>
            <p className="text-[10px] leading-none mt-0.5" style={{ color: '#02B3A8' }}>Your wise document assistant</p>
          </div>
        </div>

        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex items-center gap-1.5 text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 transition-all"
          style={{ ['--hover-color' as string]: '#016CE1' }}
          onMouseEnter={e => {
            const el = e.currentTarget
            el.style.borderColor = '#016CE1'
            el.style.color = '#016CE1'
            el.style.backgroundColor = '#E0EEFD'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget
            el.style.borderColor = ''
            el.style.color = ''
            el.style.backgroundColor = ''
          }}
        >
          {sidebarOpen
            ? <><PanelLeftClose className="w-3.5 h-3.5" /> Hide Panel</>
            : <><PanelLeftOpen  className="w-3.5 h-3.5" /> Show Panel</>
          }
        </button>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <aside className="w-72 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
            <DocumentManager
              topK={topK}
              onTopKChange={setTopK}
              onClearChat={() => clearChatRef.current()}
            />
          </aside>
        )}

        <main className="flex-1 overflow-hidden">
          <ChatInterface topK={topK} clearChatRef={clearChatRef} />
        </main>
      </div>
    </div>
  )
}
