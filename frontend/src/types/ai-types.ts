// ============================================================
// Shared AI service types
// ============================================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatResponse {
  message: string
  error?: string
}

export interface SymptomInput {
  name: string
  severity: 'mild' | 'moderate' | 'severe'
  duration: 'less24h' | '1to3days' | '3to7days' | 'moreThanWeek'
}

/** Built server-side from latest HealthInfo / MEDICAL_RECORD; optional reference for typing only. */
export interface SymptomCheckerPatientContext {
  demographics?: {
    sex?: string
    age?: number
    bloodType?: string
  }
  vitalsFromLatestRecord?: {
    recordId?: number
    recordTime?: string
    heightCm?: number
    weightKg?: number
    bmi?: number
    bloodPressure?: string
    heartRate?: number
    respiratoryRate?: number
    temperatureC?: number
    spo2Percent?: number
    symptomsOrNotesInRecord?: string
  }
  history?: {
    chronicConditions?: string[]
    pastSurgeries?: string[]
    familyHistory?: string[]
    pastIllnesses?: string[]
    vaccinations?: string[]
    substanceAbuse?: string[]
    drugAllergies?: string[]
    foodAllergies?: string[]
    otherAllergies?: string[]
  }
  currentMedications?: string[]
}

export interface SymptomAnalysisResult {
  condition: string
  severity: 'low' | 'medium' | 'high'
  recommendation: string
  details: string
  possibleCauses?: string[]
  whenToSeekHelp?: string
}

export interface SymptomAnalysisResponse {
  results: SymptomAnalysisResult[]
  disclaimer: string
  error?: string
}
