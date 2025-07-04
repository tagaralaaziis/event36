import mysql from 'mysql2/promise';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'bismillah123',
  database: process.env.DB_NAME || 'event_management',
  port: parseInt(process.env.DB_PORT || '3306'),
  timezone: '+00:00',
  dateStrings: true,
  ssl: false,
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000,
};

let connection: mysql.Connection | null = null;

async function getConnection(): Promise<mysql.Connection> {
  if (!connection) {
    try {
      connection = await mysql.createConnection(dbConfig);
      console.log('Database connected successfully');
    } catch (error) {
      console.error('Database connection failed:', error);
      throw error;
    }
  }
  return connection;
}

export const db = {
  async query(sql: string, params?: any[]): Promise<any> {
    const conn = await getConnection();
    try {
      const [results] = await conn.execute(sql, params);
      return results;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  },

  async execute(sql: string, params?: any[]): Promise<any> {
    const conn = await getConnection();
    try {
      const [results] = await conn.execute(sql, params);
      return results;
    } catch (error) {
      console.error('Database execute error:', error);
      throw error;
    }
  },

  async close(): Promise<void> {
    if (connection) {
      await connection.end();
      connection = null;
    }
  }
};

export default db;