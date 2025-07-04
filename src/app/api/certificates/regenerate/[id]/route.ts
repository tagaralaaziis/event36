import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { generateCertificatePdfLib } from '@/lib/certificate-pdf-lib'
import path from 'path'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const certificateId = params.id
  try {
    // Ambil data sertifikat, peserta, event, dan template
    const result = await db.execute(`
      SELECT c.*, p.id as participant_id, p.name as participant_name, p.email, t.token, e.name as event_name, e.id as event_id, e.slug as event_slug, e.start_time, ct.template_path, ct.template_fields
      FROM certificates c
      JOIN participants p ON c.participant_id = p.id
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      LEFT JOIN certificate_templates ct ON ct.event_id = e.id
      WHERE c.id = ?
      ORDER BY ct.created_at DESC
      LIMIT 1
    `, [certificateId])
    const rows = Array.isArray(result) ? (result[0] as any[]) : []
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ message: 'Certificate not found' }, { status: 404 })
    }
    const cert = rows[0]
    // Hapus file lama jika ada
    if (cert.path) {
      try {
        const oldPath = path.join(process.cwd(), 'public', cert.path)
        await (await import('fs/promises')).unlink(oldPath)
      } catch (e) { /* ignore if not exist */ }
    }
    // Field mapping dan ukuran template
    const fields = typeof cert.template_fields === 'string' ? JSON.parse(cert.template_fields) : cert.template_fields
    // Ukuran template (ambil dari metadata gambar jika perlu)
    let width_img = 900, height_img = 636
    try {
      const sharp = (await import('sharp')).default
      const imageBytes = await (await import('fs/promises')).readFile(path.join(process.cwd(), 'public', cert.template_path))
      const meta = await sharp(imageBytes).metadata()
      width_img = meta.width || 900
      height_img = meta.height || 636
    } catch {}
    // Info event
    const eventSlug = cert.event_slug || ''
    const eventDate = cert.start_time ? new Date(cert.start_time) : new Date()
    const bulanRomawi = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
    const mmRomawi = bulanRomawi[eventDate.getMonth() + 1]
    const yyyy = eventDate.getFullYear()
    const certificateNumber = `NOMOR : ${cert.participant_id}${cert.event_id}/${eventSlug}/${mmRomawi}/${yyyy}`
    // Generate PDF identik dengan generate massal/manual
    const newPath = await generateCertificatePdfLib({
      participant: {
        ...cert,
        name: cert.participant_name,
        event_name: cert.event_name,
        token: cert.token,
        id: cert.participant_id,
        event_id: cert.event_id,
      },
      template: cert,
      fields,
      templateSize: { width: width_img, height: height_img },
      eventSlug,
      mmRomawi,
      yyyy,
      certificateNumber,
    })
    // Update path di database certificates
    await db.execute('UPDATE certificates SET path = ? WHERE id = ?', [newPath, certificateId])
    return NextResponse.json({ success: true, path: newPath })
  } catch (error) {
    console.error('Regenerate certificate error:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
} 