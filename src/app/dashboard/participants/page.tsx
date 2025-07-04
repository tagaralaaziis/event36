import db from '@/lib/db'
import ParticipantsClient from './ParticipantsClient'

async function getInitialData() {
  try {
    const [participants] = await db.execute(`
      SELECT p.id, p.name, p.email, p.phone, p.address, p.ticket_id, p.registered_at, 
             t.token, t.is_verified, 
             e.name as event_name
      FROM participants p
      LEFT JOIN tickets t ON p.ticket_id = t.id
      LEFT JOIN events e ON t.event_id = e.id
      ORDER BY p.registered_at DESC
      LIMIT 10
    `)
    
    const [events] = await db.execute('SELECT id, name FROM events ORDER BY name ASC')

    return { participants: participants as any[], events: events as any[] }
  } catch (error) {
    console.error('Error fetching initial participants data:', error)
    return { participants: [], events: [] }
  }
}

export const dynamic = 'force-dynamic'

export default async function ParticipantsPage() {
  const { participants, events } = await getInitialData()
  return <ParticipantsClient participants={participants} events={events} />
}