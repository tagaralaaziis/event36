import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateCertificateWithTemplate } from '@/lib/certificate-generator';
import Queue from 'bull';

// Initialize Redis queue for certificate generation
const certificateQueue = new Queue('certificate generation', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

// Process certificate generation jobs
certificateQueue.process('generate-multi-certificate', 10, async (job) => {
  const { participantId, eventId, templates, templateIndex } = job.data;
  
  try {
    // Get participant data
    const [participantRows] = await db.execute(`
      SELECT p.*, t.token, e.name as event_name, e.start_time, e.end_time
      FROM participants p
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE p.id = ? AND e.id = ?
    `, [participantId, eventId]);

    if (!participantRows || participantRows.length === 0) {
      throw new Error('Participant not found');
    }

    const participant = participantRows[0] as any;
    const template = templates[templateIndex];

    if (!template) {
      throw new Error('Template not found');
    }

    // Prepare participant data with uppercase name
    const participantData = {
      ...participant,
      name: participant.name.toUpperCase(), // Auto uppercase
      certificate_number: `CERT-${participant.token}-${templateIndex + 1}`,
      date: new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    };

    // Generate certificate
    const certificatePath = await generateCertificateWithTemplate(
      template,
      participantData,
      eventId,
      `multi_template_${templateIndex + 1}`
    );

    // Save certificate record
    await db.execute(`
      INSERT INTO certificates (participant_id, template_id, path, sent, created_at)
      VALUES (?, ?, ?, FALSE, NOW())
      ON DUPLICATE KEY UPDATE
      path = VALUES(path),
      sent = FALSE,
      created_at = NOW()
    `, [participantId, templateIndex + 1, certificatePath]);

    // Update progress
    await job.progress(100);
    
    return { success: true, certificatePath };
  } catch (error) {
    console.error('Error generating certificate:', error);
    throw error;
  }
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id;
    const { templates } = await request.json();

    if (!templates || templates.length === 0) {
      return NextResponse.json(
        { error: 'No templates provided' },
        { status: 400 }
      );
    }

    // Get all participants for this event
    const [participantRows] = await db.execute(`
      SELECT p.id, p.name, p.email, t.token
      FROM participants p
      JOIN tickets t ON p.ticket_id = t.id
      WHERE t.event_id = ? AND t.is_verified = TRUE
    `, [eventId]);

    const participants = participantRows as any[];

    if (participants.length === 0) {
      return NextResponse.json(
        { error: 'No verified participants found' },
        { status: 404 }
      );
    }

    // Clear existing jobs for this event
    await certificateQueue.clean(0, 'completed');
    await certificateQueue.clean(0, 'failed');

    // Create generation jobs for each participant and each template
    const jobs = [];
    for (const participant of participants) {
      // Randomly assign a template to each participant
      const templateIndex = Math.floor(Math.random() * templates.length);
      
      const job = await certificateQueue.add('generate-multi-certificate', {
        participantId: participant.id,
        eventId,
        templates,
        templateIndex
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });
      
      jobs.push(job);
    }

    // Store generation stats in Redis for progress tracking
    const redis = certificateQueue.client;
    await redis.setex(`cert_generation_${eventId}`, 3600, JSON.stringify({
      total: participants.length,
      generated: 0,
      sent: 0,
      startTime: new Date().toISOString()
    }));

    return NextResponse.json({
      success: true,
      message: `Started generating ${participants.length} certificates`,
      totalJobs: jobs.length,
      participants: participants.length,
      templates: templates.length
    });

  } catch (error) {
    console.error('Error starting bulk certificate generation:', error);
    return NextResponse.json(
      { error: 'Failed to start certificate generation' },
      { status: 500 }
    );
  }
}