import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateCertificateWithTemplate } from '@/lib/certificate-generator';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const certificateId = params.id;

    // Get certificate and participant data
    const [certificateRows] = await db.execute(`
      SELECT 
        c.*,
        p.name, p.email, p.phone, p.address,
        t.token,
        e.id as event_id, e.name as event_name, e.start_time, e.end_time
      FROM certificates c
      JOIN participants p ON c.participant_id = p.id
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE c.id = ?
    `, [certificateId]);

    if (!certificateRows || (certificateRows as any[]).length === 0) {
      return NextResponse.json(
        { error: 'Certificate not found' },
        { status: 404 }
      );
    }

    const certificate = (certificateRows as any[])[0];

    // Get template data (check both single and multi templates)
    let template = null;
    
    // First try multi-template
    if (certificate.template_id) {
      const [multiTemplateRows] = await db.execute(`
        SELECT * FROM certificate_templates_multi 
        WHERE event_id = ? AND template_index = ?
      `, [certificate.event_id, certificate.template_id]);
      
      if (multiTemplateRows && (multiTemplateRows as any[]).length > 0) {
        const templateData = (multiTemplateRows as any[])[0];
        template = {
          image: templateData.template_path,
          elements: JSON.parse(templateData.template_fields || '[]')
        };
      }
    }
    
    // If not found, try single template
    if (!template) {
      const [singleTemplateRows] = await db.execute(`
        SELECT * FROM certificate_templates 
        WHERE event_id = ?
      `, [certificate.event_id]);
      
      if (singleTemplateRows && (singleTemplateRows as any[]).length > 0) {
        const templateData = (singleTemplateRows as any[])[0];
        template = {
          image: templateData.template_path,
          elements: JSON.parse(templateData.template_fields || '[]')
        };
      }
    }

    if (!template) {
      return NextResponse.json(
        { error: 'Certificate template not found' },
        { status: 404 }
      );
    }

    // Prepare participant data with uppercase name
    const participantData = {
      ...certificate,
      name: certificate.name.toUpperCase(), // Auto uppercase
      certificate_number: `CERT-${certificate.token}-${certificate.template_id || 1}`,
      date: new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    };

    // Generate new certificate
    const certificatePath = await generateCertificateWithTemplate(
      template,
      participantData,
      certificate.event_id,
      `regenerated_${Date.now()}`
    );

    // Update certificate record
    await db.execute(`
      UPDATE certificates 
      SET path = ?, sent = FALSE, created_at = NOW()
      WHERE id = ?
    `, [certificatePath, certificateId]);

    return NextResponse.json({
      success: true,
      message: 'Certificate regenerated successfully',
      path: certificatePath
    });

  } catch (error) {
    console.error('Error regenerating certificate:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate certificate' },
      { status: 500 }
    );
  }
}