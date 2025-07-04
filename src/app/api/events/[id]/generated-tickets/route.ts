import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const eventId = params.id
    const [rows] = await db.execute(
      'SELECT id, file_path, generated_at, generated_by, ticket_count FROM generated_tickets WHERE event_id = ? ORDER BY generated_at DESC',
      [eventId]
    )
    return NextResponse.json({ files: rows })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch generated tickets', detail: String(err) }, { status: 500 })
  }
} 