import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { writeFile, mkdir, access, unlink } from 'fs/promises'
import db from '@/lib/db'
import fs from 'fs'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const [rows] = await db.execute(
      'SELECT template_path, template_fields FROM certificate_templates WHERE event_id = ? ORDER BY created_at DESC LIMIT 1',
      [params.id]
    );

    const templates = rows as any[];
    if (templates.length === 0) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const template = templates[0];
    const rawFields = template.template_fields;
    const fields = typeof rawFields === 'string' ? JSON.parse(rawFields || '[]') : (rawFields || []);

    // Untuk mendapatkan ukuran gambar, kita perlu membacanya dari file
    const imagePath = path.join(process.cwd(), 'public', template.template_path);
    let templateSize = { width: 842, height: 595 }; // Default A4
    try {
      const sharp = (await import('sharp')).default;
      const metadata = await sharp(imagePath).metadata();
      templateSize = { width: metadata.width || 842, height: metadata.height || 595 };
    } catch (e) {
      console.error("Could not read template image size, using default.", e);
    }
    
    return NextResponse.json({
      templateUrl: template.template_path,
      fields,
      templateSize,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const formData = await request.formData()
    const templateFile = formData.get('template') as File | null
    const fields = JSON.parse(formData.get('fields') as string)
    
    // Jika tidak ada file template baru, hanya update posisi/fields
    if (!templateFile) {
      await db.execute('UPDATE certificate_templates SET template_fields = ? WHERE event_id = ?', [JSON.stringify(fields), params.id])
      return NextResponse.json({ message: 'Fields updated' })
    }
    
    // Jika ada file baru, hapus file lama dan simpan baru
    const [oldTemplates] = await db.execute('SELECT template_path FROM certificate_templates WHERE event_id = ? ORDER BY created_at DESC LIMIT 1', [params.id])
    const templatesArr = oldTemplates as any[]
    if (templatesArr.length > 0 && templatesArr[0].template_path) {
      try { 
        await unlink(path.join(process.cwd(), 'public', templatesArr[0].template_path)); 
      } catch {}
    }
    
    // Hapus data template lama di DB
    await db.execute('DELETE FROM certificate_templates WHERE event_id = ?', [params.id])
    
    // Simpan file ke public/certificates/templates
    const dir = path.join(process.cwd(), 'public', 'certificates', 'templates')
    try { await access(dir) } catch { await mkdir(dir, { recursive: true }) }
    
    const filename = `template_${Date.now()}_${templateFile.name}`
    const filepath = path.join(dir, filename)
    const buffer = Buffer.from(await templateFile.arrayBuffer())
    await writeFile(filepath, buffer)
    
    // Simpan ke DB
    await db.execute('INSERT INTO certificate_templates (event_id, template_path, template_fields) VALUES (?, ?, ?)', [params.id, `/certificates/templates/${filename}`, JSON.stringify(fields)])
    
    return NextResponse.json({ message: 'Template saved', path: `/certificates/templates/${filename}` })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}