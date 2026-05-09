'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AdminLayout } from "@/components/admin-layout"
import { FeedbackRatingStars } from "@/components/feedback-rating-stars"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Calendar as CalendarIcon, Edit, Eye, EyeOff, Reply, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { adminAccountService, type AdminFeedbackRow } from '@/services/admin-account-service'
import { usePauseableToast, type PauseableToastEntry } from "@/hooks/usePauseableToast"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { format } from "date-fns"

interface Feedback extends AdminFeedbackRow {
  submittedDate: string
  isVisible: boolean
}

export default function FeedbackManagement() {
  const { toast, isExiting, showSuccess, showError, onMouseEnter, onMouseLeave } = usePauseableToast()
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null)
  const [responseText, setResponseText] = useState('')
  const [tableFilters, setTableFilters] = useState({
    user: '',
    role: 'ALL',
    category: '',
    rating: 'ALL',
    feedback: '',
    response: '',
    dateFrom: '',
    dateTo: '',
  })
  const [recentSearch, setRecentSearch] = useState('')
  const dateFromValue = tableFilters.dateFrom ? new Date(`${tableFilters.dateFrom}T00:00:00`) : undefined
  const dateToValue = tableFilters.dateTo ? new Date(`${tableFilters.dateTo}T00:00:00`) : undefined

  const loadFeedbacks = async () => {
    setLoading(true)
    try {
      const res = await adminAccountService.getFeedbacks()
      setFeedbacks(
        (res.feedbacks || []).map((f) => ({
          ...f,
          submittedDate: f.time ? String(f.time).replace("T", " ").slice(0, 16) : "—",
          isVisible: !!f.status,
        }))
      )
    } catch (e) {
      console.error("Load admin feedbacks failed:", e)
      showError(e instanceof Error ? e.message : "Failed to load feedbacks")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFeedbacks()
  }, [])

  const toggleVisibility = async (feedback: Feedback) => {
    setSaving(true)
    try {
      const res = await adminAccountService.updateFeedback(feedback.id, { status: !feedback.isVisible })
      const updated = {
        ...res.feedback,
        submittedDate: res.feedback.time ? String(res.feedback.time).replace("T", " ").slice(0, 16) : "—",
        isVisible: !!res.feedback.status,
      }
      setFeedbacks((prev) => prev.map((f) => (f.id === feedback.id ? updated : f)))
      showSuccess(updated.isVisible ? "Feedback is now visible" : "Feedback has been hidden")
    } catch (e) {
      console.error("Toggle visibility failed:", e)
      showError(e instanceof Error ? e.message : "Failed to update feedback visibility")
    } finally {
      setSaving(false)
    }
  }

  const handleResponse = async () => {
    if (!selectedFeedback) return
    if (!responseText.trim()) return
    setSaving(true)
    try {
      const res = await adminAccountService.updateFeedback(selectedFeedback.id, { response: responseText.trim() })
      const updated = {
        ...res.feedback,
        submittedDate: res.feedback.time ? String(res.feedback.time).replace("T", " ").slice(0, 16) : "—",
        isVisible: !!res.feedback.status,
      }
      setFeedbacks((prev) => prev.map((f) => (f.id === selectedFeedback.id ? updated : f)))
      setResponseText("")
      setSelectedFeedback(null)
      showSuccess("Response saved successfully")
    } catch (e) {
      console.error("Save response failed:", e)
      showError(e instanceof Error ? e.message : "Failed to save response")
    } finally {
      setSaving(false)
    }
  }

  const filteredFeedbacks = useMemo(() => {
    const roleMatches = (f: Feedback) => {
      if (tableFilters.role === 'ALL') return true
      return String(f.role || '').toLowerCase() === tableFilters.role.toLowerCase()
    }

    const ratingMatches = (f: Feedback) => {
      if (tableFilters.rating === 'ALL') return true
      return Number(f.rating) === Number(tableFilters.rating)
    }

    const dateMatches = (f: Feedback) => {
      if (!tableFilters.dateFrom && !tableFilters.dateTo) return true
      if (!f.time) return false
      const rawDate = String(f.time).slice(0, 10)
      if (tableFilters.dateFrom && rawDate < tableFilters.dateFrom) return false
      if (tableFilters.dateTo && rawDate > tableFilters.dateTo) return false
      return true
    }

    return feedbacks.filter((f) =>
      `${f.userName} ${f.username}`.toLowerCase().includes(tableFilters.user.toLowerCase()) &&
      roleMatches(f) &&
      String(f.type || '').toLowerCase().includes(tableFilters.category.toLowerCase()) &&
      ratingMatches(f) &&
      String(f.content || '').toLowerCase().includes(tableFilters.feedback.toLowerCase()) &&
      String(f.response || '').toLowerCase().includes(tableFilters.response.toLowerCase()) &&
      dateMatches(f)
    )
  }, [feedbacks, tableFilters])

  const respondedFeedbacks = useMemo(
    () =>
      feedbacks.filter((f) =>
        String(f.response || "").trim().length > 0 &&
        `${f.userName} ${f.username} ${f.type} ${f.content} ${f.response}`
          .toLowerCase()
          .includes(recentSearch.toLowerCase())
      ),
    [feedbacks, recentSearch]
  )

  const recentRespondedFeedbacks = useMemo(() => respondedFeedbacks.slice(0, 3), [respondedFeedbacks])

  const pauseableToast =
    toast &&
    typeof document !== "undefined" &&
    createPortal(
      <AdminPageToast
        toast={toast}
        isExiting={isExiting}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />,
      document.body
    )

  return (
    <>
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-foreground flex items-center gap-2">
            Feedback Management
          </h2>
          <p className="text-muted-foreground mt-2">View, respond, and control visibility of all user feedback</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Feedbacks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{feedbacks.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Visible Feedbacks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{feedbacks.filter(f => f.isVisible).length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {feedbacks.length > 0
                  ? (feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(1)
                  : "0.0"}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feedbacks Table */}
        <Card>
          <CardHeader>
            <CardTitle></CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading feedbacks...</p>
            ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader
                  className="text-white"
                  style={{ background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)" }}
                >
                  <TableRow>
                    <TableHead className="px-4 py-3 text-left font-semibold text-white">No.</TableHead>
                    <TableHead className="px-4 py-3 text-left font-semibold text-white">User</TableHead>
                    <TableHead className="px-4 py-3 text-left font-semibold text-white">Role</TableHead>
                    <TableHead className="px-4 py-3 text-left font-semibold text-white">Category</TableHead>
                    <TableHead className="px-4 py-3 text-left font-semibold text-white">Rating</TableHead>
                    <TableHead className="px-4 py-3 text-left font-semibold text-white">Feedback</TableHead>
                    <TableHead className="px-4 py-3 text-left font-semibold text-white">Response</TableHead>
                    <TableHead className="px-4 py-3 text-left font-semibold text-white">Date</TableHead>
                    <TableHead className="px-4 py-3 text-left font-semibold text-white">Actions</TableHead>
                  </TableRow>
                  <TableRow className="bg-white/95">
                    <TableHead className="px-2 py-2" />
                    <TableHead className="px-2 py-2">
                      <div className="relative">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          value={tableFilters.user}
                          onChange={(e) => setTableFilters((prev) => ({ ...prev, user: e.target.value }))}
                          className="h-8 text-xs pr-8"
                        />
                      </div>
                    </TableHead>
                    <TableHead className="px-2 py-2">
                      <Select
                        value={tableFilters.role}
                        onValueChange={(value) => setTableFilters((prev) => ({ ...prev, role: value }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="All roles" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All roles</SelectItem>
                          <SelectItem value="Admin">Admin</SelectItem>
                          <SelectItem value="Doctor">Doctor</SelectItem>
                          <SelectItem value="Nurse">Nurse</SelectItem>
                          <SelectItem value="Patient">Patient</SelectItem>
                          <SelectItem value="Technician">Technician</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableHead>
                    <TableHead className="px-2 py-2">
                      <Input
                        value={tableFilters.category}
                        onChange={(e) => setTableFilters((prev) => ({ ...prev, category: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </TableHead>
                    <TableHead className="px-2 py-2">
                      <Select
                        value={tableFilters.rating}
                        onValueChange={(value) => setTableFilters((prev) => ({ ...prev, rating: value }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="All ratings" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All</SelectItem>
                          <SelectItem value="5">5 stars</SelectItem>
                          <SelectItem value="4">4 stars</SelectItem>
                          <SelectItem value="3">3 stars</SelectItem>
                          <SelectItem value="2">2 stars</SelectItem>
                          <SelectItem value="1">1 star</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableHead>
                    <TableHead className="px-2 py-2">
                      <div className="relative">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          value={tableFilters.feedback}
                          onChange={(e) => setTableFilters((prev) => ({ ...prev, feedback: e.target.value }))}
                          className="h-8 text-xs pr-8"
                        />
                      </div>
                    </TableHead>
                    <TableHead className="px-2 py-2">
                      <div className="relative">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          value={tableFilters.response}
                          onChange={(e) => setTableFilters((prev) => ({ ...prev, response: e.target.value }))}
                          className="h-8 text-xs pr-8"
                        />
                      </div>
                    </TableHead>
                    <TableHead className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 w-[8.75rem] justify-start text-xs font-normal"
                            >
                              <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
                              {dateFromValue ? format(dateFromValue, "dd/MM/yyyy") : "From"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={dateFromValue}
                              onSelect={(value) =>
                                setTableFilters((prev) => ({
                                  ...prev,
                                  dateFrom: value ? format(value, "yyyy-MM-dd") : "",
                                }))
                              }
                              disabled={(date) => Boolean(dateToValue && date > dateToValue)}
                              captionLayout="dropdown"
                            />
                          </PopoverContent>
                        </Popover>
                        <span className="text-[10px] text-slate-500">-</span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 w-[8.75rem] justify-start text-xs font-normal"
                            >
                              <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
                              {dateToValue ? format(dateToValue, "dd/MM/yyyy") : "To"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={dateToValue}
                              onSelect={(value) =>
                                setTableFilters((prev) => ({
                                  ...prev,
                                  dateTo: value ? format(value, "yyyy-MM-dd") : "",
                                }))
                              }
                              disabled={(date) => Boolean(dateFromValue && date < dateFromValue)}
                              captionLayout="dropdown"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableHead>
                    <TableHead className="px-2 py-2" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFeedbacks.map((feedback, index) => (
                    <TableRow key={feedback.id} className="hover:bg-slate-50">
                      <TableCell className="px-4 py-3 font-medium">{index + 1}</TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="font-medium">{feedback.userName}</div>
                        <div className="text-xs text-slate-500">@{feedback.username || `user-${feedback.userId}`}</div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold">
                          {feedback.role}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3">{feedback.type}</TableCell>
                      <TableCell className="px-4 py-3">
                        <FeedbackRatingStars rating={Number(feedback.rating)} size="md" />
                      </TableCell>
                      <TableCell className="px-4 py-3 max-w-xs truncate">{feedback.content}</TableCell>
                      <TableCell className="px-4 py-3 max-w-xs">
                        <p className="truncate text-slate-700">{feedback.response || "—"}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground text-xs">{feedback.submittedDate}</TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                className='btn-gradient'
                                size="sm"
                                onClick={() => {
                                  setSelectedFeedback(feedback)
                                  setResponseText(feedback.response || "")
                                }}
                              >
                                <span>{feedback.response ? <Edit className="h-4 w-4" /> : <Reply className="h-4 w-4" />}</span>
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                              <DialogHeader>
                                <DialogTitle>Response to feedback</DialogTitle>
                                <DialogDescription>
                                  {selectedFeedback?.response ? "Edit your response" : "Create a response"} for {selectedFeedback?.userName}
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <p className="text-sm font-semibold mb-2">Original Feedback:</p>
                                  <div className="bg-slate-100 p-3 rounded text-sm">
                                    {selectedFeedback?.content}
                                  </div>
                                </div>
                                <div>
                                  <label className="text-sm font-semibold mb-2 block">Your Response:</label>
                                  <Textarea
                                    placeholder="Type your response here..."
                                    value={responseText}
                                    onChange={(e) => setResponseText(e.target.value)}
                                    onInput={(e) => setResponseText((e.target as HTMLTextAreaElement).value)}
                                    onBlur={(e) => setResponseText(e.target.value)}
                                    className="min-h-24"
                                  />
                                </div>
                                <Button
                                  onClick={() => void handleResponse()}
                                  className="w-full btn-gradient"
                                  disabled={saving}
                                >
                                  {saving ? "Saving..." : selectedFeedback?.response ? "Update Response" : "Send Response"}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>

                          <Button
                            className='btn-gradient'
                            size="sm"
                            onClick={() => void toggleVisibility(feedback)}
                            disabled={saving}
                            title={feedback.isVisible ? 'Hide feedback' : 'Show feedback'}
                          >
                            {feedback.isVisible ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )}
          </CardContent>
        </Card>

        {/* Responded Feedbacks */}
        {respondedFeedbacks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Your Recent Responses</CardTitle>
              <CardDescription>Feedbacks you have already responded to</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={recentSearch}
                  onChange={(e) => setRecentSearch(e.target.value)}
                  className="h-9 pr-8"
                  placeholder="Search recent responses..."
                />
              </div>

              {recentRespondedFeedbacks.map(feedback => (
                  <div key={feedback.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{feedback.userName} ({feedback.role})</p>
                        <p className="text-sm text-muted-foreground">{feedback.submittedDate}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">Category: {feedback.type}</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded text-sm">
                      <p className="font-semibold text-xs mb-1">Original:</p>
                      <p>{feedback.content}</p>
                    </div>
                    <div className="bg-blue-50 p-3 rounded text-sm border border-blue-200">
                      <p className="font-semibold text-xs mb-1 text-blue-900">Your Response:</p>
                      <p className="text-blue-900">{feedback.response}</p>
                    </div>
                  </div>
                )
              )}

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    View all feedback
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl">
                  <DialogHeader>
                    <DialogTitle>All responded feedback</DialogTitle>
                    <DialogDescription>All feedback entries that already have responses</DialogDescription>
                  </DialogHeader>
                  <div className="max-h-[65vh] overflow-y-auto space-y-3">
                    {respondedFeedbacks.map((feedback) => (
                      <div key={feedback.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold">{feedback.userName} ({feedback.role})</p>
                            <p className="text-sm text-muted-foreground">{feedback.submittedDate}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">Category: {feedback.type}</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded text-sm">
                          <p className="font-semibold text-xs mb-1">Original:</p>
                          <p>{feedback.content}</p>
                        </div>
                        <div className="bg-blue-50 p-3 rounded text-sm border border-blue-200">
                          <p className="font-semibold text-xs mb-1 text-blue-900">Your Response:</p>
                          <p className="text-blue-900">{feedback.response}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
    {pauseableToast}
    </>
  )
}

function AdminPageToast({
  toast,
  isExiting,
  onMouseEnter,
  onMouseLeave,
}: {
  toast: PauseableToastEntry
  isExiting: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto fixed bottom-5 right-5 z-[118] max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg transition-opacity duration-300 ease-out",
        isExiting ? "opacity-0" : "opacity-100",
        toast.variant === "success" && "bg-[#34A853] text-white",
        toast.variant === "error" && "bg-[#EA4335] text-white"
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {toast.message}
    </div>
  )
}
