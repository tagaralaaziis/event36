import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import fs from 'fs/promises'
import path from 'path'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Ambil template terbaru dari DB
    const [templates] = await db.execute('SELECT * FROM certificate_templates WHERE event_id = ? ORDER BY created_at DESC LIMIT 1', [params.id])
    if ((templates as any[]).length === 0) return NextResponse.json({ error: 'No template found' }, { status: 404 })
    
    const template = templates[0]
    const templatePath = path.join(process.cwd(), 'public', template.template_path)
    
    // Check if template file exists
    try {
      await fs.access(templatePath)
    } catch {
      return NextResponse.json({ error: 'Template file not found on disk' }, { status: 404 })
    }
    
    const imageBytes = await fs.readFile(templatePath)
    const fields = typeof template.template_fields === 'string' ? JSON.parse(template.template_fields) : template.template_fields
    
    // Ambil semua peserta event yang sudah registrasi (is_verified = TRUE)
    const [participants] = await db.execute(`
      SELECT p.*, t.token, t.id as ticket_id, e.name as event_name 
      FROM participants p 
      JOIN tickets t ON p.ticket_id = t.id 
      JOIN events e ON t.event_id = e.id 
      WHERE t.event_id = ? AND t.is_verified = TRUE
    `, [params.id])
    
    if ((participants as any[]).length === 0) {
      return NextResponse.json({ error: 'No verified participants found for this event' }, { status: 400 })
    }
    
    // Hapus semua file sertifikat lama untuk event ini
    const [oldCertsAll] = await db.execute(
      `SELECT c.path FROM certificates c
       JOIN participants p ON c.participant_id = p.id
       JOIN tickets t ON p.ticket_id = t.id
       WHERE t.event_id = ?`, [params.id]
    )
    for (const cert of oldCertsAll as any[]) {
      if (cert.path) {
        try { 
          await fs.unlink(path.join(process.cwd(), 'public', cert.path)) 
        } catch {}
      }
    }
    
    // Hapus data sertifikat lama di DB
    await db.execute(
      `DELETE c FROM certificates c
       JOIN participants p ON c.participant_id = p.id
       JOIN tickets t ON p.ticket_id = t.id
       WHERE t.event_id = ?`, [params.id]
    )
    
    // Ambil slug event dan tanggal event
    const [eventRows] = await db.execute('SELECT slug, start_time FROM events WHERE id = ?', [params.id])
    const eventSlug = eventRows[0]?.slug || ''
    const eventDate = eventRows[0]?.start_time ? new Date(eventRows[0].start_time) : new Date()
    const bulanRomawi = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
    const mmRomawi = bulanRomawi[eventDate.getMonth() + 1]
    const yyyy = eventDate.getFullYear()
    
    // Skala konversi posisi field dari UI ke PDF
    let width_img, height_img
    try {
      const sharp = (await import('sharp')).default
      const meta = await sharp(imageBytes).metadata()
      width_img = meta.width || 900
      height_img = meta.height || 636
    } catch {
      width_img = 900
      height_img = 636
    }
    
    const width_pdf = 842;
    const height_pdf = 595;
    
    // Generate sertifikat untuk setiap peserta
    let generatedCount = 0
    for (const p of participants as any[]) {
      try {
        // Generate PDF baru
        const pdfDoc = await PDFDocument.create()
        const page = pdfDoc.addPage([842, 595])
        
        // Embed image sesuai tipe file
        let image
        if (template.template_path.toLowerCase().endsWith('.png')) {
          image = await pdfDoc.embedPng(imageBytes)
        } else if (
          template.template_path.toLowerCase().endsWith('.jpg') ||
          template.template_path.toLowerCase().endsWith('.jpeg')
        ) {
          image = await pdfDoc.embedJpg(imageBytes)
        } else {
          throw new Error('Template must be PNG or JPG/JPEG')
        }
        
        page.drawImage(image, { x: 0, y: 0, width: 842, height: 595 })
        
        for (const f of fields) {
          // Field opsional: token
          if (f.key === 'token' && !f.active) continue
          
          let value = ''
          if (f.key === 'name') value = p.name
          else if (f.key === 'event') value = p.event_name || ''
          else if (f.key === 'number') value = `NOMOR : ${p.id}${params.id}/${eventSlug}/${mmRomawi}/${yyyy}`
          else if (f.key === 'token') value = p.token
          else if (f.key === 'date') value = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric'})
          else value = f.label
          
          // Konversi posisi field
          const x_pdf = (f.x / width_img) * width_pdf
          const y_pdf = height_pdf - ((f.y / height_img) * height_pdf)
          
          // Font family & size & style
          const fontMap = {
            Helvetica: {
              normal: StandardFonts.Helvetica,
              bold: StandardFonts.HelveticaBold,
              italic: StandardFonts.HelveticaOblique,
              bolditalic: StandardFonts.HelveticaBoldOblique
            },
            'Times Roman': {
              normal: StandardFonts.TimesRoman,
              bold: StandardFonts.TimesRomanBold,
              italic: StandardFonts.TimesRomanItalic,
              bolditalic: StandardFonts.TimesRomanBoldItalic
            },
            Courier: {
              normal: StandardFonts.Courier,
              bold: StandardFonts.CourierBold,
              italic: StandardFonts.CourierOblique,
              bolditalic: StandardFonts.CourierBoldOblique
            }
          }
          
          const fontSize = f.fontSize || 24
          let styleKey = 'normal'
          if (f.bold && f.italic) styleKey = 'bolditalic'
          else if (f.bold) styleKey = 'bold'
          else if (f.italic) styleKey = 'italic'
          
          const font = await pdfDoc.embedFont((fontMap[f.fontFamily] && fontMap[f.fontFamily][styleKey]) || StandardFonts.Helvetica)
          
          // Sanitize value (remove zero-width and non-printable chars)
          const sanitize = (str: string) => str.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[^\x20-\x7E\u00A0-\u024F]/g, '')
          const safeValue = sanitize(value)
          const textWidth = font.widthOfTextAtSize(safeValue, fontSize)
          
          page.drawText(safeValue, { x: x_pdf - textWidth / 2, y: y_pdf, size: fontSize, font, color: rgb(0,0,0) })
        }
        
        // Simpan PDF
        const certDir = path.join(process.cwd(), 'public', 'certificates')
        try { await fs.access(certDir) } catch { await fs.mkdir(certDir, { recursive: true }) }
        
        const filename = `cert_${params.id}_${p.id}.pdf`
        const filePath = path.join(certDir, filename)
        await fs.writeFile(filePath, Buffer.from(await pdfDoc.save()))
        
        // Update DB certificates (replace path lama)
        await db.execute('INSERT INTO certificates (participant_id, path, sent) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE path=VALUES(path), sent=FALSE', [p.id, `/certificates/${filename}`, false])
        
        generatedCount++
      } catch (error) {
        console.error(`Error generating certificate for participant ${p.id}:`, error)
      }
    }
    
    return NextResponse.json({ 
      message: `Sertifikat berhasil digenerate untuk ${generatedCount} peserta tervalidasi!`,
      generatedCount,
      totalParticipants: (participants as any[]).length
    })
  } catch (e) {
    console.error('Generate Certificate Error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}

// Endpoint baru: generate sertifikat hanya untuk peserta yang belum punya sertifikat
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Ambil template terbaru dari DB
    const [templates] = await db.execute('SELECT * FROM certificate_templates WHERE event_id = ? ORDER BY created_at DESC LIMIT 1', [params.id])
    if ((templates as any[]).length === 0) return NextResponse.json({ error: 'No template found' }, { status: 404 })
    
    const template = templates[0]
    const templatePath = path.join(process.cwd(), 'public', template.template_path)
    
    // Check if template file exists
    try {
      await fs.access(templatePath)
    } catch {
      return NextResponse.json({ error: 'Template file not found on disk' }, { status: 404 })
    }
    
    const imageBytes = await fs.readFile(templatePath)
    let fields = typeof template.template_fields === 'string' ? JSON.parse(template.template_fields) : template.template_fields
    let templateSize = null
    
    try {
      const body = await request.json()
      if (body?.fields) fields = body.fields
      if (body?.templateSize) templateSize = body.templateSize
    } catch {}
    
    // Ambil peserta event yang sudah terverifikasi dan BELUM punya sertifikat
    const [participants] = await db.execute(`
      SELECT p.*, t.token, t.id as ticket_id, e.name as event_name FROM participants p
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      LEFT JOIN certificates c ON c.participant_id = p.id
      WHERE t.event_id = ? AND t.is_verified = TRUE AND c.id IS NULL
    `, [params.id])
    
    if ((participants as any[]).length === 0) {
      return NextResponse.json({ message: 'No participants need certificate generation' }, { status: 200 })
    }
    
    // Ambil slug event dan tanggal event
    const [eventRows] = await db.execute('SELECT slug, start_time FROM events WHERE id = ?', [params.id])
    const eventSlug = eventRows[0]?.slug || ''
    const eventDate = eventRows[0]?.start_time ? new Date(eventRows[0].start_time) : new Date()
    const bulanRomawi = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
    const mmRomawi = bulanRomawi[eventDate.getMonth() + 1]
    const yyyy = eventDate.getFullYear()
    
    // Skala konversi posisi field dari UI ke PDF
    let width_img = templateSize?.width
    let height_img = templateSize?.height
    if (!width_img || !height_img) {
      const sharp = (await import('sharp')).default
      const meta = await sharp(imageBytes).metadata()
      width_img = meta.width || 900
      height_img = meta.height || 636
    }
    
    const width_pdf = 842;
    const height_pdf = 595;
    
    // Generate sertifikat untuk setiap peserta yang belum punya sertifikat
    let generatedCount = 0
    for (const p of participants as any[]) {
      try {
        const pdfDoc = await PDFDocument.create()
        const page = pdfDoc.addPage([842, 595])
        
        let image
        if (template.template_path.toLowerCase().endsWith('.png')) {
          image = await pdfDoc.embedPng(imageBytes)
        } else if (
          template.template_path.toLowerCase().endsWith('.jpg') ||
          template.template_path.toLowerCase().endsWith('.jpeg')
        ) {
          image = await pdfDoc.embedJpg(imageBytes)
        } else {
          throw new Error('Template must be PNG or JPG/JPEG')
        }
        
        page.drawImage(image, { x: 0, y: 0, width: 842, height: 595 })
        
        for (const f of fields) {
          if (f.active === false) continue
          
          let value = ''
          if (f.key === 'name') value = p.name
          else if (f.key === 'event') value = p.event_name || ''
          else if (f.key === 'number') value = `NOMOR : ${p.id}${params.id}/${eventSlug}/${mmRomawi}/${yyyy}`
          else if (f.key === 'token') value = p.token
          else if (f.key === 'date') value = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric'})
          else value = f.label
          
          const x_pdf = (f.x / width_img) * width_pdf
          const y_pdf = height_pdf - ((f.y / height_img) * height_pdf)
          
          const fontMap = {
            Helvetica: {
              normal: StandardFonts.Helvetica,
              bold: StandardFonts.HelveticaBold,
              italic: StandardFonts.HelveticaOblique,
              bolditalic: StandardFonts.HelveticaBoldOblique
            },
            'Times Roman': {
              normal: StandardFonts.TimesRoman,
              bold: StandardFonts.TimesRomanBold,
              italic: StandardFonts.TimesRomanItalic,
              bolditalic: StandardFonts.TimesRomanBoldItalic
            },
            Courier: {
              normal: StandardFonts.Courier,
              bold: StandardFonts.CourierBold,
              italic: StandardFonts.CourierOblique,
              bolditalic: StandardFonts.CourierBoldOblique
            }
          }
          
          const fontSize = f.fontSize || 24
          let styleKey = 'normal'
          if (f.bold && f.italic) styleKey = 'bolditalic'
          else if (f.bold) styleKey = 'bold'
          else if (f.italic) styleKey = 'italic'
          
          const font = await pdfDoc.embedFont((fontMap[f.fontFamily] && fontMap[f.fontFamily][styleKey]) || StandardFonts.Helvetica)
          
          const sanitize = (str: string) => str.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[^\x20-\x7E\u00A0-\u024F]/g, '')
          const safeValue = sanitize(value)
          const textWidth = font.widthOfTextAtSize(safeValue, fontSize)
          
          page.drawText(safeValue, { x: x_pdf - textWidth / 2, y: y_pdf, size: fontSize, font, color: rgb(0,0,0) })
        }
        
        const certDir = path.join(process.cwd(), 'public', 'certificates')
        try { await fs.access(certDir) } catch { await fs.mkdir(certDir, { recursive: true }) }
        
        const filename = `cert_${params.id}_${p.id}.pdf`
        const filePath = path.join(certDir, filename)
        await fs.writeFile(filePath, Buffer.from(await pdfDoc.save()))
        
        await db.execute('INSERT INTO certificates (participant_id, path, sent) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE path=VALUES(path), sent=FALSE', [p.id, `/certificates/${filename}`, false])
        
        generatedCount++
      } catch (error) {
        console.error(`Error generating certificate for participant ${p.id}:`, error)
      }
    }
    
    return NextResponse.json({ 
      message: `Sertifikat berhasil digenerate untuk ${generatedCount} peserta yang belum punya sertifikat!`,
      generatedCount,
      totalParticipants: (participants as any[]).length
    })
  } catch (e) {
    console.error('Generate Certificate (late) Error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}