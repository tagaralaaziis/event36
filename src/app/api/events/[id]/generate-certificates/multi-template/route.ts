import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { writeFile, mkdir, access, unlink } from 'fs/promises'
import db from '@/lib/db'
import fs from 'fs'

// GET: fetch all 6 templates for an event
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const [rows] = await db.execute(
      'SELECT template_index, template_path, template_fields FROM certificate_templates_multi WHERE event_id = ? ORDER BY template_index ASC',
      [params.id]
    );
    const templates = (rows as any[]).map(t => ({
      templateIndex: t.template_index,
      templateUrl: t.template_path,
      fields: typeof t.template_fields === 'string' ? JSON.parse(t.template_fields || '[]') : (t.template_fields || []),
      templateSize: { width: 842, height: 595 }, // default, will be updated below
    }))
    // Get image sizes for each template
    for (const t of templates) {
      if (t.templateUrl) {
        const imagePath = path.join(process.cwd(), 'public', t.templateUrl)
        let templateSize = { width: 842, height: 595 }
        try {
          const sharp = (await import('sharp')).default
          const metadata = await sharp(imagePath).metadata()
          templateSize = { width: metadata.width || 842, height: metadata.height || 595 }
        } catch {}
        t.templateSize = templateSize
      }
    }
    return NextResponse.json({ templates })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}

// POST: save/update a template for a given index
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const formData = await request.formData()
    const templateIndex = parseInt(formData.get('template_index') as string)
    if (!templateIndex || templateIndex < 1 || templateIndex > 6) {
      return NextResponse.json({ error: 'template_index must be 1-6' }, { status: 400 })
    }
    const templateFile = formData.get('template') as File | null
    const fields = JSON.parse(formData.get('fields') as string)
    
    // If no file, just update fields
    if (!templateFile) {
      await db.execute('UPDATE certificate_templates_multi SET template_fields = ? WHERE event_id = ? AND template_index = ?', [JSON.stringify(fields), params.id, templateIndex])
      return NextResponse.json({ message: 'Fields updated' })
    }
    
    // If file, remove old file if exists
    const [oldTemplates] = await db.execute('SELECT template_path FROM certificate_templates_multi WHERE event_id = ? AND template_index = ?', [params.id, templateIndex])
    const templatesArr = oldTemplates as any[]
    if (templatesArr.length > 0 && templatesArr[0].template_path) {
      try { await unlink(path.join(process.cwd(), 'public', templatesArr[0].template_path)) } catch {}
    }
    
    // Remove old DB row
    await db.execute('DELETE FROM certificate_templates_multi WHERE event_id = ? AND template_index = ?', [params.id, templateIndex])
    
    // Save new file
    const dir = path.join(process.cwd(), 'public', 'certificates', 'templates')
    try { await access(dir) } catch { await mkdir(dir, { recursive: true }) }
    
    const filename = `template_${templateIndex}_${Date.now()}`
    const ext = templateFile.name.split('.').pop() || 'png'
    const filepath = path.join(dir, `${filename}.${ext}`)
    const buffer = Buffer.from(await templateFile.arrayBuffer())
    await writeFile(filepath, buffer)
    
    // Save to DB
    await db.execute('INSERT INTO certificate_templates_multi (event_id, template_index, template_path, template_fields) VALUES (?, ?, ?, ?)', [params.id, templateIndex, `/certificates/templates/${filename}.${ext}`, JSON.stringify(fields)])
    
    return NextResponse.json({ message: 'Template saved', path: `/certificates/templates/${filename}.${ext}` })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}