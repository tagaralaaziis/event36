import Bull from 'bull'

// Koneksi ke Redis (default: redis://localhost:6379)
export const certificateQueue = new Bull('certificate-generation', {
  redis: { host: 'redis', port: 6379 },
})

export const addCertificateJob = (data: any) => certificateQueue.add(data, { attempts: 3, backoff: 5000 }) 