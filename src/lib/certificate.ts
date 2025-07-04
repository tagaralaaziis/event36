import { db } from './db';
import { generateCertificate } from './certificate-generator';
import { sendEmail } from './email';
import fs from 'fs';
import path from 'path';

export interface Certificate {
  id: number;
  participant_id: number;
  template_id?: number;
  path: string;
  sent: boolean;
  sent_at?: string;
  created_at: string;
  participant_name?: string;
  participant_email?: string;
  event_name?: string;
}

export async function getCertificates(): Promise<Certificate[]> {
  try {
    const query = `
      SELECT 
        c.*,
        p.name as participant_name,
        p.email as participant_email,
        e.name as event_name
      FROM certificates c
      JOIN participants p ON c.participant_id = p.id
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      ORDER BY c.created_at DESC
    `;
    
    const certificates = await db.query(query);
    return certificates || [];
  } catch (error) {
    console.error('Error fetching certificates:', error);
    return [];
  }
}

export async function getCertificateById(id: number): Promise<Certificate | null> {
  try {
    const query = `
      SELECT 
        c.*,
        p.name as participant_name,
        p.email as participant_email,
        e.name as event_name
      FROM certificates c
      JOIN participants p ON c.participant_id = p.id
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE c.id = ?
    `;
    
    const certificates = await db.query(query, [id]);
    return certificates[0] || null;
  } catch (error) {
    console.error('Error fetching certificate:', error);
    return null;
  }
}

export async function getCertificatesByEventId(eventId: number): Promise<Certificate[]> {
  try {
    const query = `
      SELECT 
        c.*,
        p.name as participant_name,
        p.email as participant_email,
        e.name as event_name
      FROM certificates c
      JOIN participants p ON c.participant_id = p.id
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE e.id = ?
      ORDER BY c.created_at DESC
    `;
    
    const certificates = await db.query(query, [eventId]);
    return certificates || [];
  } catch (error) {
    console.error('Error fetching certificates by event:', error);
    return [];
  }
}

export async function generateCertificateForParticipant(
  participantId: number,
  templateId?: number
): Promise<string> {
  try {
    return await generateCertificate(participantId, templateId);
  } catch (error) {
    console.error('Error generating certificate for participant:', error);
    throw error;
  }
}

export async function sendCertificateEmail(certificateId: number): Promise<boolean> {
  try {
    const certificate = await getCertificateById(certificateId);
    
    if (!certificate) {
      throw new Error('Certificate not found');
    }
    
    if (!certificate.participant_email) {
      throw new Error('Participant email not found');
    }
    
    // Check if certificate file exists
    const certificatePath = path.join(process.cwd(), 'public', certificate.path);
    if (!fs.existsSync(certificatePath)) {
      throw new Error('Certificate file not found');
    }
    
    // Send email with certificate attachment
    const emailSent = await sendEmail({
      to: certificate.participant_email,
      subject: `Certificate for ${certificate.event_name}`,
      html: `
        <h2>Congratulations ${certificate.participant_name}!</h2>
        <p>Thank you for participating in <strong>${certificate.event_name}</strong>.</p>
        <p>Please find your certificate of completion attached to this email.</p>
        <br>
        <p>Best regards,<br>Event Management Team</p>
      `,
      attachments: [
        {
          filename: `certificate_${certificate.participant_name?.replace(/\s+/g, '_')}.pdf`,
          path: certificatePath
        }
      ]
    });
    
    if (emailSent) {
      // Update certificate as sent
      await db.execute(
        'UPDATE certificates SET sent = TRUE, sent_at = NOW() WHERE id = ?',
        [certificateId]
      );
    }
    
    return emailSent;
  } catch (error) {
    console.error('Error sending certificate email:', error);
    return false;
  }
}

export async function regenerateCertificate(
  certificateId: number,
  templateId?: number
): Promise<string> {
  try {
    const certificate = await getCertificateById(certificateId);
    
    if (!certificate) {
      throw new Error('Certificate not found');
    }
    
    // Delete old certificate file if exists
    const oldPath = path.join(process.cwd(), 'public', certificate.path);
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
    
    // Generate new certificate
    const newPath = await generateCertificate(certificate.participant_id, templateId);
    
    // Update certificate record
    await db.execute(
      'UPDATE certificates SET path = ?, template_id = ?, sent = FALSE, sent_at = NULL, created_at = NOW() WHERE id = ?',
      [newPath, templateId || null, certificateId]
    );
    
    return newPath;
  } catch (error) {
    console.error('Error regenerating certificate:', error);
    throw error;
  }
}

export async function deleteCertificate(certificateId: number): Promise<boolean> {
  try {
    const certificate = await getCertificateById(certificateId);
    
    if (!certificate) {
      return false;
    }
    
    // Delete certificate file
    const certificatePath = path.join(process.cwd(), 'public', certificate.path);
    if (fs.existsSync(certificatePath)) {
      fs.unlinkSync(certificatePath);
    }
    
    // Delete certificate record
    await db.execute('DELETE FROM certificates WHERE id = ?', [certificateId]);
    
    return true;
  } catch (error) {
    console.error('Error deleting certificate:', error);
    return false;
  }
}

export async function bulkGenerateCertificates(
  participantIds: number[],
  templateId?: number
): Promise<{ success: string[], failed: string[] }> {
  const success: string[] = [];
  const failed: string[] = [];
  
  for (const participantId of participantIds) {
    try {
      const certificatePath = await generateCertificate(participantId, templateId);
      success.push(certificatePath);
    } catch (error) {
      console.error(`Failed to generate certificate for participant ${participantId}:`, error);
      failed.push(`Participant ID: ${participantId}`);
    }
  }
  
  return { success, failed };
}

export async function bulkSendCertificates(certificateIds: number[]): Promise<{ success: number[], failed: number[] }> {
  const success: number[] = [];
  const failed: number[] = [];
  
  for (const certificateId of certificateIds) {
    try {
      const sent = await sendCertificateEmail(certificateId);
      if (sent) {
        success.push(certificateId);
      } else {
        failed.push(certificateId);
      }
    } catch (error) {
      console.error(`Failed to send certificate ${certificateId}:`, error);
      failed.push(certificateId);
    }
  }
  
  return { success, failed };
}