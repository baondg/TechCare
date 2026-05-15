import { Search } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { getNotificationCategoryTypeLabel } from "@/lib/notification-categories"
import type { AppNotification } from "@/services/notification-service"

export type NotificationSortKey = "time" | "type" | "content"

export type NotificationSortConfig = {
  key: NotificationSortKey
  direction: "asc" | "desc"
} | null

export type NotificationColumnFilters = {
  date: string
  type: string
  content: string
  onDateChange: (value: string) => void
  onTypeChange: (value: string) => void
  onContentChange: (value: string) => void
}

/** Same gradient header as `prescription.tsx` history / medication tables. */
const TABLE_HEADER_GRADIENT =
  "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #06b6d4 100%)"

/** Strips backend-only dedupe suffixes so users do not see internal IDs. */
function displayNotificationBody(content: string | undefined): string {
  return String(content || "").replace(/\s*【appt:\d+】\s*$/u, "").trimEnd()
}

function formatNotifTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" })
  } catch {
    return iso
  }
}

function isUnreadStatus(status: string | undefined): boolean {
  return String(status || "").toLowerCase() === "unread"
}

function SortHeaderIcon({ column, sortConfig }: { column: NotificationSortKey; sortConfig: NotificationSortConfig }) {
  if (sortConfig?.key !== column) return <span className="ml-1 opacity-80">⇅</span>
  return <span className="ml-1">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
}

