'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Edit, Trash2, Copy, Download, CheckSquare, Square } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import useSWR from 'swr'

interface EventDetailClientProps {
  event: {
    id: string
    name: string
    description: string
    type: string
    start_date: string
    end_date: string
    location: string
    quota: number
    image_url: string
    created_at: string
    updated_at: string
    ticket_design: string
    total_tickets: number
    verified_tickets: number
    unused_tickets: number
  }
  participants: Array<{
    id: string
    name: string
    email: string
    phone: string
    ticket_id: string
    is_verified: boolean
    registered_at: string
  }>
  tickets: Array<{
    id: string
    token: string
    is_verified: boolean
    qr_code_url?: string
    participant_id?: string | null
    participant_name?: string | null
    registered_at?: string | null
  }>
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debounced
}

export default function EventDetailClient({ event: initialEvent, participants: initialParticipants, tickets: initialTickets }: EventDetailClientProps) {
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR(`/api/events/${initialEvent.id}`, fetcher, {
    fallbackData: { event: initialEvent, participants: initialParticipants, tickets: initialTickets },
    refreshInterval: 10000,
    revalidateOnFocus: true,
  })
  const event = data?.event || initialEvent
  const participants = data?.participants || initialParticipants
  const [isDeleting, setIsDeleting] = useState(false)
  const [ticketSearch, setTicketSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('token')
  const [sortDir, setSortDir] = useState('asc')
  const [selected, setSelected] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [jumpPage, setJumpPage] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [limit, setLimit] = useState(20)
  const queryParams = [
    debouncedSearch ? `search=${encodeURIComponent(debouncedSearch)}` : '',
    statusFilter ? `status=${statusFilter}` : '',
    dateFilter ? `registered_at=${dateFilter}` : '',
    `page=${page}`,
    `limit=${limit}`,
    `sort=${sortBy}`,
    `dir=${sortDir}`
  ].filter(Boolean).join('&')
  const { data: ticketData, isLoading: ticketLoading, mutate: mutateTickets } = useSWR(`/api/events/${initialEvent.id}?${queryParams}`, fetcher, { fallbackData: { tickets: initialTickets, total: initialTickets.length, page: 1, limit }, refreshInterval: 10000 })
  const tickets = ticketData?.tickets || []
  useEffect(() => { setPage(1) }, [debouncedSearch, statusFilter, dateFilter, limit])
  const total = ticketData?.total || 0
  const totalPages = Math.ceil(total / limit)
  // Bulk select logic
  useEffect(() => {
    if (selectAll) setSelected(tickets.map(t => t.id))
    else setSelected([])
  }, [selectAll, tickets])
  // Copy
  const handleCopy = async (token: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(String(token))
        toast.success('Token copied!')
      } else {
        // Fallback untuk browser lama atau non-https
        const textarea = document.createElement('textarea')
        textarea.value = String(token)
        textarea.style.position = 'fixed' // agar tidak scroll
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        toast.success('Token copied!')
      }
    } catch (e) {
      toast.error('Copy failed. Coba manual: Ctrl+C')
    }
  }
  // Export CSV (bulk or all on page)
  const handleExportCSV = () => {
    const header = ['Token','Ticket ID','Status','Participant ID','Participant Name','Registered At']
    const rows = tickets.filter(t => selected.length === 0 || selected.includes(t.id)).map(t => [
      t.token,
      t.id,
      t.is_verified ? 'Verified' : 'Unused',
      t.participant_id || '-',
      t.participant_name || '-',
      t.registered_at ? formatDateTime(t.registered_at) : '-'
    ])
    if (rows.length === 0) return toast.error('No tickets selected!')
    const csv = [header, ...rows].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tickets-event-${initialEvent.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported to CSV!')
  }
  // Sort handler
  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }
  // Tooltip helpers
  const copyRef = useRef<any>(null)
  const exportRef = useRef<any>(null)

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this event?')) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.success('Event deleted successfully')
        window.location.href = '/dashboard/events'
      } else {
        throw new Error('Failed to delete event')
      }
    } catch (error) {
      console.error('Error deleting event:', error)
      toast.error('Failed to delete event')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white w-full">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/20 sticky top-0 z-30">
        <div className="w-full max-w-2xl sm:max-w-4xl md:max-w-7xl mx-auto px-2 sm:px-4 md:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <Link
                href="/dashboard/events"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold text-lg shadow-lg transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <ArrowLeft className="h-6 w-6" />
                <span>Back to Events</span>
              </Link>
            </div>
            <div className="flex space-x-4">
              <Link
                href={`/dashboard/events/${event.id}/generate-offline`}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <span>🎟️</span>
                <span>Generate Ticket Offline</span>
              </Link>
              <Link
                href={`/dashboard/events/${event.id}/generate-certificates`}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <span>📄</span>
                <span>Generate Sertifikat</span>
              </Link>
              <Link
                href={`/dashboard/events/${event.id}/generate-certificates-multi`}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <span>📋</span>
                <span>Multi-Template Certificates</span>
              </Link>
              <Link
                href={`/dashboard/events/${event.id}/edit`}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <Edit className="h-4 w-4" />
                <span>Edit Event</span>
              </Link>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Event'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full max-w-2xl sm:max-w-4xl md:max-w-7xl mx-auto px-2 sm:px-4 md:px-8 py-4 sm:py-8">
        {/* Event Details */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mb-4 sm:mb-8">
          {/* Ticket Design Image */}
          <div className="relative w-full h-40 sm:h-56 md:h-64 flex items-center justify-center bg-gray-50">
            {event.ticket_design ? (
              <img
                src={event.ticket_design.startsWith('/') ? event.ticket_design : `/uploads/${event.ticket_design}`}
                alt="Ticket Design"
                className="w-full h-full object-contain md:object-cover rounded-t-xl"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg font-semibold bg-gradient-to-br from-blue-50 to-purple-50 border-b border-dashed border-gray-200">
                No Ticket Design
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none rounded-t-xl" />
            <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-4">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-1 sm:mb-2">{event.name}</h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <span className={`px-2 py-1 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm font-medium ${event.type === 'Seminar' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>{event.type}</span>
                <span className="text-white/80 text-xs sm:text-sm">
                  {formatDateTime(event.start_date)} - {formatDateTime(event.end_date)}
                </span>
              </div>
            </div>
          </div>

          <div className="p-2 sm:p-4 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Event Information</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500">Location</p>
                    <p className="text-gray-900">{event.location}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Quota</p>
                    <p className="text-gray-900">{event.quota} participants</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Description</p>
                    <p className="text-gray-900 whitespace-pre-wrap">{event.description}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Registration Status</h3>
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-gray-500">Total Registrations</p>
                      <p className="text-lg font-semibold text-gray-900">{event.total_tickets}</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${(event.verified_tickets / event.total_tickets) * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {event.verified_tickets} of {event.total_tickets} spots filled
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Verified</p>
                      <p className="text-lg font-semibold text-green-600">
                        {event.verified_tickets}
                      </p>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Total Unused</p>
                      <p className="text-lg font-semibold text-yellow-600">
                        {event.unused_tickets}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ticket/Token Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100">
          <div className="p-2 sm:p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Ticket Tokens for This Event</h2>
              <div className="text-xs sm:text-sm text-gray-500 mt-1 flex gap-4">
                <span>Verified: <span className="font-bold text-green-700">{event.verified_tickets}</span></span>
                <span>Unused: <span className="font-bold text-yellow-700">{event.unused_tickets}</span></span>
              </div>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <select
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="">All Status</option>
                <option value="verified">Verified</option>
                <option value="unused">Unused</option>
              </select>
              <input
                type="text"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Search token, status, participant id/name, or date..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ maxWidth: 240 }}
              />
              <button
                className="px-3 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm"
                onClick={() => {
                  setSearch(''); setStatusFilter(''); setDateFilter(''); setPage(1); setSortBy('token'); setSortDir('asc'); setSelected([]); setSelectAll(false)
                }}
                type="button"
              >Reset Filter</button>
              <button
                ref={exportRef}
                className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700 text-sm flex items-center gap-1"
                onClick={handleExportCSV}
                type="button"
                title="Export selected or all tickets on this page to CSV"
              ><Download className="w-4 h-4" /> Export CSV</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            {/* Loading State */}
            {ticketLoading ? (
              <div className="flex justify-center items-center py-12">
                <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <svg width="48" height="48" fill="none" viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-7V7h2v6h-2zm0 4v-2h2v2h-2z" fill="currentColor"/></svg>
                <div className="mt-2">Tidak ada data ditemukan</div>
              </div>
            ) : (
              <table className="w-full text-xs sm:text-sm text-gray-900">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="bg-gray-50">
                    <th className="px-2 sm:px-6 py-2 sm:py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      <button onClick={() => setSelectAll(!selectAll)} title={selectAll ? 'Unselect All' : 'Select All'} className="focus:outline-none">
                        {selectAll ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                      </button>
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left font-medium text-gray-700 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('rownum')}>
                      No {sortBy === 'rownum' && (sortDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="px-2 sm:px-6 py-2 sm:py-3 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('token')}>
                      Token {sortBy === 'token' && (sortDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="px-2 sm:px-6 py-2 sm:py-3 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('id')}>
                      Ticket ID {sortBy === 'id' && (sortDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="px-2 sm:px-6 py-2 sm:py-3 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('status')}>
                      Status {sortBy === 'status' && (sortDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="px-2 sm:px-6 py-2 sm:py-3 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('participant_id')}>
                      Participant ID {sortBy === 'participant_id' && (sortDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="px-2 sm:px-6 py-2 sm:py-3 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('participant_name')}>
                      Participant Name {sortBy === 'participant_name' && (sortDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="px-2 sm:px-6 py-2 sm:py-3 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('registered_at')}>
                      Registered At {sortBy === 'registered_at' && (sortDir === 'asc' ? '▲' : '▼')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100 text-gray-900">
                  {tickets.map((ticket, idx) => (
                    <tr key={ticket.id} className={`hover:bg-blue-50 ${selected.includes(ticket.id) ? 'bg-blue-100' : ''}`}> 
                      <td className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap">
                        <input type="checkbox" checked={selected.includes(ticket.id)} onChange={() => setSelected(selected.includes(ticket.id) ? selected.filter(id => id !== ticket.id) : [...selected, ticket.id])} />
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-4 whitespace-nowrap text-gray-900">{(page - 1) * limit + idx + 1}</td>
                      <td className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap font-mono text-blue-700 flex items-center gap-1">
                        {ticket.token}
                        <button onClick={() => handleCopy(ticket.token)} className="ml-1 text-gray-400 hover:text-blue-600" title="Copy Token" type="button"><Copy className="w-4 h-4" /></button>
                      </td>
                      <td className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap text-gray-900">{ticket.id}</td>
                      <td className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${ticket.is_verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{ticket.is_verified ? 'Verified' : 'Unused'}</span>
                      </td>
                      <td className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap text-gray-900">{ticket.participant_id || '-'}</td>
                      <td className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap text-gray-900">{ticket.participant_name || '-'}</td>
                      <td className="px-2 sm:px-6 py-2 sm:py-4 whitespace-nowrap text-gray-900">{ticket.registered_at ? formatDateTime(ticket.registered_at) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {/* Pagination & Info */}
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
                <span className="text-gray-500">items per page</span>
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
      </div>
    </div>
  )
}