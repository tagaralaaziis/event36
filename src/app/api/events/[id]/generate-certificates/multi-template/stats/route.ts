import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import Queue from 'bull';

// Initialize Redis connection
const certificateQueue = new Queue('certificate generation', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id;

    // Get total participants
    const [participantRows] = await db.execute(`
      SELECT COUNT(*) as total
      FROM participants p
      JOIN tickets t ON p.ticket_id = t.id
      WHERE t.event_id = ? AND t.is_verified = TRUE
    `, [eventId]);

    const total = (participantRows[0] as any).total;

    // Get generated certificates count
    const [generatedRows] = await db.execute(`
      SELECT COUNT(*) as generated
      FROM certificates c
      JOIN participants p ON c.participant_id = p.id
      JOIN tickets t ON p.ticket_id = t.id
      WHERE t.event_id = ? AND c.path IS NOT NULL
    `, [eventId]);

    const generated = (generatedRows[0] as any).generated;

    // Get sent certificates count
    const [sentRows] = await db.execute(`
      SELECT COUNT(*) as sent
      FROM certificates c
      JOIN participants p ON c.participant_id = p.id
      JOIN tickets t ON p.ticket_id = t.id
      WHERE t.event_id = ? AND c.sent = TRUE
    `, [eventId]);

    const sent = (sentRows[0] as any).sent;

    // Get queue stats
    const redis = certificateQueue.client;
    const statsKey = `cert_generation_${eventId}`;
    const redisStats = await redis.get(statsKey);
    
    let queueStats = {
      total,
      generated,
      sent,
      generationProgress: total > 0 ? (generated / total) * 100 : 0,
      sendingProgress: total > 0 ? (sent / total) * 100 : 0
    };

    if (redisStats) {
      const parsedStats = JSON.parse(redisStats);
      queueStats = { ...queueStats, ...parsedStats };
    }

    return NextResponse.json(queueStats);

  } catch (error) {
    console.error('Error getting certificate stats:', error);
    return NextResponse.json(
      { error: 'Failed to get certificate stats' },
      { status: 500 }
    );
  }
}