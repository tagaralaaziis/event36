import db from '@/lib/db'
import fs from 'fs/promises'
import path from 'path'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export async function generateCertificate(participantId: string, forceRegenerate = false) {
  const [existingCert] = await db.execute('SELECT * FROM certificates WHERE participant_id = ?', [participantId])
  const certExists = (existingCert as any[]).length > 0

  if (certExists && !forceRegenerate) {
    throw new Error('Sertifikat untuk peserta ini sudah ada.')
  }

  if (certExists && forceRegenerate) {
    console.log(`Regenerating certificate for participant ${participantId}. Deleting old one...`);
    const oldCertPath = (existingCert as any[])[0].path;
    if (oldCertPath) {
      try {
        await fs.unlink(path.join(process.cwd(), 'public', oldCertPath));
        console.log(`Deleted old certificate file: ${oldCertPath}`);
      } catch (e) {
        console.error(`Failed to delete old certificate file, but continuing:`, e);
      }
    }
    await db.execute('DELETE FROM certificates WHERE participant_id = ?', [participantId]);
    console.log(`Removed old certificate record for participant ${participantId}`);
  }

  // Ambil data peserta, event, dan template
  const [rows] = await db.execute(`
    SELECT p.*, t.token, t.id as ticket_id, e.id as event_id, e.name as event_name, e.slug as event_slug, e.start_time, ct.template_path, ct.template_fields
    FROM participants p
    JOIN tickets t ON p.ticket_id = t.id
    JOIN events e ON t.event_id = e.id
    LEFT JOIN certificate_templates ct ON ct.event_id = e.id
    WHERE p.id = ?
    ORDER BY ct.created_at DESC
    LIMIT 1
  `, [participantId])

  const participantData = (rows as any[])[0]
  if (!participantData || !participantData.template_path) {
    throw new Error('Template untuk event ini belum ada. Silakan upload template terlebih dahulu.')
  }

  // Check if template file exists
  const templatePath = path.join(process.cwd(), 'public', participantData.template_path)
  try {
    await fs.access(templatePath)
  } catch {
    throw new Error('Template file tidak ditemukan di server. Silakan upload ulang template.')
  }

  const fields = typeof participantData.template_fields === 'string' ? JSON.parse(participantData.template_fields) : participantData.template_fields
  let width_img = 900, height_img = 636
  try {
    const sharp = (await import('sharp')).default
    const imageBytes = await fs.readFile(templatePath)
    const meta = await sharp(imageBytes).metadata()
    width_img = meta.width || 900
    height_img = meta.height || 636
  } catch {}

  const eventSlug = participantData.event_slug || ''
  const eventDate = participantData.start_time ? new Date(participantData.start_time) : new Date()
  const bulanRomawi = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
  const mmRomawi = bulanRomawi[eventDate.getMonth() + 1]
  const yyyy = eventDate.getFullYear()
  const certificateNumber = `NOMOR : ${participantData.id}${participantData.event_id}/${eventSlug}/${mmRomawi}/${yyyy}`

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([842, 595])

  const templateImageBytes = await fs.readFile(templatePath)
  let imageEmbed
  if (participantData.template_path.toLowerCase().endsWith('.png')) {
    imageEmbed = await pdfDoc.embedPng(templateImageBytes)
  } else if (
    participantData.template_path.toLowerCase().endsWith('.jpg') ||
    participantData.template_path.toLowerCase().endsWith('.jpeg')
  ) {
    imageEmbed = await pdfDoc.embedJpg(templateImageBytes)
  } else {
    throw new Error('Template must be PNG or JPG/JPEG')
  }

  page.drawImage(imageEmbed, { x: 0, y: 0, width: 842, height: 595 })

  for (const f of fields) {
    if (f.active === false) continue
    let value = ''
    if (f.key === 'name') value = participantData.name.toUpperCase()
    else if (f.key === 'event') value = participantData.event_name || ''
    else if (f.key === 'number') value = certificateNumber
    else if (f.key === 'token') value = participantData.token
    else if (f.key === 'date') value = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric'})
    else value = f.label || ''

    const x_pdf = (f.x / width_img) * 842
    const y_pdf = 595 - ((f.y / height_img) * 595)

    const fontMap = {
      Helvetica: { normal: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold, italic: StandardFonts.HelveticaOblique, bolditalic: StandardFonts.HelveticaBoldOblique },
      'Times Roman': { normal: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold, italic: StandardFonts.TimesRomanItalic, bolditalic: StandardFonts.TimesRomanBoldItalic },
      Courier: { normal: StandardFonts.Courier, bold: StandardFonts.CourierBold, italic: StandardFonts.CourierOblique, bolditalic: StandardFonts.CourierBoldOblique },
    }

    const fontSize = f.fontSize || 24
    let styleKey: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal'
    if (f.bold && f.italic) styleKey = 'bolditalic'
    else if (f.bold) styleKey = 'bold'
    else if (f.italic) styleKey = 'italic'

    const font = await pdfDoc.embedFont((fontMap[f.fontFamily as keyof typeof fontMap]?.[styleKey]) || StandardFonts.Helvetica)
    
    const sanitize = (str: string) => str.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[^\x20-\x7E\u00A0-\u024F]/g, '')
    const safeValue = sanitize(value)
    const textWidth = font.widthOfTextAtSize(safeValue, fontSize)
    
    page.drawText(safeValue, { x: x_pdf - textWidth / 2, y: y_pdf, size: fontSize, font, color: rgb(0,0,0) })
  }

  const certDir = path.join(process.cwd(), 'public', 'certificates')
  try { await fs.access(certDir) } catch { await fs.mkdir(certDir, { recursive: true }) }
  
  const filename = `cert_${participantData.event_id}_${participantData.id}.pdf`
  const filePath = path.join(certDir, filename)
  
  await fs.writeFile(filePath, Buffer.from(await pdfDoc.save()))
  
  const relativePath = `/certificates/${filename}`
  await db.execute('INSERT INTO certificates (participant_id, path, sent) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE path=VALUES(path), sent=FALSE', [participantData.id, relativePath, false])
  
  return { success: true, path: relativePath }
}