import db from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const [rows] = await db.execute(`
      SELECT c.*, p.name as participant_name, p.email, e.name as event_name, e.type as event_type, e.ticket_design
      FROM certificates c
      JOIN participants p ON c.participant_id = p.id
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      ORDER BY c.created_at DESC
    `)
    return NextResponse.json(rows)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch certificates' }, { status: 500 })
  }
} 