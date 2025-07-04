import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import fs from 'fs/promises'
import path from 'path'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { fields, templateSize, participantId } = await request.json()
    
    // Ambil template terbaru dari DB
    const [rows] = await db.execute('SELECT * FROM certificate_templates WHERE event_id = ? ORDER BY created_at DESC LIMIT 1', [params.id])
    if ((rows as any[]).length === 0) return NextResponse.json({ error: 'No template found' }, { status: 404 })
    
    const template = rows[0]
    const templatePath = path.join(process.cwd(), 'public', template.template_path)
    
    // Check if template file exists
    try {
      await fs.access(templatePath)
    } catch {
      return NextResponse.json({ error: 'Template file not found' }, { status: 404 })
    }
    
    const imageBytes = await fs.readFile(templatePath)
    
    // Buat PDF
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([842, 595]) // A4 landscape pt
    
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
    
    // Skala konversi posisi field dari UI ke PDF
    let width_img = templateSize?.width
    let height_img = templateSize?.height
    if (!width_img || !height_img) {
      // Baca ukuran asli gambar jika tidak ada templateSize
      const sharp = (await import('sharp')).default
      const meta = await sharp(imageBytes).metadata()
      width_img = meta.width || 900
      height_img = meta.height || 636
    }
    
    const width_pdf = 842;
    const height_pdf = 595;
    
    // Ambil slug event dan tanggal event
    const [eventRows] = await db.execute('SELECT slug, start_time, name FROM events WHERE id = ?', [params.id])
    const eventSlug = eventRows[0]?.slug || ''
    const eventName = eventRows[0]?.name || 'Sample Event'
    const eventDate = eventRows[0]?.start_time ? new Date(eventRows[0].start_time) : new Date()
    const bulanRomawi = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
    const mmRomawi = bulanRomawi[eventDate.getMonth() + 1]
    const yyyy = eventDate.getFullYear()
    
    // Get participant data if participantId is provided
    let participantName = 'Contoh Nama Peserta'
    let participantToken = 'SAMPLE_TOKEN'
    
    if (participantId && participantId !== 'SAMPLE_PARTICIPANT_ID') {
      const [participantRows] = await db.execute(`
        SELECT p.name, t.token 
        FROM participants p 
        JOIN tickets t ON p.ticket_id = t.id 
        WHERE p.id = ?
      `, [participantId])
      
      if ((participantRows as any[]).length > 0) {
        participantName = (participantRows as any[])[0].name
        participantToken = (participantRows as any[])[0].token
      }
    }
    
    // Draw fields (pakai data sesuai context)
    for (const f of fields) {
      if (f.active === false) continue
      
      let value = f.label
      if (f.key === 'name') value = participantName
      else if (f.key === 'event') value = eventName
      else if (f.key === 'number') value = `NOMOR : 1${params.id}/${eventSlug}/${mmRomawi}/${yyyy}`
      else if (f.key === 'token') value = participantToken
      else if (f.key === 'date') value = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric'})
      
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
    
    const pdfBytes = await pdfDoc.save()
    return new NextResponse(Buffer.from(pdfBytes), { 
      status: 200, 
      headers: { 
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="certificate-preview.pdf"'
      } 
    })
  } catch (e) {
    console.error('Preview certificate error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}