import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import db from '@/lib/db'
import fs from 'fs/promises'

// Fungsi getOptimalGrid harus disalin dari file utama
function getOptimalGrid(ticketWidth: number, ticketHeight: number, pageWidth: number, pageHeight: number) {
  let best = { cols: 1, rows: 1, scale: 1, count: 1 }
  for (let cols = 1; cols <= 5; cols++) {
    for (let rows = 1; rows <= 10; rows++) {
      const scaleX = pageWidth / (cols * ticketWidth)
      const scaleY = pageHeight / (rows * ticketHeight)
      const scale = Math.min(scaleX, scaleY)
      const count = cols * rows
      if (scale < 0.2) continue
      if (count > best.count || (count === best.count && scale > best.scale)) {
        best = { cols, rows, scale, count }
      }
    }
  }
  return best
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const url = new URL(request.url)
    const barcodeX = Number(url.searchParams.get('barcode_x'))
    const barcodeY = Number(url.searchParams.get('barcode_y'))
    const barcodeWidth = Number(url.searchParams.get('barcode_width'))
    const barcodeHeight = Number(url.searchParams.get('barcode_height'))
    // Validasi parameter barcode
    if (
      isNaN(barcodeX) || isNaN(barcodeY) || isNaN(barcodeWidth) || isNaN(barcodeHeight) ||
      barcodeWidth < 1 || barcodeHeight < 1
    ) {
      return NextResponse.json({ error: 'Invalid barcode parameters: x, y, width, height must be >= 1 and valid numbers.' }, { status: 400 })
    }
    const eventId = params.id
    const [rows] = await db.execute('SELECT id, token FROM tickets WHERE event_id = ? ORDER BY id ASC', [eventId])
    const participants = (rows as any[]).map(row => ({ name: row.id, token: row.token }))
    if (participants.length === 0) {
      return NextResponse.json({ error: 'No tickets to preview' }, { status: 400 })
    }
    // Ambil desain template dari file_uploads
    const [designRows] = await db.execute('SELECT file_path FROM file_uploads WHERE upload_type = ? AND related_id = ? ORDER BY id DESC LIMIT 1', ['ticket_design', eventId])
    if (!(designRows as any[]).length) {
      return NextResponse.json({ error: 'No ticket design uploaded' }, { status: 400 })
    }
    const designPath = (designRows as any[])[0].file_path
    const absPath = `${process.cwd()}/public${designPath}`
    // Validasi file template benar-benar ada
    try {
      await fs.access(absPath)
    } catch {
      return NextResponse.json({ error: 'Template file not found on disk' }, { status: 400 })
    }
    let templateBuffer = await fs.readFile(absPath)
    // Gunakan parameter posisi barcode jika ada, jika tidak default pojok kanan bawah
    const ticketMeta = await sharp(templateBuffer).metadata()
    const ticketW = ticketMeta.width || 1000
    const ticketH = ticketMeta.height || 500
    let bx = barcodeX, by = barcodeY, bw = barcodeWidth, bh = barcodeHeight
    if (!barcodeX || !barcodeY || !barcodeWidth || !barcodeHeight) {
      bw = 200; bh = 200; bx = ticketW - 220; by = ticketH - 220;
    }
    // Generate ticket images (hanya untuk 1 halaman A3, 10 tiket per halaman, fit penuh)
    const A3_WIDTH = 841.89
    const A3_HEIGHT = 1190.55
    let gridCols = 1, gridRows = 10
    let bestDiff = Infinity
    for (let c = 1; c <= 10; c++) {
      if (10 % c === 0) {
        const r = 10 / c
        const scaleX = A3_WIDTH / (c * ticketW)
        const scaleY = A3_HEIGHT / (r * ticketH)
        const diff = Math.abs(scaleX - scaleY)
        if (diff < bestDiff) {
          bestDiff = diff
          gridCols = c
          gridRows = r
        }
      }
    }
    const scale = Math.min(A3_WIDTH / (gridCols * ticketW), A3_HEIGHT / (gridRows * ticketH))
    const maxTickets = 10
    const ticketsToShow = participants.slice(0, maxTickets)
    const ticketImages: Buffer[] = []
    const QRCode = (await import('qrcode')).default
    for (let i = 0; i < ticketsToShow.length; i++) {
      const participant = ticketsToShow[i]
      const registerLink = `http://10.10.11.28:3000/register?token=${participant.token}`
      const qrBufferRaw = await QRCode.toBuffer(registerLink, {
        errorCorrectionLevel: 'H',
        type: 'png',
        width: bw,
        margin: 0,
        color: { dark: '#000000', light: '#FFFFFF' },
      })
      const borderSize = Math.round(Math.max(bw, bh) * 0.08)
      const qrWithBorder = await sharp({
        create: {
          width: bw + borderSize * 2,
          height: bh + borderSize * 2,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      })
        .composite([{ input: await sharp(qrBufferRaw).resize(bw, bh, { fit: 'fill' }).png().toBuffer(), left: borderSize, top: borderSize }])
        .png()
        .toBuffer()
      const ticketImg = await sharp(templateBuffer)
        .composite([{ input: qrWithBorder, left: bx - borderSize, top: by - borderSize }])
        .png()
        .toBuffer()
      ticketImages.push(ticketImg)
    }
    // Buat canvas A3 dan tempel semua tiket (hanya halaman pertama, 10 tiket, fit penuh)
    const { createCanvas, loadImage } = await import('canvas')
    const canvas = createCanvas(A3_WIDTH, A3_HEIGHT)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, A3_WIDTH, A3_HEIGHT)
    let ticketIdx = 0
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        if (ticketIdx >= ticketImages.length) break
        const x = col * ticketW * scale
        const y = A3_HEIGHT - ((row + 1) * ticketH * scale)
        const img = await loadImage(ticketImages[ticketIdx])
        ctx.drawImage(img, x, y, ticketW * scale, ticketH * scale)
        ctx.strokeStyle = 'rgba(180,180,180,0.7)'
        ctx.lineWidth = 0.7
        ctx.strokeRect(x, y, ticketW * scale, ticketH * scale)
        ticketIdx++
      }
    }
    const buffer = canvas.toBuffer('image/png')
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="multi-preview-${eventId}.png"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (err) {
    console.error('Preview multi-ticket error:', err)
    return NextResponse.json({ error: 'Failed to generate multi-ticket preview', detail: String(err) }, { status: 500 })
  }
} 