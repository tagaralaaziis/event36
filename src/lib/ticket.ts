import { db } from './db';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { generateToken } from './utils';

export interface Ticket {
  id: number;
  event_id: number;
  token: string;
  barcode_url?: string;
  qr_code_url?: string;
  is_verified: boolean;
  created_at: string;
  event_name?: string;
  event_type?: string;
  event_location?: string;
  event_start_time?: string;
  participant_name?: string;
  participant_email?: string;
}

export interface TicketGenerationOptions {
  eventId: number;
  count: number;
  prefix?: string;
}

export async function generateTickets(options: TicketGenerationOptions): Promise<Ticket[]> {
  const { eventId, count, prefix = '' } = options;
  const tickets: Ticket[] = [];
  
  try {
    // Ensure tickets directory exists
    const ticketsDir = path.join(process.cwd(), 'public', 'tickets');
    if (!fs.existsSync(ticketsDir)) {
      fs.mkdirSync(ticketsDir, { recursive: true });
    }
    
    for (let i = 0; i < count; i++) {
      // Generate unique token
      let token: string;
      let isUnique = false;
      
      do {
        token = prefix + generateToken(10);
        const existingTickets = await db.query(
          'SELECT id FROM tickets WHERE token = ?',
          [token]
        );
        isUnique = existingTickets.length === 0;
      } while (!isUnique);
      
      // Generate QR code
      const qrCodePath = await generateQRCode(token);
      
      // Insert ticket into database
      const result = await db.execute(
        'INSERT INTO tickets (event_id, token, qr_code_url, is_verified, created_at) VALUES (?, ?, ?, FALSE, NOW())',
        [eventId, token, qrCodePath]
      );
      
      tickets.push({
        id: result.insertId,
        event_id: eventId,
        token,
        qr_code_url: qrCodePath,
        is_verified: false,
        created_at: new Date().toISOString()
      });
    }
    
    return tickets;
  } catch (error) {
    console.error('Error generating tickets:', error);
    throw error;
  }
}

