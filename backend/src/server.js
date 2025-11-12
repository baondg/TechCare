import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'TechCare API is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.get('/api/v1', (req, res) => {
  res.json({
    message: 'Welcome to TechCare API',
    version: '1.0.0'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TechCare server running on port ${PORT}`);
});

export default app;