import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, access } from 'fs/promises'
import path from 'path'
import db from '@/lib/db'
import { logSystemEvent } from '@/lib/db'
import fs from 'fs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('certificateTemplate') as File | null
    if (!file || file.size === 0) {
      return NextResponse.json({ message: 'No file uploaded' }, { status: 400 })
    }
    const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ message: 'Invalid file type' }, { status: 400 })
    }
    // Pastikan folder certificates ada
    const certDir = path.join(process.cwd(), 'public', 'certificates')
    try { await access(certDir) } catch { await mkdir(certDir, { recursive: true }) }
    // Nama file unik
    const eventId = formData.get('eventId') as string | undefined
    if (!eventId) return NextResponse.json({ message: 'Event ID is required' }, { status: 400 })
    // Penamaan file unik per event
    const timestamp = Date.now()
    const ext = path.extname(file.name)
    const filename = `certificate-template-event-${eventId}-${timestamp}${ext}`
    const filepath = path.join(certDir, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filepath, buffer, { mode: 0o644 })
    const templatePath = `/certificates/${filename}`
    // Hapus template lama untuk event ini (jika ada)
    const [oldTemplates] = await db.execute('SELECT template_path FROM certificate_templates WHERE event_id = ?', [eventId])
    for (const row of oldTemplates as any[]) {
      if (row.template_path) {
        try { await fs.promises.unlink(path.join(process.cwd(), 'public', row.template_path)) } catch {}
      }
    }
    await db.execute('DELETE FROM certificate_templates WHERE event_id = ?', [eventId])
    // Simpan ke DB
    await db.execute('INSERT INTO certificate_templates (event_id, template_path, template_fields) VALUES (?, ?, ?)', [eventId, templatePath, JSON.stringify({ name_position: { x: 0.5, y: 0.85 } })])
    await logSystemEvent('certificate_generate', `Certificate generated`, { template: templatePath })
    return NextResponse.json({ message: 'Template uploaded', path: templatePath })
  } catch (error) {
    console.error('Error uploading certificate template:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
} 