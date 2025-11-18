"use client"

import { useState } from "react"
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  ChevronLeft,
  Send,
  Sparkles,
  MessageSquare,
  Calendar,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  Star,
} from "lucide-react"
import { PatientLayout } from "@/components/patient-layout";

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

export default function FeedbackPage() {
  const [activeTab, setActiveTab] = useState<"feedback" | "ai-suggestions">("feedback")
  const [selectedCategory, setSelectedCategory] = useState<FeedbackCategory>("general")
  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackRating, setFeedbackRating] = useState<FeedbackRating | null>(null)
  const [submitted, setSubmitted] = useState(false)

  // Mock AI recommendations
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

  const getCategoryIcon = (category: FeedbackCategory) => {
    switch (category) {
      case "ai-chatbot":
        return <MessageSquare className="h-5 w-5" />
      case "ai-schedule":
        return <Calendar className="h-5 w-5" />
      case "ai-recovery":
        return <TrendingUp className="h-5 w-5" />
      default:
        return <MessageSquare className="h-5 w-5" />
    }
  }

  return (
    <PatientLayout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link to="/patient/dashboard" className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Feedback & AI Suggestions</h1>
          <p className="text-gray-600 mt-2">Share your experience and review AI recommendations</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-4 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("feedback")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "feedback"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Submit Feedback
          </button>
          <button
            onClick={() => setActiveTab("ai-suggestions")}
            className={`px-4 py-2 font-medium transition-colors flex items-center gap-2 ${
              activeTab === "ai-suggestions"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
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
            <Card>
              <CardHeader>
                <CardTitle>Feedback Category</CardTitle>
                <CardDescription>Tell us what your feedback is about</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { value: "general" as FeedbackCategory, label: "General Experience", icon: MessageSquare },
                    { value: "ai-chatbot" as FeedbackCategory, label: "AI Chatbot", icon: MessageSquare },
                    { value: "ai-schedule" as FeedbackCategory, label: "Appointment Suggestions", icon: Calendar },
                    { value: "ai-recovery" as FeedbackCategory, label: "Recovery Predictions", icon: TrendingUp },
                  ].map((cat) => {
                    const Icon = cat.icon
                    return (
                      <button
                        key={cat.value}
                        onClick={() => setSelectedCategory(cat.value)}
                        className={`p-4 rounded-lg border-2 transition-all flex items-center gap-3 ${
                          selectedCategory === cat.value
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="font-medium text-left">{cat.label}</span>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Rating Selection */}
            <Card>
              <CardHeader>
                <CardTitle>How would you rate your experience?</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setFeedbackRating(star as FeedbackRating)}
                      className="transition-transform hover:scale-110"
                      aria-label={`Rate ${star} stars`}
                    >
                      <Star
                        className={`h-10 w-10 transition-colors ${
                          feedbackRating && feedbackRating >= star ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {feedbackRating && (
                  <p className="mt-3 text-sm text-gray-600">
                    You rated this experience <span className="font-semibold">{feedbackRating} out of 5 stars</span>
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Feedback Text */}
            <Card>
              <CardHeader>
                <CardTitle>Your Feedback</CardTitle>
                <CardDescription>Please provide detailed comments (optional)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Share your thoughts, suggestions, or concerns..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="min-h-32 resize-none"
                />
                <Button onClick={handleSubmitFeedback} className="w-full bg-blue-600 hover:bg-blue-700">
                  <Send className="h-4 w-4 mr-2" />
                  Submit Feedback
                </Button>
                {submitted && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
                    Thank you! Your feedback has been submitted successfully.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI Suggestions Tab */}
        {activeTab === "ai-suggestions" && (
          <div className="space-y-4">
            {aiRecommendations.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-gray-500">
                  No AI suggestions at this time. Check back later!
                </CardContent>
              </Card>
            ) : (
              aiRecommendations.map((rec) => (
                <Card key={rec.id} className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="mt-1">
                          {rec.type === "appointment" && <Calendar className="h-5 w-5 text-blue-600" />}
                          {rec.type === "chatbot" && <MessageSquare className="h-5 w-5 text-purple-600" />}
                          {rec.type === "recovery" && <TrendingUp className="h-5 w-5 text-green-600" />}
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-lg">{rec.title}</CardTitle>
                          <CardDescription>{rec.description}</CardDescription>
                          <p className="text-xs text-gray-400 mt-1">{rec.timestamp}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                          {rec.confidence}% confidence
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="text-sm text-gray-700 font-medium mb-2">AI Recommendation:</p>
                      <p className="text-gray-900">{rec.suggestion}</p>
                    </div>

                    {rec.userResponse === "pending" ? (
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          className="flex-1 border-green-300 text-green-700 hover:bg-green-50 bg-transparent"
                          onClick={() => handleAIResponse(rec.id, "accepted")}
                        >
                          <ThumbsUp className="h-4 w-4 mr-2" />
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 border-red-300 text-red-700 hover:bg-red-50 bg-transparent"
                          onClick={() => handleAIResponse(rec.id, "rejected")}
                        >
                          <ThumbsDown className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <div
                        className={`p-3 rounded-lg flex items-center gap-2 ${
                          rec.userResponse === "accepted"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {rec.userResponse === "accepted" ? (
                          <ThumbsUp className="h-4 w-4" />
                        ) : (
                          <ThumbsDown className="h-4 w-4" />
                        )}
                        <span className="text-sm font-medium capitalize">
                          {rec.userResponse === "accepted"
                            ? "You accepted this suggestion"
                            : "You rejected this suggestion"}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </PatientLayout>
  )
}
