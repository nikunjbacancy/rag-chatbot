'use client'

import { useRef, useState } from 'react'
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
      <header className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white/90 backdrop-blur-md flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 shadow-md shadow-violet-300/50">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="currentColor" opacity="0.3"/>
              <path d="M12 3c-1.5 0-2.9.4-4.1 1.1L12 8l4.1-3.9C14.9 3.4 13.5 3 12 3z" fill="currentColor"/>
              <path d="M5 7.9L9 12l-4 4.1C3.4 14.9 3 12 3s.4-2.9 1-4.1z" fill="currentColor" opacity="0.7"/>
              <path d="M19 7.9C19.6 9.1 20 10.5 20 12s-.4 2.9-1 4.1L15 12l4-4.1z" fill="currentColor" opacity="0.7"/>
              <path d="M12 21c1.5 0 2.9-.4 4.1-1.1L12 16l-4.1 3.9C9.1 20.6 10.5 21 12 21z" fill="currentColor"/>
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 tracking-wide">SageBot</h1>
            <p className="text-[10px] text-violet-500 leading-none mt-0.5">Your wise document assistant</p>
          </div>
        </div>

        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-100 transition-all"
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
