import mysql from 'mysql2/promise'

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'event_management',
  port: parseInt(process.env.DB_PORT || '3306'),
  timezone: '+00:00',
  charset: 'utf8mb4',
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
}

// Create connection pool
const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection()
    await connection.ping()
    connection.release()
    console.log('Database connection successful')
    return true
  } catch (error) {
    console.error('Database connection failed:', error)
    return false
  }
}

// Log system events
export async function logSystemEvent(type: string, message: string, meta?: any): Promise<void> {
  try {
    const [result] = await pool.execute(
      'INSERT INTO logs (type, message, meta) VALUES (?, ?, ?)',
      [type, message, meta ? JSON.stringify(meta) : null]
    )
    console.log(`System event logged: ${type} - ${message}`)
  } catch (error) {
    console.error('Failed to log system event:', error)
  }
}

// Execute query with error handling
export async function executeQuery(query: string, params: any[] = []): Promise<any> {
  try {
    const [results] = await pool.execute(query, params)
    return results
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
}

// Get database connection
export async function getConnection() {
  return await pool.getConnection()
}

// Close database pool
export async function closePool(): Promise<void> {
  try {
    await pool.end()
    console.log('Database pool closed')
  } catch (error) {
    console.error('Error closing database pool:', error)
  }
}

// Database instance
const db = pool

// Default export
export default db

// Named export for compatibility
export { db }