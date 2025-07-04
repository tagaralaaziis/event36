import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('event_id')
    if (!eventId) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
    const [rows] = await db.execute('SELECT template_path, template_fields FROM certificate_templates WHERE event_id = ? ORDER BY created_at DESC LIMIT 1', [eventId])
    if (!rows || !rows[0]) return NextResponse.json({ error: 'No template found' }, { status: 404 })
    return NextResponse.json({ template_path: rows[0].template_path, template_fields: rows[0].template_fields })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
} 