const API_BASE = '/api'
// SSE streaming must bypass the Next.js dev proxy (which buffers SSE)
const BACKEND_DIRECT = 'http://localhost:8000'

// ------------------------------------------------------------------ //
// TypeScript interfaces matching backend schemas                       //
// ------------------------------------------------------------------ //

export type DocumentStatus = 'processing' | 'ready' | 'failed'

export interface DocumentResponse {
  id: string
  filename: string
  file_type: string
  status: DocumentStatus
  chunk_count: number
  created_at: string
  size_bytes: number
  error_message?: string | null
}

export interface DocumentListResponse {
  documents: DocumentResponse[]
  total: number
}

export interface Source {
  document_id: string
  document_name: string
  chunk_text: string
  page_number?: number | null
  relevance_score: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[] | null
  timestamp: string
}

export interface ChatRequest {
  message: string
  conversation_id?: string
  top_k?: number
}

export interface ChatResponse {
  message: ChatMessage
  conversation_id: string
}

export interface DeleteResponse {
  success: boolean
  message: string
}

export interface HealthStatus {
  status: string
  model: string
  embedding_model: string
  collection_stats: {
    total_chunks: number
    total_documents: number
  }
}

// ------------------------------------------------------------------ //
// SSE event types for streaming                                        //
// ------------------------------------------------------------------ //

export type SSETokenEvent = { type: 'token'; content: string }
export type SSESourcesEvent = { type: 'sources'; sources: Source[] }
export type SSEDoneEvent = { type: 'done' }
export type SSEErrorEvent = { type: 'error'; content: string }
export type SSEEvent = SSETokenEvent | SSESourcesEvent | SSEDoneEvent | SSEErrorEvent

// ------------------------------------------------------------------ //
// System API                                                           //
// ------------------------------------------------------------------ //

export const systemApi = {
  health: async (): Promise<HealthStatus> => {
    const res = await fetch(`${BACKEND_DIRECT}/health`)
    if (!res.ok) throw new Error('Health check failed')
    return res.json()
  },
}

// ------------------------------------------------------------------ //
// Documents API                                                        //
// ------------------------------------------------------------------ //

export const documentsApi = {
  upload: async (file: File): Promise<DocumentResponse> => {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}))
      throw new Error(errorBody?.detail || `Upload failed: ${res.status}`)
    }

    return res.json()
  },

  list: async (): Promise<DocumentListResponse> => {
    const res = await fetch(`${API_BASE}/documents/`)
    if (!res.ok) {
      throw new Error(`Failed to fetch documents: ${res.status}`)
    }
    return res.json()
  },

  get: async (id: string): Promise<DocumentResponse> => {
    const res = await fetch(`${API_BASE}/documents/${id}`)
    if (!res.ok) {
      throw new Error(`Failed to fetch document: ${res.status}`)
    }
    return res.json()
  },

  delete: async (id: string): Promise<DeleteResponse> => {
    const res = await fetch(`${API_BASE}/documents/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}))
      throw new Error(errorBody?.detail || `Delete failed: ${res.status}`)
    }
    return res.json()
  },
}

// ------------------------------------------------------------------ //
// Chat API                                                             //
// ------------------------------------------------------------------ //

export const chatApi = {
  /**
   * Stream a chat message.
   * Parses SSE events and calls the appropriate callback for each.
   * Returns the conversation_id extracted from the response header.
   */
  streamMessage: async (
    request: ChatRequest,
    onToken: (token: string) => void,
    onSources: (sources: Source[]) => void,
    onDone: () => void,
    onError?: (message: string) => void,
  ): Promise<string> => {
    const res = await fetch(`${BACKEND_DIRECT}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    const conversationId =
      res.headers.get('X-Conversation-Id') || request.conversation_id || ''

    if (!res.ok || !res.body) {
      const errorBody = await res.json().catch(() => ({}))
      throw new Error(errorBody?.detail || `Stream request failed: ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE events are separated by double newlines
      const parts = buffer.split('\n\n')
      // Keep the last incomplete part in the buffer
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data:')) continue

        const jsonStr = line.slice('data:'.length).trim()
        if (!jsonStr) continue

        let event: SSEEvent
        try {
          event = JSON.parse(jsonStr)
        } catch {
          // Partial / malformed JSON — skip gracefully
          continue
        }

        if (event.type === 'token') {
          onToken(event.content)
        } else if (event.type === 'sources') {
          onSources(event.sources)
        } else if (event.type === 'done') {
          onDone()
        } else if (event.type === 'error') {
          onError?.(event.content)
          onDone()
        }
      }
    }

    return conversationId
  },

  sendMessage: async (request: ChatRequest): Promise<ChatResponse> => {
    const res = await fetch(`${API_BASE}/chat/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}))
      throw new Error(errorBody?.detail || `Chat request failed: ${res.status}`)
    }
    return res.json()
  },

  getConversation: async (conversationId: string) => {
    const res = await fetch(`${API_BASE}/chat/conversations/${conversationId}`)
    if (!res.ok) {
      throw new Error(`Failed to fetch conversation: ${res.status}`)
    }
    return res.json()
  },

  deleteConversation: async (conversationId: string): Promise<DeleteResponse> => {
    const res = await fetch(`${API_BASE}/chat/conversations/${conversationId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      throw new Error(`Failed to delete conversation: ${res.status}`)
    }
    return res.json()
  },
}
