import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { generateCertificate } from '@/lib/certificate-generator'

export async function POST(request: NextRequest) {
  try {
    const { participantIds } = await request.json()

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json({ error: 'Participant IDs must be a non-empty array' }, { status: 400 })
    }

    let successCount = 0
    let failureCount = 0
    const results = []

    for (const participantId of participantIds) {
      try {
        // Always force regeneration for bulk actions from the dashboard
        const result = await generateCertificate(participantId, true)
        results.push({ participantId, status: 'success', path: result.path })
        successCount++
      } catch (error) {
        console.error(`Failed to generate certificate for participant ${participantId}:`, error)
        failureCount++
        results.push({ participantId, status: 'failed', reason: error instanceof Error ? error.message : 'Unknown error' })
      }
    }

    return NextResponse.json({
      message: 'Bulk generation process completed.',
      successCount,
      failureCount,
      results,
    })
  } catch (error) {
    console.error('Bulk Generate Certificate Error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
} 