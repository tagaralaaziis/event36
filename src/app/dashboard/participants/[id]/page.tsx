'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface Participant {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  token: string;
  registered_at: string;
  event_name: string;
  event_type: string;
  event_start_time: string;
  is_verified: boolean;
}

interface Certificate {
  id: number;
  path: string;
  sent: boolean;
  sent_at: string;
  created_at: string;
}

export default function ParticipantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const participantId = params.id as string;
  
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  });
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    fetchParticipantData();
    fetchCertificates();
  }, [participantId]);

  const fetchParticipantData = async () => {
    try {
      const response = await fetch(`/api/participants/${participantId}`);
      if (response.ok) {
        const data = await response.json();
        setParticipant(data);
        setEditForm({
          name: data.name,
          email: data.email,
          phone: data.phone || '',
          address: data.address || ''
        });
      } else {
        toast.error('Gagal memuat data peserta');
      }
    } catch (error) {
      console.error('Error fetching participant:', error);
      toast.error('Gagal memuat data peserta');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCertificates = async () => {
    try {
      const response = await fetch(`/api/certificates?participantId=${participantId}`);
      if (response.ok) {
        const data = await response.json();
        setCertificates(data);
      }
    } catch (error) {
      console.error('Error fetching certificates:', error);
    }
  };

  const handleUpdateParticipant = async () => {
    try {
      const response = await fetch(`/api/participants/${participantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });

      if (response.ok) {
        toast.success('Data peserta berhasil diperbarui');
        setIsEditing(false);
        fetchParticipantData();
      } else {
        toast.error('Gagal memperbarui data peserta');
      }
    } catch (error) {
      console.error('Error updating participant:', error);
      toast.error('Gagal memperbarui data peserta');
    }
  };

  const handleRegenerateCertificate = async (certificateId: number) => {
    setIsRegenerating(true);
    try {
      const response = await fetch(`/api/certificates/regenerate/${certificateId}`, {
        method: 'POST'
      });

      if (response.ok) {
        toast.success('Sertifikat berhasil digenerate ulang');
        fetchCertificates();
      } else {
        toast.error('Gagal regenerate sertifikat');
      }
    } catch (error) {
      console.error('Error regenerating certificate:', error);
      toast.error('Gagal regenerate sertifikat');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleResendCertificate = async (certificateId: number) => {
    setIsResending(true);
    try {
      const response = await fetch(`/api/certificates/send/${certificateId}`, {
        method: 'POST'
      });

      if (response.ok) {
        toast.success('Sertifikat berhasil dikirim ulang');
        fetchCertificates();
      } else {
        toast.error('Gagal mengirim ulang sertifikat');
      }
    } catch (error) {
      console.error('Error resending certificate:', error);
      toast.error('Gagal mengirim ulang sertifikat');
    } finally {
      setIsResending(false);
    }
  };

  const downloadCertificate = async (certificateId: number) => {
    try {
      const response = await fetch(`/api/certificates/${certificateId}/download`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `certificate_${participant?.name}_${certificateId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        toast.error('Gagal mengunduh sertifikat');
      }
    } catch (error) {
      console.error('Error downloading certificate:', error);
      toast.error('Gagal mengunduh sertifikat');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Memuat data peserta...</p>
        </div>
      </div>
    );
  }

  if (!participant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Peserta Tidak Ditemukan</h2>
          <button
            onClick={() => router.back()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Kembali
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.back()}
                className="flex items-center text-blue-600 hover:text-blue-700 mb-4"
              >
                ← Kembali ke Daftar Peserta
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Detail Peserta</h1>
              <p className="text-gray-600">Informasi lengkap peserta dan sertifikat</p>
            </div>
            <div className="flex gap-3">
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  ✏️ Edit Data
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleUpdateParticipant}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    💾 Simpan
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditForm({
                        name: participant.name,
                        email: participant.email,
                        phone: participant.phone || '',
                        address: participant.address || ''
                      });
                    }}
                    className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
                  >
                    ❌ Batal
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Participant Information */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Informasi Peserta</h2>
            
            {!isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama</label>
                  <p className="text-gray-900">{participant.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <p className="text-gray-900">{participant.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telepon</label>
                  <p className="text-gray-900">{participant.phone || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                  <p className="text-gray-900">{participant.address || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Token</label>
                  <p className="text-gray-900 font-mono">{participant.token}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    participant.is_verified 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {participant.is_verified ? 'Terverifikasi' : 'Belum Terverifikasi'}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Daftar</label>
                  <p className="text-gray-900">
                    {new Date(participant.registered_at).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telepon</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                  <textarea
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    rows={3}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Event Information */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Informasi Event</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Event</label>
                <p className="text-gray-900">{participant.event_name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Event</label>
                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                  {participant.event_type}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Waktu Event</label>
                <p className="text-gray-900">
                  {new Date(participant.event_start_time).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Certificates */}
        <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4">Sertifikat</h2>
          
          {certificates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Belum ada sertifikat yang digenerate</p>
            </div>
          ) : (
            <div className="space-y-4">
              {certificates.map((certificate) => (
                <div key={certificate.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">Sertifikat #{certificate.id}</h3>
                      <p className="text-sm text-gray-600">
                        Dibuat: {new Date(certificate.created_at).toLocaleDateString('id-ID')}
                      </p>
                      {certificate.sent && certificate.sent_at && (
                        <p className="text-sm text-green-600">
                          Dikirim: {new Date(certificate.sent_at).toLocaleDateString('id-ID')}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        certificate.sent 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {certificate.sent ? 'Terkirim' : 'Belum Terkirim'}
                      </span>
                      
                      <button
                        onClick={() => downloadCertificate(certificate.id)}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                      >
                        📥 Download
                      </button>
                      
                      <button
                        onClick={() => handleRegenerateCertificate(certificate.id)}
                        disabled={isRegenerating}
                        className="bg-orange-600 text-white px-3 py-1 rounded text-sm hover:bg-orange-700 disabled:opacity-50"
                      >
                        {isRegenerating ? '⏳' : '🔄'} Regenerate
                      </button>
                      
                      <button
                        onClick={() => handleResendCertificate(certificate.id)}
                        disabled={isResending}
                        className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:opacity-50"
                      >
                        {isResending ? '⏳' : '📧'} Kirim Ulang
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}