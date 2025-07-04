import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { db } from './db';

export interface CertificateData {
  participantName: string;
  eventName: string;
  eventDate: string;
  eventLocation?: string;
  completionDate?: string;
  hours?: number;
  instructor?: string;
  projectCompleted?: string;
}

export interface CertificateTemplate {
  id: number;
  event_id: number;
  template_path: string;
  template_fields: any;
}

export async function generateCertificate(
  participantId: number,
  templateId?: number
): Promise<string> {
  try {
    // Get participant data
    const participantQuery = `
      SELECT 
        p.id,
        p.name,
        p.email,
        p.phone,
        p.address,
        p.registered_at,
        t.token,
        t.is_verified,
        e.id as event_id,
        e.name as event_name,
        e.type as event_type,
        e.location as event_location,
        e.start_time as event_start_time,
        e.end_time as event_end_time
      FROM participants p
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE p.id = ?
    `;
    
    const participants = await db.query(participantQuery, [participantId]);
    
    if (!participants || participants.length === 0) {
      throw new Error('Participant not found');
    }
    
    const participant = participants[0];
    
    // Get certificate template
    let template: CertificateTemplate | null = null;
    
    if (templateId) {
      const templateQuery = `
        SELECT * FROM certificate_templates 
        WHERE id = ? AND event_id = ?
      `;
      const templates = await db.query(templateQuery, [templateId, participant.event_id]);
      template = templates[0] || null;
    } else {
      // Get default template for event
      const templateQuery = `
        SELECT * FROM certificate_templates 
        WHERE event_id = ? 
        ORDER BY created_at ASC 
        LIMIT 1
      `;
      const templates = await db.query(templateQuery, [participant.event_id]);
      template = templates[0] || null;
    }
    
    // Create certificate data
    const certificateData: CertificateData = {
      participantName: participant.name,
      eventName: participant.event_name,
      eventDate: new Date(participant.event_start_time).toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      eventLocation: participant.event_location,
      completionDate: new Date().toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    };
    
    // Generate PDF certificate
    const pdfBytes = await generateCertificatePDF(certificateData, template);
    
    // Save certificate file
    const certificatesDir = path.join(process.cwd(), 'public', 'certificates');
    if (!fs.existsSync(certificatesDir)) {
      fs.mkdirSync(certificatesDir, { recursive: true });
    }
    
    const filename = `cert_${participant.name.replace(/\s+/g, '_').toLowerCase()}_${participant.event_name.replace(/\s+/g, '_').toLowerCase()}.pdf`;
    const filepath = path.join(certificatesDir, filename);
    const relativePath = `/certificates/${filename}`;
    
    fs.writeFileSync(filepath, pdfBytes);
    
    // Save certificate record to database
    const insertQuery = `
      INSERT INTO certificates (participant_id, template_id, path, sent, created_at)
      VALUES (?, ?, ?, FALSE, NOW())
      ON DUPLICATE KEY UPDATE
      path = VALUES(path),
      template_id = VALUES(template_id),
      created_at = NOW()
    `;
    
    await db.execute(insertQuery, [
      participantId,
      template?.id || null,
      relativePath
    ]);
    
    return relativePath;
    
  } catch (error) {
    console.error('Error generating certificate:', error);
    throw error;
  }
}

async function generateCertificatePDF(
  data: CertificateData,
  template: CertificateTemplate | null
): Promise<Uint8Array> {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([842, 595]); // A4 landscape
    
    // Get fonts
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const nameFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const { width, height } = page.getSize();
    
    // Certificate border
    page.drawRectangle({
      x: 50,
      y: 50,
      width: width - 100,
      height: height - 100,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 3,
    });
    
    page.drawRectangle({
      x: 60,
      y: 60,
      width: width - 120,
      height: height - 120,
      borderColor: rgb(0.4, 0.4, 0.4),
      borderWidth: 1,
    });
    
    // Title
    page.drawText('CERTIFICATE OF COMPLETION', {
      x: width / 2 - 180,
      y: height - 150,
      size: 28,
      font: titleFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    
    // Subtitle
    page.drawText('This is to certify that', {
      x: width / 2 - 80,
      y: height - 200,
      size: 14,
      font: bodyFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    // Participant name
    page.drawText(data.participantName, {
      x: width / 2 - (data.participantName.length * 8),
      y: height - 250,
      size: 24,
      font: nameFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    
    // Event details
    page.drawText('has successfully completed', {
      x: width / 2 - 90,
      y: height - 300,
      size: 14,
      font: bodyFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    page.drawText(data.eventName, {
      x: width / 2 - (data.eventName.length * 6),
      y: height - 340,
      size: 18,
      font: titleFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    
    // Date and location
    if (data.eventLocation) {
      page.drawText(`Location: ${data.eventLocation}`, {
        x: width / 2 - 100,
        y: height - 380,
        size: 12,
        font: bodyFont,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
    
    page.drawText(`Date: ${data.eventDate}`, {
      x: width / 2 - 60,
      y: height - 400,
      size: 12,
      font: bodyFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    
    // Completion date
    page.drawText(`Issued on: ${data.completionDate}`, {
      x: width / 2 - 70,
      y: height - 450,
      size: 10,
      font: bodyFont,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    // Signature area
    page.drawText('_____________________', {
      x: width - 250,
      y: 150,
      size: 12,
      font: bodyFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    page.drawText('Authorized Signature', {
      x: width - 240,
      y: 130,
      size: 10,
      font: bodyFont,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    // Serialize the PDF
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

export async function generateMultipleCertificates(
  participantIds: number[],
  templateId?: number
): Promise<string[]> {
  const results: string[] = [];
  
  for (const participantId of participantIds) {
    try {
      const certificatePath = await generateCertificate(participantId, templateId);
      results.push(certificatePath);
    } catch (error) {
      console.error(`Error generating certificate for participant ${participantId}:`, error);
      results.push('');
    }
  }
  
  return results;
}

export async function getCertificateTemplates(eventId: number): Promise<CertificateTemplate[]> {
  try {
    const query = `
      SELECT * FROM certificate_templates 
      WHERE event_id = ? 
      ORDER BY created_at ASC
    `;
    const templates = await db.query(query, [eventId]);
    return templates || [];
  } catch (error) {
    console.error('Error fetching certificate templates:', error);
    return [];
  }
}

export async function saveCertificateTemplate(
  eventId: number,
  templatePath: string,
  templateFields: any
): Promise<number> {
  try {
    const query = `
      INSERT INTO certificate_templates (event_id, template_path, template_fields, created_at)
      VALUES (?, ?, ?, NOW())
    `;
    const result = await db.execute(query, [
      eventId,
      templatePath,
      JSON.stringify(templateFields)
    ]);
    
    return result.insertId;
  } catch (error) {
    console.error('Error saving certificate template:', error);
    throw error;
  }
}