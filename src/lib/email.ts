import nodemailer from 'nodemailer'
// import Brevo from 'brevo' // Uncomment jika sudah langganan Brevo

const useBrevo = process.env.USE_BREVO === 'true'

// === Konfigurasi SMTP Gmail ===
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.FROM_EMAIL || 'tagar@umm.ac.id',
    pass: process.env.GMAIL_APP_PASSWORD || 'isi_password_aplikasi_gmail_anda',
  },
})

// === Placeholder Konfigurasi Brevo ===
// const brevoApiKey = process.env.BREVO_API_KEY || ''
// const brevoInstance = new Brevo.TransactionalEmailsApi()
// if (brevoApiKey) brevoInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey)

export async function sendRegistrationEmail(
  to: string,
  participantName: string,
  eventName: string,
  eventDetails: string,
  ticketPath?: string,
  qrCode?: string,
  token?: string,
  phone?: string,
  address?: string
) {
  const mailOptions = {
    from: process.env.FROM_EMAIL || 'noreply@eventmanager.com',
    to,
    subject: `Registration Confirmed - ${eventName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Registration Confirmed!</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <h2 style="color: #333;">Hello ${participantName},</h2>
          <p style="color: #666; line-height: 1.6;">
            Thank you for registering for <strong>${eventName}</strong>. 
            Your registration has been confirmed successfully.
          </p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">Event Details:</h3>
            <p style="color: #666; line-height: 1.6;">${eventDetails}</p>
            <div style="margin: 24px 0 0 0;">
              <h3 style="color: #333; margin-bottom: 8px;">Your Registration Data</h3>
              <table style="width:100%; border-collapse:collapse; background:#f9fafb; border-radius:8px; overflow:hidden;">
                <tbody>
                  <tr><td style="padding:8px 12px; color:#666; width:120px;">Name</td><td style="padding:8px 12px; color:#222; font-weight:500;">${participantName}</td></tr>
                  <tr><td style="padding:8px 12px; color:#666;">Email</td><td style="padding:8px 12px; color:#222; font-weight:500;">${to}</td></tr>
                  ${phone ? `<tr><td style="padding:8px 12px; color:#666;">Phone</td><td style="padding:8px 12px; color:#222; font-weight:500;">${phone}</td></tr>` : ''}
                  ${address ? `<tr><td style="padding:8px 12px; color:#666;">Alamat</td><td style="padding:8px 12px; color:#222; font-weight:500;">${address}</td></tr>` : ''}
                </tbody>
              </table>
            </div>
            <div style="margin: 32px 0 0 0; text-align: center;">
              <h3 style="color: #333; margin-bottom: 8px;">Your Ticket QR & Token</h3>
              <img src="${qrCode || ''}" alt="QR Code" style="width: 160px; height: 160px; border-radius: 12px; border: 1px solid #eee; margin-bottom: 12px;" />
              <div style="font-family: 'Fira Mono', monospace; background: #f3f4f6; color: #333; padding: 10px 24px; border-radius: 8px; display: inline-block; font-size: 18px; letter-spacing: 1px; margin-bottom: 8px;">
                ${token || ''}
              </div>
              <div style="font-size: 13px; color: #888; margin-top: 8px;">Tunjukkan QR atau token ini saat hadir di event</div>
              <div style="font-size: 13px; color: #d97706; margin-top: 8px; font-weight: bold;">Screenshot email ini agar tidak perlu buka email saat hadir ke event.</div>
            </div>
          </div>
          <p style="color: #666; line-height: 1.6;">
            Please keep this email for your records. If you have any questions, 
            feel free to contact our support team.
          </p>
          <div style="text-align: center; margin: 32px 0 0 0;">
            <a href="https://linktr.ee/futurepreneursummit" target="_blank" style="display: inline-block; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: #fff; font-weight: bold; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 18px; box-shadow: 0 2px 8px rgba(102,126,234,0.15); letter-spacing: 1px; transition: background 0.3s;">🎁 Claim Benefit Sekarang!</a>
            <div style="font-size: 13px; color: #888; margin-top: 8px;">Promo khusus peserta Future Entrepreneur Summit</div>
          </div>
        </div>
        <div style="padding: 20px; text-align: center; background: #333; color: white;">
          <p style="margin: 0;">Future Entrepreneur Summit Indonesia</p>
        </div>
      </div>
    `,
    attachments: ticketPath ? [
      {
        filename: 'ticket.pdf',
        path: ticketPath,
      }
    ] : []
  }

  try {
    await transporter.sendMail(mailOptions)
    return true
  } catch (error) {
    console.error('Email sending failed:', error)
    return false
  }
}

export async function sendCertificateEmail(
  to: string,
  participantName: string,
  eventName: string,
  certificatePath: string
) {
  if (useBrevo) {
    // --- Contoh kode Brevo, aktifkan jika sudah langganan ---
    // const fs = require('fs')
    // const fileContent = fs.readFileSync(certificatePath, { encoding: 'base64' })
    // const sendSmtpEmail = {
    //   to: [{ email: to, name: participantName }],
    //   sender: { email: process.env.FROM_EMAIL || 'noreply@event.com', name: 'Event Admin' },
    //   subject: `Certificate - ${eventName}`,
    //   htmlContent: `<h1>Selamat ${participantName}!</h1><p>Sertifikat terlampir.</p>`,
    //   attachment: [
    //     { content: fileContent, name: 'certificate.pdf' }
    //   ]
    // }
    // try {
    //   await brevoInstance.sendTransacEmail(sendSmtpEmail)
    //   return true
    // } catch (error) {
    //   console.error('Brevo email sending failed:', error)
    //   return false
    // }
    return false // fallback jika Brevo belum aktif
  }

  // === Default: Kirim via Gmail SMTP ===
  const mailOptions = {
    from: process.env.FROM_EMAIL || 'tagar@umm.ac.id',
    to,
    subject: `Certificate - ${eventName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Certificate Ready!</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <h2 style="color: #333;">Congratulations ${participantName}!</h2>
          <p style="color: #666; line-height: 1.6;">
            Your certificate for <strong>${eventName}</strong> is ready. 
            Please find it attached to this email.
          </p>
          <p style="color: #666; line-height: 1.6;">
            Thank you for your participation. We hope you enjoyed the event!
          </p>
        </div>
        <div style="padding: 20px; text-align: center; background: #333; color: white;">
          <p style="margin: 0;">Future Entrepreneur Summit Indonesia</p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: 'certificate.pdf',
        path: certificatePath,
      }
    ]
  }

  try {
    await transporter.sendMail(mailOptions)
    return true
  } catch (error) {
    console.error('Certificate email sending failed:', error)
    return false
  }
}
