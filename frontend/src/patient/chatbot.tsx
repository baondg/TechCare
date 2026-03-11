"use client"

/**
 * =============================================================================
 * AI CHATBOT PAGE - TechCare Medical Assistant
 * =============================================================================
 * 
 * This component provides a conversational AI interface for patients to interact
 * with TechCare's medical assistant. It uses Google Gemini API for natural
 * language processing and response generation.
 * 
 * FEATURES:
 * - Real-time chat interface with message history
 * - Typing indicators while AI is generating responses
 * - Auto-scroll to latest messages
 * - Quick question buttons for common queries
 * - Feedback buttons (thumbs up/down) for AI responses
 * - Error handling with graceful fallback messages
 * 
 * ARCHITECTURE:
 * 1. User types message → handleSend() is triggered
 * 2. Message added to UI → Loading indicator shown
 * 3. Conversation history sent to AI service (ai-service.ts)
 * 4. AI service calls Gemini API with medical assistant context
 * 5. Response received → Loading replaced with AI message
 * 
 * AI CAPABILITIES:
 * - Medication information and reminders
 * - Appointment scheduling assistance
 * - General health questions and wellness tips
 * - Post-treatment care instructions
 * 
 * @author TechCare Development Team
 * @version 1.0.0
 */

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PatientLayout } from "@/components/patient-layout"
import { Bot, Send, ThumbsUp, ThumbsDown } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { sendChatMessage, type ChatMessage as AIMessage } from "@/services/ai-service"

/**
 * Message type definition for chat messages
 * @property id - Unique identifier for React key prop
 * @property role - Who sent the message: "user" or "assistant"
 * @property content - The actual message text
 * @property timestamp - When the message was sent
 * @property isLoading - Optional flag to show typing indicator
 */
type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  isLoading?: boolean
}

/**
 * ChatbotPage Component
 * 
 * Main chat interface for patient-AI interaction. Manages conversation state,
 * handles message sending, and renders the chat UI with real-time updates.
 * 
 * STATE MANAGEMENT:
 * - messages: Array of all chat messages (user + assistant)
 * - input: Current text in the input field
 * - isLoading: Whether AI is currently generating a response
 * - scrollAreaRef: Reference to scroll container for auto-scroll
 * 
 * @returns JSX.Element - The complete chatbot page wrapped in PatientLayout
 */
export default function ChatbotPage() {
  // ==================== STATE MANAGEMENT ====================
  
  // Chat message history - initialized with welcome message from AI
  const [messages, setMessages] = useState<Message[]>([
    {
      id: `msg-${Date.now()}-1`,
      role: "assistant",
      content:
        "Hello! I'm your TechCare AI assistant. I can help you with questions about your medications, appointments, and post-treatment care. How can I assist you today?",
      timestamp: new Date(),
    },
  ])
  
  // Current user input text
  const [input, setInput] = useState("")
  
  // Loading state - prevents multiple simultaneous requests
  const [isLoading, setIsLoading] = useState(false)
  
  // Reference to scroll container for programmatic scrolling
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // ==================== SIDE EFFECTS ====================
  
  /**
   * Auto-scroll Effect
   * Automatically scrolls the chat container to the bottom whenever
   * new messages are added, ensuring the latest message is always visible.
   */
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages])

  // ==================== EVENT HANDLERS ====================
  
  /**
   * handleSend - Processes user message and gets AI response
   * 
   * FLOW:
   * 1. Validate input (not empty, not already loading)
   * 2. Add user message to chat immediately (optimistic UI)
   * 3. Clear input field and show loading indicator
   * 4. Build conversation history for context
   * 5. Call AI service with history + new message
   * 6. Replace loading with actual AI response
   * 7. Handle errors gracefully with user-friendly message
   * 
   * @async
   */
  const handleSend = async () => {
    // Guard: Prevent empty messages or concurrent requests
    if (!input.trim() || isLoading) return

    const userMessageId = `msg-${Date.now()}-user`
    const userMessage: Message = {
      id: userMessageId,
      role: "user",
      content: input,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    const currentInput = input
    setInput("")
    setIsLoading(true)

    // Add loading message with unique ID
    const loadingMessageId = `msg-${Date.now()}-loading`
    const loadingMessage: Message = {
      id: loadingMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isLoading: true,
    }
    setMessages(prev => [...prev, loadingMessage])

    try {
      // Prepare conversation history for AI
      const conversationHistory: AIMessage[] = messages
        .filter(msg => !msg.isLoading)
        .map(msg => ({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content
        }))

      // Call AI service
      const response = await sendChatMessage(conversationHistory, currentInput)

      // Remove loading message and add actual response
      setMessages(prev => {
        const filtered = prev.filter(msg => msg.id !== loadingMessageId)
        return [
          ...filtered,
          {
            id: `msg-${Date.now()}-assistant`,
            role: "assistant",
            content: response.message,
            timestamp: new Date(),
          }
        ]
      })
    } catch (error) {
      console.error('Chat error:', error)
      
      // Remove loading message and add error message
      setMessages(prev => {
        const filtered = prev.filter(msg => msg.id !== loadingMessageId)
        return [
          ...filtered,
          {
            id: `msg-${Date.now()}-error`,
            role: "assistant",
            content: "I'm having trouble connecting right now. Please try again in a moment, or contact our support team if the issue persists.",
            timestamp: new Date(),
          }
        ]
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <PatientLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold">AI Health Assistant</h2>
          <p className="text-muted-foreground">24/7 support for your health questions</p>
        </div>

        <Card className="h-[calc(100vh-16rem)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Chat with AI Assistant
            </CardTitle>
            <CardDescription>Ask about medications, appointments, and health guidance</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col h-[calc(100%-5rem)]">
            <ScrollArea className="flex-1 pr-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-lg p-4 ${
                        message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                      }`}
                    >
                      {message.isLoading ? (
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                          <span className="text-sm opacity-70">Thinking...</span>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                          <p className="text-xs opacity-70 mt-2">
                            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {message.role === "assistant" && (
                            <div className="flex gap-2 mt-3">
                              <Button size="sm" variant="ghost" className="h-7 px-2">
                                <ThumbsUp className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2">
                                <ThumbsDown className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex gap-2 mt-4 pt-4 border-t">
              <Input
                placeholder="Type your question..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && !isLoading && handleSend()}
                disabled={isLoading}
              />
              <Button className="btn-gradient" onClick={handleSend} disabled={isLoading || !input.trim()}>
                <Send className="h-4 w-4 mt-0.5 mr-0.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Questions</CardTitle>
            <CardDescription>Common topics I can help with</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2">
              <Button
                variant="outline"
                className="justify-start bg-transparent"
                onClick={() => setInput("What medications am I currently taking?")}
              >
                What medications am I taking?
              </Button>
              <Button
                variant="outline"
                className="justify-start bg-transparent"
                onClick={() => setInput("When is my next appointment?")}
              >
                When is my next appointment?
              </Button>
              <Button
                variant="outline"
                className="justify-start bg-transparent"
                onClick={() => setInput("How should I prepare for my checkup?")}
              >
                How to prepare for checkup?
              </Button>
              <Button
                variant="outline"
                className="justify-start bg-transparent"
                onClick={() => setInput("What are the side effects of my medication?")}
              >
                Medication side effects?
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PatientLayout>
  )
}
