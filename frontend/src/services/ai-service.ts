const CUSTOM_AI_API_KEY = import.meta.env.VITE_CUSTOM_AI_API_KEY || '';
const CUSTOM_AI_API_ENDPOINT = import.meta.env.VITE_CUSTOM_AI_API_ENDPOINT || '';
const AI_API_ENDPOINT = import.meta.env.VITE_AI_API_ENDPOINT || 'http://localhost:3000/api/ai/chat'
const AI_API_KEY = import.meta.env.VITE_AI_API_KEY || 'AIzaSyDeBPklvZOIylsnXgtzqOXeYkkRNUW3z0Y'
const AI_PROVIDER = import.meta.env.VITE_AI_PROVIDER || 'gemini' // openai, gemini, anthropic, cohere, huggingface, custom

// Cache for available models to avoid repeated API calls
let cachedModels: any[] | null = null
let selectedModel: string | null = null

// Re-export types from ai-types.ts
export type {
  ChatMessage,
  ChatResponse,
  SymptomInput,
  SymptomAnalysisResult,
  SymptomAnalysisResponse
} from './ai-types'

import type { ChatMessage, SymptomInput, SymptomAnalysisResult, SymptomAnalysisResponse } from './ai-types'

// ============ SYMPTOM CHECKER TYPES ============

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

/**
 * Fetch available models from Gemini API
 */
