import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { sendCertificateEmail } from '@/lib/email'
import path from 'path'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const eventId = params.id
    
    // Get all participants with generated certificates for this event
    const [rows] = await db.execute(`
      SELECT c.*, p.name as participant_name, p.email, e.name as event_name
      FROM certificates c
      JOIN participants p ON c.participant_id = p.id
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE t.event_id = ? AND c.path IS NOT NULL AND c.sent = FALSE
      ORDER BY p.name ASC
    `, [eventId])

    const certificates = (rows as any[])
    if (!certificates.length) {
      return NextResponse.json({ 
        message: 'No unsent certificates found for this event',
        successCount: 0,
        failureCount: 0,
        results: []
      })
    }

    let successCount = 0
    let failureCount = 0
    const results = []

    for (const cert of certificates) {
      try {
        const certificatePath = path.join(process.cwd(), 'public', cert.path)
        const sent = await sendCertificateEmail(cert.email, cert.participant_name, cert.event_name, certificatePath)
        
        if (sent) {
          await db.execute('UPDATE certificates SET sent = 1, sent_at = NOW() WHERE id = ?', [cert.id])
          successCount++
          results.push({ 
            certificateId: cert.id, 
            participantName: cert.participant_name,
            email: cert.email,
            status: 'success' 
          })
        } else {
          throw new Error('Failed to send email via provider.')
        }
      } catch (error) {
        console.error(`Failed to send certificate ${cert.id}:`, error)
        failureCount++
        results.push({ 
          certificateId: cert.id, 
          participantName: cert.participant_name,
          email: cert.email,
          status: 'failed', 
          reason: error instanceof Error ? error.message : 'Unknown error' 
        })
      }
    }

    return NextResponse.json({
      message: `Bulk certificate sending completed.`,
      successCount,
      failureCount,
      totalCertificates: certificates.length,
      results,
    })
  } catch (error) {
    console.error('Bulk Send Multi-Certificate Error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}