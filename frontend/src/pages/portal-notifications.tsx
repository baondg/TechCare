"use client"

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react"
import { PatientLayout } from "@/components/patient-layout"
import { DoctorLayout } from "@/components/doctor-layout"
import { NurseLayout } from "@/components/nurse-layout"
import { TechnicianLayout } from "@/components/technician-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  NotificationTabbedList,
  type NotificationSortConfig,
  type NotificationSortKey,
} from "@/components/notification-tabbed-list"
import { getNotificationCategoryTypeLabel } from "@/lib/notification-categories"
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/services/notification-service"

type Portal = "patient" | "doctor" | "nurse" | "technician"

const Layouts: Record<Portal, ComponentType<{ children: ReactNode }>> = {
  patient: PatientLayout,
  doctor: DoctorLayout,
  nurse: NurseLayout,
  technician: TechnicianLayout,
}

function parseYmdLocal(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const dt = new Date(y, mo, d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function notificationTimeMs(n: AppNotification): number {
  const t = new Date(n.time).getTime()
  return Number.isNaN(t) ? 0 : t
}

function formatNotifDisplayTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" })
  } catch {
    return iso
  }
}

function NotificationsInner({ portal }: { portal: Portal }) {
  const Layout = Layouts[portal]
  const [items, setItems] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [filterColDate, setFilterColDate] = useState("")
  const [filterColType, setFilterColType] = useState("")
  const [filterColContent, setFilterColContent] = useState("")
  const [sortConfig, setSortConfig] = useState<NotificationSortConfig>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchNotifications()
      if (data.success) {
        setItems(data.notifications)
        setUnreadCount(data.unreadCount)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onRowClick = async (n: AppNotification) => {
    if (n.status === "read") return
    try {
      await markNotificationRead(n.id)
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: "read" } : x)))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      /* ignore */
    }
  }

  const onMarkAll = async () => {
    try {
      await markAllNotificationsRead()
      await load()
    } catch {
      /* ignore */
    }
  }

  const filteredItems = useMemo(() => {
    const fromRaw = dateFrom.trim()
    const toRaw = dateTo.trim()
    if (!fromRaw && !toRaw) return items

    let startMs: number | null = null
    let endMs: number | null = null
    if (fromRaw) {
      const d = parseYmdLocal(fromRaw)
      if (d) startMs = startOfLocalDay(d).getTime()
    }
    if (toRaw) {
      const d = parseYmdLocal(toRaw)
      if (d) endMs = endOfLocalDay(d).getTime()
    }
    if (startMs !== null && endMs !== null && startMs > endMs) {
      const t = startMs
      startMs = endMs
      endMs = t
    }

    return items.filter((n) => {
      const t = notificationTimeMs(n)
      if (startMs !== null && t < startMs) return false
      if (endMs !== null && t > endMs) return false
      return true
    })
  }, [items, dateFrom, dateTo])

  const columnFiltered = useMemo(() => {
    return filteredItems.filter((n) => {
      const dq = filterColDate.trim().toLowerCase()
      if (dq) {
        const timeStr = formatNotifDisplayTime(n.time).toLowerCase()
        const iso = String(n.time || "").toLowerCase()
        if (!timeStr.includes(dq) && !iso.includes(dq)) return false
      }
      const tq = filterColType.trim().toLowerCase()
      if (tq) {
        const typeLabel = getNotificationCategoryTypeLabel(n.type).toLowerCase()
        const raw = String(n.type || "").toLowerCase()
        if (!typeLabel.includes(tq) && !raw.includes(tq)) return false
      }
      const cq = filterColContent.trim().toLowerCase()
      if (cq) {
        if (!String(n.content || "").toLowerCase().includes(cq)) return false
      }
      return true
    })
  }, [filteredItems, filterColDate, filterColType, filterColContent])

  const sortedDisplay = useMemo(() => {
    if (!sortConfig) return columnFiltered
    const { key, direction } = sortConfig
    return [...columnFiltered].sort((a, b) => {
      if (key === "time") {
        const ta = notificationTimeMs(a)
        const tb = notificationTimeMs(b)
        if (ta === tb) return 0
        return direction === "asc" ? ta - tb : tb - ta
      }
      if (key === "type") {
        const va = getNotificationCategoryTypeLabel(a.type)
        const vb = getNotificationCategoryTypeLabel(b.type)
        return direction === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      const ca = a.content || ""
      const cb = b.content || ""
      return direction === "asc" ? ca.localeCompare(cb) : cb.localeCompare(ca)
    })
  }, [columnFiltered, sortConfig])

  const handleSort = (key: NotificationSortKey) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
      }
      return { key, direction: "asc" }
    })
  }

  return (
    <Layout>
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 md:px-6 md:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label htmlFor="notif-date-from" className="text-xs text-muted-foreground">
                From date
              </Label>
              <Input
                id="notif-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-[11.5rem] rounded-md border border-input bg-white text-sm text-slate-900 shadow-sm [color-scheme:light] dark:bg-white dark:text-slate-900"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="notif-date-to" className="text-xs text-muted-foreground">
                To date
              </Label>
              <Input
                id="notif-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 w-[11.5rem] rounded-md border border-input bg-white text-sm text-slate-900 shadow-sm [color-scheme:light] dark:bg-white dark:text-slate-900"
              />
            </div>
          </div>
          {unreadCount > 0 ? (
            <Button type="button" variant="outline" size="sm" className="h-9 w-fit shrink-0" onClick={() => void onMarkAll()}>
              Mark all read
            </Button>
          ) : null}
        </div>

        <Card className="border-2 border-cyan-200/70 shadow-lg shadow-slate-300/20 ring-1 ring-slate-200/70 dark:border-cyan-900/40 dark:ring-slate-700/80">
          <CardContent className="p-0">
            {loading ? (
              <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : (
              <NotificationTabbedList
                items={sortedDisplay}
                scrollAreaClassName="h-[min(72vh,620px)] min-h-[280px]"
                onRowClick={(n) => void onRowClick(n)}
                sortable
                sortConfig={sortConfig}
                onSort={handleSort}
                columnFilters={{
                  date: filterColDate,
                  type: filterColType,
                  content: filterColContent,
                  onDateChange: setFilterColDate,
                  onTypeChange: setFilterColType,
                  onContentChange: setFilterColContent,
                }}
                listMeta={{ apiTotal: items.length, afterDateCount: filteredItems.length }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

export function PatientPortalNotificationsPage() {
  return <NotificationsInner portal="patient" />
}

export function DoctorPortalNotificationsPage() {
  return <NotificationsInner portal="doctor" />
}

export function NursePortalNotificationsPage() {
  return <NotificationsInner portal="nurse" />
}

export function TechnicianPortalNotificationsPage() {
  return <NotificationsInner portal="technician" />
}
