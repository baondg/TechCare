"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Send,
  Sparkles,
  MessageSquare,
  Calendar,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  Star,
  CheckCircle,
} from "lucide-react"
import { DoctorLayout } from "@/components/doctor-layout"

type FeedbackCategory = "ai-chatbot" | "ai-schedule" | "ai-recovery" | "general"
type FeedbackRating = 1 | 2 | 3 | 4 | 5

interface AIRecommendation {
  id: string
  type: "appointment" | "chatbot" | "recovery"
  title: string
  description: string
  suggestion: string
  confidence: number
  timestamp: string
  userResponse?: "accepted" | "rejected" | "pending"
}



export default function DoctorFeedback() {
    const [activeTab, setActiveTab] = useState<"feedback" | "ai-suggestions">("feedback")
      const [selectedCategory, setSelectedCategory] = useState<FeedbackCategory>("general")
      const [feedbackText, setFeedbackText] = useState("")
      const [feedbackRating, setFeedbackRating] = useState<FeedbackRating | null>(null)
      const [submitted, setSubmitted] = useState(false)
    
      const [aiRecommendations] = useState<AIRecommendation[]>([
        {
          id: "1",
          type: "appointment",
          title: "Optimal Appointment Slot",
          description: "Based on your availability and doctor schedule",
          suggestion: "Tuesday, 10:30 AM with Dr. Sarah Johnson - Cardiology",
          confidence: 92,
          timestamp: "Today at 2:45 PM",
          userResponse: "pending",
        },
        {
          id: "2",
          type: "chatbot",
          title: "Chatbot Response Quality",
          description: "About your medication questions",
          suggestion: "The AI chatbot answered your question about Amoxicillin dosage correctly",
          confidence: 88,
          timestamp: "Yesterday at 3:20 PM",
          userResponse: "accepted",
        },
        {
          id: "3",
          type: "recovery",
          title: "Recovery Progress Prediction",
          description: "Estimated recovery timeline for your condition",
          suggestion: "Based on current treatment, expect full recovery in 5-7 days",
          confidence: 85,
          timestamp: "2 days ago",
          userResponse: "pending",
        },
      ])
    
      const handleSubmitFeedback = () => {
        console.log("Feedback submitted:", { category: selectedCategory, rating: feedbackRating, text: feedbackText })
        setSubmitted(true)
        setFeedbackText("")
        setFeedbackRating(null)
        setTimeout(() => setSubmitted(false), 3000)
      }
    
      const handleAIResponse = (id: string, response: "accepted" | "rejected") => {
        console.log(`AI recommendation ${id} ${response}`)
      }

  return (
    <DoctorLayout>
      <div className="w-full space-y-6">
        {/* Header với gradient */}
        <div>
<<<<<<< HEAD
<<<<<<< HEAD
          <h2 className="h-12 text-3xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent mb-2">
=======
          <h2 className="h-12 text-4xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent mb-2">
>>>>>>> 2a3e1294 (Add nurse portal and Technician portal)
=======
          <h2 className="h-12 text-3xl font-bold bg-linear-to-r from-[#06b6d4] via-[#0891b2] to-[#06b6d4] bg-clip-text text-transparent mb-2">
>>>>>>> d0e85e3f (add technician portal + appointment page)
            Feedback & AI Suggestions
          </h2>
          <p className="text-slate-600 text-lg">Share your experience and review AI recommendations</p>
        </div>

        {/* Tab Navigation với style mới */}
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("feedback")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all duration-300 ${
              activeTab === "feedback"
                ? "bg-white text-cyan-600 shadow-md"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Submit Feedback
          </button>
          <button
            onClick={() => setActiveTab("ai-suggestions")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all duration-300 flex items-center gap-2 ${
              activeTab === "ai-suggestions"
                ? "bg-white text-cyan-600 shadow-md"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            AI Suggestions ({aiRecommendations.length})
          </button>
        </div>

        {/* Feedback Tab */}
        {activeTab === "feedback" && (
          <div className="space-y-6">
            {/* Category Selection */}
            <Card className="card-feature border-slate-200/60">
              <CardHeader className="bg-linear-to-r from-cyan-50/50 to-transparent">
                <CardTitle className="text-slate-900">Feedback Category</CardTitle>
                <CardDescription>Tell us what your feedback is about</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { value: "general" as FeedbackCategory, label: "General Experience", icon: MessageSquare },
                    { value: "ai-suggestion" as FeedbackCategory, label: "AI Suggestion", icon: MessageSquare },
                    { value: "ai-schedule" as FeedbackCategory, label: "Appointment Suggestions", icon: Calendar },
                    { value: "ai-recovery" as FeedbackCategory, label: "Recovery Predictions", icon: TrendingUp },
                  ].map((cat) => {
                    const Icon = cat.icon
                    const isSelected = selectedCategory === cat.value
                    return (
                      <button
                        key={cat.value}
                        onClick={() => setSelectedCategory(cat.value)}
                        className={`card-feature-group p-5 rounded-xl transition-all duration-300 flex items-center gap-4 ${
                          isSelected
                            ? "border-cyan-500 bg-cyan-50/50 shadow-lg"
                            : "hover:shadow-md"
                        }`}
                      >
                        <div className={`icon-feature-card ${isSelected ? "scale-110" : ""}`}>
                          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                            isSelected 
                              ? "bg-linear-to-br from-cyan-500 to-cyan-600" 
                              : "bg-linear-to-br from-slate-100 to-slate-200"
                          }`}>
                            <Icon className={`h-6 w-6 ${isSelected ? "text-white" : "text-slate-600"}`} />
                          </div>
                        </div>
                        <span className={`font-semibold text-left ${
                          isSelected ? "text-cyan-700" : "text-slate-700"
                        }`}>
                          {cat.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Rating Selection */}
            <Card className="card-feature border-slate-200/60">
              <CardHeader className="bg-linear-to-r from-amber-50/50 to-transparent">
                <CardTitle className="text-slate-900">Rate Your Experience</CardTitle>
                <CardDescription>How would you rate this experience?</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="flex gap-3 justify-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setFeedbackRating(star as FeedbackRating)}
                      className="transition-all duration-300 hover:scale-125"
                      aria-label={`Rate ${star} stars`}
                    >
                      <Star
                        className={`h-12 w-12 transition-all duration-300 ${
                          feedbackRating && feedbackRating >= star 
                            ? "fill-amber-400 text-amber-400 scale-110" 
                            : "text-slate-300 hover:text-amber-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {feedbackRating && (
                  <p className="mt-4 text-center text-slate-600">
                    You rated this experience{" "}
                    <span className="font-bold text-amber-600">{feedbackRating} out of 5 stars</span>
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Feedback Text */}
            <Card className="card-feature border-slate-200/60">
              <CardHeader className="bg-linear-to-r from-blue-50/50 to-transparent">
                <CardTitle className="text-slate-900">Your Feedback</CardTitle>
                <CardDescription>Share your detailed thoughts and suggestions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <Textarea
                  placeholder="Tell us about your experience, what went well, and what could be improved..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="min-h-40 resize-none custom-input"
                />
                <Button 
                  onClick={handleSubmitFeedback} 
                  className="w-full btn-gradient h-12 text-base"
                  disabled={!feedbackRating}
                >
                  <Send className="h-5 w-5 mr-2" />
                  Submit Feedback
                </Button>
                {submitted && (
                  <div className="p-4 bg-linear-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-green-700 font-medium">
                      Thank you! Your feedback has been submitted successfully.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI Suggestions Tab */}
        {activeTab === "ai-suggestions" && (
            <div></div>
        )}
      </div>
    </DoctorLayout>
  )
}
