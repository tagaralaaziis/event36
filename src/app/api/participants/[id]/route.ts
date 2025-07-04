import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const participantId = params.id;

    const [rows] = await db.execute(`
      SELECT 
        p.*,
        t.token,
        t.is_verified,
        e.name as event_name,
        e.type as event_type,
        e.start_time as event_start_time
      FROM participants p
      JOIN tickets t ON p.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE p.id = ?
    `, [participantId]);

    if (!rows || (rows as any[]).length === 0) {
      return NextResponse.json(
        { error: 'Participant not found' },
        { status: 404 }
      );
    }

    return NextResponse.json((rows as any[])[0]);
  } catch (error) {
    console.error('Error fetching participant:', error);
    return NextResponse.json(
      { error: 'Failed to fetch participant' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const participantId = params.id;
    const { name, email, phone, address } = await request.json();

    // Update participant data
    await db.execute(`
      UPDATE participants 
      SET name = ?, email = ?, phone = ?, address = ?
      WHERE id = ?
    `, [name, email, phone, address, participantId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating participant:', error);
    return NextResponse.json(
      { error: 'Failed to update participant' },
      { status: 500 }
    );
  }
}