export function NotificationTabbedList({
  items,
  scrollAreaClassName,
  onRowClick,
  variant = "page",
  sortable = false,
  sortConfig = null,
  onSort,
  columnFilters,
  listMeta,
}: {
  items: AppNotification[]
  scrollAreaClassName: string
  onRowClick: (n: AppNotification) => void
  /** Popover: fixed max height so flex + overflow-y-auto actually scrolls. */
  variant?: "page" | "popover"
  /** Portal page: clickable column headers (same pattern as nurse patients table). */
  sortable?: boolean
  sortConfig?: NotificationSortConfig
  onSort?: (key: NotificationSortKey) => void
  /** Portal page: second header row — one search box per column (optional per field). */
  columnFilters?: NotificationColumnFilters
  /** For empty-state copy when column filters are enabled. */
  listMeta?: { apiTotal: number; afterDateCount: number }
}) {
  const rootClass =
    variant === "popover"
      ? "flex h-[min(calc(100dvh-7.25rem),456px)] max-h-[min(calc(100dvh-7.25rem),456px)] w-full min-h-0 flex-col overflow-hidden"
      : "flex min-h-0 flex-1 flex-col"

  const scrollClass =
    variant === "popover"
      ? cn(
          "min-h-0 flex-1 basis-0 overflow-y-auto overflow-x-auto overscroll-y-contain bg-slate-50/95 dark:bg-slate-900/50",
          "[scrollbar-width:thin] [scrollbar-color:rgb(148_163_184)_rgb(241_245_249)]",
          "[&::-webkit-scrollbar]:w-2",
          "[&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100 dark:[&::-webkit-scrollbar-track]:bg-slate-800",
          "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600",
        )
      : cn(
          "min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-y-contain bg-slate-50/95 dark:bg-slate-900/50",
          "[scrollbar-width:thin] [scrollbar-color:rgb(148_163_184)_rgb(241_245_249)]",
          "[&::-webkit-scrollbar]:w-2",
          "[&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100 dark:[&::-webkit-scrollbar-track]:bg-slate-800",
          "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600",
          scrollAreaClassName,
        )

  const showColumnSearch = Boolean(columnFilters)
  const showShell = showColumnSearch || items.length > 0

  const emptyMessage = (() => {
    if (items.length > 0) return null
    if (!showColumnSearch || !listMeta) return "No notifications yet."
    if (listMeta.apiTotal === 0) return "No notifications yet."
    if (listMeta.afterDateCount === 0) return "No notifications in the selected date range."
    return "No matching notifications. Try another column filter."
  })()

  return (
    <div className={rootClass}>
      <div className={scrollClass}>
        {!showShell ? (
          <p className="p-3 text-center text-xs text-muted-foreground">No notifications yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            <Table className="w-full table-fixed text-xs">
              <TableHeader className="sticky top-0 z-10">
                <TableRow
                  className="!cursor-default border-0 text-white hover:!bg-transparent data-[state=selected]:!bg-transparent"
                  style={{ background: TABLE_HEADER_GRADIENT }}
                >
                  <TableHead
                    className={cn(
                      "border-0 p-1.5 text-left text-[13px] font-semibold text-white shadow-none",
                      variant === "popover"
                        ? "w-[44%] min-w-[13.5rem] sm:min-w-[15rem]"
                        : "w-[20%] min-w-[9.5rem] lg:w-[18%]",
                      sortable && onSort && "cursor-pointer select-none transition hover:brightness-110",
                    )}
                    onClick={sortable && onSort ? () => onSort("time") : undefined}
                  >
                    Date
                    {sortable && onSort ? <SortHeaderIcon column="time" sortConfig={sortConfig} /> : null}
                  </TableHead>
                  <TableHead
                    className={cn(
                      "border-0 p-1.5 text-left text-[13px] font-semibold text-white shadow-none",
                      variant === "popover" ? "w-[14%] min-w-[3.25rem]" : "w-[30%] min-w-[12rem] lg:w-[28%]",
                      sortable && onSort && "cursor-pointer select-none transition hover:brightness-110",
                    )}
                    onClick={sortable && onSort ? () => onSort("type") : undefined}
                  >
                    Type
                    {sortable && onSort ? <SortHeaderIcon column="type" sortConfig={sortConfig} /> : null}
                  </TableHead>
                  <TableHead
                    className={cn(
                      "min-w-0 border-0 p-1.5 text-left text-[13px] font-semibold text-white shadow-none",
                      variant === "popover" ? "w-[42%]" : "w-[50%] lg:w-[54%]",
                      sortable && onSort && "cursor-pointer select-none transition hover:brightness-110",
                    )}
                    onClick={sortable && onSort ? () => onSort("content") : undefined}
                  >
                    Content
                    {sortable && onSort ? <SortHeaderIcon column="content" sortConfig={sortConfig} /> : null}
                  </TableHead>
                </TableRow>
                {columnFilters ? (
                  <TableRow className="border-b border-slate-200 bg-white hover:bg-white dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-950">
                    <TableHead className="p-1 align-middle">
                      <Label htmlFor="notif-col-date" className="sr-only">
                        Filter by date
                      </Label>
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <Search className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="notif-col-date"
                          value={columnFilters.date}
                          onChange={(e) => columnFilters.onDateChange(e.target.value)}
                          className="h-8 bg-white pr-8 text-xs text-slate-900 dark:bg-slate-950 dark:text-slate-100"
                          autoComplete="off"
                        />
                      </div>
                    </TableHead>
                    <TableHead className="p-1 align-middle">
                      <Label htmlFor="notif-col-type" className="sr-only">
                        Filter by type
                      </Label>
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <Search className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="notif-col-type"
                          value={columnFilters.type}
                          onChange={(e) => columnFilters.onTypeChange(e.target.value)}
                          className="h-8 bg-white pr-8 text-xs text-slate-900 dark:bg-slate-950 dark:text-slate-100"
                          autoComplete="off"
                        />
                      </div>
                    </TableHead>
                    <TableHead className="p-1 align-middle">
                      <Label htmlFor="notif-col-content" className="sr-only">
                        Filter by content
                      </Label>
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <Search className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="notif-col-content"
                          value={columnFilters.content}
                          onChange={(e) => columnFilters.onContentChange(e.target.value)}
                          className="h-8 bg-white pr-8 text-xs text-slate-900 dark:bg-slate-950 dark:text-slate-100"
                          autoComplete="off"
                        />
                      </div>
                    </TableHead>
                  </TableRow>
                ) : null}
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={3}
                      className="p-6 text-center text-xs text-muted-foreground"
                    >
                      {emptyMessage ?? "No notifications yet."}
                    </TableCell>
                  </TableRow>
                ) : null}
                {items.map((n) => {
                  const unread = isUnreadStatus(n.status)
                  const typeLabel = getNotificationCategoryTypeLabel(n.type)
                  return (
                    <TableRow
                      key={n.id}
                      aria-label={unread ? "Unread notification" : "Read notification"}
                      className={cn(
                        "cursor-pointer border-t border-slate-200 transition-colors odd:!bg-transparent even:!bg-transparent dark:border-slate-700",
                        unread
                          ? "!bg-cyan-50/95 dark:!bg-cyan-950/35"
                          : "!bg-white hover:!bg-slate-50 dark:!bg-slate-950 dark:hover:!bg-slate-900/50",
                      )}
                      onClick={() => onRowClick(n)}
                    >
                      <TableCell
                        className={cn(
                          "p-1.5 align-top leading-snug",
                          variant === "popover" ? "min-w-0" : "max-w-0",
                        )}
                      >
                        <span className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
                          {unread ? (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500 dark:bg-cyan-400"
                              aria-hidden
                            />
                          ) : (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />
                          )}
                          <span className="tabular-nums">{formatNotifTime(n.time)}</span>
                        </span>
                      </TableCell>
                      <TableCell className="max-w-0 p-1.5 align-top leading-snug">
                        <span
                          className={cn(
                            "block whitespace-nowrap font-semibold leading-tight",
                            unread ? "text-cyan-900 dark:text-cyan-100" : "text-slate-800 dark:text-slate-200",
                          )}
                          title={n.type?.trim() ? n.type : undefined}
                        >
                          {typeLabel}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-0 min-w-0 p-1.5 align-top leading-snug">
                        <span
                          className={cn(
                            "block break-words",
                            unread ? "font-medium text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300",
                          )}
                        >
                          {displayNotificationBody(n.content)}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
