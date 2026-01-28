'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AdminLayout } from "@/components/admin-layout"
import { MessageSquare, Eye, EyeOff, Reply, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface Feedback {
  id: string
  userId: string
  userName: string
  role: string
  category: string
  rating: number
  comment: string
  submittedDate: string
  isVisible: boolean
  response?: string
}

export default function FeedbackManagement() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([
    {
      id: '1',
      userId: 'OP12345678',
      userName: 'Dr. Sarah Johnson',
      role: 'Doctor',
      category: 'User Interface',
      rating: 4,
      comment: 'Should add "Clear all" button',
      submittedDate: '07/10/2025 10:30',
      isVisible: true,
    },
    {
      id: '2',
      userId: 'OP12345678',
      userName: 'Nurse Michael Chen',
      role: 'Nurse',
      category: 'AI Chatbot',
      rating: 3.5,
      comment: 'The chatbot doesn\'t give the correct answer',
      submittedDate: '07/10/2025 14:23',
      isVisible: false,
    },
    {
      id: '3',
      userId: 'OP12345678',
      userName: 'John Doe',
      role: 'Patient',
      category: 'User Interface',
      rating: 5,
      comment: 'The test out of the screen so I cannot view it',
      submittedDate: '07/10/2025 14:23',
      isVisible: true,
    },
    {
      id: '4',
      userId: 'OP12345678',
      userName: 'Admin User',
      role: 'Admin',
      category: 'Recovery Prediction',
      rating: 4.5,
      comment: 'It must have longer recovery because the patient have obesity',
      submittedDate: '07/10/2025 14:23',
      isVisible: true,
    },
    {
      id: '5',
      userId: 'OP12345678',
      userName: 'Tech Support',
      role: 'Technician',
      category: 'Notification',
      rating: 5,
      comment: 'I haven\'t receive any notification!',
      submittedDate: '07/10/2025 14:23',
      isVisible: true,
    },
  ])

  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null)
  const [responseText, setResponseText] = useState('')

  const toggleVisibility = (id: string) => {
    setFeedbacks(feedbacks.map(f => 
      f.id === id ? { ...f, isVisible: !f.isVisible } : f
    ))
  }

  const handleResponse = (id: string) => {
    if (responseText.trim()) {
      setFeedbacks(feedbacks.map(f => 
        f.id === id ? { ...f, response: responseText } : f
      ))
      setResponseText('')
      setSelectedFeedback(null)
    }
  }

  const deleteFeedback = (id: string) => {
    setFeedbacks(feedbacks.filter(f => f.id !== id))
  }

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return 'text-green-600'
    if (rating >= 3) return 'text-yellow-600'
    return 'text-red-600'
  }

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating)
    const hasHalfStar = rating % 1 !== 0
    return (
      <div className="flex gap-1">
        {[...Array(5)].map((_, i) => (
          <span key={i} className={i < fullStars ? 'text-yellow-400' : 'text-gray-300'}>
            ★
          </span>
        ))}
      </div>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-foreground flex items-center gap-2">

            Feedback Management
          </h2>
          <p className="text-muted-foreground mt-2">View, manage, and respond to user feedbacks</p>
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
                {(feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(1)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feedbacks Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Feedbacks</CardTitle>
            <CardDescription>Manage user feedbacks and responses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">No.</th>
                    <th className="px-4 py-3 text-left font-semibold">User</th>
                    <th className="px-4 py-3 text-left font-semibold">Role</th>
                    <th className="px-4 py-3 text-left font-semibold">Category</th>
                    <th className="px-4 py-3 text-left font-semibold">Rating</th>
                    <th className="px-4 py-3 text-left font-semibold">Feedback</th>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {feedbacks.map((feedback, index) => (
                    <tr key={feedback.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{index + 1}</td>
                      <td className="px-4 py-3">{feedback.userName}</td>
                      <td className="px-4 py-3">
                        <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold">
                          {feedback.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">{feedback.category}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {renderStars(feedback.rating)}
                          <span className={`font-semibold ${getRatingColor(feedback.rating)}`}>
                            {feedback.rating}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate">{feedback.comment}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{feedback.submittedDate}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedFeedback(feedback)}
                              >
                                <Reply className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                              <DialogHeader>
                                <DialogTitle>Respond to Feedback</DialogTitle>
                                <DialogDescription>
                                  Reply to {selectedFeedback?.userName}'s feedback
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <p className="text-sm font-semibold mb-2">Original Feedback:</p>
                                  <div className="bg-slate-100 p-3 rounded text-sm">
                                    {selectedFeedback?.comment}
                                  </div>
                                </div>
                                <div>
                                  <label className="text-sm font-semibold mb-2 block">Your Response:</label>
                                  <Textarea
                                    placeholder="Type your response here..."
                                    value={responseText}
                                    onChange={(e) => setResponseText(e.target.value)}
                                    className="min-h-24"
                                  />
                                </div>
                                <Button
                                  onClick={() => handleResponse(feedback.id)}
                                  className="w-full"
                                >
                                  Send Response
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleVisibility(feedback.id)}
                            title={feedback.isVisible ? 'Hide feedback' : 'Show feedback'}
                          >
                            {feedback.isVisible ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4" />
                            )}
                          </Button>

                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteFeedback(feedback.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Responded Feedbacks */}
        {feedbacks.some(f => f.response) && (
          <Card>
            <CardHeader>
              <CardTitle>Your Responses</CardTitle>
              <CardDescription>Feedbacks you have already responded to</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {feedbacks.map(feedback => 
                feedback.response && (
                  <div key={feedback.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{feedback.userName} ({feedback.role})</p>
                        <p className="text-sm text-muted-foreground">{feedback.submittedDate}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">Category: {feedback.category}</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded text-sm">
                      <p className="font-semibold text-xs mb-1">Original:</p>
                      <p>{feedback.comment}</p>
                    </div>
                    <div className="bg-blue-50 p-3 rounded text-sm border border-blue-200">
                      <p className="font-semibold text-xs mb-1 text-blue-900">Your Response:</p>
                      <p className="text-blue-900">{feedback.response}</p>
                    </div>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  )
}