export async function generateQRCode(token: string): Promise<string> {
  try {
    const qrCodeDir = path.join(process.cwd(), 'public', 'tickets');
    if (!fs.existsSync(qrCodeDir)) {
      fs.mkdirSync(qrCodeDir, { recursive: true });
    }
    
    const filename = `qr_${token}.png`;
    const filepath = path.join(qrCodeDir, filename);
    const relativePath = `/tickets/${filename}`;
    
    // Generate QR code with ticket verification URL
    const qrData = `${process.env.SERVER_URL || 'http://localhost:3000'}/verify/${token}`;
    
    await QRCode.toFile(filepath, qrData, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    return relativePath;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
}

export async function getTickets(): Promise<Ticket[]> {
  try {
    const query = `
      SELECT 
        t.*,
        e.name as event_name,
        e.type as event_type,
        e.location as event_location,
        e.start_time as event_start_time,
        p.name as participant_name,
        p.email as participant_email
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      LEFT JOIN participants p ON p.ticket_id = t.id
      ORDER BY t.created_at DESC
    `;
    
    const tickets = await db.query(query);
    return tickets || [];
  } catch (error) {
    console.error('Error fetching tickets:', error);
    return [];
  }
}

export async function getTicketById(id: number): Promise<Ticket | null> {
  try {
    const query = `
      SELECT 
        t.*,
        e.name as event_name,
        e.type as event_type,
        e.location as event_location,
        e.start_time as event_start_time,
        p.name as participant_name,
        p.email as participant_email
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      LEFT JOIN participants p ON p.ticket_id = t.id
      WHERE t.id = ?
    `;
    
    const tickets = await db.query(query, [id]);
    return tickets[0] || null;
  } catch (error) {
    console.error('Error fetching ticket:', error);
    return null;
  }
}

export async function getTicketByToken(token: string): Promise<Ticket | null> {
  try {
    const query = `
      SELECT 
        t.*,
        e.name as event_name,
        e.type as event_type,
        e.location as event_location,
        e.start_time as event_start_time,
        p.name as participant_name,
        p.email as participant_email
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      LEFT JOIN participants p ON p.ticket_id = t.id
      WHERE t.token = ?
    `;
    
    const tickets = await db.query(query, [token]);
    return tickets[0] || null;
  } catch (error) {
    console.error('Error fetching ticket by token:', error);
    return null;
  }
}

export async function getTicketsByEventId(eventId: number): Promise<Ticket[]> {
  try {
    const query = `
      SELECT 
        t.*,
        e.name as event_name,
        e.type as event_type,
        e.location as event_location,
        e.start_time as event_start_time,
        p.name as participant_name,
        p.email as participant_email
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      LEFT JOIN participants p ON p.ticket_id = t.id
      WHERE t.event_id = ?
      ORDER BY t.created_at DESC
    `;
    
    const tickets = await db.query(query, [eventId]);
    return tickets || [];
  } catch (error) {
    console.error('Error fetching tickets by event:', error);
    return [];
  }
}

export async function verifyTicket(token: string): Promise<boolean> {
  try {
    const result = await db.execute(
      'UPDATE tickets SET is_verified = TRUE WHERE token = ? AND is_verified = FALSE',
      [token]
    );
    
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Error verifying ticket:', error);
    return false;
  }
}

export async function unverifyTicket(token: string): Promise<boolean> {
  try {
    const result = await db.execute(
      'UPDATE tickets SET is_verified = FALSE WHERE token = ?',
      [token]
    );
    
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Error unverifying ticket:', error);
    return false;
  }
}

export async function deleteTicket(id: number): Promise<boolean> {
  try {
    // Get ticket info first
    const ticket = await getTicketById(id);
    if (!ticket) return false;
    
    // Delete QR code file if exists
    if (ticket.qr_code_url) {
      const qrPath = path.join(process.cwd(), 'public', ticket.qr_code_url);
      if (fs.existsSync(qrPath)) {
        fs.unlinkSync(qrPath);
      }
    }
    
    // Delete ticket from database
    await db.execute('DELETE FROM tickets WHERE id = ?', [id]);
    
    return true;
  } catch (error) {
    console.error('Error deleting ticket:', error);
    return false;
  }
}

export async function regenerateQRCode(ticketId: number): Promise<string | null> {
  try {
    const ticket = await getTicketById(ticketId);
    if (!ticket) return null;
    
    // Delete old QR code if exists
    if (ticket.qr_code_url) {
      const oldPath = path.join(process.cwd(), 'public', ticket.qr_code_url);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
    
    // Generate new QR code
    const newQRPath = await generateQRCode(ticket.token);
    
    // Update ticket record
    await db.execute(
      'UPDATE tickets SET qr_code_url = ? WHERE id = ?',
      [newQRPath, ticketId]
    );
    
    return newQRPath;
  } catch (error) {
    console.error('Error regenerating QR code:', error);
    return null;
  }
}

export async function getAvailableTickets(eventId: number): Promise<Ticket[]> {
  try {
    const query = `
      SELECT t.* FROM tickets t
      LEFT JOIN participants p ON p.ticket_id = t.id
      WHERE t.event_id = ? AND p.id IS NULL
      ORDER BY t.created_at ASC
    `;
    
    const tickets = await db.query(query, [eventId]);
    return tickets || [];
  } catch (error) {
    console.error('Error fetching available tickets:', error);
    return [];
  }
}

export async function getTicketStats(eventId?: number): Promise<{
  total: number;
  verified: number;
  available: number;
  registered: number;
}> {
  try {
    let query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN t.is_verified = TRUE THEN 1 END) as verified,
        COUNT(CASE WHEN p.id IS NULL THEN 1 END) as available,
        COUNT(CASE WHEN p.id IS NOT NULL THEN 1 END) as registered
      FROM tickets t
      LEFT JOIN participants p ON p.ticket_id = t.id
    `;
    
    const params: any[] = [];
    
    if (eventId) {
      query += ' WHERE t.event_id = ?';
      params.push(eventId);
    }
    
    const result = await db.query(query, params);
    
    return {
      total: result[0]?.total || 0,
      verified: result[0]?.verified || 0,
      available: result[0]?.available || 0,
      registered: result[0]?.registered || 0
    };
  } catch (error) {
    console.error('Error fetching ticket stats:', error);
    return { total: 0, verified: 0, available: 0, registered: 0 };
  }
}