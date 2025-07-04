import nodemailer from 'nodemailer'
import fs from 'fs/promises'
import path from 'path'

// Email configuration interface
interface EmailConfig {
  provider: 'gmail' | 'brevo' | 'mailtrap'
  host?: string
  port?: number
  secure?: boolean
  auth: {
    user: string
    pass: string
  }
}

// Get email configuration based on environment
function getEmailConfig(): EmailConfig {
  const useBrevo = process.env.USE_BREVO === 'true'
  
  if (useBrevo) {
    return {
      provider: 'brevo',
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.BREVO_SMTP_USER || '',
        pass: process.env.BREVO_SMTP_PASS || ''
      }
    }
  }

  if (process.env.GMAIL_APP_PASSWORD) {
    return {
      provider: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.FROM_EMAIL || '',
        pass: process.env.GMAIL_APP_PASSWORD
      }
    }
  }

  // Default to Mailtrap for development
  return {
    provider: 'mailtrap',
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT || '2525'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  }
}

// Create transporter
function createTransporter() {
  const config = getEmailConfig()
  
  return nodemailer.createTransporter({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    tls: {
      rejectUnauthorized: false
    }
  })
}

// Send email with attachment
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: Array<{
    filename: string
    path: string
    contentType?: string
  }>
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = createTransporter()
    const fromEmail = process.env.FROM_EMAIL || 'noreply@eventmanagement.com'

    const mailOptions = {
      from: fromEmail,
      to,
      subject,
      html,
      attachments: attachments || []
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('Email sent successfully:', info.messageId)
    
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('Error sending email:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

// Send registration confirmation email
export async function sendRegistrationEmail(
  participantEmail: string,
  participantName: string,
  eventName: string,
  ticketToken: string,
  qrCodePath?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const subject = `Registration Confirmation - ${eventName}`
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Registration Confirmation</h2>
        <p>Dear ${participantName},</p>
        <p>Thank you for registering for <strong>${eventName}</strong>!</p>
        <p>Your registration details:</p>
        <ul>
          <li><strong>Name:</strong> ${participantName}</li>
          <li><strong>Event:</strong> ${eventName}</li>
          <li><strong>Ticket Token:</strong> ${ticketToken}</li>
        </ul>
        <p>Please keep this email for your records. You may need to present your ticket token at the event.</p>
        <p>We look forward to seeing you at the event!</p>
        <hr>
        <p style="font-size: 12px; color: #666;">
          This is an automated email. Please do not reply to this message.
        </p>
      </div>
    `

    const attachments = []
    if (qrCodePath) {
      const fullPath = path.join(process.cwd(), 'public', qrCodePath)
      try {
        await fs.access(fullPath)
        attachments.push({
          filename: 'ticket-qr.png',
          path: fullPath,
          contentType: 'image/png'
        })
      } catch (error) {
        console.warn('QR code file not found:', fullPath)
      }
    }

    const result = await sendEmail(participantEmail, subject, html, attachments)
    return { success: result.success, error: result.error }
  } catch (error) {
    console.error('Error sending registration email:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

// Send certificate email
export async function sendCertificateEmail(
  participantEmail: string,
  participantName: string,
  eventName: string,
  certificatePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const subject = `Certificate of Completion - ${eventName}`
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Certificate of Completion</h2>
        <p>Dear ${participantName},</p>
        <p>Congratulations on completing <strong>${eventName}</strong>!</p>
        <p>Please find your certificate of completion attached to this email.</p>
        <p>Thank you for your participation, and we hope you found the event valuable.</p>
        <p>Best regards,<br>Event Management Team</p>
        <hr>
        <p style="font-size: 12px; color: #666;">
          This is an automated email. Please do not reply to this message.
        </p>
      </div>
    `

    const fullPath = path.join(process.cwd(), 'public', certificatePath)
    const attachments = [{
      filename: `certificate_${participantName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      path: fullPath,
      contentType: 'application/pdf'
    }]

    const result = await sendEmail(participantEmail, subject, html, attachments)
    return { success: result.success, error: result.error }
  } catch (error) {
    console.error('Error sending certificate email:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

// Send bulk emails
export async function sendBulkEmails(
  emails: Array<{
    to: string
    subject: string
    html: string
    attachments?: Array<{
      filename: string
      path: string
      contentType?: string
    }>
  }>
): Promise<{ success: number; failed: number; results: any[] }> {
  const results = []
  let success = 0
  let failed = 0

  for (const email of emails) {
    try {
      const result = await sendEmail(email.to, email.subject, email.html, email.attachments)
      if (result.success) {
        success++
        results.push({ email: email.to, status: 'success', messageId: result.messageId })
      } else {
        failed++
        results.push({ email: email.to, status: 'failed', error: result.error })
      }
    } catch (error) {
      failed++
      results.push({ 
        email: email.to, 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
    }
  }

  return { success, failed, results }
}

// Test email configuration
export async function testEmailConfig(): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createTransporter()
    await transporter.verify()
    return { success: true }
  } catch (error) {
    console.error('Email configuration test failed:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}