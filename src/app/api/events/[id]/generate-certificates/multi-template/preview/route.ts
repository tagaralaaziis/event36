import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import fs from 'fs/promises'
import path from 'path'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { participantId, templateIndex } = await request.json()
    if (!participantId || !templateIndex) return NextResponse.json({ error: 'participantId and templateIndex are required' }, { status: 400 })
    
    // Fetch participant, event, and the selected template
    const [participantRows] = await db.execute(`
      SELECT p.*, t.token, t.id as ticket_id, e.id as event_id, e.name as event_name, e.slug as event_slug, e.start_time
      FROM participants p
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE p.id = ?
      LIMIT 1
    `, [participantId])
    
    const participant = (participantRows as any[])[0]
    if (!participant) return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    
    const eventId = participant.event_id
    const [templateRows] = await db.execute(
      'SELECT template_path, template_fields FROM certificate_templates_multi WHERE event_id = ? AND template_index = ? LIMIT 1',
      [eventId, templateIndex]
    )
    
    const template = (templateRows as any[])[0]
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    
    // Read template image
    const templatePath = path.join(process.cwd(), 'public', template.template_path)
    const imageBytes = await fs.readFile(templatePath)
    
    let width_img = 900, height_img = 636
    try {
      const sharp = (await import('sharp')).default
      const meta = await sharp(imageBytes).metadata()
      width_img = meta.width || 900
      height_img = meta.height || 636
    } catch {}
    
    // Prepare fields
    const fields = typeof template.template_fields === 'string' ? JSON.parse(template.template_fields) : template.template_fields
    
    // Create a new PDF page for this template
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([842, 595])
    
    let imageEmbed
    if (template.template_path.toLowerCase().endsWith('.png')) {
      imageEmbed = await pdfDoc.embedPng(imageBytes)
    } else if (
      template.template_path.toLowerCase().endsWith('.jpg') ||
      template.template_path.toLowerCase().endsWith('.jpeg')
    ) {
      imageEmbed = await pdfDoc.embedJpg(imageBytes)
    } else {
      throw new Error('Template must be PNG or JPG/JPEG')
    }
    
    page.drawImage(imageEmbed, { x: 0, y: 0, width: 842, height: 595 })
    
    // Certificate number
    const eventSlug = participant.event_slug || ''
    const eventDate = participant.start_time ? new Date(participant.start_time) : new Date()
    const bulanRomawi = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
    const mmRomawi = bulanRomawi[eventDate.getMonth() + 1]
    const yyyy = eventDate.getFullYear()
    const certificateNumber = `NOMOR : ${participant.id}${eventId}/${eventSlug}/${mmRomawi}/${yyyy}`
    
    // Draw fields
    for (const f of fields) {
      if (f.active === false) continue
      
      let value = ''
      if (f.key === 'name') value = participant.name
      else if (f.key === 'event') value = participant.event_name || ''
      else if (f.key === 'number') value = certificateNumber
      else if (f.key === 'token') value = participant.token
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
    
    // Return PDF as buffer (can be rendered as preview in frontend)
    const pdfBytes = await pdfDoc.save()
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="preview-certificate-${participantId}-${templateIndex}.pdf"`,
        'Content-Length': pdfBytes.length.toString(),
      },
    })
  } catch (e) {
    console.error('Multi-template preview error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}