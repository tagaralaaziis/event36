import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs/promises'
import path from 'path'
import db from './db'

export interface CertificateData {
  participantName: string
  eventName: string
  eventDate: string
  eventLocation?: string
  completionDate?: string
  certificateId?: string
  additionalInfo?: string
}

export interface CertificateTemplate {
  id: number
  event_id: number
  template_path: string
  template_fields: any
}

// Generate certificate with participant ID
export async function generateCertificate(
  participantId: number, 
  templateId?: number,
  forceRegenerate: boolean = false
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    // Get participant data
    const [participantRows]: any = await db.execute(`
      SELECT p.*, t.token, e.name as event_name, e.location, e.start_time, e.end_time
      FROM participants p
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE p.id = ?
    `, [participantId])

    if (!participantRows || participantRows.length === 0) {
      throw new Error('Participant not found')
    }

    const participant = participantRows[0]

    // Check if certificate already exists and not forcing regeneration
    if (!forceRegenerate) {
      const [existingCerts]: any = await db.execute(
        'SELECT * FROM certificates WHERE participant_id = ?',
        [participantId]
      )

      if (existingCerts && existingCerts.length > 0) {
        return { success: true, path: existingCerts[0].path }
      }
    }

    // Get template if specified
    let template = null
    if (templateId) {
      const [templateRows]: any = await db.execute(
        'SELECT * FROM certificate_templates WHERE id = ?',
        [templateId]
      )
      if (templateRows && templateRows.length > 0) {
        template = templateRows[0]
      }
    }

    // Generate certificate
    const certificateData: CertificateData = {
      participantName: participant.name,
      eventName: participant.event_name,
      eventDate: new Date(participant.start_time).toLocaleDateString('id-ID'),
      eventLocation: participant.location,
      completionDate: new Date().toLocaleDateString('id-ID'),
      certificateId: `CERT-${participant.token}-${Date.now()}`
    }

    const certificatePath = await createCertificatePDF(certificateData, template)

    // Save certificate record
    const [result]: any = await db.execute(`
      INSERT INTO certificates (participant_id, template_id, path, sent, created_at)
      VALUES (?, ?, ?, FALSE, NOW())
      ON DUPLICATE KEY UPDATE
      path = VALUES(path), template_id = VALUES(template_id), created_at = NOW()
    `, [participantId, templateId || null, certificatePath])

    return { success: true, path: certificatePath }

  } catch (error) {
    console.error('Error generating certificate:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Generate certificate with template
export async function generateCertificateWithTemplate(
  participantId: number,
  templateId: number,
  forceRegenerate: boolean = false
): Promise<{ success: boolean; path?: string; error?: string }> {
  return await generateCertificate(participantId, templateId, forceRegenerate)
}

// Create PDF certificate
async function createCertificatePDF(data: CertificateData, template?: any): Promise<string> {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([842, 595]) // A4 landscape
    
    // Get fonts
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const nameFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const { width, height } = page.getSize()

    // Certificate border
    page.drawRectangle({
      x: 50,
      y: 50,
      width: width - 100,
      height: height - 100,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 3,
    })

    // Inner border
    page.drawRectangle({
      x: 70,
      y: 70,
      width: width - 140,
      height: height - 140,
      borderColor: rgb(0.4, 0.4, 0.4),
      borderWidth: 1,
    })

    // Title
    page.drawText('CERTIFICATE OF COMPLETION', {
      x: width / 2 - 200,
      y: height - 150,
      size: 32,
      font: titleFont,
      color: rgb(0.1, 0.1, 0.1),
    })

    // Subtitle
    page.drawText('This is to certify that', {
      x: width / 2 - 100,
      y: height - 220,
      size: 16,
      font: bodyFont,
      color: rgb(0.3, 0.3, 0.3),
    })

    // Participant name
    page.drawText(data.participantName, {
      x: width / 2 - (data.participantName.length * 8),
      y: height - 280,
      size: 28,
      font: nameFont,
      color: rgb(0.1, 0.1, 0.1),
    })

    // Event details
    page.drawText('has successfully completed', {
      x: width / 2 - 120,
      y: height - 330,
      size: 16,
      font: bodyFont,
      color: rgb(0.3, 0.3, 0.3),
    })

    page.drawText(data.eventName, {
      x: width / 2 - (data.eventName.length * 6),
      y: height - 370,
      size: 20,
      font: titleFont,
      color: rgb(0.1, 0.1, 0.1),
    })

    // Date and location
    if (data.eventDate) {
      page.drawText(`Date: ${data.eventDate}`, {
        x: 150,
        y: height - 450,
        size: 12,
        font: bodyFont,
        color: rgb(0.3, 0.3, 0.3),
      })
    }

    if (data.eventLocation) {
      page.drawText(`Location: ${data.eventLocation}`, {
        x: 150,
        y: height - 470,
        size: 12,
        font: bodyFont,
        color: rgb(0.3, 0.3, 0.3),
      })
    }

    // Certificate ID
    if (data.certificateId) {
      page.drawText(`Certificate ID: ${data.certificateId}`, {
        x: width - 300,
        y: 100,
        size: 10,
        font: bodyFont,
        color: rgb(0.5, 0.5, 0.5),
      })
    }

    // Completion date
    page.drawText(`Issued on: ${data.completionDate || new Date().toLocaleDateString('id-ID')}`, {
      x: width - 300,
      y: 80,
      size: 10,
      font: bodyFont,
      color: rgb(0.5, 0.5, 0.5),
    })

    // Save PDF
    const pdfBytes = await pdfDoc.save()
    
    // Ensure certificates directory exists
    const certificatesDir = path.join(process.cwd(), 'public', 'certificates')
    try {
      await fs.access(certificatesDir)
    } catch {
      await fs.mkdir(certificatesDir, { recursive: true })
    }

    // Generate filename
    const filename = `cert_${data.participantName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`
    const filePath = path.join(certificatesDir, filename)
    
    // Write file
    await fs.writeFile(filePath, pdfBytes)
    
    return `/certificates/${filename}`

  } catch (error) {
    console.error('Error creating PDF certificate:', error)
    throw error
  }
}

// Bulk generate certificates
export async function bulkGenerateCertificates(
  participantIds: number[],
  templateId?: number,
  forceRegenerate: boolean = false
): Promise<{ success: number; failed: number; results: any[] }> {
  const results = []
  let success = 0
  let failed = 0

  for (const participantId of participantIds) {
    try {
      const result = await generateCertificate(participantId, templateId, forceRegenerate)
      if (result.success) {
        success++
        results.push({ participantId, status: 'success', path: result.path })
      } else {
        failed++
        results.push({ participantId, status: 'failed', error: result.error })
      }
    } catch (error) {
      failed++
      results.push({ 
        participantId, 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
    }
  }

  return { success, failed, results }
}

// Get certificate templates for event
export async function getCertificateTemplates(eventId: number): Promise<CertificateTemplate[]> {
  try {
    const [rows]: any = await db.execute(
      'SELECT * FROM certificate_templates WHERE event_id = ? ORDER BY created_at DESC',
      [eventId]
    )
    return rows || []
  } catch (error) {
    console.error('Error getting certificate templates:', error)
    return []
  }
}

// Create certificate template
export async function createCertificateTemplate(
  eventId: number,
  templatePath: string,
  templateFields: any
): Promise<{ success: boolean; templateId?: number; error?: string }> {
  try {
    const [result]: any = await db.execute(
      'INSERT INTO certificate_templates (event_id, template_path, template_fields) VALUES (?, ?, ?)',
      [eventId, templatePath, JSON.stringify(templateFields)]
    )

    return { success: true, templateId: result.insertId }
  } catch (error) {
    console.error('Error creating certificate template:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}