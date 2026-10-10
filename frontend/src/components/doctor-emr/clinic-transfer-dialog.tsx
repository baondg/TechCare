import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowRightLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { doctorService } from "@/services/doctor-service"
import { appointmentService, type ClinicRoomOption } from "@/services/appointment-service"
import { translatePatientInDepartment } from "@/lib/patient-departments"

function roomDepartmentLabel(rooms: ClinicRoomOption[], roomId: string | null): string | null {
  if (!roomId) return null
  const r = rooms.find((x) => String(x.id) === roomId)
  if (!r) return null
  const n = r.departmentName?.trim()
  if (n) return n
  if (r.departmentId != null && Number.isFinite(Number(r.departmentId))) return `Department #${r.departmentId}`
  return "No department linked to this room"
}

/** Move the patient from today's check-in room to another clinic room. */
export function ClinicTransferDialog({
  open,
  onOpenChange,
  patientId,
  checkInRoom,
  visitLoading,
  onTransferred,
  showError,
  showSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  checkInRoom: { id: number; name: string } | null
  visitLoading: boolean
  onTransferred: () => Promise<void>
  showError: (message: string) => void
  showSuccess: (message: string) => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState("")
  const [note, setNote] = useState("")
  const [rooms, setRooms] = useState<ClinicRoomOption[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [toRoomId, setToRoomId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      setRoomsLoading(true)
      try {
        const list = await appointmentService.getClinicRooms()
        if (cancelled) return
        setRooms(list)
        const fromIdStr = checkInRoom ? String(checkInRoom.id) : ""
        if (list.length >= 2) {
          const other = list.find((r) => String(r.id) !== fromIdStr) ?? list[1]
          setToRoomId(String(other.id))
        } else if (list.length === 1) {
          setToRoomId(String(list[0].id))
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) setRooms([])
      } finally {
        if (!cancelled) setRoomsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, checkInRoom])

  const fromDepartment = roomDepartmentLabel(rooms, checkInRoom ? String(checkInRoom.id) : null)
  const toDepartment = roomDepartmentLabel(rooms, toRoomId)

  const submit = async () => {
    if (!reason.trim()) {
      showError("Reason is required.")
      return
    }
    const fromR = Number(checkInRoom?.id)
    const toR = Number(toRoomId)
    if (!Number.isFinite(fromR) || fromR <= 0) {
      showError("Could not determine the check-in room for this visit. Ask the nurse to confirm today’s appointment / check-in.")
      return
    }
    if (!Number.isFinite(toR) || toR <= 0) {
      showError("Select a destination room.")
      return
    }
    setSubmitting(true)
    try {
      await doctorService.createPatientTransfer(patientId, {
        kind: "clinic",
        reason: reason.trim(),
        note: note.trim() || undefined,
        fromRoomId: fromR,
        toRoomId: toR,
      })
      showSuccess("Transfer recorded.")
      await onTransferred()
      onOpenChange(false)
      setReason("")
      setNote("")
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not record transfer.")
    } finally {
      setSubmitting(false)
    }
  }

  const departmentNote = (label: string | null) =>
    label ? (
      <p className="text-sm text-slate-600 rounded-md border border-cyan-100 bg-cyan-50/60 px-3 py-2">
        <span className="text-slate-500">{t("doctor.patients.department")}: </span>
        <span className="font-medium text-slate-800">{translatePatientInDepartment(label, t)}</span>
      </p>
    ) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto p-6 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1">
          <DialogTitle>Transfer clinic</DialogTitle>
          <DialogDescription className="sr-only">
            Move the patient to another clinic room. From room reflects the nurse check-in slot for today.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <div className="space-y-4 py-1">
            <div className="grid gap-2">
              <Label htmlFor="tr-reason">
                Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="tr-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onInput={(e) => setReason((e.target as HTMLTextAreaElement).value)}
                onBlur={(e) => setReason(e.target.value)}
                rows={2}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tr-note">Clinical note (optional)</Label>
              <Textarea
                id="tr-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
                onBlur={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>
                  From room <span className="text-red-500">*</span>
                </Label>
                {visitLoading ? (
                  <p className="text-sm text-muted-foreground">Loading visit…</p>
                ) : checkInRoom ? (
                  <>
                    <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-foreground" aria-readonly="true">
                      {checkInRoom.name}
                    </div>
                    {departmentNote(fromDepartment)}
                  </>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
                    No check-in room on file for today. Clinic transfer needs the room from the nurse check-in slot.
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                <Label>
                  To room <span className="text-red-500">*</span>
                </Label>
                {roomsLoading ? null : (
                  <>
                    <Select value={toRoomId} onValueChange={setToRoomId}>
                      <SelectTrigger aria-required="true">
                        <SelectValue placeholder="Select room" />
                      </SelectTrigger>
                      <SelectContent>
                        {rooms.map((r) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {departmentNote(toDepartment)}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="btn-gradient gap-1"
            disabled={submitting || !checkInRoom}
            title={!checkInRoom ? "Check-in room is required for a clinic transfer" : undefined}
            onClick={() => void submit()}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
            Save transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
