import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export interface CertificateConfig {
  participantName: string;
  eventName: string;
  eventDate: string;
  eventLocation?: string;
  completionDate?: string;
  hours?: number;
  instructor?: string;
  projectCompleted?: string;
  templatePath?: string;
}

export class CertificatePDFGenerator {
  private pdfDoc: PDFDocument;
  private page: PDFPage;
  private titleFont: PDFFont;
  private bodyFont: PDFFont;
  private nameFont: PDFFont;

  constructor() {
    this.pdfDoc = null as any;
    this.page = null as any;
    this.titleFont = null as any;
    this.bodyFont = null as any;
    this.nameFont = null as any;
  }

  async initialize(): Promise<void> {
    this.pdfDoc = await PDFDocument.create();
    this.page = this.pdfDoc.addPage([842, 595]); // A4 landscape
    
    // Load fonts
    this.titleFont = await this.pdfDoc.embedFont(StandardFonts.HelveticaBold);
    this.bodyFont = await this.pdfDoc.embedFont(StandardFonts.Helvetica);
    this.nameFont = await this.pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  async generateCertificate(config: CertificateConfig): Promise<Uint8Array> {
    await this.initialize();
    
    const { width, height } = this.page.getSize();
    
    // Draw certificate border
    this.drawBorder(width, height);
    
    // Draw certificate content
    this.drawTitle(width, height);
    this.drawParticipantInfo(config, width, height);
    this.drawEventInfo(config, width, height);
    this.drawSignature(width, height);
    
    // Return PDF bytes
    return await this.pdfDoc.save();
  }

  private drawBorder(width: number, height: number): void {
    // Outer border
    this.page.drawRectangle({
      x: 50,
      y: 50,
      width: width - 100,
      height: height - 100,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 3,
    });
    
    // Inner border
    this.page.drawRectangle({
      x: 60,
      y: 60,
      width: width - 120,
      height: height - 120,
      borderColor: rgb(0.4, 0.4, 0.4),
      borderWidth: 1,
    });
  }

  private drawTitle(width: number, height: number): void {
    this.page.drawText('CERTIFICATE OF COMPLETION', {
      x: width / 2 - 180,
      y: height - 150,
      size: 28,
      font: this.titleFont,
      color: rgb(0.1, 0.1, 0.1),
    });
  }

  private drawParticipantInfo(config: CertificateConfig, width: number, height: number): void {
    // "This is to certify that" text
    this.page.drawText('This is to certify that', {
      x: width / 2 - 80,
      y: height - 200,
      size: 14,
      font: this.bodyFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    // Participant name
    this.page.drawText(config.participantName, {
      x: width / 2 - (config.participantName.length * 8),
      y: height - 250,
      size: 24,
      font: this.nameFont,
      color: rgb(0.1, 0.1, 0.1),
    });
  }

  private drawEventInfo(config: CertificateConfig, width: number, height: number): void {
    // "has successfully completed" text
    this.page.drawText('has successfully completed', {
      x: width / 2 - 90,
      y: height - 300,
      size: 14,
      font: this.bodyFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    // Event name
    this.page.drawText(config.eventName, {
      x: width / 2 - (config.eventName.length * 6),
      y: height - 340,
      size: 18,
      font: this.titleFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    
    // Event location
    if (config.eventLocation) {
      this.page.drawText(`Location: ${config.eventLocation}`, {
        x: width / 2 - 100,
        y: height - 380,
        size: 12,
        font: this.bodyFont,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
    
    // Event date
    this.page.drawText(`Date: ${config.eventDate}`, {
      x: width / 2 - 60,
      y: height - 400,
      size: 12,
      font: this.bodyFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    
    // Completion date
    if (config.completionDate) {
      this.page.drawText(`Issued on: ${config.completionDate}`, {
        x: width / 2 - 70,
        y: height - 450,
        size: 10,
        font: this.bodyFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  }

  private drawSignature(width: number, height: number): void {
    // Signature line
    this.page.drawText('_____________________', {
      x: width - 250,
      y: 150,
      size: 12,
      font: this.bodyFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    // Signature label
    this.page.drawText('Authorized Signature', {
      x: width - 240,
      y: 130,
      size: 10,
      font: this.bodyFont,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  async saveCertificate(config: CertificateConfig, outputPath: string): Promise<string> {
    const pdfBytes = await this.generateCertificate(config);
    
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write file
    fs.writeFileSync(outputPath, pdfBytes);
    
    return outputPath;
  }
}

export async function generateCertificatePDF(config: CertificateConfig): Promise<Uint8Array> {
  const generator = new CertificatePDFGenerator();
  return await generator.generateCertificate(config);
}

export async function saveCertificatePDF(config: CertificateConfig, outputPath: string): Promise<string> {
  const generator = new CertificatePDFGenerator();
  return await generator.saveCertificate(config, outputPath);
}