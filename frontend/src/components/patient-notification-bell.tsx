import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NotificationTabbedList } from '@/components/notification-tabbed-list'
import {
  fetchNotifications,
  markNotificationRead,
  type AppNotification,
} from '@/services/notification-service'

const POLL_MS = 60_000

const PORTALS = new Set(['patient', 'doctor', 'nurse', 'technician'])

function portalFromPathname(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] ?? ''
  return PORTALS.has(seg) ? seg : 'patient'
}

export function PatientNotificationBell() {
  const { pathname } = useLocation()
  const notificationsHref = useMemo(() => `/${portalFromPathname(pathname)}/notifications`, [pathname])
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
      <PopoverContent
        align="end"
        className="flex max-h-[min(88vh,520px)] min-h-0 w-[min(100vw-1rem,32rem)] flex-col overflow-hidden border-2 border-cyan-200/90 bg-white p-0 shadow-xl shadow-slate-400/25 ring-1 ring-slate-300/60 dark:border-cyan-900/50 dark:bg-slate-950 dark:ring-slate-600/80 sm:w-[min(100vw-1.5rem,34rem)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/90 bg-linear-to-b from-slate-50 to-white px-2.5 py-1.5 dark:border-slate-700 dark:from-slate-900 dark:to-slate-950">
          <div className="text-xs font-semibold text-foreground">
            Notifications
            {loading && (
              <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">Loading…</span>
            )}
          </div>
          <Button variant="link" size="sm" className="h-auto p-0 text-[10px]" asChild>
            <Link to={notificationsHref} onClick={() => setOpen(false)}>
              View all
            </Link>
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {items.length === 0 && !loading ? (
            <p className="p-3 text-xs text-muted-foreground">No notifications yet.</p>
          ) : (
            <NotificationTabbedList
              variant="popover"
              items={items}
              scrollAreaClassName=""
              onRowClick={(n) => void onRowClick(n)}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
