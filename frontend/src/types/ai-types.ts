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
