import { Router, Request, Response } from 'express';

const router = Router();

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
}

/**
 * GET /api/ai/chat
 * Simple test endpoint to verify server is working
 */
router.get('/chat', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'AI Chat API is running!',
    usage: 'Send POST request with {"messages": [{"role": "user", "content": "your message"}]}',
    endpoints: {
      test: 'GET /api/ai/chat',
      chat: 'POST /api/ai/chat'
    }
  });
});

/**
 * POST /api/ai/chat
 * Handle AI chat requests
 * 
 * This is a basic example. In production, you should:
 * 1. Integrate with real AI service (OpenAI, Gemini, Azure OpenAI, etc.)
 * 2. Add authentication and rate limiting
 * 3. Store conversation history in database
 * 4. Add context about patient's medical records
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { messages } = req.body as ChatRequest;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Invalid request. Messages array is required.'
      });
    }

    // Get the last user message
    const lastUserMessage = messages
      .filter(m => m.role === 'user')
      .pop()?.content || '';

    // TODO: Replace this with actual AI service call
    // Example: OpenAI, Google Gemini, Azure OpenAI, etc.
    
    // For now, use rule-based responses as fallback
    const response = generateResponse(lastUserMessage);

    res.json({
      message: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process chat request'
    });
  }
});

/**
 * Generate a response based on the user's message
 * This is a simple rule-based system. Replace with actual AI integration.
 */
function generateResponse(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase();

  // Medication queries
  if (lowerMessage.includes('medication') || lowerMessage.includes('medicine') || lowerMessage.includes('drug') || lowerMessage.includes('pill')) {
    return `I can help you with your medications! Here's what I can assist with:

💊 **Current Medications**: View your active prescriptions
⏰ **Reminders**: Set up medication reminders
⚠️ **Side Effects**: Learn about potential side effects
🔄 **Interactions**: Check for drug interactions
📋 **Refills**: Request prescription refills

What would you like to know about your medications?`;
  }

  // Appointment queries
  if (lowerMessage.includes('appointment') || lowerMessage.includes('schedule') || lowerMessage.includes('booking') || lowerMessage.includes('visit')) {
    return `I can help you manage your appointments! Here are your options:

📅 **View Appointments**: See your upcoming visits
➕ **Book New**: Schedule a new appointment
✏️ **Reschedule**: Change an existing appointment
❌ **Cancel**: Cancel an appointment
🗺️ **Directions**: Get directions to the clinic

Would you like to see your upcoming appointments or book a new one?`;
  }

  // Symptoms/health concerns
  if (lowerMessage.includes('symptom') || lowerMessage.includes('pain') || lowerMessage.includes('sick') || lowerMessage.includes('hurt') || lowerMessage.includes('feel')) {
    return `I understand you're not feeling well. While I can provide general information, it's important to consult with a healthcare professional for proper diagnosis and treatment.

🏥 **Immediate Options**:
• Book an urgent care appointment
• Speak with a nurse (available 24/7)
• Visit the emergency room (if severe)

📞 **Emergency**: Call 911 if experiencing:
• Chest pain or difficulty breathing
• Severe bleeding or trauma
• Loss of consciousness
• Severe allergic reaction

Would you like me to help you schedule an appointment?`;
  }

  // Test results
  if (lowerMessage.includes('test') || lowerMessage.includes('result') || lowerMessage.includes('lab') || lowerMessage.includes('blood work')) {
    return `I can help you with your test results and lab work.

🔬 **Lab Results**: Most results are available within 2-3 business days
📊 **View Results**: Check your patient portal for available results
📞 **Discuss Results**: Schedule a follow-up to discuss findings with your doctor
⏱️ **Pending Tests**: View tests that are still being processed

Lab results are typically reviewed by your doctor before being released to the portal. Would you like to check if your results are ready?`;
  }

  // Billing/insurance
  if (lowerMessage.includes('bill') || lowerMessage.includes('payment') || lowerMessage.includes('insurance') || lowerMessage.includes('cost')) {
    return `I can help you with billing and insurance questions!

💳 **Billing Department**: (555) 123-4567
📧 **Email**: billing@techcare.com
⏰ **Hours**: Mon-Fri, 8AM-5PM

💰 **Payment Options**:
• Pay online through patient portal
• Set up a payment plan
• Financial assistance programs available

📋 **Insurance**:
• We accept most major insurance providers
• Verify your coverage online
• Submit claims directly

Would you like information about a specific bill or insurance question?`;
  }

  // Records access
  if (lowerMessage.includes('record') || lowerMessage.includes('history') || lowerMessage.includes('document') || lowerMessage.includes('report')) {
    return `I can help you access your medical records!

📁 **Available Records**:
• Visit summaries and doctor's notes
• Lab and test results
• Imaging reports (X-rays, MRI, CT scans)
• Vaccination history
• Prescription history

📥 **Download**: Export your records as PDF
📤 **Share**: Send records to other healthcare providers
🔒 **Privacy**: Your records are secure and HIPAA-compliant

What type of records would you like to access?`;
  }

  // Doctor information
  if (lowerMessage.includes('doctor') || lowerMessage.includes('physician') || lowerMessage.includes('specialist')) {
    return `I can help you find information about our healthcare providers!

👨‍⚕️ **Find a Doctor**:
• Search by specialty
• View doctor profiles and credentials
• Read patient reviews
• Check availability

🏥 **Our Specialties**:
• Cardiology • Orthopedics
• Dermatology • Ophthalmology  
• Pediatrics • Internal Medicine

Would you like to search for a specific type of doctor or view your current care team?`;
  }

  // General greeting/help
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey') || lowerMessage.includes('help')) {
    return `Hello! I'm your TechCare AI assistant. I'm here to help you 24/7 with:

💊 **Medications**: Prescriptions, refills, and reminders
📅 **Appointments**: Scheduling and managing visits
🏥 **Health Questions**: General wellness information
🔬 **Test Results**: Lab work and imaging results
📋 **Medical Records**: Access your health information
💳 **Billing**: Payment and insurance questions

What can I help you with today?`;
  }

  // Default response
  return `I'm here to help with your healthcare needs! I can assist you with:

💊 Medications and prescriptions
📅 Appointments and scheduling
🏥 Health questions and concerns
🔬 Test results and lab work
📋 Medical records access
💳 Billing and insurance

What would you like to know more about?`;
}

/**
 * Example: Integrate with OpenAI
 * Uncomment and configure to use OpenAI
 */
/*
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function getOpenAIResponse(messages: ChatMessage[]): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "You are a helpful medical assistant for TechCare hospital..."
      },
      ...messages
    ],
    temperature: 0.7,
    max_tokens: 500
  });

  return completion.choices[0].message.content || "No response generated";
}
*/

export default router;