async function getAvailableGeminiModels(): Promise<any[]> {
  if (cachedModels) {
    return cachedModels
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${AI_API_KEY}`,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      console.error('Failed to fetch Gemini models:', response.statusText)
      return []
    }

    const data = await response.json()
    cachedModels = data.models || []
    console.log('📋 Available Gemini models:', cachedModels.map((m: any) => m.name))
    return cachedModels
  } catch (error) {
    console.error('Error fetching Gemini models:', error)
    return []
  }
}

/**
 * Select a valid Gemini model that supports generateContent
 */
async function pickGeminiModel(): Promise<string> {
  if (selectedModel) {
    return selectedModel
  }

  const models = await getAvailableGeminiModels()
  
  // Priority list of models
  const priorityModels = [
    'gemini-2.5-pro', // High priority as requested
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-pro'
  ]

  // Try to find a model from the priority list
  for (const modelName of priorityModels) {
    const found = models.find((m: any) => 
      (m.name === `models/${modelName}` || m.name === modelName) &&
      m.supportedGenerationMethods?.includes('generateContent')
    )
    if (found) {
      selectedModel = found.name
      console.log('✅ Selected Gemini model (priority):', selectedModel)
      return selectedModel
    }
  }
  
  // Find a model that supports generateContent
  const validModel = models.find((m: any) => 
    m.supportedGenerationMethods?.includes('generateContent')
  )

  if (validModel) {
    selectedModel = validModel.name
    console.log('✅ Selected Gemini model:', selectedModel)
    return selectedModel
  }

  // Fallback to gemini-1.5-flash if available
  const fallback = models.find((m: any) => 
    m.name.includes('gemini-1.5-flash') || m.name.includes('gemini-pro')
  )

  if (fallback) {
    selectedModel = fallback.name
    console.log('⚠️ Using fallback model:', selectedModel)
    return selectedModel
  }

  // Last resort: use first available model
  if (models.length > 0) {
    selectedModel = models[0].name
    console.log('⚠️ Using first available model:', selectedModel)
    return selectedModel
  }

  throw new Error('No Gemini models available')
}

/**
 * Send a message to the AI service and get a response
 * Works with ANY AI provider by adapting request/response format
 * @param messages - Conversation history
 * @param userMessage - Current user message
 * @returns AI response
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  userMessage: string
): Promise<ChatResponse> {
  const systemPrompt = `You are a helpful medical assistant for TechCare hospital. 
You can help patients with:
- Medication information and reminders
- Appointment scheduling and information
- General health questions and wellness tips
- Post-treatment care instructions

Important guidelines:
- Always be empathetic and professional
- For serious medical concerns, recommend consulting a doctor
- Provide accurate information based on the patient's medical records
- Keep responses concise but informative
- Use simple, easy-to-understand language`

  // Try Gemini first if selected
  if (AI_PROVIDER && AI_PROVIDER.toLowerCase() === 'custom') {
    try {
      console.log('🔗 Calling custom AI API:', CUSTOM_AI_API_ENDPOINT);
      const endpoint = CUSTOM_AI_API_ENDPOINT;
      const apiKey = CUSTOM_AI_API_KEY;
      const requestBody = buildRequestBody('custom', messages, userMessage, systemPrompt);
      const headers = buildHeaders('custom', apiKey);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Custom API error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      console.log('Custom AI API raw response:', data);
      const message = extractMessage('custom', data);
      return { message };
    } catch (error) {
      console.error('Custom API failed:', error);
      return {
        message: getFallbackResponse(userMessage),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  if (AI_PROVIDER.toLowerCase() === 'gemini') {
    // Lấy danh sách model ưu tiên
    const modelsToTry = [
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-pro'
    ];
    let lastGeminiError = null;
    for (const modelName of modelsToTry) {
      try {
        const modelId = modelName;
        const endpoint = `https://generativelanguage.googleapis.com/v1/models/${modelId}:generateContent?key=${AI_API_KEY}`;
        console.log('🔗 Trying Gemini model:', modelId);
        const requestBody = buildRequestBody('gemini', messages, userMessage, systemPrompt);
        const headers = buildHeaders('gemini', AI_API_KEY);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
          const errorText = await response.text();
          lastGeminiError = errorText;
          // Nếu lỗi quota hoặc model không khả dụng, thử model tiếp theo
          if (response.status === 429 || response.status === 404 || errorText.includes('quota') || errorText.includes('RESOURCE_EXHAUSTED')) {
            console.warn(`Gemini model ${modelId} failed:`, errorText);
            continue;
          } else {
            throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
          }
        }
        const data = await response.json();
        const message = extractMessage('gemini', data);
        return { message };
      } catch (error) {
        lastGeminiError = error;
        console.warn(`Gemini model ${modelName} error:`, error);
        continue;
      }
    }
    // Nếu tất cả model Gemini đều lỗi, thử OpenAI, nếu OpenAI cũng lỗi thì gọi custom API
    console.error('All Gemini models failed, trying OpenAI:', lastGeminiError);
    try {
      const openaiEndpoint = 'https://api.openai.com/v1/chat/completions';
      const openaiKey = import.meta.env.VITE_OPENAI_API_KEY || '';
      const requestBody = buildRequestBody('openai', messages, userMessage, systemPrompt);
      const headers = buildHeaders('openai', openaiKey);
      const response = await fetch(openaiEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      const message = extractMessage('openai', data);
      return { message };
    } catch (openaiError) {
      console.error('OpenAI fallback also failed, trying custom API:', openaiError);
      try {
        console.log('🔗 Calling custom AI API:', CUSTOM_AI_API_ENDPOINT);
        const endpoint = CUSTOM_AI_API_ENDPOINT;
        const apiKey = CUSTOM_AI_API_KEY;
        const requestBody = buildRequestBody('custom', messages, userMessage, systemPrompt);
        const headers = buildHeaders('custom', apiKey);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Custom API error: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        const message = extractMessage('custom', data);
        return { message };
      } catch (customError) {
        console.error('Custom API also failed:', customError);
        return {
          message: getFallbackResponse(userMessage),
          error: customError instanceof Error ? customError.message : 'Unknown error'
        };
      }
    }
  } else {
    // Use selected provider (OpenAI, etc.)
    try {
      let endpoint = AI_API_ENDPOINT;
      let apiKey = AI_API_KEY;
      if (AI_PROVIDER.toLowerCase() === 'openai') {
        endpoint = 'https://api.openai.com/v1/chat/completions';
        apiKey = import.meta.env.VITE_OPENAI_API_KEY || '';
      }
      const requestBody = buildRequestBody(AI_PROVIDER, messages, userMessage, systemPrompt);
      const headers = buildHeaders(AI_PROVIDER, apiKey);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      const message = extractMessage(AI_PROVIDER, data);
      return { message };
    } catch (error) {
      console.error('AI Service Error:', error);
      return {
        message: getFallbackResponse(userMessage),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Fallback responses when AI service is unavailable
 */
function getFallbackResponse(query: string): string {
  const lowerQuery = query.toLowerCase()
  
  if (lowerQuery.includes('medication') || lowerQuery.includes('medicine') || lowerQuery.includes('drug')) {
    return "I can help you with medication information. You can ask about:\n• Current medications and dosages\n• Medication schedules and reminders\n• Potential side effects\n• Drug interactions\n\nWhat would you like to know?"
  }
  
  if (lowerQuery.includes('appointment') || lowerQuery.includes('schedule') || lowerQuery.includes('visit')) {
    return "I can assist with appointments. You can:\n• View upcoming appointments\n• Schedule new appointments\n• Reschedule or cancel appointments\n• Get directions to the clinic\n\nWhat would you like to do?"
  }
  
  if (lowerQuery.includes('symptom') || lowerQuery.includes('pain') || lowerQuery.includes('sick') || lowerQuery.includes('feel')) {
    return "I understand you're not feeling well. While I can provide general information, it's important to consult with a healthcare professional for proper diagnosis and treatment.\n\nWould you like to:\n• Schedule an urgent appointment\n• Speak with a nurse\n• Get general wellness tips"
  }
  
  if (lowerQuery.includes('test') || lowerQuery.includes('result') || lowerQuery.includes('lab')) {
    return "I can help you access your test results and medical records. Lab results are typically available 2-3 days after testing. Would you like me to:\n• Check if your results are ready\n• Explain what tests you've had\n• Schedule a follow-up appointment"
  }
  
  if (lowerQuery.includes('insurance') || lowerQuery.includes('payment') || lowerQuery.includes('bill')) {
    return "For billing and insurance questions, I recommend:\n• Contacting our billing department at (555) 123-4567\n• Checking your insurance coverage online\n• Setting up a payment plan if needed\n\nI can also help you find information about accepted insurance providers."
  }
  
  return "I'm here to help with your healthcare needs! I can assist with:\n\n• 💊 Medications and prescriptions\n• 📅 Appointments and scheduling\n• 🏥 Test results and medical records\n• ❤️ General health and wellness questions\n• 📋 Post-treatment care instructions\n\nWhat would you like to know?"
}

/**
 * Build request body based on AI provider format
 * Supports: OpenAI, Anthropic (Claude), Cohere, Hugging Face, Google Gemini, and custom
 */
function buildRequestBody(
  provider: string,
  messages: ChatMessage[],
  userMessage: string,
  systemPrompt: string
): unknown {
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
    { role: 'user', content: userMessage }
  ]

  switch (provider.toLowerCase()) {
    case 'openai':
    case 'azure-openai':
      return {
        model: 'gpt-3.5-turbo',
        messages: fullMessages,
        temperature: 0.7,
        max_tokens: 500
      }

    case 'anthropic':
    case 'claude':
      return {
        model: 'claude-3-sonnet-20240229',
        messages: fullMessages.filter(m => m.role !== 'system'),
        system: systemPrompt,
        max_tokens: 500
      }

    case 'cohere':
      return {
        message: userMessage,
        chat_history: messages.map(m => ({
          role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
          message: m.content
        })),
        preamble: systemPrompt
      }

    case 'huggingface':
      return {
        inputs: `${systemPrompt}\n\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}\nuser: ${userMessage}\nassistant:`,
        parameters: {
          max_new_tokens: 500,
          temperature: 0.7
        }
      }

    case 'gemini':
      return {
        contents: [{
          parts: [{
            text: `${systemPrompt}\n\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}\nuser: ${userMessage}`
          }]
        }]
      }

    default:
      // Custom API expects { message: userMessage }
      return {
        message: userMessage
      }
  }
}

/**
 * Build headers based on AI provider authentication method
 */
function buildHeaders(provider: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (!apiKey) return headers

  switch (provider.toLowerCase()) {
    case 'openai':
    case 'azure-openai':
      headers['Authorization'] = `Bearer ${apiKey}`
      // Add OpenRouter specific headers if using OpenRouter
      if (AI_API_ENDPOINT.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = 'https://techcare-app.com'
        headers['X-Title'] = 'TechCare Medical Assistant'
      }
      break

    case 'anthropic':
    case 'claude':
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
      break

    case 'cohere':
      headers['Authorization'] = `Bearer ${apiKey}`
      break

    case 'huggingface':
      headers['Authorization'] = `Bearer ${apiKey}`
      break

    case 'gemini':
      // Gemini uses API key in URL, not header
      break

    default:
      // Custom - use x-api-key header for custom AI/ML API
      headers['x-api-key'] = apiKey
      break
  }

  return headers
}

/**
 * Extract message from response based on provider format
 */
function extractMessage(provider: string, data: unknown): string {
  try {
    switch (provider.toLowerCase()) {
      case 'openai':
      case 'azure-openai':
        return data.choices?.[0]?.message?.content || data.message || 'No response'

      case 'anthropic':
      case 'claude':
        return data.content?.[0]?.text || data.message || 'No response'

      case 'cohere':
        return data.text || data.message || 'No response'

      case 'huggingface':
        return data[0]?.generated_text || data.generated_text || data.message || 'No response'

      case 'gemini':
        return data.candidates?.[0]?.content?.parts?.[0]?.text || data.message || 'No response'

      default:
        // Try common response field names, including custom API { reply }
        return data.reply || data.message || data.response || data.content || data.text || data.output || 'No response from AI'
    }
  } catch (error) {
    console.error('Error extracting message:', error)
    return 'Error parsing AI response'
  }
}

/**
 * Example: Integrate with OpenAI
 * Uncomment and configure if using OpenAI
 */
/*
export async function sendChatMessageOpenAI(
  messages: ChatMessage[],
  userMessage: string
): Promise<ChatResponse> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful medical assistant...'
          },
          ...messages,
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    })

    const data = await response.json()
    return {
      message: data.choices[0].message.content
    }
  } catch (error) {
    console.error('OpenAI Error:', error)
    return {
      message: getFallbackResponse(userMessage),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
*/

/**
 * Example: Integrate with Google Gemini
 * Uncomment and configure if using Gemini
 */
/*
export async function sendChatMessageGemini(
  messages: ChatMessage[],
  userMessage: string
): Promise<ChatResponse> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${AI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${messages.map(m => `${m.role}: ${m.content}`).join('\n')}\nuser: ${userMessage}`
            }]
          }]
        })
      }
    )

    const data = await response.json()
    return {
      message: data.candidates[0].content.parts[0].text
    }
  } catch (error) {
    console.error('Gemini Error:', error)
    return {
      message: getFallbackResponse(userMessage),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
*/

// ============ SYMPTOM CHECKER AI ANALYSIS ============

/**
 * Analyze symptoms using AI and return possible conditions
 * @param symptoms - Array of symptoms with severity and duration
 * @returns Analysis results with recommendations
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
    'less24h': 'less than 24 hours',
    '1to3days': '1 to 3 days',
    '3to7days': '3 to 7 days',
    'moreThanWeek': 'more than a week'
  }

  // Format symptoms for AI prompt
  const symptomDescription = symptoms
    .map(s => `- ${s.name}: severity is ${s.severity}, duration is ${durationMap[s.duration]}`)
    .join('\n')

  const systemPrompt = `You are a medical symptom analysis assistant for TechCare hospital. 
Your role is to analyze patient symptoms and provide preliminary assessments.

IMPORTANT GUIDELINES:
1. Always emphasize that this is NOT a medical diagnosis
2. Recommend professional consultation for serious symptoms
3. Be empathetic and clear in your explanations
4. Consider symptom combinations and their interactions
5. Prioritize patient safety - err on the side of caution

You MUST respond in valid JSON format with this exact structure:
{
  "results": [
    {
      "condition": "Possible condition name",
      "severity": "low" | "medium" | "high",
      "recommendation": "What the patient should do",
      "details": "Detailed explanation",
      "possibleCauses": ["cause1", "cause2"],
      "whenToSeekHelp": "When to see a doctor immediately"
    }
  ],
  "disclaimer": "Medical disclaimer message"
}

Severity levels:
- "high": Requires immediate medical attention (ER visit)
- "medium": Should see a doctor within 24-48 hours
- "low": Can monitor at home, seek care if worsening`

  const userMessage = `Please analyze these symptoms and provide your assessment:

${symptomDescription}

Patient has ${symptoms.length} symptom(s) total.
Provide 1-3 possible conditions based on these symptoms, prioritized by likelihood.
Respond ONLY with valid JSON, no additional text.`

  try {
    // For Gemini, dynamically select a valid model
    let endpoint = AI_API_ENDPOINT
    if (AI_PROVIDER.toLowerCase() === 'gemini') {
      const modelName = await pickGeminiModel()
      const modelId = modelName.replace('models/', '')
      endpoint = `https://generativelanguage.googleapis.com/v1/models/${modelId}:generateContent?key=${AI_API_KEY}`
    }

    const requestBody = buildSymptomAnalysisRequestBody(AI_PROVIDER, systemPrompt, userMessage)
    const headers = buildHeaders(AI_PROVIDER, AI_API_KEY)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Symptom Analysis API Error:', errorText)
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const messageContent = extractMessage(AI_PROVIDER, data)

    // Parse JSON from AI response
    const jsonMatch = messageContent.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        results: parsed.results || [],
        disclaimer: parsed.disclaimer || 'This is not a medical diagnosis. Please consult a healthcare professional.',
      }
    }

    throw new Error('Could not parse AI response')

  } catch (error) {
    console.error('Symptom Analysis Error:', error)
    
    // Fallback to rule-based analysis
    return getFallbackSymptomAnalysis(symptoms)
  }
}

/**
 * Build request body for symptom analysis based on provider
 */
function buildSymptomAnalysisRequestBody(
  provider: string,
  systemPrompt: string,
  userMessage: string
): unknown {
  switch (provider.toLowerCase()) {
    case 'openai':
    case 'azure-openai':
      return {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3, // Lower temperature for more consistent medical advice
        max_tokens: 1000
      }

    case 'anthropic':
    case 'claude':
      return {
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: userMessage }],
        system: systemPrompt,
        max_tokens: 1000
      }

    case 'gemini':
      return {
        contents: [{
          parts: [{
            text: `${systemPrompt}\n\n${userMessage}`
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1000
        }
      }

    default:
      return {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      }
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
      whenToSeekHelp: 'Seek medical care if fever exceeds 103°F (39.4°C), symptoms worsen, or you have difficulty breathing.'
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
