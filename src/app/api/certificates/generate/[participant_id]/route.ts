import { NextRequest, NextResponse } from 'next/server'
import { generateCertificate } from '@/lib/certificate-generator'

export async function POST(request: NextRequest, { params }: { params: { participant_id: string } }) {
  try {
    // For single generation/regeneration, always force it.
    // This simplifies the frontend logic as both buttons point to the same endpoint.
    const result = await generateCertificate(params.participant_id, true) 
    return NextResponse.json(result)
  } catch (e) {
    console.error('Generate Certificate (single) Error:', e)
    
    let errorMessage = 'Unknown error'
    if (e instanceof Error) {
        errorMessage = e.message
    }
    
    // Customize status code based on error message
    if (errorMessage.includes('sudah ada')) {
        return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    if (errorMessage.includes('Template')) {
        return NextResponse.json({ error: errorMessage }, { status: 404 })
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
} 