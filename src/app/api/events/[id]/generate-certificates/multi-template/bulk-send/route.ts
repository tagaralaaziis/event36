import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendCertificateEmail } from '@/lib/email';
import Queue from 'bull';

// Initialize Redis queue for email sending
const emailQueue = new Queue('email sending', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

// Process email sending jobs
emailQueue.process('send-certificate-email', 10, async (job) => {
  const { participantId, eventId, certificatePath } = job.data;
  
  try {
    // Get participant and event data
    const [participantRows] = await db.execute(`
      SELECT p.*, e.name as event_name, e.type as event_type
      FROM participants p
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE p.id = ? AND e.id = ?
    `, [participantId, eventId]);

    if (!participantRows || participantRows.length === 0) {
      throw new Error('Participant not found');
    }

    const participant = participantRows[0] as any;

    // Send email with certificate
    await sendCertificateEmail(
      participant.email,
      participant.name,
      participant.event_name,
      certificatePath
    );

    // Update certificate as sent
    await db.execute(`
      UPDATE certificates 
      SET sent = TRUE, sent_at = NOW()
      WHERE participant_id = ? AND path = ?
    `, [participantId, certificatePath]);

    // Update progress
    await job.progress(100);
    
    return { success: true };
  } catch (error) {
    console.error('Error sending certificate email:', error);
    throw error;
  }
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id;

    // Get all certificates that haven't been sent yet
    const [certificateRows] = await db.execute(`
      SELECT c.*, p.email, p.name, e.name as event_name
      FROM certificates c
      JOIN participants p ON c.participant_id = p.id
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE e.id = ? AND c.sent = FALSE AND c.path IS NOT NULL
    `, [eventId]);

    const certificates = certificateRows as any[];

    if (certificates.length === 0) {
      return NextResponse.json(
        { error: 'No unsent certificates found' },
        { status: 404 }
      );
    }

    // Clear existing email jobs for this event
    await emailQueue.clean(0, 'completed');
    await emailQueue.clean(0, 'failed');

    // Create email sending jobs
    const jobs = [];
    for (const certificate of certificates) {
      const job = await emailQueue.add('send-certificate-email', {
        participantId: certificate.participant_id,
        eventId,
        certificatePath: certificate.path
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        delay: jobs.length * 1000, // Stagger emails by 1 second
      });
      
      jobs.push(job);
    }

    // Update sending stats in Redis
    const redis = emailQueue.client;
    const statsKey = `cert_generation_${eventId}`;
    const existingStats = await redis.get(statsKey);
    
    if (existingStats) {
      const stats = JSON.parse(existingStats);
      stats.totalToSend = certificates.length;
      await redis.setex(statsKey, 3600, JSON.stringify(stats));
    }

    return NextResponse.json({
      success: true,
      message: `Started sending ${certificates.length} certificates`,
      totalEmails: certificates.length
    });

  } catch (error) {
    console.error('Error starting bulk certificate sending:', error);
    return NextResponse.json(
      { error: 'Failed to start certificate sending' },
      { status: 500 }
    );
  }
}