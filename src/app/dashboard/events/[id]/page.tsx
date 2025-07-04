import db from '@/lib/db'
import EventDetailClient from './EventDetailClient'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'

async function getEventDetails(eventId: string) {
  try {
    const [eventRows] = await db.execute(`
      SELECT e.*, 
             COUNT(t.id) as total_tickets,
             COUNT(CASE WHEN t.is_verified = TRUE THEN 1 END) as verified_tickets
      FROM events e
      LEFT JOIN tickets t ON e.id = t.event_id
      WHERE e.id = ?
      GROUP BY e.id
    `, [eventId])
    const events = eventRows as any[]
    if (events.length === 0) {
      return null
    }
    const [participantRows] = await db.execute(`
      SELECT p.*, t.token, t.is_verified
      FROM participants p
      JOIN tickets t ON p.ticket_id = t.id
      WHERE t.event_id = ?
      ORDER BY p.registered_at DESC
    `, [eventId])
    const [ticketRows] = await db.execute(`
      SELECT t.id, t.token, t.is_verified, t.qr_code_url, p.id as participant_id, p.name as participant_name, p.registered_at
      FROM tickets t
      LEFT JOIN participants p ON t.id = p.ticket_id
      WHERE t.event_id = ?
      ORDER BY t.id ASC
    `, [eventId])
    return {
      event: events[0],
      participants: participantRows as any[],
      tickets: ticketRows as any[]
    }
  } catch (error) {
    console.error('Error fetching event details:', error)
    return null
  }
}

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const data = await getEventDetails(params.id)
  if (!data) return <div>Event not found</div>
  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{data.event.name}</h1>
      </div>
      <EventDetailClient event={data.event} participants={data.participants} tickets={data.tickets} />
    </>
  )
}