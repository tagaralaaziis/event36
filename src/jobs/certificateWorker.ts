import { certificateQueue } from './certificateQueue'
import { generateCertificatePdfLib } from '@/lib/certificate-pdf-lib'
import db from '@/lib/db'

certificateQueue.process(async (job) => {
  const { participantId } = job.data
  // Ambil data peserta, event, dan template dari DB
  const [rows] = await db.execute(`
    SELECT p.*, t.token, t.is_verified, e.name as event_name, e.id as event_id, e.slug as event_slug, e.start_time, ct.template_path, ct.template_fields
    FROM participants p
    JOIN tickets t ON p.ticket_id = t.id
    JOIN events e ON t.event_id = e.id
    LEFT JOIN certificate_templates ct ON ct.event_id = e.id
    WHERE p.id = ?
    ORDER BY ct.created_at DESC
    LIMIT 1
  `, [participantId])
  if (!rows || !rows[0]) throw new Error('Participant/template not found')
  const cert = rows[0]
  const fields = typeof cert.template_fields === 'string' ? JSON.parse(cert.template_fields) : cert.template_fields
  let width_img = 900, height_img = 636
  try {
    const sharp = (await import('sharp')).default
    const imageBytes = await (await import('fs/promises')).readFile(require('path').join(process.cwd(), 'public', cert.template_path))
    const meta = await sharp(imageBytes).metadata()
    width_img = meta.width || 900
    height_img = meta.height || 636
  } catch {}
  const eventSlug = cert.event_slug || ''
  const eventDate = cert.start_time ? new Date(cert.start_time) : new Date()
  const bulanRomawi = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
  const mmRomawi = bulanRomawi[eventDate.getMonth() + 1]
  const yyyy = eventDate.getFullYear()
  const certificateNumber = `NOMOR : ${cert.id}${cert.event_id}/${eventSlug}/${mmRomawi}/${yyyy}`
  // Generate PDF
  const newPath = await generateCertificatePdfLib({
    participant: {
      ...cert,
      name: cert.name,
      event_name: cert.event_name,
      token: cert.token,
      id: cert.id,
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
  // Update DB certificates
  await db.execute('INSERT INTO certificates (participant_id, path, sent) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE path=VALUES(path), sent=FALSE', [cert.id, newPath, false])
  return { path: newPath }
})

// Monitoring events
certificateQueue.on('completed', (job, result) => {
  console.log(`[QUEUE] Job selesai: participantId=${job.data.participantId}, path=${result?.path}`)
})

certificateQueue.on('failed', (job, err) => {
  console.error(`[QUEUE] Job gagal: participantId=${job.data.participantId}, error=${err.message}`)
  // TODO: Integrasi notifikasi email/Slack jika perlu
})

certificateQueue.on('active', (job) => {
  console.log(`[QUEUE] Mulai proses job: participantId=${job.data.participantId}`)
})

certificateQueue.on('waiting', (jobId) => {
  console.log(`[QUEUE] Job waiting: jobId=${jobId}`)
}) 