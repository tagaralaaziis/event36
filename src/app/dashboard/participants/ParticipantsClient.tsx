"use client"
import Link from 'next/link'
import { Calendar, Users, Download, Filter, Search, Mail, Eye, FileText, Edit, Trophy, Copy, RefreshCw } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'

// Modern, responsive, and maintainable ParticipantsClient component
// Features: search, filter, export, status badge, empty/loading state, and clean code structure
const fetcher = (url: string) => fetch(url).then(res => res.json())

function useDebounce(value: any, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debounced
}

export default function ParticipantsClient({ participants: initialParticipants, events: initialEvents }: { participants: any[], events: any[] }) {
  const [filterEvent, setFilterEvent] = useState('')
  const [filterCertificate, setFilterCertificate] = useState('')
  const [filterCertificateSent, setFilterCertificateSent] = useState('')
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState<string|null>(null)
  const [selected, setSelected] = useState<any|null>(null)
  const [showModal, setShowModal] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [editModal, setEditModal] = useState(false)
  const [editData, setEditData] = useState<any|null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [jumpPage, setJumpPage] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  const queryParams = [
    filterEvent ? `event_id=${filterEvent}` : '',
    filterCertificate ? `certificate_status=${filterCertificate}` : '',
    filterCertificateSent ? `certificate_sent_status=${filterCertificateSent}` : '',
    debouncedSearch ? `search=${encodeURIComponent(debouncedSearch)}` : '',
    `page=${page}`,
    `limit=${limit}`,
    `sort=${sortBy}`,
    `dir=${sortDir}`
  ].filter(Boolean).join('&')

  const { data, error, isLoading, mutate } = useSWR(`/api/participants?${queryParams}`, fetcher, {
    fallbackData: { participants: initialParticipants, total: initialParticipants.length, page: 1, limit: limit },
    refreshInterval: 10000,
    revalidateOnFocus: true,
  })

  const participants = data?.participants || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / limit)
  
  useEffect(() => {
    setPage(1)
    setSelectedIds([])
  }, [debouncedSearch, filterEvent, filterCertificate, filterCertificateSent, limit])

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(participants.map((p: any) => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    if (e.target.checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((participantId) => participantId !== id));
    }
  };

  const handleBulkGenerate = async () => {
    const participantsToGenerate = participants.filter((p: any) => selectedIds.includes(p.id) && !p.certificate_id);
    if (participantsToGenerate.length === 0) {
      return toast.error('No selected participants need a certificate generated.');
    }
    
    setIsProcessing(true);
    toast.loading(`Generating ${participantsToGenerate.length} certificate(s)...`, { id: 'bulk-generate' });

    try {
      const res = await fetch('/api/certificates/bulk-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIds: participantsToGenerate.map(p => p.id) }),
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(`Successfully generated ${result.successCount} certificate(s).`, { id: 'bulk-generate' });
        mutate(); // Refresh data
        setSelectedIds([]);
      } else {
        throw new Error('Failed to generate certificates');
      }
    } catch (error) {
      console.error(error);
      toast.error('An error occurred during bulk generation.', { id: 'bulk-generate' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkRegenerate = async () => {
    const participantsToRegenerate = participants.filter((p: any) => selectedIds.includes(p.id) && p.certificate_id);
    if (participantsToRegenerate.length === 0) {
      return toast.error('No selected participants have a certificate to regenerate.');
    }

    setIsProcessing(true);
    toast.loading(`Regenerating ${participantsToRegenerate.length} certificate(s)...`, { id: 'bulk-regenerate' });

    try {
      const res = await fetch('/api/certificates/bulk-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIds: participantsToRegenerate.map(p => p.id) }),
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(`Successfully regenerated ${result.successCount} certificate(s).`, { id: 'bulk-regenerate' });
        mutate();
        setSelectedIds([]);
      } else {
        throw new Error('Failed to regenerate certificates');
      }
    } catch (error) {
      console.error(error);
      toast.error('An error occurred during bulk regeneration.', { id: 'bulk-regenerate' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkResend = async () => {
    const participantsToResend = participants.filter((p: any) => selectedIds.includes(p.id) && p.certificate_id);
    if (participantsToResend.length === 0) {
      return toast.error('No selected participants have a certificate to resend.');
    }

    setIsProcessing(true);
    toast.loading(`Resending ${participantsToResend.length} certificate(s)...`, { id: 'bulk-resend' });

    try {
      const res = await fetch('/api/certificates/bulk-resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateIds: participantsToResend.map(p => p.certificate_id) }),
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(`Successfully resent ${result.successCount} certificate(s).`, { id: 'bulk-resend' });
      } else {
        throw new Error('Failed to resend certificates');
      }
    } catch (error) {
      console.error(error);
      toast.error('An error occurred during bulk resend.', { id: 'bulk-resend' });
    } finally {
      setIsProcessing(false);
      setSelectedIds([]);
    }
  };

  const handleExport = async () => {
    setExporting(true)
    toast.loading('Exporting CSV...', { id: 'export-toast' })
    try {
      const res = await fetch(`/api/participants/export?${queryParams}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'participants.csv'
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
        toast.success('Export CSV berhasil!', { id: 'export-toast' })
      } else {
        toast.error('Export gagal!', { id: 'export-toast' })
      }
    } catch {
      toast.error('Export gagal!', { id: 'export-toast' })
    } finally {
      setExporting(false)
    }
  }

  const handleView = (participant: any) => {
    setSelected(participant)
    setShowModal(true)
  }
  const closeModal = () => {
    setShowModal(false)
    setTimeout(() => setSelected(null), 300)
  }

  const handleEdit = (participant: any) => {
    setEditData(participant)
    setEditModal(true)
  }
  const closeEditModal = () => {
    setEditModal(false)
    setTimeout(() => setEditData(null), 300)
  }
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEditLoading(true)
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)
    const payload = {
      id: editData.id,
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      address: formData.get('address'),
    }
    try {
      const res = await fetch('/api/participants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success('Data peserta berhasil diupdate!')
        setEditModal(false)
        setEditData(null)
        mutate()
      } else {
        const data = await res.json()
        toast.error('Gagal update peserta: ' + (data.message || 'Unknown error'))
      }
    } catch (err) {
      toast.error('Gagal update peserta')
    }
    setEditLoading(false)
  }

  const handleResendCertificate = async (participant: any) => {
    if (!participant.certificate_id) return
    toast.loading('Mengirim ulang sertifikat...', { id: 'resend-cert' })
    try {
      const res = await fetch(`/api/certificates/send/${participant.certificate_id}`, { method: 'POST' })
      if (res.ok) toast.success('Email sertifikat berhasil dikirim ulang!', { id: 'resend-cert' })
      else toast.error('Gagal mengirim ulang email sertifikat', { id: 'resend-cert' })
    } catch {
      toast.error('Gagal mengirim ulang email sertifikat', { id: 'resend-cert' })
    }
  }

  const handleGenerateCertificate = async (participant: any) => {
    toast.loading('Generating certificate...', { id: 'generate-cert' })
    try {
      const res = await fetch(`/api/certificates/generate/${participant.id}`, { method: 'POST' })
      if (res.ok) {
        toast.success('Certificate generated successfully!', { id: 'generate-cert' })
        mutate() // Refresh data to show new certificate status
      } else {
        const data = await res.json()
        toast.error(data.message || 'Failed to generate certificate', { id: 'generate-cert' })
      }
    } catch (err) {
      toast.error('Failed to generate certificate', { id: 'generate-cert' })
    }
  }

  const handleRegenerateCertificate = async (participant: any) => {
    toast.loading('Regenerating certificate...', { id: 'regenerate-cert' });
    try {
      // This assumes the generate endpoint can handle regeneration
      const res = await fetch(`/api/certificates/generate/${participant.id}`, { method: 'POST' });
      if (res.ok) {
        toast.success('Certificate regenerated successfully!', { id: 'regenerate-cert' });
        mutate(); // Refresh data
      } else {
        const data = await res.json();
        toast.error(data.message || 'Failed to regenerate certificate', { id: 'regenerate-cert' });
      }
    } catch (err) {
      toast.error('Failed to regenerate certificate', { id: 'regenerate-cert' });
    }
  };

  const handleCopy = async (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      // Modern approach: Clipboard API (secure contexts)
      try {
        await navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
      } catch (err) {
        toast.error('Copy failed! Please try again.');
      }
    } else {
      // Fallback for older browsers or insecure contexts
      const textArea = document.createElement('textarea');
      textArea.value = text;
      
      // Make the textarea out of sight
      textArea.style.position = 'fixed';
      textArea.style.top = '-9999px';
      textArea.style.left = '-9999px';

      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        const successful = document.execCommand('copy');
        if (successful) {
          toast.success('Copied to clipboard!');
        } else {
          toast.error('Copy failed! Your browser may not support this feature.');
        }
      } catch (err) {
        toast.error('Copy failed! Your browser may not support this feature.');
      }

      document.body.removeChild(textArea);
    }
  };

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  return (
    <div className="min-h-screen bg-white w-full max-w-2xl sm:max-w-3xl md:max-w-7xl mx-auto px-2 sm:px-4 md:px-8 py-4 sm:py-8">
      {/* Page Title & Export */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 sm:mb-4 gap-2 sm:gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Participants</h2>
          <p className="text-gray-600 text-sm">Manage event participants and their registration status</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 text-sm w-full sm:w-auto mt-2 sm:mt-0" onClick={handleExport} disabled={exporting}>
          <Download className="h-4 w-4 text-white" />
          <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
        </button>
      </div>

      {/* Alert */}
      {alert && (
        <div className="mb-2 sm:mb-4 p-2 sm:p-4 rounded-lg bg-green-100 text-green-800 text-center font-medium animate-fade-in text-sm">
          {alert}
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-2 sm:p-4 mb-2 sm:mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search participants by name, email, or token..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder-gray-500 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto items-center">
            {/* Total Participants Info Box - oranye */}
            <div className="flex items-center px-4 py-2 bg-orange-50 border border-orange-200 rounded-lg text-orange-800 font-semibold text-sm mr-0 sm:mr-2 mb-2 sm:mb-0 min-w-[120px] justify-center">
              Total Participants: <span className="ml-2 font-bold">{total}</span>
            </div>
            <select className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 text-sm w-full sm:w-auto" value={filterCertificate} onChange={e => setFilterCertificate(e.target.value)}>
              <option value="">All Certificates</option>
              <option value="generated">Generated</option>
              <option value="not_generated">Not Generated</option>
            </select>
            <select className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 text-sm w-full sm:w-auto" value={filterCertificateSent} onChange={e => setFilterCertificateSent(e.target.value)}>
              <option value="">All Sent Status</option>
              <option value="sent">Sent</option>
              <option value="pending">Pending</option>
            </select>
            <select className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 text-sm w-full sm:w-auto" value={filterEvent} onChange={e => setFilterEvent(e.target.value)}>
              <option value="">All Events</option>
              {initialEvents.map((ev: any) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
            <button
                className="px-3 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm"
                onClick={() => {
                  setSearch(''); setFilterEvent(''); setFilterCertificate(''); setFilterCertificateSent(''); setPage(1); setSortBy('name'); setSortDir('asc');
                }}
                type="button"
              >Reset</button>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl shadow-lg p-3 mb-4 flex flex-col sm:flex-row justify-between items-center gap-3 animate-fade-in">
          <div className="font-semibold text-blue-800">
            {selectedIds.length} item(s) selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleBulkGenerate}
              disabled={isProcessing}
              className="px-3 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
            >
              <Trophy className="w-4 h-4" />
              Generate Certificates
            </button>
            <button
              onClick={handleBulkRegenerate}
              disabled={isProcessing}
              className="px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4" />
              Regenerate Certificates
            </button>
            <button
              onClick={handleBulkResend}
              disabled={isProcessing}
              className="px-3 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
            >
              <Mail className="w-4 h-4" />
              Resend Certificates
            </button>
          </div>
        </div>
      )}

      {/* Loading State or No Data */}
      {isLoading ? (
        <div className="text-center py-8">
          <div className="flex justify-center items-center py-12">
            <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
          </div>
        </div>
      ) : participants.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 text-center py-16">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800">No Participants Found</h3>
          <p className="text-gray-500 text-sm mt-1">Try adjusting your search or filter criteria.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                      onChange={handleSelectAll}
                      checked={participants.length > 0 && selectedIds.length === participants.length}
                    />
                  </th>
                  <th className="p-3 text-left font-semibold text-gray-700 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('rownum')}>
                    No {sortBy === 'rownum' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="px-2 sm:px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('name')}>
                    Participant {sortBy === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="px-2 sm:px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('event_name')}>
                    Event {sortBy === 'event_name' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="px-2 sm:px-2 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('certificate_id')}>
                    Certificate {sortBy === 'certificate_id' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="px-2 sm:px-2 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('certificate_sent')}>
                    Sent Status {sortBy === 'certificate_sent' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="px-2 sm:px-2 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell cursor-pointer" onClick={() => handleSort('registered_at')}>
                    Registered {sortBy === 'registered_at' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="px-2 sm:px-2 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {participants.map((p: any, idx: number) => (
                  <tr key={p.id} className={`hover:bg-blue-50 ${selectedIds.includes(p.id) ? 'bg-blue-100' : ''}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                        checked={selectedIds.includes(p.id)}
                        onChange={(e) => handleSelectOne(e, p.id)}
                      />
                    </td>
                    <td className="p-3 text-gray-900">{(page - 1) * limit + idx + 1}</td>
                    <td className="px-2 sm:px-3 py-2 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{p.name}</div>
                      <div className="text-gray-500">{p.address || 'No Address'}</div>
                    </td>
                    <td className="px-2 sm:px-3 py-2 whitespace-nowrap text-gray-900">{p.event_name}</td>
                    <td className="px-2 sm:px-2 py-2 whitespace-nowrap">
                      {p.certificate_id ? (
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800`}>
                          Generated
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-2 sm:px-2 py-2 whitespace-nowrap">
                      {p.certificate_id ? (
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${p.certificate_sent ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                          {p.certificate_sent ? 'Sent' : 'Pending'}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-2 sm:px-2 py-2 whitespace-nowrap text-gray-900 hidden md:table-cell">{formatDateTime(p.registered_at)}</td>
                    <td className="px-2 sm:px-2 py-2 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <button onClick={() => handleView(p)} className="text-gray-400 hover:text-blue-600" title="View Details"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => handleEdit(p)} className="text-gray-400 hover:text-green-600" title="Edit Participant"><Edit className="w-4 h-4" /></button>
                        {p.certificate_id ? (
                          <>
                            <button onClick={() => handleRegenerateCertificate(p)} className="text-gray-400 hover:text-blue-600" title="Regenerate Certificate"><RefreshCw className="w-4 h-4" /></button>
                            <button onClick={() => handleResendCertificate(p)} className="text-gray-400 hover:text-purple-600" title="Resend Certificate"><Mail className="w-4 h-4" /></button>
                          </>
                        ) : (
                          <button onClick={() => handleGenerateCertificate(p)} className="text-gray-400 hover:text-yellow-600" title="Generate Certificate"><Trophy className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t border-gray-100 gap-2">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                Menampilkan {(page - 1) * limit + 1}–{Math.min(page * limit, total)} dari {total} data
              </div>
              <div className="flex items-center gap-2 text-sm">
                <select
                  value={limit}
                  onChange={e => setLimit(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-gray-500">per page</span>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50">Prev</button>
              <span>Page</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpPage}
                onChange={e => setJumpPage(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const num = parseInt(jumpPage, 10)
                    if (num >= 1 && num <= totalPages) {
                      setPage(num)
                      setJumpPage('')
                    }
                  }
                }}
                className="w-14 px-2 py-1 border border-gray-300 rounded text-center"
                placeholder={String(page)}
              />
              <span>of {totalPages}</span>
              <button disabled={page === totalPages || totalPages === 0} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50">Next</button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showModal && selected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Participant Details</h3>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column - Participant Info */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Name</label>
                    <p className="mt-1 text-sm text-gray-900 font-semibold">{selected.name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <p className="mt-1 text-sm text-gray-900">{selected.email}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <p className="mt-1 text-sm text-gray-900">{selected.phone || 'Not provided'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Alamat</label>
                    <p className="mt-1 text-sm text-gray-900">{selected.address || 'Not provided'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Event</label>
                    <p className="mt-1 text-sm text-gray-900 font-semibold">{selected.event_name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Token</label>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-sm text-gray-900 font-mono bg-gray-100 px-2 py-1 rounded">{selected.token || 'Not generated'}</p>
                      {selected.token && (
                        <button 
                          onClick={() => handleCopy(selected.token)} 
                          className="text-gray-400 hover:text-blue-600" 
                          title="Copy Token"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <span className={`mt-1 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${selected.is_verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {selected.is_verified ? 'Verified' : 'Unused'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Registered At</label>
                    <p className="mt-1 text-sm text-gray-900">{formatDateTime(selected.registered_at)}</p>
                  </div>
                  {selected.certificate_id && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Certificate</label>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="text-sm text-green-600 font-semibold">Generated ✓</p>
                        <button 
                          onClick={() => window.open(selected.certificate_url, '_blank')}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          View Certificate
                        </button>
                      </div>
                      <div className="mt-2">
                        <label className="block text-sm font-medium text-gray-700">Sent Status</label>
                         <span className={`mt-1 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${selected.certificate_sent ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                           {selected.certificate_sent ? 'Sent' : 'Pending'}
                         </span>
                       </div>
                    </div>
                  )}
                </div>

                {/* Right Column - QR Code */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">QR Code</label>
                    {selected.token ? (
                      <div className="flex flex-col items-center">
                        <div className="bg-white p-4 rounded-lg border-2 border-gray-200 shadow-sm">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(selected.token)}`}
                            alt="QR Code"
                            className="w-48 h-48"
                          />
                        </div>
                        <p className="mt-3 text-xs text-gray-500 text-center">
                          Scan QR code atau tunjukkan token untuk verifikasi
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button 
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(selected.token)}`;
                              link.download = `qr-${selected.token}.png`;
                              link.click();
                            }}
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                          >
                            Download QR
                          </button>
            <button
                            onClick={() => handleCopy(selected.token)}
                            className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
            >
                            Copy Token
            </button>
                        </div>
            </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <svg className="w-16 h-16 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V6a1 1 0 00-1-1H5a1 1 0 00-1 1v1a1 1 0 001 1zm12 0h2a1 1 0 001-1V6a1 1 0 00-1-1h-2a1 1 0 00-1 1v1a1 1 0 001 1zM5 20h2a1 1 0 001-1v-1a1 1 0 00-1-1H5a1 1 0 00-1 1v1a1 1 0 001 1z" />
                        </svg>
                        <p className="text-sm">QR Code not available</p>
                        <p className="text-xs">Token not generated yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button onClick={closeModal} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && editData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Edit Participant</h3>
                <button onClick={closeEditModal} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editData.name}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={editData.email}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    defaultValue={editData.phone || ''}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Alamat</label>
                  <input
                    type="text"
                    name="address"
                    defaultValue={editData.address || ''}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="mt-6 flex justify-end space-x-3">
            <button
                    type="button"
              onClick={closeEditModal}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {editLoading ? 'Saving...' : 'Save Changes'}
            </button>
                </div>
              </form>
            </div>
            </div>
        </div>
      )}
    </div>
  )
} 