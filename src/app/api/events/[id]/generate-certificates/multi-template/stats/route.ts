import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const eventId = params.id
    
    // Get statistics for multi-template certificates
    const [participantStats] = await db.execute(`
      SELECT 
        COUNT(DISTINCT p.id) as total_participants,
        COUNT(DISTINCT CASE WHEN t.is_verified = TRUE THEN p.id END) as verified_participants,
        COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN p.id END) as participants_with_certificates,
        COUNT(DISTINCT CASE WHEN c.sent = TRUE THEN p.id END) as participants_with_sent_certificates
      FROM participants p
      JOIN tickets t ON p.ticket_id = t.id
      LEFT JOIN certificates c ON c.participant_id = p.id
      WHERE t.event_id = ?
    `, [eventId])

    const [templateStats] = await db.execute(`
      SELECT COUNT(*) as template_count
      FROM certificate_templates_multi 
      WHERE event_id = ?
    `, [eventId])

    const [certificateStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_certificates,
        COUNT(CASE WHEN sent = TRUE THEN 1 END) as sent_certificates,
        COUNT(CASE WHEN sent = FALSE THEN 1 END) as pending_certificates
      FROM certificates c
      JOIN participants p ON c.participant_id = p.id
      JOIN tickets t ON p.ticket_id = t.id
      WHERE t.event_id = ?
    `, [eventId])

    const stats = {
      participants: (participantStats as any[])[0],
      templates: (templateStats as any[])[0],
      certificates: (certificateStats as any[])[0]
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Multi-template stats error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}