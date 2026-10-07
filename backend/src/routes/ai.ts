import { Router, Request, Response } from 'express';
import logger from '../common/logger';
import * as aiController from '../controllers/aiController';

const authenticateToken = require('../middleware/authMiddleware');
const { authorizeCapability } = require('../middleware/authorizeCapability');
const { aiChatRateLimit, aiSymptomRateLimit, aiRecoveryRateLimit } = require('../middleware/rateLimitMiddleware');
const { requireInternalApiSecret } = require('../middleware/requireInternalApiSecret');

const router = Router();

/** One structured log line per AI request (no bodies: they hold patient data). */
router.use((req: Request, _res: Response, next) => {
  const u = (req as { user?: { userId?: unknown; id?: unknown } }).user;
  logger.info(
    { requestId: req.requestId ?? null, method: req.method, path: req.path, userId: u?.userId ?? u?.id ?? null },
    'ai.http'
  );
  next();
});

const adminOnly = authorizeCapability('ai.models.inspect', { message: 'Admin access required' });
const clinicalStaff = authorizeCapability('ai.clinical.assist', { message: 'Doctor or admin access required' });

// Admin diagnostics
router.get('/chat', authenticateToken, adminOnly, aiController.getChatInfo);

// Server-to-server (appointmentAiService); INTERNAL_API_SECRET required in production
router.post('/chat', requireInternalApiSecret, aiChatRateLimit, aiController.chat);
router.post('/symptom-analysis', requireInternalApiSecret, aiSymptomRateLimit, aiController.analyzeSymptoms);
router.post('/recovery-prediction', requireInternalApiSecret, aiRecoveryRateLimit, aiController.predictRecovery);

// Doctor-facing assistants
router.post('/suggest-medicine', authenticateToken, clinicalStaff, aiController.suggestMedicine);
router.post('/recommend-doctor', authenticateToken, clinicalStaff, aiController.recommendDoctor);

export default router;
