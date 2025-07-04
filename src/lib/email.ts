import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    path: string;
  }>;
}

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

function getEmailConfig(): EmailConfig {
  // Check if using Gmail
  if (process.env.GMAIL_APP_PASSWORD) {
    return {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.FROM_EMAIL || '',
        pass: process.env.GMAIL_APP_PASSWORD
      }
    };
  }
  
  // Check if using Brevo (SendinBlue)
  if (process.env.USE_BREVO === 'true') {
    return {
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.BREVO_EMAIL || '',
        pass: process.env.BREVO_API_KEY || ''
      }
    };
  }
  
  // Default to Mailtrap for development
  return {
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT || '2525'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  };
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const config = getEmailConfig();
    
    // Create transporter
    const transporter = nodemailer.createTransporter(config);
    
    // Verify connection
    await transporter.verify();
    
    // Send email
    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL || 'noreply@eventmanagement.com',
      to: options.to,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments
    });
    
    console.log('Email sent successfully:', info.messageId);
    return true;
    
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

export async function sendBulkEmails(emails: EmailOptions[]): Promise<{ success: number, failed: number }> {
  let success = 0;
  let failed = 0;
  
  for (const email of emails) {
    try {
      const sent = await sendEmail(email);
      if (sent) {
        success++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error('Error sending bulk email:', error);
      failed++;
    }
  }
  
  return { success, failed };
}

export async function sendCertificateEmail(
  recipientEmail: string,
  recipientName: string,
  eventName: string,
  certificatePath: string
): Promise<boolean> {
  return await sendEmail({
    to: recipientEmail,
    subject: `Certificate for ${eventName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Congratulations ${recipientName}!</h2>
        <p>Thank you for participating in <strong>${eventName}</strong>.</p>
        <p>Please find your certificate of completion attached to this email.</p>
        <br>
        <p>Best regards,<br>Event Management Team</p>
      </div>
    `,
    attachments: [
      {
        filename: `certificate_${recipientName.replace(/\s+/g, '_')}.pdf`,
        path: certificatePath
      }
    ]
  });
}

export async function sendTicketEmail(
  recipientEmail: string,
  recipientName: string,
  eventName: string,
  ticketToken: string,
  qrCodePath?: string
): Promise<boolean> {
  const attachments = qrCodePath ? [
    {
      filename: `ticket_${ticketToken}.png`,
      path: qrCodePath
    }
  ] : undefined;

  return await sendEmail({
    to: recipientEmail,
    subject: `Your Ticket for ${eventName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Hello ${recipientName}!</h2>
        <p>Thank you for registering for <strong>${eventName}</strong>.</p>
        <p>Your ticket token is: <strong>${ticketToken}</strong></p>
        ${qrCodePath ? '<p>Please find your QR code ticket attached to this email.</p>' : ''}
        <p>Please keep this email for your records and bring it to the event.</p>
        <br>
        <p>Best regards,<br>Event Management Team</p>
      </div>
    `,
    attachments
  });
}