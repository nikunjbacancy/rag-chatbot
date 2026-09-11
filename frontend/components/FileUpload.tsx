'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { UploadCloud, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { documentsApi, DocumentResponse } from '@/lib/api'
import clsx from 'clsx'

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
  'text/csv': ['.csv'],
  'application/csv': ['.csv'],
}

type State = 'idle' | 'uploading' | 'success' | 'error'

export default function FileUpload({ onUploadComplete }: { onUploadComplete: (doc: DocumentResponse) => void }) {
  const [state, setState]       = useState<State>('idle')
  const [feedback, setFeedback] = useState('')
  const [progress, setProgress] = useState(0)

  const onDrop = useCallback(async (accepted: File[], rejected: any[]) => {
    if (rejected.length > 0) {
      setFeedback(rejected[0]?.errors?.[0]?.message || 'File rejected')
      setState('error')
      setTimeout(() => setState('idle'), 4000)
      return
    }
    if (!accepted.length) return

    const file = accepted[0]
    setState('uploading')
    setFeedback(`Uploading ${file.name}…`)
    setProgress(0)

    const interval = setInterval(() => setProgress(p => Math.min(p + 12, 88)), 200)
    try {
      const doc = await documentsApi.upload(file)
      clearInterval(interval)
      setProgress(100)
      setState('success')
      setFeedback(`"${file.name}" uploaded!`)
      onUploadComplete(doc)
      setTimeout(() => { setState('idle'); setFeedback(''); setProgress(0) }, 3000)
    } catch (e: any) {
      clearInterval(interval)
      setState('error')
      setFeedback(e.message || 'Upload failed')
      setTimeout(() => { setState('idle'); setFeedback(''); setProgress(0) }, 5000)
    }
  }, [onUploadComplete])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 50 * 1024 * 1024,
    multiple: false,
    disabled: state === 'uploading',
  })

  return (
    <div
      {...getRootProps()}
      className={clsx(
        'relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 select-none',
        state === 'uploading' && 'cursor-not-allowed opacity-70',
        state === 'success'   && 'border-emerald-400 bg-emerald-50',
        state === 'error'     && 'border-red-400 bg-red-50',
      )}
      style={
        state === 'idle' || state === 'uploading'
          ? isDragActive
            ? { borderColor: '#016CE1', backgroundColor: '#E0EEFD' }
            : { borderColor: '#d1d5db', backgroundColor: 'white' }
          : undefined
      }
      onMouseEnter={e => {
        if (state === 'idle' && !isDragActive)
          e.currentTarget.style.borderColor = '#016CE1'
      }}
      onMouseLeave={e => {
        if (state === 'idle' && !isDragActive)
          e.currentTarget.style.borderColor = '#d1d5db'
      }}
    >
      <input {...getInputProps()} />

      <div className="flex flex-col items-center gap-2">
        {state === 'uploading' && <Loader2      className="w-7 h-7 animate-spin" style={{ color: '#016CE1' }} />}
        {state === 'success'   && <CheckCircle2 className="w-7 h-7 text-emerald-500" />}
        {state === 'error'     && <XCircle      className="w-7 h-7 text-red-500" />}
        {state === 'idle'      && (
          <UploadCloud className="w-7 h-7 transition-colors"
            style={{ color: isDragActive ? '#016CE1' : '#9ca3af' }} />
        )}

        <div>
          {state === 'idle' ? (
            <>
              <p className="text-xs font-medium text-gray-700">
                {isDragActive ? 'Drop your file here' : 'Drag & drop or click to upload'}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">PDF, DOCX, TXT, MD, CSV — max 50 MB</p>
            </>
          ) : (
            <p className={clsx('text-xs font-medium',
              state === 'success' && 'text-emerald-600',
              state === 'error'   && 'text-red-600',
            )}
            style={state === 'uploading' ? { color: '#016CE1' } : undefined}>
              {feedback}
            </p>
          )}
        </div>
      </div>

      {state === 'uploading' && (
        <div className="mt-3 w-full bg-gray-200 rounded-full h-1 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, background: 'linear-gradient(to right, #016CE1, #02B3A8)' }}
          />
        </div>
      )}
    </div>
  )
}
