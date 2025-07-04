import db from '@/lib/db'
import { sendCertificateEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const certificateId = params.id
  try {
    // Ambil data sertifikat dan peserta
    const result = await db.execute(`
      SELECT c.*, p.name as participant_name, p.email, e.name as event_name
      FROM certificates c
      JOIN participants p ON c.participant_id = p.id
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE c.id = ?
      LIMIT 1
    `, [certificateId])
    const rows = Array.isArray(result) ? (result[0] as any[]) : []
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ message: 'Certificate not found' }, { status: 404 })
    }
    const cert = rows[0]
    // Path file sertifikat (pastikan path sesuai dengan sistem Anda)
    const certificatePath = path.join(process.cwd(), 'public', cert.path)
    // Kirim email
    const sent = await sendCertificateEmail(cert.email, cert.participant_name, cert.event_name, certificatePath)
    if (sent) {
      // Update status sent di database
      await db.execute('UPDATE certificates SET sent = 1, sent_at = NOW() WHERE id = ?', [certificateId])
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ success: false, message: 'Failed to send email' }, { status: 500 })
    }
  } catch (error) {
    console.error('Send certificate error:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
} 