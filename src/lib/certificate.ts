import fs from 'fs'
import path from 'path'

interface GenerateCertificateOptions {
  participantName: string
  eventName: string
  participantId: number
  eventId: number
  certificateNumber: string
  templatePath?: string // path ke file template desain (PNG/JPG)
}

export async function generateCertificate({ participantName, eventName, participantId, eventId, certificateNumber, templatePath }: GenerateCertificateOptions): Promise<string> {
  // Pastikan folder public/certificates ada
  const certDir = path.join(process.cwd(), 'public', 'certificates')
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true })
  }
  
  // Nama file unik
  const filename = `cert_${participantId}_${eventId}.pdf`
  const filePath = path.join(certDir, filename)
  const publicPath = `/certificates/${filename}`

  // Generate PDF using jsPDF instead of PDFKit to avoid font issues
  return new Promise(async (resolve, reject) => {
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      })

      // Jika ada templatePath dan file gambar, gunakan sebagai background
      if (templatePath && (templatePath.endsWith('.png') || templatePath.endsWith('.jpg') || templatePath.endsWith('.jpeg'))) {
        const imgData = fs.readFileSync(templatePath)
        // Convert buffer to base64
        const base64Img = `data:image/${templatePath.endsWith('.png') ? 'png' : 'jpeg'};base64,${imgData.toString('base64')}`
        doc.addImage(base64Img, 'PNG', 0, 0, 297, 210) // A4 landscape: 297x210mm
      }

      // Set font to built-in font
      doc.setFont('helvetica', 'normal')
      // Certificate content
      doc.setFontSize(24)
      doc.text('Certificate of Participation', 148, 50, { align: 'center' })
      doc.setFontSize(18)
      doc.text('Awarded to:', 148, 80, { align: 'center' })
      doc.setFontSize(28)
      doc.text(participantName, 148, 110, { align: 'center' })
      doc.setFontSize(18)
      doc.text('For participating in:', 148, 140, { align: 'center' })
      doc.setFontSize(22)
      doc.text(eventName, 148, 170, { align: 'center' })
      doc.setFontSize(14)
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 148, 200, { align: 'center' })
      // Tambahkan nomor sertifikat di pojok kanan bawah
      doc.setFontSize(12)
      doc.text(`Certificate No: ${certificateNumber}`, 280, 205, { align: 'right' })
      // Save PDF
      const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
      fs.writeFileSync(filePath, pdfBuffer)
      resolve(publicPath)
    } catch (error) {
      reject(error)
    }
  })
}