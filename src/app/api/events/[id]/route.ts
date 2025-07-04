import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, access } from 'fs/promises'
import path from 'path'
import db, { testConnection } from '@/lib/db'
import QRCode from 'qrcode'
import fs from 'fs'

// Fungsi untuk format tanggal ke MySQL DATETIME
function toMySQLDateTime(date: Date) {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url, 'http://localhost')
  const search = url.searchParams.get('search') || ''
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)
  const offset = (page - 1) * limit
  const status = url.searchParams.get('status') || ''
  const registeredAt = url.searchParams.get('registered_at') || ''
  const sort = url.searchParams.get('sort') || 'token'
  const dir = url.searchParams.get('dir') || 'asc'
  const allowedSort = {
    token: 't.token',
    id: 't.id',
    status: 't.is_verified',
    participant_id: 'p.id',
    participant_name: 'p.name',
    registered_at: 'p.registered_at'
  }
  const sortCol = allowedSort[sort] || 't.token'
  const sortOrder = dir === 'desc' ? 'DESC' : 'ASC'

  // Query tickets dengan search dan pagination
  let ticketQuery = `SELECT t.*, p.id as participant_id, p.name as participant_name, p.registered_at FROM tickets t LEFT JOIN participants p ON p.ticket_id = t.id WHERE t.event_id = ?`
  let countQuery = `SELECT COUNT(*) as total FROM tickets t LEFT JOIN participants p ON p.ticket_id = t.id WHERE t.event_id = ?`
  const paramsArr = [params.id]

  if (search) {
    ticketQuery += ` AND (
      t.token LIKE ? OR
      t.id LIKE ? OR
      p.id LIKE ? OR
      p.name LIKE ? OR
      p.email LIKE ?
    )`
    countQuery += ` AND (
      t.token LIKE ? OR
      t.id LIKE ? OR
      p.id LIKE ? OR
      p.name LIKE ? OR
      p.email LIKE ?
    )`
    for (let i = 0; i < 5; i++) paramsArr.push(`%${search}%`)
  }
  if (status === 'verified') {
    ticketQuery += ' AND t.is_verified = 1'
    countQuery += ' AND t.is_verified = 1'
  } else if (status === 'unused') {
    ticketQuery += ' AND (t.is_verified = 0 OR t.is_verified IS NULL)'
    countQuery += ' AND (t.is_verified = 0 OR t.is_verified IS NULL)'
  }
  if (registeredAt) {
    ticketQuery += ' AND DATE(p.registered_at) = ?'
    countQuery += ' AND DATE(p.registered_at) = ?'
    paramsArr.push(registeredAt)
  }
  ticketQuery += ` ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?`
  paramsArr.push(String(limit), String(offset))

  // Tambahkan log untuk debug
  console.log('TICKET QUERY:', ticketQuery)
  console.log('PARAMS:', paramsArr)

  const [tickets] = await db.execute(ticketQuery, paramsArr)
  if (Array.isArray(tickets)) {
    console.log('TICKETS LENGTH:', tickets.length)
  } else {
    console.log('TICKETS TYPE:', typeof tickets, tickets)
  }
  const [countRows] = await db.execute(countQuery, paramsArr.slice(0, paramsArr.length - 2))
  const total = countRows[0]?.total || 0

  try {
    // Test database connection first
    const isConnected = await testConnection()
    if (!isConnected) {
      return NextResponse.json({ message: 'Database connection failed' }, { status: 500 })
    }

    const eventId = params.id

    // Get event details
    const [eventRows] = await db.execute('SELECT * FROM events WHERE id = ?', [eventId])
    const events = eventRows as any[]
    if (events.length === 0) {
      return NextResponse.json({ message: 'Event not found' }, { status: 404 })
    }
    const event = events[0]

    // Get ticket statistics
    const [statsRows] = await db.execute(`
      SELECT 
        COUNT(*) as total_tickets,
        SUM(CASE WHEN is_verified = TRUE THEN 1 ELSE 0 END) as verified_tickets
      FROM tickets
      WHERE event_id = ?
    `, [eventId]);

    const stats = (statsRows as any[])[0];
    const totalTickets = Number(stats.total_tickets) || 0;
    const verifiedTickets = Number(stats.verified_tickets) || 0;

    const eventWithStats = {
      ...event,
      total_tickets: totalTickets,
      verified_tickets: verifiedTickets,
      unused_tickets: totalTickets - verifiedTickets
    };

    // Get participants with ticket info
    const [participantRows] = await db.execute(`
      SELECT p.*, t.token, t.is_verified
      FROM participants p
      JOIN tickets t ON p.ticket_id = t.id
      WHERE t.event_id = ?
      ORDER BY p.registered_at DESC
    `, [eventId])

    const participants = participantRows as any[]

    return NextResponse.json({
      event: eventWithStats,
      participants,
      tickets,
      total,
      page,
      limit
    })
  } catch (error) {
    console.error('Error fetching event details:', error)
    return NextResponse.json({ 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id;
    const contentType = request.headers.get('content-type') || '';
    console.log('PUT /api/events/[id] Content-Type:', contentType);

    if (contentType.includes('application/json')) {
      // Handle JSON update (misal update posisi barcode)
      const body = await request.json();
      if (body.ticketQrPosition) {
        // Update event in database
        await db.execute('UPDATE events SET ticket_qr_position = ? WHERE id = ?', [body.ticketQrPosition, eventId]);
      }
      if (body.quota !== undefined) {
        // Update event in database
        await db.execute('UPDATE events SET quota = ? WHERE id = ?', [body.quota, eventId]);
      }
      return NextResponse.json({ message: 'Event updated successfully' });
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const ticketDesignFile = formData.get('ticketDesign') as File | null;
      // Proses upload file jika ada
      if (ticketDesignFile) {
        try {
          // Hapus file lama jika ada
          const [oldEventRows] = await db.execute('SELECT ticket_design FROM events WHERE id = ?', [eventId]);
          const oldEvent = (oldEventRows as any[])[0];
          if (oldEvent && oldEvent.ticket_design) {
            const oldFilePath = path.join(process.cwd(), 'public', oldEvent.ticket_design);
            if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
          }
          // Hapus data file lama di file_uploads
          await db.execute('DELETE FROM file_uploads WHERE upload_type = ? AND related_id = ?', ['ticket_design', eventId]);
          const bytes = await ticketDesignFile.arrayBuffer();
          const buffer = Buffer.from(bytes);
          const projectRoot = process.cwd();
          const publicDir = path.join(projectRoot, 'public');
          const uploadsDir = path.join(publicDir, 'uploads');
          try { await access(publicDir); } catch { await mkdir(publicDir, { recursive: true }); }
          try { await access(uploadsDir); } catch { await mkdir(uploadsDir, { recursive: true }); }
          const timestamp = Date.now();
          const randomString = Math.random().toString(36).substring(2, 8);
          const fileExtension = path.extname(ticketDesignFile.name);
          const baseFileName = ticketDesignFile.name.replace(fileExtension, '').replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
          const filename = `ticket-${timestamp}-${randomString}-${baseFileName}${fileExtension}`;
          const filepath = path.join(uploadsDir, filename);
          await writeFile(filepath, buffer, { mode: 0o644 });
          const ticketDesignPath = `/uploads/${filename}`;
          const ticketDesignSize = ticketDesignFile.size;
          const ticketDesignType = ticketDesignFile.type;
          await db.execute('UPDATE events SET ticket_design = ?, ticket_design_size = ?, ticket_design_type = ? WHERE id = ?', [ticketDesignPath, ticketDesignSize, ticketDesignType, eventId]);
          // Track file upload
          try {
            await db.execute('INSERT INTO file_uploads (filename, original_name, file_path, file_size, file_type, upload_type, related_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [filename, ticketDesignFile.name, ticketDesignPath, ticketDesignSize, ticketDesignType, 'ticket_design', parseInt(eventId)]);
          } catch (dbError) { console.error('⚠️ Failed to track file upload in database:', dbError); }
        } catch (fileError) {
          console.error('❌ File upload error:', fileError);
          return NextResponse.json({ message: 'Failed to upload ticket design: ' + (fileError instanceof Error ? fileError.message : 'Unknown error') }, { status: 500 });
        }
      }
      // Update field lain dari formData
      let updateData: any = {};
      const fieldMap: Record<string, string> = {
        startTime: 'start_time',
        endTime: 'end_time',
        ticketQrPosition: 'ticket_qr_position',
        // tambahkan mapping lain jika perlu
      };
      for (const entry of Array.from(formData.entries())) {
        let [key, value] = entry;
        if (key !== 'ticketDesign') {
          if (fieldMap[key]) key = fieldMap[key];
          updateData[key] = value;
        }
      }
      // Update event di database
      if (Object.keys(updateData).length > 0) {
        const updateFields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
        const updateValues = [...Object.values(updateData), eventId];
        await db.execute(`UPDATE events SET ${updateFields} WHERE id = ?`, updateValues);
        // Improvisasi: update tiket jika kuota berubah
        if (updateData.quota !== undefined) {
          const quotaBaru = parseInt(updateData.quota as string);
          const [ticketRows] = await db.execute('SELECT id FROM tickets WHERE event_id = ?', [eventId]);
          const tiketLama = ticketRows as any[];
          const jumlahTiketLama = tiketLama.length;
          if (quotaBaru > jumlahTiketLama) {
            // Tambah tiket baru
            const selisih = quotaBaru - jumlahTiketLama;
            for (let i = 0; i < selisih; i++) {
              const token = `EV${eventId}_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
              await db.execute('INSERT INTO tickets (event_id, token) VALUES (?, ?)', [eventId, token]);
              // Generate QR code PNG
              const qrDir = path.join(process.cwd(), 'public', 'tickets')
              if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true })
              const qrPath = path.join(qrDir, `qr_${token}.png`)
              await QRCode.toFile(qrPath, token, { width: 400 })
              await db.execute('UPDATE tickets SET qr_code_url = ? WHERE token = ?', [`/tickets/qr_${token}.png`, token])
            }
          } else if (quotaBaru < jumlahTiketLama) {
            // Hapus tiket yang belum terpakai
            const selisih = jumlahTiketLama - quotaBaru;
            // Validasi selisih agar aman
            const safeLimit = Math.max(0, Math.floor(selisih));
            if (safeLimit > 0) {
              const [unusedTickets] = await db.execute(
                `SELECT id, token FROM tickets WHERE event_id = ? AND id NOT IN (SELECT ticket_id FROM participants) LIMIT ${safeLimit}`,
                [eventId]
              );
              for (const t of unusedTickets as any[]) {
                // Hapus file QR code
                const qrPath = path.join(process.cwd(), 'public', 'tickets', `qr_${t.token}.png`)
                if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath)
                await db.execute('DELETE FROM tickets WHERE id = ?', [t.id]);
              }
            }
          }
        }
      }
      return NextResponse.json({ message: 'Event updated successfully' });
    } else {
      return NextResponse.json({ message: 'Unsupported Content-Type' }, { status: 400 });
    }
  } catch (error) {
    console.error('❌ Error updating event:', error)
    return NextResponse.json({ message: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id
    const fs = require('fs').promises
    const pathMod = require('path')
    // 1. Hapus semua file desain e-ticket dari file_uploads
    const [designFiles] = await db.execute('SELECT file_path FROM file_uploads WHERE upload_type = ? AND related_id = ?', ['ticket_design', eventId])
    for (const row of designFiles as any[]) {
      try {
        const filePath = pathMod.join(process.cwd(), 'public', row.file_path)
        await fs.unlink(filePath)
        console.log('🗑️ Deleted e-ticket design file:', filePath)
      } catch (e) { console.error('⚠️ Error deleting e-ticket design file:', e) }
    }
    // 2. Hapus file QR/tiket offline di /public/tickets
    const [ticketRows] = await db.execute('SELECT qr_code_url FROM tickets WHERE event_id = ?', [eventId])
    for (const row of ticketRows as any[]) {
      if (row.qr_code_url) {
        try {
          const filePath = pathMod.join(process.cwd(), 'public', row.qr_code_url)
          await fs.unlink(filePath)
          console.log('🗑️ Deleted ticket QR file:', filePath)
        } catch (e) { console.error('⚠️ Error deleting ticket QR file:', e) }
      }
    }
    // 3. Hapus file sertifikat di /public/certificates
    const [certRows] = await db.execute('SELECT path FROM certificates WHERE participant_id IN (SELECT id FROM participants WHERE ticket_id IN (SELECT id FROM tickets WHERE event_id = ?))', [eventId])
    for (const row of certRows as any[]) {
      if (row.path) {
        try {
          const filePath = pathMod.join(process.cwd(), 'public', row.path)
          await fs.unlink(filePath)
          console.log('🗑️ Deleted certificate file:', filePath)
        } catch (e) { console.error('⚠️ Error deleting certificate file:', e) }
    }
    }
    // 3b. Hapus file template sertifikat di /public/certificates/templates
    const [templateRows] = await db.execute('SELECT template_path FROM certificate_templates WHERE event_id = ?', [eventId])
    for (const row of templateRows as any[]) {
      if (row.template_path) {
        try {
          const filePath = pathMod.join(process.cwd(), 'public', row.template_path)
          await fs.unlink(filePath)
          console.log('🗑️ Deleted certificate template file:', filePath)
        } catch (e) { console.error('⚠️ Error deleting certificate template file:', e) }
    }
    }
    // 4. Hapus data database terkait event
    await db.execute('DELETE FROM file_uploads WHERE related_id = ?', [eventId])
    await db.execute('DELETE FROM certificate_templates WHERE event_id = ?', [eventId])
    await db.execute('DELETE FROM certificates WHERE participant_id IN (SELECT id FROM participants WHERE ticket_id IN (SELECT id FROM tickets WHERE event_id = ?))', [eventId])
    await db.execute('DELETE FROM participants WHERE ticket_id IN (SELECT id FROM tickets WHERE event_id = ?)', [eventId])
    await db.execute('DELETE FROM tickets WHERE event_id = ?', [eventId])
    await db.execute('DELETE FROM events WHERE id = ?', [eventId])
    console.log('🗑️ Event and all related data deleted:', eventId)
    // Tambahkan log system event
    const { logSystemEvent } = await import('@/lib/db')
    await logSystemEvent('event_delete', `Event deleted: ${eventId}`, { eventId })
    // 5. Hapus folder generated-tickets/event-<eventId> beserta isinya
    try {
      const genTicketsDir = pathMod.join(process.cwd(), 'public', 'generated-tickets', `event-${eventId}`)
      if (await fs.stat(genTicketsDir).then(() => true).catch(() => false)) {
        await fs.rm(genTicketsDir, { recursive: true, force: true })
        console.log('🗑️ Deleted generated tickets folder:', genTicketsDir)
      }
    } catch (e) { console.error('⚠️ Error deleting generated tickets folder:', e) }
    return NextResponse.json({ message: 'Event and all related data deleted successfully' })
  } catch (error) {
    console.error('❌ Error deleting event and related data:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}