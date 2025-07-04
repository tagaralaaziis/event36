import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { AsyncParser } from '@json2csv/node'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const event_id = searchParams.get('event_id')
    const status = searchParams.get('status')
    const certificate_status = searchParams.get('certificate_status')
    const search = searchParams.get('search')
    const sort = searchParams.get('sort') || 'name'
    const dir = searchParams.get('dir') || 'asc'
    
    let query = `
      SELECT 
        p.id, p.name, p.email, p.phone, p.address, p.registered_at,
        e.name as event_name,
        t.token, t.is_verified,
        c.id as certificate_id
      FROM participants p
      LEFT JOIN tickets t ON p.ticket_id = t.id
      LEFT JOIN events e ON t.event_id = e.id
      LEFT JOIN certificates c ON p.id = c.participant_id
      WHERE 1=1
    `
    const params: any[] = []

    if (event_id) {
      query += ' AND e.id = ?'
      params.push(event_id)
    }
    if (status) {
      if (status === 'verified') {
        query += ' AND t.is_verified = TRUE'
      } else if (status === 'unverified') {
        query += ' AND (t.is_verified = FALSE OR t.is_verified IS NULL)'
      }
    }
    if (certificate_status) {
      if (certificate_status === 'generated') {
        query += ' AND c.id IS NOT NULL'
      } else if (certificate_status === 'not_generated') {
        query += ' AND c.id IS NULL'
      }
    }
    if (search) {
      query += ' AND (p.name LIKE ? OR p.email LIKE ? OR t.token LIKE ?)' 
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }

    const validSorts: { [key: string]: string } = {
      name: 'p.name',
      event_name: 'e.name',
      token: 't.token',
      is_verified: 't.is_verified',
      registered_at: 'p.registered_at'
    };

    if (sort && validSorts[sort]) {
      query += ` ORDER BY ${validSorts[sort]} ${dir === 'asc' ? 'ASC' : 'DESC'}`
    } else {
      query += ' ORDER BY p.name ASC'
    }

    const [rows] = await db.execute(query, params)
    const participants = rows as any[]

    if (!participants.length) {
      // Return empty CSV instead of error
      const fields = ['id', 'name', 'email', 'phone', 'address', 'event_name', 'token', 'is_verified', 'certificate_status', 'registered_at']
      const parser = new AsyncParser({ fields });
      const csv = await parser.parse([]).promise();
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="participants.csv"',
        },
      });
    }

    const processedParticipants = participants.map(p => ({
      ...p,
      is_verified: p.is_verified ? 'Verified' : 'Unused',
      certificate_status: p.certificate_id ? 'Generated' : 'Not Generated'
    }));
    
    const fields = ['id', 'name', 'email', 'phone', 'address', 'event_name', 'token', 'is_verified', 'certificate_status', 'registered_at']
    const parser = new AsyncParser({ fields });
    const csv = await parser.parse(processedParticipants).promise();

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="participants.csv"',
      },
    })
  } catch (err) {
    console.error('Export participants error:', err)
    return NextResponse.json({ error: 'Failed to export participants', detail: String(err) }, { status: 500 })
  }
} 