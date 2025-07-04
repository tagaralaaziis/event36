"use client"
import React, { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import { ArrowLeft } from 'lucide-react'

const FONT_FAMILIES = [
  { label: 'Helvetica', value: 'Helvetica' },
  { label: 'Times Roman', value: 'Times Roman' },
  { label: 'Courier', value: 'Courier' },
]

const DEFAULT_FIELDS = [
  { key: 'name', label: 'Nama Peserta', color: 'bg-blue-500', fontFamily: 'Helvetica', fontSize: 24, bold: false, italic: false },
  { key: 'event', label: 'Nama Event', color: 'bg-green-500', fontFamily: 'Helvetica', fontSize: 24, bold: false, italic: false },
  { key: 'number', label: 'Nomor Sertifikat', color: 'bg-purple-500', fontFamily: 'Helvetica', fontSize: 18, bold: false, italic: false },
  { key: 'date', label: 'Tanggal', color: 'bg-yellow-500', fontFamily: 'Helvetica', fontSize: 18, bold: false, italic: false },
  { key: 'token', label: 'Token', color: 'bg-pink-500', fontFamily: 'Helvetica', fontSize: 14, bold: false, italic: false },
]

export default function GenerateCertificatesPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id
  const [template, setTemplate] = useState<File | null>(null)
  const [templateUrl, setTemplateUrl] = useState<string | null>(null)
  const [fields, setFields] = useState(DEFAULT_FIELDS.map((f, i) => ({ ...f, x: 40 + i * 140, y: 30, active: true })))
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const imgRef = useRef<HTMLImageElement>(null)
  const [saving, setSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [templateSize, setTemplateSize] = useState<{ width: number, height: number } | null>(null)
  const [participants, setParticipants] = useState<any[]>([])
  const [selectedParticipant, setSelectedParticipant] = useState<string>('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch template data
        const templateRes = await fetch(`/api/events/${eventId}/generate-certificates/template`)
        if (templateRes.ok) {
          const templateData = await templateRes.json()
          setTemplateUrl(templateData.templateUrl)
          setFields(templateData.fields || DEFAULT_FIELDS.map((f, i) => ({ ...f, x: 40 + i * 140, y: 30, active: true })))
          setTemplateSize(templateData.templateSize)
        }

        // Fetch participants
        const participantsRes = await fetch(`/api/events/${eventId}`)
        if (participantsRes.ok) {
          const eventData = await participantsRes.json()
          setParticipants(eventData.participants || [])
          if (eventData.participants && eventData.participants.length > 0) {
            setSelectedParticipant(eventData.participants[0].id)
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error)
      }
    }
    fetchData()
  }, [eventId])

  // Perhitungan preview canvas: selalu aspect ratio A4 agar posisi field identik dengan PDF
  const A4_WIDTH = 842, A4_HEIGHT = 595
  const PREVIEW_MAX_WIDTH = 420
  const PREVIEW_MAX_HEIGHT = 297
  let widthPreview = PREVIEW_MAX_WIDTH, heightPreview = PREVIEW_MAX_HEIGHT
  if (templateSize) {
    // Selalu pakai aspect ratio A4
    widthPreview = PREVIEW_MAX_WIDTH
    heightPreview = PREVIEW_MAX_WIDTH * (A4_HEIGHT / A4_WIDTH)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setTemplate(file)
      const url = URL.createObjectURL(file)
      setTemplateUrl(url)
      
      const img = new window.Image()
      img.onload = () => {
        setTemplateSize({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.src = url
    }
  }

  // Refactor drag & drop: parent menangani semua event
  const previewRef = useRef<HTMLDivElement>(null)

  // Simpan posisi offset saat mulai drag
  const handleFieldPointerDown = (idx: number, clientX: number, clientY: number) => {
    setDragIndex(idx)
    if (!templateSize) return
    const preview = previewRef.current
    if (!preview) return
    const rect = preview.getBoundingClientRect()
    setOffset({
      x: clientX - (fields[idx].x / templateSize.width) * widthPreview - rect.left,
      y: clientY - (fields[idx].y / templateSize.height) * heightPreview - rect.top,
    })
  }

  // Handler drag di parent
  const handlePointerMove = (clientX: number, clientY: number) => {
    if (dragIndex === null || !templateSize) return
    const preview = previewRef.current
    if (!preview) return
    const rect = preview.getBoundingClientRect()
    let x = ((clientX - offset.x - rect.left) / widthPreview) * templateSize.width
    let y = ((clientY - offset.y - rect.top) / heightPreview) * templateSize.height
    // Clamp agar tidak keluar area
    x = Math.max(0, Math.min(x, templateSize.width - 1))
    y = Math.max(0, Math.min(y, templateSize.height - 1))
    setFields(f => f.map((field, i) => i === dragIndex ? { ...field, x, y } : field))
  }

  // Handler mouse/touch event di parent
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragIndex !== null) {
      handlePointerMove(e.clientX, e.clientY)
    }
  }
  const handleMouseUp = () => setDragIndex(null)
  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragIndex !== null && e.touches.length > 0) {
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY)
    }
  }
  const handleTouchEnd = () => setDragIndex(null)

  // Toggle field aktif
  const handleToggleField = (key: string, checked: boolean) => {
    setFields(f => f.map(field => field.key === key ? { ...field, active: checked } : field))
  }

  // Simpan template & posisi ke backend
  const handleSave = async () => {
    if (!templateUrl || !templateSize) return toast.error('Upload template terlebih dahulu!')
    setSaving(true)
    
    const formData = new FormData()
    if (template) formData.append('template', template)
    formData.append('fields', JSON.stringify(fields))
    
    const res = await fetch(`/api/events/${eventId}/generate-certificates/template`, { method: 'POST', body: formData })
    if (res.ok) toast.success('Template & posisi field berhasil disimpan!')
    else toast.error('Gagal menyimpan template!')
    setSaving(false)
  }

  // Preview sertifikat (ambil dari backend)
  const handlePreview = async () => {
    if (!templateUrl || !templateSize) return toast.error('Upload template terlebih dahulu!')
    
    setPreviewUrl(null)
    toast.loading('Generating preview...', { id: 'preview' })
    
    const res = await fetch(`/api/events/${eventId}/generate-certificates/preview`, {
      method: 'POST',
      body: JSON.stringify({ 
        fields, 
        templateSize,
        participantId: selectedParticipant || 'SAMPLE_PARTICIPANT_ID'
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (res.ok) {
      const blob = await res.blob()
      setPreviewUrl(URL.createObjectURL(blob))
      toast.success('Preview generated!', { id: 'preview' })
    } else {
      const error = await res.json()
      toast.error(error.error || 'Gagal generate preview!', { id: 'preview' })
    }
  }

  // Generate batch sertifikat
  const handleGenerate = async () => {
    if (!templateUrl || !templateSize) return toast.error('Upload template terlebih dahulu!')
    
    setGenerating(true)
    toast.loading('Generating certificates...', { id: 'generate' })
    
    const res = await fetch(`/api/events/${eventId}/generate-certificates/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (res.ok) {
      const result = await res.json()
      toast.success(result.message, { id: 'generate' })
    } else {
      const error = await res.json()
      toast.error(error.error || 'Gagal generate sertifikat!', { id: 'generate' })
    }
    setGenerating(false)
  }

  return (
    <div className="min-h-screen bg-white w-full">
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Generate Certificates</h1>
              <p className="text-sm text-gray-500">Design and generate certificates for event participants.</p>
            </div>
            <button onClick={() => router.back()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400">
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Event</span>
            </button>
          </div>
        </div>
      </header>
      
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-8 py-4 sm:py-8">
        <Toaster position="top-right" />
        
        <div className="bg-white rounded-lg shadow-lg p-4">
          <p className="mb-2 text-gray-600 text-sm">Upload template sertifikat (PNG/JPG, ukuran A4), lalu atur posisi field secara interaktif.</p>
          
          <input type="file" accept="image/png,image/jpeg" onChange={handleFileChange} className="mb-2 w-full max-w-full" />
          
          {/* Participant Selection */}
          {participants.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preview dengan data peserta:
              </label>
              <select
                value={selectedParticipant}
                onChange={(e) => setSelectedParticipant(e.target.value)}
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Sample Data</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.email})
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-4">
            {fields.map((f, idx) => (
              <div
                key={f.key}
                className={`flex flex-col gap-2 p-3 rounded-xl border shadow-sm transition-all bg-white relative group
                  ${f.active ? 'border-purple-500 ring-1 ring-purple-200' : 'border-gray-200 opacity-70'}
                `}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={f.active}
                    onChange={e => handleToggleField(f.key, e.target.checked)}
                    className="accent-purple-600 w-5 h-5 rounded focus:ring-2 focus:ring-purple-400 transition-all cursor-pointer border-2 border-gray-300"
                    id={`field-active-${f.key}`}
                  />
                  <label htmlFor={`field-active-${f.key}`} className="font-semibold text-base text-gray-800 select-none cursor-pointer">
                    {f.label}
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <select
                    value={f.fontFamily}
                    onChange={e => {
                      setFields(f => f.map((field, i) => i === idx ? { ...field, fontFamily: e.target.value } : field))
                    }}
                    className="flex-1 rounded-md border px-2 py-1 text-xs focus:ring-1 focus:ring-purple-400"
                    title="Font Family"
                  >
                    {FONT_FAMILIES.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={8}
                    max={72}
                    value={f.fontSize}
                    onChange={e => {
                      setFields(f => f.map((field, i) => i === idx ? { ...field, fontSize: Number(e.target.value) } : field))
                    }}
                    className="w-16 rounded-md border px-2 py-1 text-xs focus:ring-1 focus:ring-purple-400"
                    title="Font Size"
                  />
                  <label className="flex items-center gap-1 cursor-pointer pl-2">
                    <input
                      type="checkbox"
                      checked={!!f.bold}
                      onChange={e => {
                        setFields(f => f.map((field, i) => i === idx ? { ...field, bold: e.target.checked } : field))
                      }}
                      className="accent-purple-600 w-4 h-4 rounded cursor-pointer"
                      title="Bold"
                    />
                    <span className="font-bold text-sm text-gray-700">B</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!f.italic}
                      onChange={e => {
                        setFields(f => f.map((field, i) => i === idx ? { ...field, italic: e.target.checked } : field))
                      }}
                      className="accent-purple-600 w-4 h-4 rounded cursor-pointer"
                      title="Italic"
                    />
                    <span className="italic text-sm text-gray-700">I</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
          
          {templateUrl && templateSize && (
            <>
              {/* Warning jika aspect ratio template tidak sama dengan A4 */}
              {Math.abs((templateSize.width / templateSize.height) - (A4_WIDTH / A4_HEIGHT)) > 0.01 && (
                <div className="mb-2 p-2 bg-yellow-100 text-yellow-800 rounded text-xs font-semibold">
                  <b>Warning:</b> Aspect ratio template ({templateSize.width}x{templateSize.height}) tidak sama dengan A4 (842x595). Posisi field di hasil PDF bisa melenceng. Disarankan upload template berukuran 842x595 pixel.
                </div>
              )}
              <div
                ref={previewRef}
                className="template-preview relative border rounded-lg overflow-x-auto overflow-y-auto mt-4 shadow-lg bg-white mx-auto w-full"
                style={{ width: widthPreview, height: heightPreview, maxWidth: '100%', maxHeight: '70vw', minHeight: 180, aspectRatio: '842/595' }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <img
                  ref={imgRef}
                  src={templateUrl}
                  alt="Template Preview"
                  className="w-full h-full object-contain select-none"
                  draggable={false}
                  style={{ position: 'absolute', left: 0, top: 0, width: widthPreview, height: heightPreview }}
                />
                {fields.map((field, idx) => (
                  field.active && (
                    <div
                      key={field.key}
                      className={`absolute cursor-move px-2 py-1 rounded shadow text-black text-xs font-bold select-none ${field.color} ${dragIndex === idx ? 'z-30' : 'z-10'}`}
                      style={{
                        left: (field.x / templateSize.width) * widthPreview,
                        top: (field.y / templateSize.height) * heightPreview,
                        opacity: dragIndex === idx ? 0.7 : 1,
                        fontFamily: field.fontFamily,
                        fontSize: field.fontSize * (widthPreview / A4_WIDTH),
                        fontWeight: field.bold ? 'bold' : 'normal',
                        fontStyle: field.italic ? 'italic' : 'normal',
                        maxWidth: '90vw',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        cursor: dragIndex === idx ? 'grabbing' : 'move',
                        pointerEvents: 'auto',
                      }}
                      onMouseDown={e => {
                        e.stopPropagation();
                        handleFieldPointerDown(idx, e.clientX, e.clientY)
                      }}
                      onTouchStart={e => {
                        e.stopPropagation();
                        if (e.touches.length > 0) {
                          handleFieldPointerDown(idx, e.touches[0].clientX, e.touches[0].clientY)
                        }
                      }}
                    >
                      {field.label}
                    </div>
                  )
                ))}
              </div>
            </>
          )}
          
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-4 w-full">
            <button onClick={handleSave} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow transition-all w-full sm:w-auto text-sm" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan Template & Posisi'}
            </button>
            <button onClick={handlePreview} className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-semibold shadow transition-all w-full sm:w-auto text-sm">
              Preview Sertifikat
            </button>
            <button onClick={handleGenerate} className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow transition-all w-full sm:w-auto text-sm" disabled={generating}>
              {generating ? 'Menggenerate...' : 'Generate Semua Sertifikat'}
            </button>
          </div>
          
          {previewUrl && (
            <div className="mt-6">
              <h3 className="font-bold mb-2 bg-blue-600 text-white px-2 py-1 rounded text-sm">Preview Sertifikat:</h3>
              <iframe src={previewUrl} className="w-full h-[220px] sm:h-[400px] md:h-[600px] border rounded shadow bg-white" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}