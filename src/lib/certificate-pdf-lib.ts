import fs from 'fs/promises'
import path from 'path'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export interface CertificateField {
  key: string
  x: number
  y: number
  fontFamily: string
  fontSize: number
  bold?: boolean
  italic?: boolean
  label?: string
  active?: boolean
}

export interface GenerateCertificatePdfLibOptions {
  participant: any
  template: any
  fields: CertificateField[]
  templateSize: { width: number; height: number }
  eventSlug: string
  mmRomawi: string
  yyyy: number
  certificateNumber: string
}

export async function generateCertificatePdfLib({ participant, template, fields, templateSize, eventSlug, mmRomawi, yyyy, certificateNumber }: GenerateCertificatePdfLibOptions): Promise<string> {
  const templatePath = path.join(process.cwd(), 'public', template.template_path)
  const imageBytes = await fs.readFile(templatePath)
  const width_img = templateSize.width
  const height_img = templateSize.height
  const width_pdf = 842
  const height_pdf = 595
  // Generate PDF baru
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([842, 595])
  // Embed image sesuai tipe file
  let image
  if (template.template_path.toLowerCase().endsWith('.png')) {
    image = await pdfDoc.embedPng(imageBytes)
  } else if (
    template.template_path.toLowerCase().endsWith('.jpg') ||
    template.template_path.toLowerCase().endsWith('.jpeg')
  ) {
    image = await pdfDoc.embedJpg(imageBytes)
  } else {
    throw new Error('Template must be PNG or JPG/JPEG')
  }
  page.drawImage(image, { x: 0, y: 0, width: 842, height: 595 })
  for (const f of fields) {
    if (f.active === false) continue
    let value = ''
    if (f.key === 'name') value = participant.name
    else if (f.key === 'event') value = participant.event_name || ''
    else if (f.key === 'number') value = certificateNumber
    else if (f.key === 'token') value = participant.token
    else if (f.key === 'date') value = new Date().toLocaleDateString()
    else value = f.label || ''
    // Konversi posisi field
    const x_pdf = (f.x / width_img) * width_pdf
    const y_pdf = height_pdf - ((f.y / height_img) * height_pdf)
    // Font family & size & style
    const fontMap = {
      Helvetica: {
        normal: StandardFonts.Helvetica,
        bold: StandardFonts.HelveticaBold,
        italic: StandardFonts.HelveticaOblique,
        bolditalic: StandardFonts.HelveticaBoldOblique
      },
      'Times Roman': {
        normal: StandardFonts.TimesRoman,
        bold: StandardFonts.TimesRomanBold,
        italic: StandardFonts.TimesRomanItalic,
        bolditalic: StandardFonts.TimesRomanBoldItalic
      },
      Courier: {
        normal: StandardFonts.Courier,
        bold: StandardFonts.CourierBold,
        italic: StandardFonts.CourierOblique,
        bolditalic: StandardFonts.CourierBoldOblique
      }
    }
    const fontSize = f.fontSize || 24
    let styleKey = 'normal'
    if (f.bold && f.italic) styleKey = 'bolditalic'
    else if (f.bold) styleKey = 'bold'
    else if (f.italic) styleKey = 'italic'
    const font = await pdfDoc.embedFont((fontMap[f.fontFamily] && fontMap[f.fontFamily][styleKey]) || StandardFonts.Helvetica)
    // Sanitize value
    const sanitize = (str: string) => str.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[^\x20-\x7E\u00A0-\u024F]/g, '')
    const safeValue = sanitize(value)
    const textWidth = font.widthOfTextAtSize(safeValue, fontSize)
    page.drawText(safeValue, { x: x_pdf - textWidth / 2, y: y_pdf, size: fontSize, font, color: rgb(0,0,0) })
  }
  // Simpan PDF
  const certDir = path.join(process.cwd(), 'public', 'certificates')
  try { await fs.access(certDir) } catch { await fs.mkdir(certDir, { recursive: true }) }
  const filename = `cert_${participant.event_id}_${participant.id || participant.participant_id}.pdf`
  const filePath = path.join(certDir, filename)
  await fs.writeFile(filePath, Buffer.from(await pdfDoc.save()))
  return `/certificates/${filename}`
} 