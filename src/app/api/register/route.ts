import { NextRequest, NextResponse } from 'next/server'
import db, { testConnection } from '@/lib/db'
import { sendRegistrationEmail } from '@/lib/email'
import { generateCertificate } from '@/lib/certificate'
import path from 'path'
import { addCertificateJob } from '@/jobs/certificateQueue'

export async function GET(request: NextRequest) {
  try {
    const isConnected = await testConnection()
    if (!isConnected) {
      return NextResponse.json({ message: 'Database connection failed' }, { status: 500 })
    }
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    if (!token) {
      return NextResponse.json({ message: 'Token is required' }, { status: 400 })
    }
    // Query ticket dan event
    const [tickets] = await db.execute(`
      SELECT t.id as ticket_id, t.token, t.is_verified, e.id as event_id, e.name, e.type, e.location, e.description, e.start_time, e.end_time, e.ticket_design, t.qr_code_url
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      WHERE t.token = ?
    `, [token])
    const ticketArray = tickets as any[]
    if (!ticketArray || ticketArray.length === 0) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 404 })
    }
    const ticket = ticketArray[0]
    if (ticket.is_verified) {
      return NextResponse.json({ message: 'This ticket has already been used' }, { status: 400 })
    }
    return NextResponse.json({
      event: {
        id: ticket.event_id,
        name: ticket.name,
        type: ticket.type,
        location: ticket.location,
        description: ticket.description,
        start_time: ticket.start_time,
        end_time: ticket.end_time
      }
    })
  } catch (error) {
    console.error('Error fetching event data:', error)
    return NextResponse.json({ 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const isConnected = await testConnection()
    if (!isConnected) {
      return NextResponse.json({ message: 'Database connection failed' }, { status: 500 })
    }
    const body = await request.json()
    const { token, name, email, phone, address } = body
    if (!token || !name || !email) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }
    // Query ticket dan event
    const [tickets] = await db.execute(`
      SELECT t.id as ticket_id, t.token, t.is_verified, e.id as event_id, e.name, e.type, e.location, e.description, e.start_time, e.end_time, e.ticket_design, t.qr_code_url
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      WHERE t.token = ?
    `, [token])
    const ticketArray = tickets as any[]
    if (!ticketArray || ticketArray.length === 0) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 404 })
    }
    const ticket = ticketArray[0]
    if (ticket.is_verified) {
      return NextResponse.json({ message: 'This ticket has already been used' }, { status: 400 })
    }
    // Insert participant
    const [participantResult] = await db.execute(`
      INSERT INTO participants (ticket_id, name, email, phone, address)
      VALUES (?, ?, ?, ?, ?)
    `, [ticket.ticket_id, name, email, phone || null, address || null])
    const participantId = (participantResult as any).insertId
    // Mark ticket as verified
    await db.execute('UPDATE tickets SET is_verified = TRUE WHERE id = ?', [ticket.ticket_id])
    // Trigger generate sertifikat otomatis (queue)
    addCertificateJob({ participantId })
    // Email konfirmasi (try-catch terpisah)
    try {
      const eventDetails = `
Event: ${ticket.name}
Type: ${ticket.type}
Location: ${ticket.location}
Date: ${new Date(ticket.start_time).toLocaleString()} - ${new Date(ticket.end_time).toLocaleString()}
${ticket.description ? `Description: ${ticket.description}` : ''}`
      // QR code URL (public path)
      const qrCodeUrl = ticket.qr_code_url?.startsWith('http') ? ticket.qr_code_url : `${process.env.PUBLIC_URL || ''}${ticket.qr_code_url}`
      await sendRegistrationEmail(email, name, ticket.name, eventDetails, undefined, qrCodeUrl, ticket.token, phone, address)
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError)
    }
    return NextResponse.json({ 
      message: 'Registration successful',
      participantId: participantId,
      participant: {
        name,
        email,
        phone,
        address
      },
      token: ticket.token,
      qr_code_url: ticket.qr_code_url?.startsWith('http') ? ticket.qr_code_url : `${process.env.PUBLIC_URL || ''}${ticket.qr_code_url}`,
      event: {
        id: ticket.event_id,
        name: ticket.name,
        type: ticket.type,
        location: ticket.location,
        description: ticket.description,
        start_time: ticket.start_time,
        end_time: ticket.end_time
      }
    })
  } catch (error) {
    console.error('Error processing registration:', error)
    return NextResponse.json({ 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}