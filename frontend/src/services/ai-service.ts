// ── Python FastAPI chatbot (medAI) ───────────────────────────
// Run with: uvicorn api_chatbot:app --reload  (default port 8000)
// Endpoint: POST /api/chat  → { reply: string }
const MEDAI_CHAT_ENDPOINT =
  import.meta.env.VITE_MEDAI_CHAT_ENDPOINT || 'http://localhost:8000/api/chat'

// ── Python FastAPI symptom checker (medAI) ───────────────────
// Run with: uvicorn api_symptom:app --reload  (default port 8000)
const MEDAI_SYMPTOM_ENDPOINT =
  import.meta.env.VITE_MEDAI_SYMPTOM_ENDPOINT || 'http://localhost:8000/api/analyze_symptoms'




// Re-export types from ai-types.ts
export type {
  ChatMessage,
  ChatResponse,
  SymptomInput,
  SymptomAnalysisResult,
  SymptomAnalysisResponse
} from '../types/ai-types'

import type { ChatMessage, ChatResponse, SymptomInput, SymptomAnalysisResult, SymptomAnalysisResponse } from '../types/ai-types'

// SymptomInput, SymptomAnalysisResult, SymptomAnalysisResponse are
// defined in ai-types.ts and re-exported above.



/**
 * Send a chat message through the backend, which proxies it to the
 * locally-running LLM (Ollama, LM Studio, etc.).
 *
 * Falls back to a friendly rule-based response if the backend is unreachable.
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  userMessage: string
): Promise<ChatResponse> {
  try {
    console.log('🤖 Sending chat to medAI chatbot:', MEDAI_CHAT_ENDPOINT);

    const payload = {
      messages: [
        ...messages.filter(m => m.role !== 'system'),
        { role: 'user', content: userMessage },
      ],
    };

    const response = await fetch(MEDAI_CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Python API returns { reply: string }
    const data = await response.json() as { reply?: string; detail?: string };

    if (data.reply) {
      return { message: data.reply };
    }

    throw new Error(data.detail || 'Empty response from chatbot');
  } catch (error) {
    console.error('Chatbot AI Service Error:', error);
    return {
      message: getFallbackResponse(userMessage),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fallback responses when AI service is unavailable
 */
function getFallbackResponse(query: string): string {
  const lowerQuery = query.toLowerCase()
  
  if (lowerQuery.includes('medication') || lowerQuery.includes('medicine') || lowerQuery.includes('drug')) {
    return "I can help you with medication information. You can ask about:\nΓÇó Current medications and dosages\nΓÇó Medication schedules and reminders\nΓÇó Potential side effects\nΓÇó Drug interactions\n\nWhat would you like to know?"
  }
  
  if (lowerQuery.includes('appointment') || lowerQuery.includes('schedule') || lowerQuery.includes('visit')) {
    return "I can assist with appointments. You can:\nΓÇó View upcoming appointments\nΓÇó Schedule new appointments\nΓÇó Reschedule or cancel appointments\nΓÇó Get directions to the clinic\n\nWhat would you like to do?"
  }
  
  if (lowerQuery.includes('symptom') || lowerQuery.includes('pain') || lowerQuery.includes('sick') || lowerQuery.includes('feel')) {
    return "I understand you're not feeling well. While I can provide general information, it's important to consult with a healthcare professional for proper diagnosis and treatment.\n\nWould you like to:\nΓÇó Schedule an urgent appointment\nΓÇó Speak with a nurse\nΓÇó Get general wellness tips"
  }
  
  if (lowerQuery.includes('test') || lowerQuery.includes('result') || lowerQuery.includes('lab')) {
    return "I can help you access your test results and medical records. Lab results are typically available 2-3 days after testing. Would you like me to:\nΓÇó Check if your results are ready\nΓÇó Explain what tests you've had\nΓÇó Schedule a follow-up appointment"
  }
  
  if (lowerQuery.includes('insurance') || lowerQuery.includes('payment') || lowerQuery.includes('bill')) {
    return "For billing and insurance questions, I recommend:\nΓÇó Contacting our billing department at (555) 123-4567\nΓÇó Checking your insurance coverage online\nΓÇó Setting up a payment plan if needed\n\nI can also help you find information about accepted insurance providers."
  }
  
  return "I'm here to help with your healthcare needs! I can assist with:\n\nΓÇó ≡ƒÆè Medications and prescriptions\nΓÇó ≡ƒôà Appointments and scheduling\nΓÇó ≡ƒÅÑ Test results and medical records\nΓÇó Γ¥ñ∩╕Å General health and wellness questions\nΓÇó ≡ƒôï Post-treatment care instructions\n\nWhat would you like to know?"
}

