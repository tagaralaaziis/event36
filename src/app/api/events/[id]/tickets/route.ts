import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'
import QRCode from 'qrcode'
import path from 'path'
import fs from 'fs/promises'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const eventId = params.id
    const [rows] = await db.execute('SELECT id, token, qr_code_url FROM tickets WHERE event_id = ? ORDER BY id ASC', [eventId])
    return NextResponse.json({ tickets: rows })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch tickets', detail: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const conn = await db.getConnection()
  try {
    const eventId = params.id
    const { jumlah } = await request.json()
    const quota = parseInt(jumlah)
    if (!quota || quota < 1 || quota > 1000) {
      return NextResponse.json({ error: 'Invalid quota' }, { status: 400 })
    }
    await conn.beginTransaction()
    // Ambil token yang sudah ada
    const [existingRows] = await conn.execute('SELECT token FROM tickets WHERE event_id = ?', [eventId])
    const existingTokens = new Set((existingRows as any[]).map(r => r.token))
    const tickets = []
    const newTickets = []
    const ticketsDir = path.join(process.cwd(), 'public', 'tickets')
    try { await fs.access(ticketsDir) } catch { await fs.mkdir(ticketsDir, { recursive: true }) }
    for (let i = 0; i < quota; i++) {
      let token = ''
      do {
        token = uuidv4().replace(/-/g, '').substring(0, 12).toUpperCase()
      } while (existingTokens.has(token))
      existingTokens.add(token)
      const registrationUrl = `${process.env.SERVER_URL || 'http://localhost:3000'}/register?token=${token}`
      const qrCodeBuffer = await QRCode.toBuffer(registrationUrl, {
        width: 400,
        margin: 4,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'H',
        type: 'png',
      })
      const qrCodePath = path.join(ticketsDir, `qr_${token}.png`)
      await fs.writeFile(qrCodePath, qrCodeBuffer, { mode: 0o644 })
      tickets.push([eventId, token, `/tickets/qr_${token}.png`, false])
      newTickets.push({ token })
    }
    if (tickets.length > 0) {
      const placeholders = tickets.map(() => '(?, ?, ?, ?)').join(', ')
      const values = tickets.flat()
      await conn.execute(`INSERT INTO tickets (event_id, token, qr_code_url, is_verified) VALUES ${placeholders}`, values)
    }
    await conn.commit()
    // Log audit ke tabel logs
    try {
      await conn.execute('INSERT INTO logs (type, message, meta) VALUES (?, ?, ?)', [
        'generate_ticket_batch',
        `Generate batch ${newTickets.length} tiket untuk event ${eventId}`,
        JSON.stringify({ eventId, jumlah: newTickets.length, tokens: newTickets.map(t => t.token), ip: request.headers.get('x-forwarded-for') || request.headers.get('host') })
      ])
    } catch (logErr) {
      console.error('Gagal insert log audit generate_ticket_batch:', logErr)
    }
    return NextResponse.json({ tickets: newTickets })
  } catch (error) {
    await conn.rollback()
    console.error('❌ Batch create tiket gagal, rollback:', error)
    return NextResponse.json({ error: 'Failed to create tickets (rollback)', detail: String(error) }, { status: 500 })
  } finally {
    await conn.release()
  }
} 