import fs from 'fs'
import path from 'path'
import { createCanvas, loadImage } from 'canvas'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'

interface GenerateTicketPDFOptions {
  participantName: string
  eventName: string
  eventId: number
  ticketToken: string
  ticketDesign: string // path ke file desain offline (PNG/JPG)
}

export async function generateTicketPDF({ participantName, eventName, eventId, ticketToken, ticketDesign }: GenerateTicketPDFOptions): Promise<string> {
  // Pastikan folder public/tickets ada
  const ticketDir = path.join(process.cwd(), 'public', 'tickets')
  if (!fs.existsSync(ticketDir)) {
    fs.mkdirSync(ticketDir, { recursive: true })
  }
  // Nama file unik
  const filename = `ticket_${eventId}_${ticketToken}.pdf`
  const filePath = path.join(ticketDir, filename)
  const publicPath = `/tickets/${filename}`

  // Load background desain offline
  const designPath = ticketDesign.startsWith('/') ? path.join(process.cwd(), 'public', ticketDesign) : ticketDesign
  const bgImage = await loadImage(designPath)

  // Generate QR code sebagai data URL
  const qrDataUrl = await QRCode.toDataURL(ticketToken)
  const qrImage = await loadImage(qrDataUrl)

  // Ukuran A4 landscape (mm): 297 x 210
  // jsPDF: 297 x 210 mm, canvas: 3508 x 2480 px (300dpi)
  const widthPx = 1200, heightPx = 680 // sesuaikan dengan desain offline
  const canvas = createCanvas(widthPx, heightPx)
  const ctx = canvas.getContext('2d')

  // Draw background
  ctx.drawImage(bgImage, 0, 0, widthPx, heightPx)

  // Draw QR code di pojok kanan bawah
  const qrSize = 140
  ctx.drawImage(qrImage, widthPx - qrSize - 40, heightPx - qrSize - 40, qrSize, qrSize)

  // Draw nama peserta
  ctx.font = 'bold 36px Arial'
  ctx.fillStyle = '#222'
  ctx.textAlign = 'left'
  ctx.fillText(participantName, 60, heightPx - 80)

  // Draw event name
  ctx.font = '24px Arial'
  ctx.fillStyle = '#444'
  ctx.fillText(eventName, 60, heightPx - 40)

  // Export canvas ke image
  const ticketImageBuffer = canvas.toBuffer('image/png')

  // Buat PDF dengan jsPDF
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  // Konversi px ke mm (A4 landscape: 297 x 210 mm)
  const imgWidthMm = 297, imgHeightMm = 210
  doc.addImage(ticketImageBuffer, 'PNG', 0, 0, imgWidthMm, imgHeightMm)
  // Save PDF
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
  fs.writeFileSync(filePath, pdfBuffer)
  return filePath
} 