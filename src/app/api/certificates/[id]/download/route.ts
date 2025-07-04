import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import fs from 'fs/promises'
import path from 'path'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const certificateId = params.id

    // Get certificate data
    const [rows] = await db.execute(`
      SELECT c.*, p.name as participant_name, e.name as event_name
      FROM certificates c
      JOIN participants p ON c.participant_id = p.id
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE c.id = ?
      LIMIT 1
    `, [certificateId])

    const cert = (rows as any[])[0]
    if (!cert) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 })
    }

    // Construct file path
    const filePath = path.join(process.cwd(), 'public', cert.path)
    
    try {
      // Check if file exists
      await fs.access(filePath)
    } catch {
      return NextResponse.json({ error: 'Certificate file not found' }, { status: 404 })
    }

    // Read file
    const fileBuffer = await fs.readFile(filePath)
    
    // Return PDF file
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="certificate-${cert.participant_name}-${cert.event_name}.pdf"`,
        'Cache-Control': 'public, max-age=3600'
      }
    })
  } catch (error) {
    console.error('Download certificate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 