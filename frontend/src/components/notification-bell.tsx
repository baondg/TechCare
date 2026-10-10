/**
 * NotificationBell — Dropdown notification bell with unread badge.
 * Polls for unread count every 30s, shows notification list on click.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, Clock, UserRound, Calendar, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { apiClient } from '@/api/client'
import type { NotificationsResponse } from '@/services/notification-service'

interface Notification {
  id: number
  title: string
  message: string
  type: string
  isRead: boolean
  relatedId: number | null
  createdAt: string
}

function titleFromNotificationType(type: string): string {
  switch (type) {
    case 'cover_request':
      return 'Cover request'
    case 'cover_accepted':
      return 'Cover accepted'
    case 'cover_rejected':
      return 'Cover rejected'
    case 'appointment_cancelled':
      return 'Appointment cancelled'
    case 'appointment_rescheduled':
      return 'Appointment rescheduled'
    default:
      return 'Notification'
  }
}

function mapApiToBellRow(r: {
  id: number
  type: string
  content: string
  time: string
  status: string
}): Notification {
  return {
    id: r.id,
    title: titleFromNotificationType(r.type),
    message: r.content,
    type: r.type,
    isRead: r.status === 'read',
    relatedId: null,
    createdAt: r.time,
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const then = new Date(dateStr)
  const diffMs = now.getTime() - then.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return then.toLocaleDateString()
}

function typeIcon(type: string) {
  switch (type) {
    case 'cover_request':
    case 'cover_accepted':
    case 'cover_rejected':
      return UserRound
    case 'appointment_cancelled':
    case 'appointment_rescheduled':
      return Calendar
    default:
      return Bell
  }
}

function typeColor(type: string): string {
  switch (type) {
    case 'cover_accepted': return 'text-green-600 bg-green-50'
    case 'cover_rejected': return 'text-red-500 bg-red-50'
    case 'cover_request': return 'text-cyan-600 bg-cyan-50'
    case 'appointment_cancelled': return 'text-orange-500 bg-orange-50'
    case 'appointment_rescheduled': return 'text-blue-500 bg-blue-50'
    default: return 'text-slate-500 bg-slate-50'
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // ── Fetch unread count ──
  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await apiClient.get<{ count: number }>('/api/notifications/unread-count')
      setUnreadCount(data.count)
    } catch {
      // silently fail — notifications are non-critical
    }
  }, [])

  // ── Fetch notifications ──
  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiClient.get<NotificationsResponse>('/api/notifications')
      const rows = data.notifications || []
      setNotifications(rows.slice(0, 20).map(mapApiToBellRow))
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Poll every 30s ──
  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  // ── Load on open ──
  useEffect(() => {
    if (open) fetchNotifications()
  }, [open, fetchNotifications])

  // ── Click outside to close ──
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const markAsRead = useCallback(async (id: number) => {
    try {
      await apiClient.patch(`/api/notifications/${id}/read`, {})
      setNotifications(ns => ns.map(n => n.id === id ? { ...n, isRead: true } : n))
      setUnreadCount(c => Math.max(0, c - 1))
    } catch { /* ignore */ }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      await apiClient.patch('/api/notifications/read-all', {})
      setNotifications(ns => ns.map(n => ({ ...n, isRead: true })))
      setUnreadCount(0)
    } catch { /* ignore */ }
  }, [])

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        className="btn-outline transition-transform duration-500 text-xl px-7 py-4 relative"
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-md animate-in zoom-in duration-200">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[28rem] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl z-[60] animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-gradient-to-r from-cyan-50 to-white px-4 py-3">
            <h3 className="font-bold text-slate-800">Notifications</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="text-xs text-cyan-600 hover:text-cyan-800" onClick={markAllAsRead}>
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                  Mark all read
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-80">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Clock className="h-5 w-5 animate-spin mr-2" />
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Bell className="h-10 w-10 mb-2 text-slate-200" />
                <span className="text-sm">No notifications yet</span>
              </div>
            ) : (
              notifications.map(n => {
                const Icon = typeIcon(n.type)
                const colorClass = typeColor(n.type)
                return (
                  <button
                    key={n.id}
                    className={cn(
                      'w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50',
                      !n.isRead && 'bg-cyan-50/30'
                    )}
                    onClick={() => !n.isRead && markAsRead(n.id)}
                  >
                    <div className="flex gap-3">
                      <div className={cn('flex-shrink-0 mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center', colorClass)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <span className={cn('text-sm font-semibold text-slate-800', !n.isRead && 'text-cyan-800')}>
                            {n.title}
                          </span>
                          {!n.isRead && (
                            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-cyan-500 mt-1.5" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                        <span className="text-[10px] text-slate-400 mt-1 block">{timeAgo(n.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
