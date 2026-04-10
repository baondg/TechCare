"use client"

import { useEffect, useMemo, useState } from "react"
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
import { TechnicianLayout } from "@/components/technician-layout"
import {
  appointmentService,
  type PatientAiRecommendation,
  type PatientFeedback,
} from "@/services/appointment-service"

type FeedbackCategory = "ai-chatbot" | "ai-schedule" | "ai-recovery" | "general" | "other"
type FeedbackRating = 1 | 2 | 3 | 4 | 5

interface AIRecommendation {
  id: number
  type: "chatbot" | "symptomchecker" | "other"
  title: string
  description: string
  suggestion: string
  confidence: number
  timestamp: string
  userResponse?: "accepted" | "rejected" | "pending"
}

function toDisplayTimestamp(raw: string | null) {
  if (!raw) return "—"
  try {
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return String(raw)
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return String(raw)
  }
}

function mapDbRecommendationToUi(row: PatientAiRecommendation): AIRecommendation {
  const normalizedFeedback = String(row.feedback || "").toLowerCase()
  const userResponse =
    normalizedFeedback === "accepted"
      ? "accepted"
      : normalizedFeedback === "rejected"
        ? "rejected"
        : "pending"

  return {
    id: row.id,
    type: row.type === "chatbot" || row.type === "symptomchecker" ? row.type : "other",
    title:
      row.type === "chatbot"
        ? "Chatbot Recommendation"
        : row.type === "symptomchecker"
          ? "Symptom Checker Recommendation"
          : "AI Recommendation",
    description: `${row.modelProvider || "AI"} • ${row.modelName || "Model"}`,
    suggestion: row.content,
    confidence: 90,
    timestamp: toDisplayTimestamp(row.time),
    userResponse,
  }
}

