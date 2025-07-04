'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Calendar, MapPin, Clock, User, Mail, Phone, Building, Loader2, CheckCircle } from 'lucide-react'

interface EventData {
  id: number
  name: string
  type: string
  location: string
  description: string
  start_time: string
  end_time: string
}

export default function RegisterPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  
  const [eventData, setEventData] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  })

  const [participantData, setParticipantData] = useState<any>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [tokenPeserta, setTokenPeserta] = useState<string | null>(null)
  const [eventDetail, setEventDetail] = useState<any>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (token) {
      fetchEventData()
    } else {
      setError('Invalid registration link: token is missing')
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (success) {
      if (typeof window !== 'undefined') {
        const lastReg = window.sessionStorage.getItem('lastRegData')
        if (lastReg) {
          const data = JSON.parse(lastReg)
          setParticipantData(data.participant)
          setQrUrl(data.qr_code_url)
          setTokenPeserta(data.token)
          setEventDetail(data.event)
        }
      }
    }
  }, [success])

  const fetchEventData = async () => {
    try {
      const response = await fetch(`/api/register?token=${token}`)
      if (response.ok) {
        const data = await response.json()
        if (!data.event) {
          setError('Event not found for this token')
        } else {
          setEventData(data.event)
        }
      } else {
        const errorData = await response.json()
        setError(errorData.message || 'Failed to load event data')
      }
    } catch (error) {
      setError('Failed to load event data')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          ...formData
        })
      })
      if (response.ok) {
        const data = await response.json();
        // Simpan response ke sessionStorage agar bisa diambil di halaman sukses
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem('lastRegData', JSON.stringify(data));
        }
        setError('')
        setSuccess(true)
      } else {
        let errorData = { message: '' }
        try {
          errorData = await response.json()
        } catch {}
        setError(errorData.message || 'Registration failed')
      }
    } catch (error) {
      setError('Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading event details...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto text-center">
          <div className="text-red-500 mb-4">
            <svg className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Registration Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div
          id="reg-success-card"
          className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-auto text-center border border-gray-200 relative"
          style={{ minWidth: 340, minHeight: 500, overflow: 'visible', boxSizing: 'border-box' }}
        >
          {/* Ikon sukses dan heading */}
          <div className="flex flex-col items-center mb-4">
            <CheckCircle className="h-14 w-14 text-green-500 mb-2 drop-shadow-lg" />
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Registrasi Berhasil!</h2>
            <p className="text-gray-500 text-sm mb-2">Data peserta & QR code siap digunakan</p>
          </div>
          {/* QR Code */}
          {qrUrl && (
            <img
              src={qrUrl}
              alt="QR Code Peserta"
              className="mx-auto mb-4 rounded-lg border border-gray-300 bg-white shadow"
              style={{ width: 120, height: 120 }}
              crossOrigin="anonymous"
            />
          )}
          {/* Token Peserta */}
          {tokenPeserta && (
            <div className="mb-2 text-xs font-mono text-purple-700 bg-purple-50 rounded px-2 py-1 inline-block tracking-widest border border-purple-200">
              Token: {tokenPeserta}
            </div>
          )}
          {/* Data Peserta */}
          {participantData && (
            <div className="mb-4 text-left text-sm text-gray-700 bg-gray-50 rounded-lg p-3 shadow-inner">
              <div className="mb-1 font-semibold text-gray-800">Data Peserta</div>
              <div><span className="font-semibold">Nama:</span> {participantData.name}</div>
              <div><span className="font-semibold">Email:</span> {participantData.email}</div>
              <div><span className="font-semibold">No. HP:</span> {participantData.phone}</div>
              <div><span className="font-semibold">Alamat:</span> {participantData.address}</div>
            </div>
          )}
          {/* Data Event */}
          {eventDetail && (
            <div className="mb-4 text-left text-xs text-gray-600 border-t border-b py-2 bg-blue-50 rounded-lg px-3">
              <div className="mb-1 font-semibold text-blue-800">Detail Acara</div>
              <div><span className="font-semibold">Acara:</span> {eventDetail.name}</div>
              <div><span className="font-semibold">Tipe:</span> {eventDetail.type}</div>
              <div><span className="font-semibold">Lokasi:</span> {eventDetail.location}</div>
              <div>
                <span className="font-semibold">Tanggal/Jam:</span> {new Date(eventDetail.start_time).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} / {new Date(eventDetail.start_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
              </div>
              <div><span className="font-semibold">Deskripsi:</span> {eventDetail.description}</div>
            </div>
          )}
          {/* Himbauan Screenshot */}
          <div className="text-xs text-pink-600 mb-2 font-medium">Simpan/screenshot data ini sebagai bukti registrasi.</div>
          {/* Button Download */}
          <button
            className={`w-full py-2 mt-2 rounded-lg font-bold text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-colors duration-200 shadow-md ${downloading || !participantData ? 'opacity-60 cursor-not-allowed' : ''}`}
            onClick={async () => {
              setDownloading(true);
              await new Promise(res => setTimeout(res, 350));
              const node = document.getElementById('reg-success-card');
              if (node) {
                try {
                  // @ts-ignore
                  const { toPng } = await import('html-to-image');
                  const dataUrl = await toPng(node, { cacheBust: true, backgroundColor: '#fff' });
                  const link = document.createElement('a');
                  link.download = `data-peserta-${tokenPeserta || 'event'}.png`;
                  link.href = dataUrl;
                  link.click();
                } catch (err) {
                  alert('Gagal download gambar. Silakan coba lagi.');
                } finally {
                  setDownloading(false);
                }
              }
            }}
            disabled={downloading || !participantData}
          >
            {downloading ? 'Mendownload...' : 'Download Data Peserta'}
          </button>
          {/* Claim Benefit Button & Promo */}
          <a
            href="https://linktr.ee/futurepreneursummit"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full mt-4 py-3 rounded-2xl font-bold text-white text-lg text-center bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 shadow-md transition-all duration-200"
            style={{ letterSpacing: 0.2 }}
          >
            <span role="img" aria-label="gift" className="mr-2">🎁</span> Claim Benefit Sekarang!
          </a>
          <div className="text-center text-gray-400 text-base mt-2 mb-1 font-medium">Promo khusus peserta Future Entrepreneur Summit</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-3 rounded-lg w-fit mx-auto mb-4">
            <Calendar className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Event Registration</h1>
          <p className="text-gray-600">Register for this amazing event</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Event Details */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Event Details</h2>
            
            {eventData && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{eventData.name}</h3>
                  <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full mt-1 ${
                    eventData.type === 'Seminar' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {eventData.type}
                  </span>
                </div>

                <div className="flex items-start space-x-3">
                  <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900">Location</p>
                    <p className="text-gray-600">{eventData.location}</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Clock className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900">Schedule</p>
                    <p className="text-gray-600">
                      {new Date(eventData.start_time).toLocaleString()} - {/*new Date(eventData.end_time).toLocaleString()*/}
                    </p>
                  </div>
                </div>

                {eventData.description && (
                  <div>
                    <p className="font-medium text-gray-900 mb-2">Description</p>
                    <p className="text-gray-600">{eventData.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Registration Form */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Registration Form</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white text-gray-900 placeholder-gray-500"
                    placeholder="Enter your full name"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white text-gray-900 placeholder-gray-500"
                    placeholder="Enter your email address"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white text-gray-900 placeholder-gray-500"
                    placeholder="Enter your phone number"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
                  Alamat
                </label>
                <div className="relative">
                  <Building className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white text-gray-900 placeholder-gray-500"
                    placeholder="Masukkan alamat lengkap Anda"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-2">
                  Registration Token
                </label>
                <input
                  type="text"
                  id="token"
                  value={token || ''}
                  readOnly
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                <span>{submitting ? 'Registering...' : 'Register Now'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}