import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import fs from 'fs/promises'
import path from 'path'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const eventId = params.id
    
    // Fetch all verified participants for this event
    const [participantRows] = await db.execute(`
      SELECT p.*, t.token, t.id as ticket_id, e.id as event_id, e.name as event_name, e.slug as event_slug, e.start_time
      FROM participants p
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE t.event_id = ? AND t.is_verified = TRUE
      ORDER BY p.id ASC
    `, [eventId])
    
    const participants = (participantRows as any[])
    if (!participants.length) {
      return NextResponse.json({ error: 'No verified participants found' }, { status: 400 })
    }

    // Fetch all templates for this event (1-6)
    const [templateRows] = await db.execute(
      'SELECT template_index, template_path, template_fields FROM certificate_templates_multi WHERE event_id = ? ORDER BY template_index ASC',
      [eventId]
    )
    
    const templates = (templateRows as any[])
    if (!templates.length) {
      return NextResponse.json({ error: 'No templates found for this event' }, { status: 404 })
    }

    let successCount = 0
    let failureCount = 0
    const results = []

    // Generate certificates for each participant
    for (const participant of participants) {
      try {
        // Check if participant already has certificates
        const [existingCerts] = await db.execute(
          'SELECT id FROM certificates WHERE participant_id = ?',
          [participant.id]
        )

        // Delete existing certificates if any
        if ((existingCerts as any[]).length > 0) {
          for (const cert of existingCerts as any[]) {
            try {
              const [certData] = await db.execute('SELECT path FROM certificates WHERE id = ?', [cert.id])
              if ((certData as any[])[0]?.path) {
                const oldPath = path.join(process.cwd(), 'public', (certData as any[])[0].path)
                await fs.unlink(oldPath).catch(() => {}) // Ignore if file doesn't exist
              }
            } catch (e) {
              console.error('Error deleting old certificate file:', e)
            }
          }
          await db.execute('DELETE FROM certificates WHERE participant_id = ?', [participant.id])
        }

        // Create merged PDF with all templates
        const mergedPdf = await PDFDocument.create()
        
        for (const template of templates) {
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
          const page = mergedPdf.addPage([842, 595])
          
          let imageEmbed
          if (template.template_path.toLowerCase().endsWith('.png')) {
            imageEmbed = await mergedPdf.embedPng(imageBytes)
          } else if (
            template.template_path.toLowerCase().endsWith('.jpg') ||
            template.template_path.toLowerCase().endsWith('.jpeg')
          ) {
            imageEmbed = await mergedPdf.embedJpg(imageBytes)
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
            
            const font = await mergedPdf.embedFont((fontMap[f.fontFamily] && fontMap[f.fontFamily][styleKey]) || StandardFonts.Helvetica)
            
            const sanitize = (str: string) => str.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[^\x20-\x7E\u00A0-\u024F]/g, '')
            const safeValue = sanitize(value)
            const textWidth = font.widthOfTextAtSize(safeValue, fontSize)
            
            page.drawText(safeValue, { x: x_pdf - textWidth / 2, y: y_pdf, size: fontSize, font, color: rgb(0,0,0) })
          }
        }

        // Save merged PDF to disk
        const certDir = path.join(process.cwd(), 'public', 'certificates')
        try { await fs.access(certDir) } catch { await fs.mkdir(certDir, { recursive: true }) }
        
        const filename = `cert_multi_${eventId}_${participant.id}.pdf`
        const filePath = path.join(certDir, filename)
        const relativePath = `/certificates/${filename}`
        
        const pdfBytes = await mergedPdf.save()
        await fs.writeFile(filePath, Buffer.from(pdfBytes))
        
        // Save to database
        await db.execute(
          'INSERT INTO certificates (participant_id, path, sent) VALUES (?, ?, ?)',
          [participant.id, relativePath, false]
        )
        
        successCount++
        results.push({ 
          participantId: participant.id, 
          participantName: participant.name,
          status: 'success', 
          path: relativePath,
          templatesUsed: templates.length
        })
        
      } catch (error) {
        console.error(`Failed to generate multi-certificate for participant ${participant.id}:`, error)
        failureCount++
        results.push({ 
          participantId: participant.id, 
          participantName: participant.name,
          status: 'failed', 
          reason: error instanceof Error ? error.message : 'Unknown error' 
        })
      }
    }

    return NextResponse.json({
      message: `Multi-template certificate generation completed.`,
      successCount,
      failureCount,
      totalParticipants: participants.length,
      templatesUsed: templates.length,
      results,
    })
  } catch (e) {
    console.error('Bulk multi-template generate error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}