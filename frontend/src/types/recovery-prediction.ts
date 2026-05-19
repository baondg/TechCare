export interface RecoveryPrediction {
  daysMin: number
  daysMax: number
  confidence: "low" | "medium" | "high"
  note: string
  disclaimer: string
}

export interface RecoveryPredictionApiResponse {
  success: boolean
  eligible?: boolean
  prediction?: RecoveryPrediction
  cached?: boolean
  recommendationId?: number
  model?: { id: number | null; name: string; provider: string }
  message?: string
}
