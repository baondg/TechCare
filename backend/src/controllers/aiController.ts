import type { Request, Response } from 'express';
import { asyncHandler } from '../common/asyncHandler';
import * as aiService from '../services/ai/aiService';

/** JSON answer of `work(req)`; AiResponseError is sent with its own status and body. */
const aiHandler = (work: (req: Request) => Promise<unknown>) =>
  asyncHandler(async (req: Request, res: Response) => {
    try {
      res.json(await work(req));
    } catch (error) {
      if (error instanceof aiService.AiResponseError) {
        res.status(error.status).json(error.body);
        return;
      }
      throw error;
    }
  });

/** GET /api/ai/chat — provider / model diagnostics (admin). */
export const getChatInfo = aiHandler(() => aiService.getChatInfo());

/** POST /api/ai/chat — `{ messages, systemPrompt?, preferredModel? }` (internal). */
export const chat = aiHandler((req) => aiService.chat(req.body));

/** POST /api/ai/symptom-analysis — `{ symptoms, patientContext? }` (internal). */
export const analyzeSymptoms = aiHandler((req) => aiService.analyzeSymptoms(req.body ?? {}));

/** POST /api/ai/recovery-prediction — `{ clinicalSummary?, patientContext? }` (internal). */
export const predictRecovery = aiHandler((req) => aiService.predictRecovery(req.body ?? {}));

/** POST /api/ai/suggest-medicine — `{ diagnosis?, symptoms?, patientInfo?, language? }` (doctor / admin). */
export const suggestMedicine = aiHandler((req) => aiService.suggestMedicine(req.body ?? {}));

/** POST /api/ai/recommend-doctor — `{ symptoms?, department?, preferredDate?, availableDoctors? }` (doctor / admin). */
export const recommendDoctor = aiHandler((req) => aiService.recommendDoctor(req.body ?? {}));
