import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const offset = (page - 1) * limit
    // Validasi agar aman
    const safeLimit = Math.max(1, limit)
    const safeOffset = Math.max(0, offset)
    const search = searchParams.get('search') || ''
    const eventId = searchParams.get('event_id') || ''
    const certificateStatus = searchParams.get('certificate_status') || ''
    const certificateSentStatus = searchParams.get('certificate_sent_status') || ''
    const sortBy = searchParams.get('sort') || 'registered_at'
    const sortDir = searchParams.get('dir') || 'desc'
    
    const validSortColumns: { [key: string]: string } = {
      name: 'p.name',
      event_name: 'e.name',
      token: 't.token',
      is_verified: 't.is_verified',
      registered_at: 'p.registered_at',
      certificate_id: 'c.id',
      certificate_sent: 'c.sent'
    }
    const safeSortBy = validSortColumns[sortBy] || 'p.registered_at'
    const safeSortDir = sortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC'

    // Build filter for status
    let statusFilter = ''

    let eventFilter = ''
    if (eventId) {
      eventFilter = ' AND t.event_id = ?'
    }

    let certificateFilter = ''
    if (certificateStatus === 'generated') {
      certificateFilter = ' AND c.id IS NOT NULL'
    } else if (certificateStatus === 'not_generated') {
      certificateFilter = ' AND c.id IS NULL'
    }

    let certificateSentFilter = ''
    if (certificateSentStatus === 'sent') {
      certificateSentFilter = ' AND c.sent = TRUE'
    } else if (certificateSentStatus === 'pending') {
      certificateSentFilter = ' AND c.id IS NOT NULL AND (c.sent = FALSE OR c.sent IS NULL)'
    }

    // Build filter for search
    let searchFilter = ''
    let searchParamsArr: any[] = []
    if (search) {
      searchFilter = ` AND (
        p.name LIKE ? OR
        p.email LIKE ? OR
        t.token LIKE ? OR
        p.id LIKE ?
      )`
      searchParamsArr = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
    }
    
    const countParams = [...(eventId ? [eventId] : []), ...searchParamsArr]
    const queryParams = [...(eventId ? [eventId] : []), ...searchParamsArr]

    // Get total count
    const [countRows] = await db.execute(`
      SELECT COUNT(p.id) as total 
      FROM participants p 
      LEFT JOIN tickets t ON p.ticket_id = t.id
      LEFT JOIN certificates c ON c.participant_id = p.id
      WHERE 1=1${statusFilter}${eventFilter}${certificateFilter}${certificateSentFilter}${searchFilter}
    `, countParams)
    const total = countRows[0]?.total || 0

    // Get paginated participants
    const [rows] = await db.execute(`
      SELECT p.id, p.name, p.email, p.phone, p.address, p.ticket_id, p.registered_at, 
             t.token, t.qr_code_url, t.is_verified, 
             e.name as event_name, e.type as event_type, 
             c.id as certificate_id, c.path as certificate_url, c.sent as certificate_sent
      FROM participants p
      LEFT JOIN tickets t ON p.ticket_id = t.id
      LEFT JOIN events e ON t.event_id = e.id
      LEFT JOIN certificates c ON c.participant_id = p.id
      WHERE 1=1${statusFilter}${eventFilter}${certificateFilter}${certificateSentFilter}${searchFilter}
      ORDER BY ${safeSortBy} ${safeSortDir}
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `, queryParams)

    return NextResponse.json({ participants: rows, total, page, limit })
  } catch (error) {
    console.error('Error fetching participants:', error)
    return NextResponse.json({ error: 'Failed to fetch participants', detail: String(error) }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, email, phone, address } = body
    if (!id || !name || !email) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }
    // Update peserta
    await db.execute(
      'UPDATE participants SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?',
      [name, email, phone || null, address || null, id]
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating participant:', error)
    return NextResponse.json({ message: 'Failed to update participant', error: String(error) }, { status: 500 })
  }
} 