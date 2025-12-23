import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import aiRoutes from './routes/ai';
const authRoutes = require('./authorization/routes');
const systemConfigRoutes = require('./routes/systemConfig');
const sessionMiddleware = require('./middleware/sessionMiddleware');
const sequelize = require('./common/database');

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware for checking timeout
app.use(sessionMiddleware.checkSessionTimeout);

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/system-config', systemConfigRoutes);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'TechCare Backend API'
  });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'TechCare Backend API',
    version: '1.0.0',
      endpoints: {
      health: '/health',
      ai: '/api/ai/chat',
      auth: '/api/auth/login, /api/auth/signup',
      systemConfig: '/api/system-config'
    }
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: Function) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Sync database (create tables if they don't exist)
    await sequelize.sync({ alter: false });
    console.log('✅ Database synced successfully');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
      console.log(`📡 AI Chat endpoint: http://localhost:${PORT}/api/ai/chat`);
      console.log(`🔐 Auth endpoints: http://localhost:${PORT}/api/auth/login, /api/auth/signup`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
