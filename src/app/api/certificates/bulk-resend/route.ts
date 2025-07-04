import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { sendCertificateEmail } from '@/lib/email'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const { certificateIds } = await request.json()

    if (!Array.isArray(certificateIds) || certificateIds.length === 0) {
      return NextResponse.json({ error: 'Certificate IDs must be a non-empty array' }, { status: 400 })
    }

    let successCount = 0
    let failureCount = 0
    const results = []

    for (const certificateId of certificateIds) {
      try {
        const [rows] = await db.execute(`
          SELECT c.*, p.name as participant_name, p.email, e.name as event_name
          FROM certificates c
          JOIN participants p ON c.participant_id = p.id
          JOIN tickets t ON p.ticket_id = t.id
          JOIN events e ON t.event_id = e.id
          WHERE c.id = ?
          LIMIT 1
        `, [certificateId])

        const cert = (rows as any[])[0]
        if (!cert) {
          throw new Error(`Certificate with ID ${certificateId} not found.`)
        }

        const certificatePath = path.join(process.cwd(), 'public', cert.path)
        const sent = await sendCertificateEmail(cert.email, cert.participant_name, cert.event_name, certificatePath)
        
        if (sent) {
          await db.execute('UPDATE certificates SET sent = 1, sent_at = NOW() WHERE id = ?', [certificateId])
          successCount++
          results.push({ certificateId, status: 'success' })
        } else {
          throw new Error('Failed to send email via provider.')
        }
      } catch (error) {
        console.error(`Failed to resend certificate ${certificateId}:`, error)
        failureCount++
        results.push({ certificateId, status: 'failed', reason: error instanceof Error ? error.message : 'Unknown error' })
      }
    }

    return NextResponse.json({
      message: 'Bulk resend process completed.',
      successCount,
      failureCount,
      results,
    })
  } catch (error) {
    console.error('Bulk Resend Certificate Error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
} 