export default function TechnicianFeedback() {
  const [activeTab, setActiveTab] = useState<"feedback" | "all-feedback" | "ai-suggestions">("feedback")
  const [selectedCategory, setSelectedCategory] = useState<FeedbackCategory>("general")
  const [customCategory, setCustomCategory] = useState("")
  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackRating, setFeedbackRating] = useState<FeedbackRating | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [feedbackHistory, setFeedbackHistory] = useState<PatientFeedback[]>([])
  const [loadingRecommendations, setLoadingRecommendations] = useState(true)
  const [aiRecommendations, setAiRecommendations] = useState<AIRecommendation[]>([])
  const [loadingAllFeedback, setLoadingAllFeedback] = useState(true)
  const [allVisibleFeedback, setAllVisibleFeedback] = useState<PatientFeedback[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingHistory(true)
      try {
        const rows = await appointmentService.getFeedbacks()
        if (cancelled) return
        setFeedbackHistory(rows)
      } catch (e) {
        console.error("Load feedback history failed:", e)
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingAllFeedback(true)
      try {
        const rows = await appointmentService.getVisibleFeedbacks()
        if (cancelled) return
        setAllVisibleFeedback(rows)
      } catch (e) {
        console.error("Load visible feedback failed:", e)
      } finally {
        if (!cancelled) setLoadingAllFeedback(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingRecommendations(true)
      try {
        const rows = await appointmentService.getAiRecommendations()
        if (cancelled) return
        const mapped = rows.map((r) => mapDbRecommendationToUi(r))
        setAiRecommendations(mapped)
      } catch (e) {
        console.error("Load AI recommendations failed:", e)
      } finally {
        if (!cancelled) setLoadingRecommendations(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmitFeedback = async () => {
    if (!feedbackRating || !feedbackText.trim()) return
    const mappedType = selectedCategory === "other" ? customCategory.trim() : selectedCategory
    if (!mappedType) return
    setSubmitting(true)
    try {
      const created = await appointmentService.createFeedback({
        type: mappedType,
        rating: feedbackRating,
        content: feedbackText.trim(),
      })
      setFeedbackHistory((prev) => [created, ...prev])
      setAllVisibleFeedback((prev) => [created, ...prev])
      setSubmitted(true)
      setFeedbackText("")
      setFeedbackRating(null)
      setCustomCategory("")
      window.setTimeout(() => setSubmitted(false), 3000)
    } catch (e) {
      console.error("Submit feedback failed:", e)
    } finally {
      setSubmitting(false)
    }
  }

  const handleAIResponse = async (id: number, response: "accepted" | "rejected") => {
    try {
      await appointmentService.updateAiRecommendationFeedback(id, response)
      setAiRecommendations((prev) =>
        prev.map((item) => (item.id === id ? { ...item, userResponse: response } : item))
      )
    } catch (e) {
      console.error("Update AI recommendation feedback failed:", e)
    }
  }

  const latestVisibleFeedback = useMemo(
    () => feedbackHistory.filter((x) => !!x.status).slice(0, 5),
    [feedbackHistory]
  )

  return (
    <TechnicianLayout>
      <div className="w-full space-y-6">
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
            onClick={() => setActiveTab("all-feedback")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all duration-300 ${
              activeTab === "all-feedback"
                ? "bg-white text-cyan-600 shadow-md"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            View All Feedback
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
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { value: "general" as FeedbackCategory, label: "General Experience", icon: MessageSquare },
                    { value: "ai-chatbot" as FeedbackCategory, label: "AI Chatbot", icon: MessageSquare },
                    { value: "ai-schedule" as FeedbackCategory, label: "Symptom Checker", icon: Calendar },
                    { value: "ai-recovery" as FeedbackCategory, label: "Recovery Predictions", icon: TrendingUp },
                    { value: "other" as FeedbackCategory, label: "Other", icon: Sparkles },
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
                {selectedCategory === "other" && (
                  <div className="mt-4">
                    <Textarea
                      placeholder="Enter custom feedback category..."
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      className="min-h-16 resize-none custom-input"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Rating Selection */}
            <Card className="card-feature border-slate-200/60">
              <CardContent className="p-6">
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
              <CardContent className="space-y-4 p-6">
                <Textarea
                  placeholder="Tell us about your experience, what went well, and what could be improved..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="min-h-40 resize-none custom-input"
                />
                <Button 
                  onClick={() => void handleSubmitFeedback()} 
                  className="w-full btn-gradient h-12 text-base"
                  disabled={!feedbackRating || !feedbackText.trim() || submitting || (selectedCategory === "other" && !customCategory.trim())}
                >
                  <Send className="h-5 w-5 mr-2" />
                  {submitting ? "Submitting..." : "Submit Feedback"}
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

            <Card className="card-feature border-slate-200/60">
              <CardContent className="p-6">
                {loadingHistory ? (
                  <p className="text-sm text-slate-500">Loading feedback history...</p>
                ) : latestVisibleFeedback.length === 0 ? (
                  <p className="text-sm text-slate-500">No feedback submitted yet.</p>
                ) : (
                  <div className="space-y-3">
                    {latestVisibleFeedback.map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
                            {item.type}
                          </span>
                          <span className="text-xs text-slate-500">
                            {item.time ? String(item.time).replace("T", " ").slice(0, 16) : "—"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-700">{item.content}</p>
                        <p className="mt-2 text-xs text-amber-600 font-semibold">Rating: {item.rating}/5</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "all-feedback" && (
          <Card className="card-feature border-slate-200/60">
            <CardContent className="p-6">
              {loadingAllFeedback ? (
                <p className="text-sm text-slate-500">Loading visible feedback...</p>
              ) : allVisibleFeedback.length === 0 ? (
                <p className="text-sm text-slate-500">No visible feedback available.</p>
              ) : (
                <div className="space-y-3">
                  {allVisibleFeedback.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
                          {item.type}
                        </span>
                        <span className="text-xs text-slate-500">
                          {item.time ? String(item.time).replace("T", " ").slice(0, 16) : "—"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{item.content}</p>
                      {item.response ? (
                        <div className="mt-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
                          <span className="font-semibold">Admin Response:</span> {item.response}
                        </div>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-amber-600 font-semibold">Rating: {item.rating}/5</span>
                        <span className="text-slate-500">{item.userName || `User #${item.userId || "?"}`}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "ai-suggestions" && (
          <div className="space-y-4">
            {loadingRecommendations ? (
              <Card className="card-feature">
                <CardContent className="pt-12 pb-12 text-center">
                  <p className="text-slate-500 text-lg">Loading AI suggestions...</p>
                </CardContent>
              </Card>
            ) : aiRecommendations.length === 0 ? (
              <Card className="card-feature">
                <CardContent className="pt-12 pb-12 text-center">
                  <Sparkles className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 text-lg">No AI suggestions at this time. Check back later!</p>
                </CardContent>
              </Card>
            ) : (
              aiRecommendations.map((rec) => (
                <Card key={rec.id} className="card-feature-group border-l-4 border-l-cyan-500 hover:shadow-lg transition-all duration-300">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="icon-feature-card">
                          <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${
                            rec.type === "chatbot"
                              ? "bg-linear-to-br from-purple-500 to-purple-600"
                              : "bg-linear-to-br from-green-500 to-green-600"
                          }`}>
                            {rec.type === "chatbot" && <MessageSquare className="h-7 w-7 text-white" />}
                            {rec.type === "symptomchecker" && <TrendingUp className="h-7 w-7 text-white" />}
                            {rec.type === "other" && <Sparkles className="h-7 w-7 text-white" />}
                          </div>
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-xl text-slate-900 mb-1">{rec.title}</CardTitle>
                          <CardDescription className="text-slate-600">{rec.description}</CardDescription>
                          <p className="text-xs text-slate-400 mt-2">{rec.timestamp}</p>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <div className="inline-flex items-center px-4 py-2 bg-linear-to-r from-cyan-500 to-blue-500 text-white rounded-full text-sm font-bold shadow-md">
                          {rec.confidence}% relevance
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-5 bg-linear-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200">
                      <p className="text-sm text-slate-600 font-semibold mb-2 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-cyan-600" />
                        AI Recommendation:
                      </p>
                      <p className="text-slate-900 leading-relaxed">{rec.suggestion}</p>
                    </div>

                    {rec.userResponse === "pending" ? (
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          className="flex-1 btn-outline border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => void handleAIResponse(rec.id, "accepted")}
                        >
                          <ThumbsUp className="h-4 w-4 mr-2" />
                          Accept Suggestion
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => void handleAIResponse(rec.id, "rejected")}
                        >
                          <ThumbsDown className="h-4 w-4 mr-2" />
                          Decline
                        </Button>
                      </div>
                    ) : (
                      <div
                        className={`p-4 rounded-xl flex items-center gap-3 ${
                          rec.userResponse === "accepted"
                            ? "bg-linear-to-r from-green-50 to-emerald-50 text-green-700 border border-green-200"
                            : "bg-linear-to-r from-red-50 to-rose-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {rec.userResponse === "accepted" ? (
                          <ThumbsUp className="h-5 w-5" />
                        ) : (
                          <ThumbsDown className="h-5 w-5" />
                        )}
                        <span className="font-semibold">
                          {rec.userResponse === "accepted"
                            ? "You accepted this suggestion"
                            : "You declined this suggestion"}
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
    </TechnicianLayout>
  )
}
