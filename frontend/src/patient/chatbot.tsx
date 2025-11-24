"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PatientLayout } from "@/components/patient-layout"
import { Bot, Send, ThumbsUp, ThumbsDown } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

type Message = {
  id: number
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

export default function ChatbotPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      content:
        "Hello! I'm your TechCare AI assistant. I can help you with questions about your medications, appointments, and post-treatment care. How can I assist you today?",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")

  const handleSend = () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: messages.length + 1,
      role: "user",
      content: input,
      timestamp: new Date(),
    }

    setMessages([...messages, userMessage])
    setInput("")

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: Message = {
        id: messages.length + 2,
        role: "assistant",
        content: getAIResponse(input),
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiResponse])
    }, 1000)
  }

  const getAIResponse = (query: string): string => {
    const lowerQuery = query.toLowerCase()
    if (lowerQuery.includes("medication") || lowerQuery.includes("medicine")) {
      return "You're currently taking Amoxicillin 500mg (3 times daily for 5 more days) and Vitamin D3 1000 IU (once daily, ongoing). Make sure to take Amoxicillin with food to avoid stomach upset. Would you like to set up medication reminders?"
    }
    if (lowerQuery.includes("appointment")) {
      return "You have 2 upcoming appointments: 1) General Checkup with Dr. Sarah Johnson tomorrow at 10:00 AM, and 2) Follow-up Visit with Dr. Michael Chen on Dec 20 at 2:30 PM. Would you like to reschedule or get directions?"
    }
    if (lowerQuery.includes("symptom") || lowerQuery.includes("pain")) {
      return "I understand you're experiencing symptoms. For accurate medical advice, I recommend scheduling an appointment with your doctor. However, I can help you book an appointment or provide general wellness tips. What would you prefer?"
    }
    return "I'm here to help! You can ask me about your medications, appointments, medical records, or general health questions. What would you like to know?"
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
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-lg p-4 ${
                        message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{message.content}</p>
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
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
              />
              <Button onClick={handleSend}>
                <Send className="h-4 w-4" />
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
