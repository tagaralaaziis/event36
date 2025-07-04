"use client"
import React, { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import { ArrowLeft, Upload, Eye, Download, Save, Trash2, Users, Award, Mail, RefreshCw, BarChart3 } from 'lucide-react'

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

export default function GenerateCertificatesMultiPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id
  
  const [activeTab, setActiveTab] = useState(1)
  const [templates, setTemplates] = useState<any[]>([])
  const [participants, setParticipants] = useState<any[]>([])
  const [selectedParticipant, setSelectedParticipant] = useState<string>('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [bulkSending, setBulkSending] = useState(false)
  const [stats, setStats] = useState<any>(null)
  
  const previewRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    fetchData()
    fetchStats()
  }, [eventId])

  const fetchData = async () => {
    try {
      // Fetch templates
      const templateRes = await fetch(`/api/events/${eventId}/generate-certificates/multi-template`)
      if (templateRes.ok) {
        const templateData = await templateRes.json()
        const templatesArray = Array.from({ length: 6 }, (_, i) => {
          const existing = templateData.templates.find((t: any) => t.templateIndex === i + 1)
          return existing || {
            templateIndex: i + 1,
            templateUrl: null,
            fields: DEFAULT_FIELDS.map((f, idx) => ({ ...f, x: 40 + idx * 140, y: 30, active: true })),
            templateSize: { width: 842, height: 595 }
          }
        })
        setTemplates(templatesArray)
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

  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/generate-certificates/multi-template/stats`)
      if (res.ok) {
        const statsData = await res.json()
        setStats(statsData)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const handleFileChange = (templateIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      const img = new window.Image()
      img.onload = () => {
        const templateSize = { width: img.naturalWidth, height: img.naturalHeight }
        setTemplates(prev => prev.map(t => 
          t.templateIndex === templateIndex 
            ? { ...t, templateUrl: url, templateFile: file, templateSize }
            : t
        ))
      }
      img.src = url
    }
  }

  const handleFieldPointerDown = (templateIndex: number, fieldIdx: number, clientX: number, clientY: number) => {
    setDragIndex(fieldIdx)
    const template = templates.find(t => t.templateIndex === templateIndex)
    if (!template) return
    
    const preview = previewRefs.current[templateIndex - 1]
    if (!preview) return
    
    const rect = preview.getBoundingClientRect()
    const field = template.fields[fieldIdx]
    const previewWidth = 420
    const previewHeight = 297
    
    setOffset({
      x: clientX - (field.x / template.templateSize.width) * previewWidth - rect.left,
      y: clientY - (field.y / template.templateSize.height) * previewHeight - rect.top,
    })
  }

  const handlePointerMove = (templateIndex: number, clientX: number, clientY: number) => {
    if (dragIndex === null) return
    
    const template = templates.find(t => t.templateIndex === templateIndex)
    if (!template) return
    
    const preview = previewRefs.current[templateIndex - 1]
    if (!preview) return
    
    const rect = preview.getBoundingClientRect()
    const previewWidth = 420
    const previewHeight = 297
    
    let x = ((clientX - offset.x - rect.left) / previewWidth) * template.templateSize.width
    let y = ((clientY - offset.y - rect.top) / previewHeight) * template.templateSize.height
    
    x = Math.max(0, Math.min(x, template.templateSize.width - 1))
    y = Math.max(0, Math.min(y, template.templateSize.height - 1))
    
    setTemplates(prev => prev.map(t => 
      t.templateIndex === templateIndex 
        ? {
            ...t,
            fields: t.fields.map((field: any, i: number) => 
              i === dragIndex ? { ...field, x, y } : field
            )
          }
        : t
    ))
  }

  const handleToggleField = (templateIndex: number, fieldKey: string, checked: boolean) => {
    setTemplates(prev => prev.map(t => 
      t.templateIndex === templateIndex 
        ? {
            ...t,
            fields: t.fields.map((field: any) => 
              field.key === fieldKey ? { ...field, active: checked } : field
            )
          }
        : t
    ))
  }

  const handleSave = async (templateIndex: number) => {
    const template = templates.find(t => t.templateIndex === templateIndex)
    if (!template) return
    
    setSaving(true)
    
    const formData = new FormData()
    formData.append('template_index', templateIndex.toString())
    if (template.templateFile) formData.append('template', template.templateFile)
    formData.append('fields', JSON.stringify(template.fields))
    
    const res = await fetch(`/api/events/${eventId}/generate-certificates/multi-template`, { 
      method: 'POST', 
      body: formData 
    })
    
    if (res.ok) {
      toast.success(`Template ${templateIndex} berhasil disimpan!`)
      fetchStats() // Refresh stats
    } else {
      toast.error(`Gagal menyimpan template ${templateIndex}!`)
    }
    setSaving(false)
  }

  const handlePreview = async (templateIndex: number) => {
    if (!selectedParticipant) return toast.error('Pilih peserta terlebih dahulu!')
    
    setPreviewUrl(null)
    toast.loading('Generating preview...', { id: 'preview' })
    
    const res = await fetch(`/api/events/${eventId}/generate-certificates/multi-template/preview`, {
      method: 'POST',
      body: JSON.stringify({ 
        participantId: selectedParticipant,
        templateIndex
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

  const handleBulkGenerate = async () => {
    setGenerating(true)
    toast.loading('Generating multi-certificates for all participants...', { id: 'bulk-generate' })
    
    const res = await fetch(`/api/events/${eventId}/generate-certificates/multi-template/bulk-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (res.ok) {
      const result = await res.json()
      toast.success(`${result.message} Success: ${result.successCount}, Failed: ${result.failureCount}`, { id: 'bulk-generate' })
      fetchStats() // Refresh stats
    } else {
      const error = await res.json()
      toast.error(error.error || 'Gagal generate bulk certificates!', { id: 'bulk-generate' })
    }
    setGenerating(false)
  }

  const handleBulkSend = async () => {
    setBulkSending(true)
    toast.loading('Sending certificates to all participants...', { id: 'bulk-send' })
    
    const res = await fetch(`/api/events/${eventId}/generate-certificates/multi-template/bulk-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (res.ok) {
      const result = await res.json()
      toast.success(`${result.message} Success: ${result.successCount}, Failed: ${result.failureCount}`, { id: 'bulk-send' })
      fetchStats() // Refresh stats
    } else {
      const error = await res.json()
      toast.error(error.error || 'Gagal bulk send certificates!', { id: 'bulk-send' })
    }
    setBulkSending(false)
  }

  const currentTemplate = templates.find(t => t.templateIndex === activeTab)

  return (
    <div className="min-h-screen bg-white w-full">
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Generate Multi-Template Certificates</h1>
              <p className="text-sm text-gray-500">Design up to 6 different certificate templates for participants.</p>
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
        
        {/* Statistics Dashboard */}
        {stats && (
          <div className="mb-6 bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Certificate Statistics
              </h2>
              <button onClick={fetchStats} className="text-blue-600 hover:text-blue-800">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.participants.verified_participants}</div>
                <div className="text-sm text-blue-700">Verified Participants</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.templates.template_count}</div>
                <div className="text-sm text-green-700">Templates Configured</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{stats.participants.participants_with_certificates}</div>
                <div className="text-sm text-purple-700">Participants with Certificates</div>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{stats.certificates.sent_certificates}</div>
                <div className="text-sm text-orange-700">Certificates Sent</div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Actions */}
        <div className="mb-6 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Bulk Actions</h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleBulkGenerate}
              disabled={generating}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {generating ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Award className="h-5 w-5" />
                  <span>Generate All Certificates</span>
                </>
              )}
            </button>
            
            <button
              onClick={handleBulkSend}
              disabled={bulkSending}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {bulkSending ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Mail className="h-5 w-5" />
                  <span>Send All Certificates</span>
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Participant Selection */}
        {participants.length > 0 && (
          <div className="mb-6 bg-white rounded-lg shadow-lg p-4">
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

        {/* Template Tabs */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2 border-b border-gray-200">
            {[1, 2, 3, 4, 5, 6].map(index => (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
                  activeTab === index
                    ? 'bg-blue-600 text-white border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                Template {index}
              </button>
            ))}
          </div>
        </div>

        {/* Current Template Editor */}
        {currentTemplate && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Template {activeTab}</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSave(activeTab)}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => handlePreview(activeTab)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </button>
              </div>
            </div>

            {/* File Upload */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Template {activeTab}
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => handleFileChange(activeTab, e)}
                className="w-full"
              />
            </div>

            {/* Field Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
              {currentTemplate.fields.map((f: any, idx: number) => (
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
                      onChange={e => handleToggleField(activeTab, f.key, e.target.checked)}
                      className="accent-purple-600 w-5 h-5 rounded focus:ring-2 focus:ring-purple-400 transition-all cursor-pointer border-2 border-gray-300"
                    />
                    <label className="font-semibold text-base text-gray-800 select-none cursor-pointer">
                      {f.label}
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <select
                      value={f.fontFamily}
                      onChange={e => {
                        setTemplates(prev => prev.map(t => 
                          t.templateIndex === activeTab 
                            ? {
                                ...t,
                                fields: t.fields.map((field: any, i: number) => 
                                  i === idx ? { ...field, fontFamily: e.target.value } : field
                                )
                              }
                            : t
                        ))
                      }}
                      className="flex-1 rounded-md border px-2 py-1 text-xs focus:ring-1 focus:ring-purple-400"
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
                        setTemplates(prev => prev.map(t => 
                          t.templateIndex === activeTab 
                            ? {
                                ...t,
                                fields: t.fields.map((field: any, i: number) => 
                                  i === idx ? { ...field, fontSize: Number(e.target.value) } : field
                                )
                              }
                            : t
                        ))
                      }}
                      className="w-16 rounded-md border px-2 py-1 text-xs focus:ring-1 focus:ring-purple-400"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Template Preview */}
            {currentTemplate.templateUrl && (
              <div
                ref={el => { previewRefs.current[activeTab - 1] = el; }}
                className="template-preview relative border rounded-lg overflow-hidden mt-4 shadow-lg bg-white mx-auto"
                style={{ width: 420, height: 297 }}
                onMouseMove={(e) => handlePointerMove(activeTab, e.clientX, e.clientY)}
                onMouseUp={() => setDragIndex(null)}
                onMouseLeave={() => setDragIndex(null)}
                onTouchMove={(e) => {
                  if (e.touches.length > 0) {
                    handlePointerMove(activeTab, e.touches[0].clientX, e.touches[0].clientY)
                  }
                }}
                onTouchEnd={() => setDragIndex(null)}
              >
                <img
                  src={currentTemplate.templateUrl}
                  alt="Template Preview"
                  className="w-full h-full object-contain select-none"
                  draggable={false}
                />
                {currentTemplate.fields.map((field: any, idx: number) => (
                  field.active && (
                    <div
                      key={field.key}
                      className={`absolute cursor-move px-2 py-1 rounded shadow text-black text-xs font-bold select-none ${field.color} ${dragIndex === idx ? 'z-30' : 'z-10'}`}
                      style={{
                        left: (field.x / currentTemplate.templateSize.width) * 420,
                        top: (field.y / currentTemplate.templateSize.height) * 297,
                        opacity: dragIndex === idx ? 0.7 : 1,
                        fontFamily: field.fontFamily,
                        fontSize: field.fontSize * (420 / 842),
                        fontWeight: field.bold ? 'bold' : 'normal',
                        fontStyle: field.italic ? 'italic' : 'normal',
                        cursor: dragIndex === idx ? 'grabbing' : 'move',
                      }}
                      onMouseDown={e => {
                        e.stopPropagation();
                        handleFieldPointerDown(activeTab, idx, e.clientX, e.clientY)
                      }}
                      onTouchStart={e => {
                        e.stopPropagation();
                        if (e.touches.length > 0) {
                          handleFieldPointerDown(activeTab, idx, e.touches[0].clientX, e.touches[0].clientY)
                        }
                      }}
                    >
                      {field.label}
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        )}

        {/* Preview Modal */}
        {previewUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 relative max-w-full" style={{ maxWidth: 900 }}>
              <button
                onClick={() => setPreviewUrl(null)}
                className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 bg-gray-100 rounded-full p-2"
              >
                ✕
              </button>
              <h2 className="text-lg font-bold mb-4 text-center">Preview Template {activeTab}</h2>
              <iframe src={previewUrl} className="w-full h-[600px] border rounded shadow bg-white" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}