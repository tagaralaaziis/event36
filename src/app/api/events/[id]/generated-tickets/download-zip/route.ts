import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import path from 'path'
import fs from 'fs/promises'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const eventId = params.id
    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No file ids provided' }, { status: 400 })
    }
    // Ambil file_path dari DB
    const [rows] = await db.execute(
      `SELECT file_path FROM generated_tickets WHERE event_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
      [eventId, ...ids]
    )
    const files = (rows as any[]).map(r => r.file_path)
    if (!files.length) {
      return NextResponse.json({ error: 'No files found' }, { status: 404 })
    }
    // Siapkan ZIP
    const JSZip = await import('jszip').then(m => m.default)
    const zip = new JSZip()
    let notFoundFiles: string[] = []
    let foundFiles = 0
    for (const relPath of files) {
      const absPath = path.join(process.cwd(), 'public', relPath)
      try {
        const data = await fs.readFile(absPath)
        const filename = relPath.split('/').pop() || 'file.pdf'
        zip.file(filename, data)
        foundFiles++
      } catch (err) {
        notFoundFiles.push(relPath)
        console.error('Download ZIP: File not found:', absPath)
      }
    }
    if (foundFiles === 0) {
      return NextResponse.json({ error: 'No files found on disk', notFoundFiles }, { status: 404 })
    }
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    const headers: Record<string, string> = {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="offline-tickets-massal-event-${eventId}.zip"`,
      'Content-Length': zipBuffer.length.toString(),
    }
    if (notFoundFiles.length > 0) {
      headers['X-Download-Warning'] = `Some files not found: ${notFoundFiles.join(', ')}`
    }
    return new NextResponse(zipBuffer, {
      status: 200,
      headers,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to generate ZIP', detail: String(err) }, { status: 500 })
  }
} 