// ============ SYMPTOM CHECKER AI ANALYSIS ============

/**
 * Analyze symptoms using the medAI Python FastAPI service.
 * Falls back to rule-based analysis when the service is unreachable.
 *
 * Python API: POST http://localhost:8000/api/analyze_symptoms
 * Input:  { symptoms: [{ symptom, severity, duration }] }
 * Output: { possible_conditions: [{disease, probability, reason}],
 *           recommended_action, suggested_medication_type }
 */
export async function analyzeSymptoms(
  symptoms: SymptomInput[]
): Promise<SymptomAnalysisResponse> {
  if (symptoms.length === 0) {
    return {
      results: [],
      disclaimer: 'No symptoms provided for analysis.',
      error: 'Please select at least one symptom.'
    }
  }

  const durationMap: Record<string, string> = {
    'less24h': 'Less than 24 hours',
    '1to3days': '1-3 days',
    '3to7days': '3-7 days',
    'moreThanWeek': 'More than a week'
  }

  const severityMap: Record<string, string> = {
    'mild': 'Mild',
    'moderate': 'Moderate',
    'severe': 'Severe'
  }

  // Map to Python API input format
  const payload = {
    symptoms: symptoms.map(s => ({
      symptom: s.name,
      severity: severityMap[s.severity] ?? s.severity,
      duration: durationMap[s.duration] ?? s.duration,
    }))
  }

  try {
    console.log('🩺 Sending symptoms to medAI:', MEDAI_SYMPTOM_ENDPOINT)

    const response = await fetch(MEDAI_SYMPTOM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('medAI API Error:', errorText)
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json() as {
      possible_conditions?: { disease: string; probability: string; reason: string }[]
      recommended_action?: string
      suggested_medication_type?: string[]
    }

    const conditions = data.possible_conditions ?? []
    const recommendedAction = data.recommended_action ?? 'Please consult a healthcare professional.'
    const medications = data.suggested_medication_type ?? []

    const results: SymptomAnalysisResult[] = conditions.map(c => {
      const prob = (c.probability ?? '').toLowerCase()
      const severity: 'low' | 'medium' | 'high' =
        prob === 'high' ? 'high' : prob === 'medium' ? 'medium' : 'low'

      return {
        condition: c.disease,
        severity,
        recommendation: recommendedAction,
        details: c.reason,
        possibleCauses: medications.length > 0 ? medications : undefined,
        whenToSeekHelp: 'Consult a doctor if your symptoms worsen or do not improve within 48 hours.'
      }
    })

    return {
      results,
      disclaimer: 'This is not a medical diagnosis. Always consult a qualified healthcare professional for proper evaluation and treatment.'
    }

  } catch (error) {
    console.error('Symptom Analysis Error:', error)
    // Fallback to rule-based analysis
    return getFallbackSymptomAnalysis(symptoms)
  }
}



/**
 * Fallback symptom analysis when AI service is unavailable
 */
function getFallbackSymptomAnalysis(symptoms: SymptomInput[]): SymptomAnalysisResponse {
  const results: SymptomAnalysisResult[] = []
  
  const hasSevere = symptoms.some(s => s.severity === 'severe')
  const hasChestPain = symptoms.some(s => s.name.toLowerCase().includes('chest pain'))
  const hasSOB = symptoms.some(s => s.name.toLowerCase().includes('shortness of breath'))
  const hasFever = symptoms.some(s => s.name.toLowerCase().includes('fever'))
  const hasCough = symptoms.some(s => s.name.toLowerCase().includes('cough'))
  const hasHeadache = symptoms.some(s => s.name.toLowerCase().includes('headache'))
  const hasNausea = symptoms.some(s => s.name.toLowerCase().includes('nausea') || s.name.toLowerCase().includes('vomiting'))
  const hasDizziness = symptoms.some(s => s.name.toLowerCase().includes('dizziness'))
  const longDuration = symptoms.some(s => s.duration === '3to7days' || s.duration === 'moreThanWeek')

  // Emergency symptoms check
  if ((hasChestPain && hasSevere) || (hasSOB && hasSevere)) {
    results.push({
      condition: 'Emergency Symptoms Detected',
      severity: 'high',
      recommendation: 'Seek emergency medical care immediately',
      details: 'Severe chest pain or shortness of breath can indicate serious conditions such as heart attack, pulmonary embolism, or severe respiratory distress that require immediate medical evaluation.',
      possibleCauses: ['Cardiac issues', 'Pulmonary conditions', 'Anxiety/panic attack'],
      whenToSeekHelp: 'Call emergency services (911) or go to the nearest emergency room immediately.'
    })
    return {
      results,
      disclaimer: 'This is not a medical diagnosis. Given the severity of your symptoms, please seek immediate medical attention.'
    }
  }

  // Flu-like symptoms
  if (hasFever && hasCough) {
    results.push({
      condition: 'Possible Respiratory Infection',
      severity: hasSevere || longDuration ? 'medium' : 'low',
      recommendation: hasSevere ? 'See a doctor within 24 hours' : 'Rest and monitor symptoms',
      details: 'Your combination of fever and cough may indicate a respiratory infection such as the flu, common cold, or COVID-19. Monitor your temperature and stay hydrated.',
      possibleCauses: ['Influenza (Flu)', 'Common cold', 'COVID-19', 'Bronchitis'],
      whenToSeekHelp: 'Seek medical care if fever exceeds 103┬░F (39.4┬░C), symptoms worsen, or you have difficulty breathing.'
    })
  }

  // Headache with other symptoms
  if (hasHeadache && hasSevere) {
    results.push({
      condition: 'Severe Headache Assessment Needed',
      severity: 'medium',
      recommendation: 'Consult a healthcare provider soon',
      details: 'Severe headaches, especially with sudden onset or accompanied by other symptoms, should be evaluated by a medical professional to rule out serious conditions.',
      possibleCauses: ['Migraine', 'Tension headache', 'Dehydration', 'Hypertension'],
      whenToSeekHelp: 'Seek immediate care if headache is sudden and severe ("worst headache of your life"), accompanied by confusion, vision changes, or stiff neck.'
    })
  }

  // Gastrointestinal symptoms
  if (hasNausea) {
    results.push({
      condition: 'Gastrointestinal Symptoms',
      severity: hasSevere ? 'medium' : 'low',
      recommendation: hasSevere ? 'See a doctor if symptoms persist' : 'Stay hydrated and rest',
      details: 'Nausea and vomiting can have many causes including viral infections, food poisoning, or medication side effects. Focus on staying hydrated with small sips of water or electrolyte drinks.',
      possibleCauses: ['Viral gastroenteritis', 'Food poisoning', 'Medication side effects', 'Motion sickness'],
      whenToSeekHelp: 'Seek care if unable to keep fluids down for 24 hours, see blood in vomit, or have severe abdominal pain.'
    })
  }

  // Dizziness
  if (hasDizziness && hasSevere) {
    results.push({
      condition: 'Dizziness Evaluation Recommended',
      severity: 'medium',
      recommendation: 'Schedule a medical appointment',
      details: 'Severe dizziness can affect balance and safety. It may be related to inner ear problems, blood pressure changes, or other conditions that should be evaluated.',
      possibleCauses: ['Vertigo', 'Low blood pressure', 'Dehydration', 'Inner ear infection'],
      whenToSeekHelp: 'Seek immediate care if dizziness is accompanied by chest pain, severe headache, numbness, or difficulty speaking.'
    })
  }

  // Default result if no specific patterns matched
  if (results.length === 0) {
    const overallSeverity = hasSevere ? 'medium' : (longDuration ? 'medium' : 'low')
    results.push({
      condition: hasSevere ? 'Symptoms Require Attention' : 'General Symptoms Assessment',
      severity: overallSeverity,
      recommendation: hasSevere 
        ? 'Consider scheduling an appointment with your doctor' 
        : 'Monitor symptoms at home and rest',
      details: `Based on the ${symptoms.length} symptom(s) you reported, ${hasSevere ? 'given the severity level, a medical evaluation is recommended' : 'these appear to be manageable with home care'}. Continue to track your symptoms and note any changes.`,
      possibleCauses: ['Various conditions possible', 'Further evaluation may be needed'],
      whenToSeekHelp: 'Seek medical care if symptoms worsen, new symptoms develop, or you feel significantly unwell.'
    })
  }

  return {
    results,
    disclaimer: 'This is an automated assessment and NOT a medical diagnosis. Always consult with a qualified healthcare professional for proper evaluation and treatment.'
  }
}
