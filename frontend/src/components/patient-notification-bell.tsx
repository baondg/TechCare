import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  fetchNotifications,
  markNotificationRead,
  type AppNotification,
} from '@/services/notification-service'

const POLL_MS = 60_000

function formatNotifTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function PatientNotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchNotifications()
      if (data.success) {
        setItems(data.notifications)
        setUnreadCount(data.unreadCount)
      }
    } catch {
      /* keep prior state; avoid toast spam on poll */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const onRowClick = async (n: AppNotification) => {
    if (n.status === 'read') return
    try {
      await markNotificationRead(n.id)
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, status: 'read' } : x)),
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      /* ignore */
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative btn-outline transition-transform duration-500 text-xl px-7 py-4"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(100vw-2rem,22rem)] p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold text-foreground">
          Notifications
          {loading && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">Loading…</span>
          )}
        </div>
        <ScrollArea className="h-[min(60vh,320px)]">
          {items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cn(
                      'w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-muted/80',
                      n.status === 'unread' && 'bg-cyan-50/80 dark:bg-cyan-950/30',
                    )}
                    onClick={() => void onRowClick(n)}
                  >
                    <div className="text-xs text-muted-foreground mb-1">
                      {formatNotifTime(n.time)}
                    </div>
                    <div className="text-foreground leading-snug whitespace-pre-wrap break-words">
                      {n.content}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
