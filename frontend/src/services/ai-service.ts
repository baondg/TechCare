// AI Service for chatbot integration
// Supports ANY AI provider: OpenAI, Gemini, Anthropic, Cohere, Hugging Face, Azure, AWS, or custom backends

const AI_API_ENDPOINT = import.meta.env.VITE_AI_API_ENDPOINT || 'http://localhost:3000/api/ai/chat'
const AI_API_KEY = import.meta.env.VITE_AI_API_KEY || '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'
const AI_PROVIDER = import.meta.env.VITE_AI_PROVIDER || 'custom' // openai, gemini, anthropic, cohere, huggingface, custom

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatResponse {
  message: string
  error?: string
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
  try {
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

    // Build request body based on provider
    const requestBody = buildRequestBody(AI_PROVIDER, messages, userMessage, systemPrompt)
    
    // Build headers based on provider
    const headers = buildHeaders(AI_PROVIDER, AI_API_KEY)

    const response = await fetch(AI_API_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('API Error Response:', errorText)
      throw new Error(`API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    
    // Extract message from response based on provider format
    const message = extractMessage(AI_PROVIDER, data)
    
    return { message }
  } catch (error) {
    console.error('AI Service Error:', error)
    
    // Fallback to rule-based responses if API fails
    return {
      message: getFallbackResponse(userMessage),
      error: error instanceof Error ? error.message : 'Unknown error'
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
        model: 'gpt-4',
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
      // Custom format - standard OpenAI-like format
      return {
        messages: fullMessages
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
      // Custom - use Bearer token by default
      headers['Authorization'] = `Bearer ${apiKey}`
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
        // Try common response field names
        return data.message || data.response || data.content || data.text || data.output || 'No response from AI'
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
