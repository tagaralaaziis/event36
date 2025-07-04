import { createCanvas, loadImage, registerFont } from 'canvas';
import fs from 'fs';
import path from 'path';

interface TextElement {
  id: string;
  type: 'participant_name' | 'event_name' | 'certificate_number' | 'date' | 'token';
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  text: string;
}

interface Template {
  image: string;
  elements: TextElement[];
}

interface ParticipantData {
  name: string;
  email: string;
  token: string;
  event_name: string;
  certificate_number: string;
  date: string;
  [key: string]: any;
}

export async function generateCertificateWithTemplate(
  template: Template,
  participantData: ParticipantData,
  eventId: string,
  suffix: string = ''
): Promise<string> {
  try {
    // Load the background image
    let backgroundImage;
    if (template.image.startsWith('data:')) {
      // Base64 image
      const base64Data = template.image.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      backgroundImage = await loadImage(buffer);
    } else {
      // File path
      const imagePath = path.join(process.cwd(), 'public', template.image);
      backgroundImage = await loadImage(imagePath);
    }

    // Create canvas with background image dimensions
    const canvas = createCanvas(backgroundImage.width, backgroundImage.height);
    const ctx = canvas.getContext('2d');

    // Draw background image
    ctx.drawImage(backgroundImage, 0, 0);

    // Process each text element
    for (const element of template.elements) {
      let text = '';
      
      // Get text based on element type
      switch (element.type) {
        case 'participant_name':
          text = participantData.name.toUpperCase(); // Auto uppercase
          break;
        case 'event_name':
          text = participantData.event_name;
          break;
        case 'certificate_number':
          text = participantData.certificate_number;
          break;
        case 'date':
          text = participantData.date;
          break;
        case 'token':
          text = participantData.token;
          break;
        default:
          text = element.text;
      }

      // Set font properties
      let fontStyle = '';
      if (element.fontStyle === 'italic') fontStyle += 'italic ';
      if (element.fontWeight === 'bold') fontStyle += 'bold ';
      
      ctx.font = `${fontStyle}${element.fontSize}px ${element.fontFamily}`;
      ctx.fillStyle = element.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Calculate position (convert from design coordinates to canvas coordinates)
      const scaleX = backgroundImage.width / 800; // Design canvas width
      const scaleY = backgroundImage.height / 600; // Design canvas height
      
      const x = (element.x + element.width / 2) * scaleX;
      const y = (element.y + element.height / 2) * scaleY;

      // Draw text
      ctx.fillText(text, x, y);
    }

    // Generate filename
    const timestamp = Date.now();
    const filename = `certificate_${participantData.name.replace(/\s+/g, '_')}_${eventId}_${suffix}_${timestamp}.png`;
    const outputPath = path.join(process.cwd(), 'public', 'certificates', filename);

    // Ensure certificates directory exists
    const certificatesDir = path.join(process.cwd(), 'public', 'certificates');
    if (!fs.existsSync(certificatesDir)) {
      fs.mkdirSync(certificatesDir, { recursive: true });
    }

    // Save the certificate
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);

    return `/certificates/${filename}`;
  } catch (error) {
    console.error('Error generating certificate:', error);
    throw new Error('Failed to generate certificate');
  }
}

export async function generateCertificatePreview(
  template: Template,
  sampleData: any = {}
): Promise<Buffer> {
  try {
    // Default sample data
    const defaultData = {
      name: 'JOHN DOE',
      event_name: 'Sample Event',
      certificate_number: 'CERT-SAMPLE-001',
      date: new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }),
      token: 'SAMPLE123'
    };

    const participantData = { ...defaultData, ...sampleData };

    // Load the background image
    let backgroundImage;
    if (template.image.startsWith('data:')) {
      const base64Data = template.image.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      backgroundImage = await loadImage(buffer);
    } else {
      const imagePath = path.join(process.cwd(), 'public', template.image);
      backgroundImage = await loadImage(imagePath);
    }

    // Create canvas
    const canvas = createCanvas(backgroundImage.width, backgroundImage.height);
    const ctx = canvas.getContext('2d');

    // Draw background
    ctx.drawImage(backgroundImage, 0, 0);

    // Process text elements
    for (const element of template.elements) {
      let text = '';
      
      switch (element.type) {
        case 'participant_name':
          text = participantData.name.toUpperCase();
          break;
        case 'event_name':
          text = participantData.event_name;
          break;
        case 'certificate_number':
          text = participantData.certificate_number;
          break;
        case 'date':
          text = participantData.date;
          break;
        case 'token':
          text = participantData.token;
          break;
        default:
          text = element.text;
      }

      // Set font
      let fontStyle = '';
      if (element.fontStyle === 'italic') fontStyle += 'italic ';
      if (element.fontWeight === 'bold') fontStyle += 'bold ';
      
      ctx.font = `${fontStyle}${element.fontSize}px ${element.fontFamily}`;
      ctx.fillStyle = element.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Calculate position
      const scaleX = backgroundImage.width / 800;
      const scaleY = backgroundImage.height / 600;
      
      const x = (element.x + element.width / 2) * scaleX;
      const y = (element.y + element.height / 2) * scaleY;

      // Draw text
      ctx.fillText(text, x, y);
    }

    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error generating certificate preview:', error);
    throw new Error('Failed to generate certificate preview');
  }
}