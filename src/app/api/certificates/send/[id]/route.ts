import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendCertificateEmail } from '@/lib/email';

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
        p.name, p.email,
        e.name as event_name, e.type as event_type
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

    if (!certificate.path) {
      return NextResponse.json(
        { error: 'Certificate file not found' },
        { status: 404 }
      );
    }

    // Send email with certificate
    await sendCertificateEmail(
      certificate.email,
      certificate.name,
      certificate.event_name,
      certificate.path
    );

    // Update certificate as sent
    await db.execute(`
      UPDATE certificates 
      SET sent = TRUE, sent_at = NOW()
      WHERE id = ?
    `, [certificateId]);

    return NextResponse.json({
      success: true,
      message: 'Certificate sent successfully'
    });

  } catch (error) {
    console.error('Error sending certificate:', error);
    return NextResponse.json(
      { error: 'Failed to send certificate' },
      { status: 500 }
    );
  }
}