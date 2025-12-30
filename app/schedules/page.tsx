"use client"


import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import dynamic from "next/dynamic"
import { format, parseISO } from "date-fns"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { schedulesApi, type CreateScheduleRequest, type Slot, type Schedule } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

// FullCalendar (client-only)
const FullCalendar = dynamic(() => import("@fullcalendar/react"), { ssr: false }) as any
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import { AppointmentDrawer } from "../../components/schedule/appointment-drawer"
import { RescheduleDrawer } from "@/components/schedule/reschedule-drawer"
import { X, Loader2 } from "lucide-react"
import { createPortal } from "react-dom"
import { color } from "html2canvas/dist/types/css/types/color"


export default function SchedulesPage() {
  const { toast } = useToast()
  // Schedule drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Appointment drawer open state (separate from schedule drawer)
  const [apptDrawerOpen, setApptDrawerOpen] = useState(false)
  // React Hook Form for dirty tracking (no schema)
  const { reset: formReset, setValue: setFormValue, formState: { isDirty } } = useForm<CreateScheduleRequest>({
    mode: "onChange",
    defaultValues: {
      start_date: "",
      end_date: "",
      start_time: "",
      end_time: "",
      slot_duration_minutes: 30,
      patients_per_slot: 1,
      location: "",
      days_of_week: [],
      recurring_interval_weeks: 1,
    },
  })

  const [appointments, setAppointments] = useState<any[]>([])
  const [allAppointments, setAllAppointments] = useState<any[]>([])

  // Core data/state for schedules/slots/calendar
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [scheduleDates, setScheduleDates] = useState<any[]>([])

  // Visible range for calendar and caching refs
  const [visibleFrom, setVisibleFrom] = useState<string | null>(null)
  const [visibleTo, setVisibleTo] = useState<string | null>(null)
  const monthDatesCacheRef = useRef<Map<string, any[]>>(new Map())
  const rangeSlotsCacheRef = useRef<Map<string, any[]>>(new Map())

  // Appointment drawer initial props (when opening drawer)
  const [apptInitialDate, setApptInitialDate] = useState<string | undefined>(undefined)
  const [apptInitialLocation, setApptInitialLocation] = useState<string | undefined>(undefined)
  const [apptInitialSlotId, setApptInitialSlotId] = useState<string | undefined>(undefined)
  const [apptInitialSlotTime, setApptInitialSlotTime] = useState<string | undefined>(undefined)
  const [apptInitialPatientIndex, setApptInitialPatientIndex] = useState<number | undefined>(undefined)

  // Various UI flags and form values used across the file
  const [creating, setCreating] = useState(false)
  const [updatingSchedule, setUpdatingSchedule] = useState(false)
  const [deletingSchedule, setDeletingSchedule] = useState(false)
  const [deletingAppointment, setDeletingAppointment] = useState(false)

  // Schedule editing form values
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [startTime, setStartTime] = useState<string>("00:00")
  const [endTime, setEndTime] = useState<string>("07:30")
  const [slotDuration, setSlotDuration] = useState<number>(30)
  const [patientsPerSlot, setPatientsPerSlot] = useState<number>(1)
  const [location, setLocation] = useState<string>("")
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>([])
  const [recurringIntervalWeeks, setRecurringIntervalWeeks] = useState<number>(1)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [operationScope, setOperationScope] = useState<"this_day" | "subsequent_days" | "later_days">("this_day")
  const [anchorDate, setAnchorDate] = useState<string>("")

  // Reschedule modal state
  const [rescheduleScheduleId, setRescheduleScheduleId] = useState<string | null>(null)
  const [rescheduleLocation, setRescheduleLocation] = useState<string>("")
  const [initialTotalToReschedule, setInitialTotalToReschedule] = useState<number>(0)
  const [remainingToReschedule, setRemainingToReschedule] = useState<number>(0)
  const [selectedRescheduleDate, setSelectedRescheduleDate] = useState<string>("")
  const [lastRescheduleResult, setLastRescheduleResult] = useState<any | null>(null)
  const [rescheduleScope, setRescheduleScope] = useState<"this_day" | "subsequent_days" | "later_days">("this_day")
  const [rescheduleAnchorDate, setRescheduleAnchorDate] = useState<string>("")
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false)
  const [availableDates, setAvailableDates] = useState<any[]>([])
  const [rescheduleLoading, setRescheduleLoading] = useState(false)

  // Remove cancelled / historical appointments from UI lists so slots only show active bookings
  const sanitizeAppointments = (list: any[] | undefined | null) => {
    if (!list || !Array.isArray(list)) return []
    return (list || []).filter((a: any) => {
      const status = String(a?.status || a?.state || a?.appointment_status || "").toUpperCase()
      // Exclude anything that looks like a cancellation so cancelled appointments don't re-appear in UI
      if (status.includes("CANCEL")) return false
      return true
    })
  }
  // Slot action menu state for booked slots
  const [slotMenuOpen, setSlotMenuOpen] = useState(false)
  const [slotMenuPos, setSlotMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [slotMenuSlotId, setSlotMenuSlotId] = useState<string | null>(null)
  const [slotMenuPatientIndex, setSlotMenuPatientIndex] = useState<number | null>(null)
  const [slotMenuPatientId, setSlotMenuPatientId] = useState<string | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirmDeleteReason, setConfirmDeleteReason] = useState<string | undefined>(undefined)
  const [confirmDeleteNotes, setConfirmDeleteNotes] = useState<string>("")
  const [confirmDeleteError, setConfirmDeleteError] = useState<string | undefined>(undefined)
  const [confirmDeleteSlot, setConfirmDeleteSlot] = useState<any | null>(null)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [reschedulePayload, setReschedulePayload] = useState<{ patient?: any; slot?: any; slotId?: string; patientId?: string | null } | null>(null)
  const [loadingAll, setLoadingAll] = useState(false)
  const [loadError, setLoadError] = useState<string>("")
  const [currentView, setCurrentView] = useState<string>("dayGridMonth")
  const [dayModalOpen, setDayModalOpen] = useState(false)
  const [dayModalDate, setDayModalDate] = useState<string>("")
  const [dayModalItems, setDayModalItems] = useState<Array<{ scheduleId: string; location: string; start: string; end: string }>>([])

  // Ensure the appointment drawer is never visible in month view. If the
  // view switches to `dayGridMonth` (including on initial load), close the
  // appointment drawer and clear any initial props so it does not persist.
  useEffect(() => {
    if (currentView === 'dayGridMonth') {
      setApptDrawerOpen(false)
      setApptInitialDate(undefined)
      setApptInitialLocation(undefined)
      setApptInitialSlotId(undefined)
      setApptInitialSlotTime(undefined)
    }
  }, [currentView])

  // On component mount (or reload), ensure any transient drawers/menus are
  // reset. This prevents a stale drawer from remaining open after a page
  // reload where the calendar view may default to month view.
  useEffect(() => {
    // Close appointment drawer and clear initial props
    setApptDrawerOpen(false)
    setApptInitialDate(undefined)
    setApptInitialLocation(undefined)
    setApptInitialSlotId(undefined)
    setApptInitialSlotTime(undefined)
    setApptInitialPatientIndex(undefined)

    // Close reschedule and delete confirmations
    setRescheduleOpen(false)
    setReschedulePayload(null)
    setConfirmDeleteOpen(false)
    setConfirmDeleteSlot(null)
    setSlotMenuOpen(false)
    setSlotMenuSlotId(null)
    setSlotMenuPatientIndex(null)
    setSlotMenuPatientId(null)
    // No cleanup required; this runs on mount only
  }, [])

  // Normalize slot object from backend to local Slot shape expected by the calendar
  const normalizeSlot = (s: any): Slot => {
    if (!s) return s as Slot
    const maxPatients = (s.max_patients ?? s.patients_per_slot ?? s.patientsPerSlot ?? s.capacity ?? 0) as number
    const currentPatients = (s.current_patients ?? s.currentPatients ?? s.filled_count ?? s.booked_count ?? s.occupied ?? 0) as number
    return {
      id: String(s.id ?? s.slot_id ?? s._id ?? ""),
      schedule_id: String(s.schedule_id ?? s.scheduleId ?? s.parent_schedule_id ?? ""),
      doctor_id: String(s.doctor_id ?? s.provider_id ?? s.doctorId ?? ""),
      date: s.date ?? s.day ?? s.slot_date ?? "",
      start_time: s.start_time ?? s.startTime ?? s.start ?? "",
      end_time: s.end_time ?? s.endTime ?? s.end ?? "",
      max_patients: Number(maxPatients || 0),
      current_patients: Number(currentPatients || 0),
      status: (s.status ?? s.state ?? "AVAILABLE") as any,
      location: s.location ?? s.place ?? s.clinic ?? "",
    }
  }

  // Try to resolve a location string for a given scheduleId on an anchor date.
  // Used when deleting schedules with reschedule requirements to find a location
  // associated with the anchored day. Falls back to searching scheduleDates,
  // slots, and schedules state. Returns null when not found.
  async function resolveLocationForAnchor(scheduleId: string, anchorISO: string): Promise<string | null> {
    try {
      // 1) Try scheduleDates (per-day overrides)
      const byDate = (scheduleDates || []).find((d: any) => String(d.schedule_id) === String(scheduleId) && d.date === anchorISO)
      if (byDate && byDate.location) return byDate.location

      // 2) Try slots for the anchor date
      const slotForDate = (slots || []).find((s: any) => String(s.schedule_id) === String(scheduleId) && s.date === anchorISO)
      if (slotForDate && slotForDate.location) return slotForDate.location

      // 3) Try schedules master list
      const sched = (schedules || []).find((s: any) => String(s.id) === String(scheduleId))
      if (sched && sched.location) return sched.location
    } catch (e) {
      // ignore and fallthrough to null
    }
    return null
  }

  // Auto-load all schedules (range data fetched via datesSet)
  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      setLoadingAll(true)
      setLoadError("")
      try {
        const list = await schedulesApi.list()
        if (cancelled) return
        setSchedules(list)
        const allSlots: Slot[] = []
        for (const s of list) {
          try {
            const sSlots = await schedulesApi.getSlotsForSchedule(s.id)
            if (cancelled) return
            // normalize incoming slots
            allSlots.push(...(sSlots || []).map(normalizeSlot))
          } catch (e) {
            // ignore per-schedule error to continue others
          }
        }
        if (cancelled) return
        setSlots(allSlots)
        // also try to fetch appointments for the current user so we can show patient names on booked slots
        try {
          const user = JSON.parse(localStorage.getItem("user") || "{}")
          const userId = user.id || user._id
          if (userId) {
            const appts = await (await import("@/lib/api")).appointmentsApi.getForUser(userId)
            if (!cancelled) {
              setAllAppointments(appts || [])
              setAppointments(sanitizeAppointments(appts || []))
              console.debug('[schedules] fetched appointments count', (appts || []).length)
              console.debug('[schedules] sample appointment (0):', (appts || [])[0])
            }
          }
        } catch (e) {
          // ignore appointments fetch errors
        }
      } catch (e: any) {
        console.error("Failed to load schedules:", e)
        setLoadError(e?.message || "Failed to fetch schedules")
        toast({
          title: "Error",
          description: e?.message || "Failed to fetch schedules",
          variant: "destructive",
        })
      } finally {
        if (!cancelled) setLoadingAll(false)
      }
    }
    loadAll()
    return () => { cancelled = true }
  }, [])

  // Expose a refresh function to reload schedules and slots
  async function refreshSlotsAndSchedules() {
    let cancelled = false
    setLoadingAll(true)
    try {
      const list = await schedulesApi.list()
      if (cancelled) return
      setSchedules(list)

      // Prefer a single range fetch for visible calendar window (if set) to avoid
      // N+1 per-schedule API calls. Fall back to per-schedule aggregation only if
      // the range endpoint fails or is unavailable.
      let allSlots: Slot[] = []
      try {
        if (visibleFrom && visibleTo) {
          const rangeSlots = await schedulesApi.getSlotsRange(visibleFrom, visibleTo)
          if (!cancelled) {
            allSlots = (rangeSlots || []).map(normalizeSlot)
            setSlots(allSlots)
          }
        } else {
          // no visible range, fallback to fetching per-schedule (legacy)
          const acc: Slot[] = []
          for (const s of list) {
            try {
              const sSlots = await schedulesApi.getSlotsForSchedule(s.id)
              if (cancelled) return
              acc.push(...(sSlots || []).map(normalizeSlot))
            } catch (e) {
              // continue
            }
          }
          if (!cancelled) setSlots(acc)
        }
      } catch (err) {
        // If range fetch fails, fallback to per-schedule aggregation
        console.warn('getSlotsRange failed in refreshSlotsAndSchedules, falling back to per-schedule fetch', err)
        const acc: Slot[] = []
        for (const s of list) {
          try {
            const sSlots = await schedulesApi.getSlotsForSchedule(s.id)
            if (cancelled) return
            acc.push(...(sSlots || []).map(normalizeSlot))
          } catch (e) {
            // continue
          }
        }
        if (!cancelled) setSlots(acc)
      }
      // refresh appointments too
      try {
        const user = JSON.parse(localStorage.getItem("user") || "{}")
        const userId = user.id || user._id
        if (userId) {
            const appts = await (await import("@/lib/api")).appointmentsApi.getForUser(userId)
            if (cancelled) return
            setAllAppointments(appts || [])
            setAppointments(sanitizeAppointments(appts || []))
        }
      } catch (e) {
        // ignore
      }
    } catch (e) {
      // ignore here
    } finally {
      if (!cancelled) setLoadingAll(false)
    }
  }

  // Helper: optimistic merge of visible-range schedule_dates and slots into caches/state
  async function optimisticMergeVisibleRangeData() {
    if (!visibleFrom || !visibleTo) return
    const [dates, rangeSlots] = await Promise.all([
      schedulesApi.getScheduleDatesRange(visibleFrom, visibleTo),
      schedulesApi.getSlotsRange(visibleFrom, visibleTo),
    ])

    const datesKey = `${visibleFrom}|${visibleTo}|month`
    monthDatesCacheRef.current.set(datesKey, [ ...(monthDatesCacheRef.current.get(datesKey) || []), ...(dates || []) ])
    // dedupe by id
    const mergedDates = (monthDatesCacheRef.current.get(datesKey) || []).reduce((acc: any[], d: any) => {
      if (!acc.find(x => x.id === d.id)) acc.push(d)
      return acc
    }, [])
    monthDatesCacheRef.current.set(datesKey, mergedDates)
    setScheduleDates(mergedDates)

    const slotsKey = `${visibleFrom}|${visibleTo}|slots`
    rangeSlotsCacheRef.current.set(slotsKey, [ ...(rangeSlotsCacheRef.current.get(slotsKey) || []), ...(rangeSlots || []) ])
    const mergedSlots = (rangeSlotsCacheRef.current.get(slotsKey) || []).reduce((acc: any[], s: any) => {
      if (!acc.find(x => String(x.id) === String(s.id))) acc.push(s)
      return acc
    }, [])
    rangeSlotsCacheRef.current.set(slotsKey, mergedSlots)
    setSlots(prev => {
      // merge into existing slots state, preferring new ones
      const map = new Map<string, any>()
      mergedSlots.forEach((s: any) => map.set(String(s.id), normalizeSlot(s)))
      prev.forEach((s: any) => { if (!map.has(String(s.id))) map.set(String(s.id), s) })
      return Array.from(map.values())
    })
  }

  // Ensure we capture a fresh snapshot for confirm delete drawer whenever it opens
  useEffect(() => {
    let cancelled = false
    if (!confirmDeleteOpen) return
      ; (async () => {
        try {
          // Reset any previous reason/notes/error immediately when opening
          setConfirmDeleteReason(undefined)
          setConfirmDeleteNotes("")
          setConfirmDeleteError(undefined)

          const targetSlotId = slotMenuSlotId
          if (!targetSlotId) {
            setConfirmDeleteSlot(null)
            return
          }

          // Try targeted refresh: prefer fetching the schedule that owns this slot
          let freshSlot = slots.find(s => String(s.id) === String(targetSlotId))
          const scheduleId = freshSlot?.schedule_id
          if (scheduleId) {
            try {
              const raw = await schedulesApi.getSlotsForSchedule(scheduleId)
              if (cancelled) return
              const normalized = (raw || []).map((s: any) => normalizeSlot(s))
              setSlots(prev => [...prev.filter(s => s.schedule_id !== scheduleId), ...normalized])
              const matched = (normalized || []).find((s: any) => String(s.id) === String(targetSlotId))
              if (matched) freshSlot = matched
            } catch (e) {
              // ignore per-schedule fetch error
            }
          } else {
            // fallback: refresh everything
            try { await refreshSlotsAndSchedules() } catch (e) { }
            freshSlot = slots.find(s => String(s.id) === String(targetSlotId)) || freshSlot
          }

          // Refresh appointments and capture the specific appointment for this slot/patient
          try {
            const user = JSON.parse(localStorage.getItem('user') || '{}')
            const userId = user.id || user._id
            if (userId) {
              const api = await import('@/lib/api')
              const appts = await api.appointmentsApi.getForUser(userId)
              if (cancelled) return
              const saneAppts = sanitizeAppointments(appts || [])
              setAllAppointments(appts || [])
              setAppointments(saneAppts)

              // Prefer matching by patient_id when available (slot can have multiple patients)
              let found: any = null
              if (slotMenuPatientId) {
                found = (saneAppts || []).find((a: any) => String(a.slot_id) === String(targetSlotId) && String(a.patient_id || a.patient?.id || a.patient?._id) === String(slotMenuPatientId)) || null
              }

              // Fallback: match by patientIndex if provided (use deterministic ordering)
              if (!found && typeof slotMenuPatientIndex === 'number') {
                const list = (saneAppts || []).filter((a: any) => String(a.slot_id) === String(targetSlotId))
                list.sort((x: any, y: any) => {
                  const tx = Date.parse(String(x?.created_at || x?.createdAt || x?.created || 0)) || 0
                  const ty = Date.parse(String(y?.created_at || y?.createdAt || y?.created || 0)) || 0
                  return tx - ty
                })
                found = list[slotMenuPatientIndex] || null
              }

              // Final fallback: most-recent appointment for this slot
              if (!found) {
                const list = (saneAppts || []).filter((a: any) => String(a.slot_id) === String(targetSlotId))
                if (list.length) {
                  list.sort((x: any, y: any) => {
                    const tx = Date.parse(String(x?.created_at || x?.createdAt || x?.created || 0)) || 0
                    const ty = Date.parse(String(y?.created_at || y?.createdAt || y?.created || 0)) || 0
                    return ty - tx
                  })
                  found = list[0]
                }
              }

              setConfirmDeleteSlot({ slotId: targetSlotId, slot: freshSlot, appointment: found })
              setConfirmDeleteReason(undefined)
              return
            }
          } catch (e) {
            // ignore
          }

          // final fallback: set snapshot from whatever we have locally
          const apptLocal = appointments.find(a => String(a.slot_id) === String(targetSlotId)) || null
          setConfirmDeleteSlot({ slotId: targetSlotId, slot: freshSlot, appointment: apptLocal })
          setConfirmDeleteReason(undefined)
        } catch (e) {
          // ignore
        }
      })()
    return () => { cancelled = true }
  }, [confirmDeleteOpen, slotMenuSlotId])

  // Clear delete snapshot and form when drawer closes to avoid stale data
  useEffect(() => {
    if (!confirmDeleteOpen) {
      setConfirmDeleteSlot(null)
      setConfirmDeleteReason(undefined)
      setConfirmDeleteNotes("")
      setConfirmDeleteError(undefined)
      setSlotMenuSlotId(null)
      setSlotMenuPatientIndex(null)
      setSlotMenuPatientId(null)
    }
  }, [confirmDeleteOpen])

  // Auto-close the slot action menu after 3 seconds to avoid it persisting
  useEffect(() => {
    if (!slotMenuOpen) return undefined
    const timer = setTimeout(() => {
      setSlotMenuOpen(false)
      setSlotMenuSlotId(null)
      setSlotMenuPatientIndex(null)
      setSlotMenuPatientId(null)
    }, 5000)
    return () => clearTimeout(timer)
  }, [slotMenuOpen])

  // Normalize time to HH:mm (backend may return HH:MM:SS)
  function normalizeTime(t?: string) {
    if (!t) return "00:00"
    // Expect formats like HH:MM or HH:MM:SS
    const parts = t.split(":")
    if (parts.length >= 2) {
      return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`
    }
    return t
  }

  // Handlers extracted from lengthy inline onClick callbacks
  async function handleDeleteScheduleClick() {
    if (!isEditing || !editingScheduleId) return
    setDeletingSchedule(true)
    try {
      await schedulesApi.delete(editingScheduleId!, { scope: operationScope, anchor_date: anchorDate })
      setDrawerOpen(false)
      toast({ title: "Deleted", description: "Schedule deleted successfully", duration: 2000 })
      await refreshAll()
    } catch (e: any) {
      let code: string | undefined
      let message: string | undefined
      let bookedCount: number | undefined
      if (typeof e?.message === "string") {
        try {
          const parsed = JSON.parse(e.message)
          if (parsed && typeof parsed === "object") {
            code = (parsed as any).code
            message = (parsed as any).message
            bookedCount = (parsed as any).booked_appointments_count || (parsed as any).booked_slots_count
          }
        } catch { /* ignore */ }
      }
      const detail = e?.response?.data?.detail
      if (!code && typeof detail === "object") code = (detail as any)?.code
      if (!message && typeof detail === "object") message = (detail as any)?.message
      if (!bookedCount && typeof detail === "object") bookedCount = (detail as any)?.booked_appointments_count || (detail as any)?.booked_slots_count

      if (code === "RESCHEDULE_REQUIRED") {
        const loc = await resolveLocationForAnchor(editingScheduleId!, anchorDate)
        if (loc) {
          openRescheduleModal(editingScheduleId!, loc, bookedCount || 0, operationScope, anchorDate)
        } else {
          toast({ title: "Error", description: message || "Location not found for rescheduling", variant: "destructive", duration: 2000 })
        }
      } else {
        toast({ title: "Error", description: message || e?.message || "Failed to delete schedule", variant: "destructive", duration: 2000 })
      }
    } finally {
      setDeletingSchedule(false)
    }
  }

  async function handleUpdateScheduleClick() {
    if (!editingScheduleId) return
    setUpdatingSchedule(true)
    try {
      const payload: Partial<CreateScheduleRequest> = {
        start_time: startTime,
        end_time: endTime,
        slot_duration_minutes: slotDuration,
        patients_per_slot: patientsPerSlot,
        days_of_week: daysOfWeek,
        recurring_interval_weeks: recurringIntervalWeeks,
      }
      const res = await schedulesApi.update(editingScheduleId, payload, { scope: operationScope, anchor_date: anchorDate })
      const updated = (res as any)?.schedule as Schedule | undefined
      const regenerated = (res as any)?.slots as Slot[] | undefined
      if (updated) {
        setSchedules(prev => prev.map(s => (s.id === updated.id ? updated : s)))
      }
      if (regenerated) {
        setSlots(prev => [
          ...prev.filter(s => s.schedule_id !== editingScheduleId),
          ...regenerated,
        ])
      }
      // Optimistically merge visible-range data so month view doesn't briefly lose events after update
      try {
        await optimisticMergeVisibleRangeData()
      } catch (e) {
        // ignore optimistic merge errors and fall back to full refresh
      }
      await refreshAll()
      setDrawerOpen(false)
      toast({ title: "Updated", description: "Schedule updated successfully", duration: 2000 })
    } catch (e: any) {
      let code: string | undefined
      let message: string | undefined
      let bookedCount: number | undefined
      if (typeof e?.message === "string") {
        try {
          const parsed = JSON.parse(e.message)
          if (parsed && typeof parsed === "object") {
            code = (parsed as any).code
            message = (parsed as any).message
            bookedCount = (parsed as any).booked_appointments_count || (parsed as any).booked_slots_count
          }
        } catch { /* ignore */ }
      }
      const detail = e?.response?.data?.detail
      if (!code && typeof detail === "object") code = (detail as any)?.code
      if (!message && typeof detail === "object") message = (detail as any)?.message
      if (!bookedCount && typeof detail === "object") bookedCount = (detail as any)?.booked_appointments_count || (detail as any)?.booked_slots_count

      if (code === "RESCHEDULE_REQUIRED") {
        const loc = await resolveLocationForAnchor(editingScheduleId!, anchorDate)
        if (loc) {
          openRescheduleModal(editingScheduleId!, loc, bookedCount || 0, operationScope, anchorDate)
        } else {
          toast({ title: "Error", description: message || "Location not found for rescheduling", variant: "destructive", duration: 2000 })
        }
      } else if (code === "RESCHEDULE_REQUIRED_SHRINK_NOT_ALLOWED") {
        toast({
          title: "Cannot shrink schedule",
          description: message || "Cannot shrink date/time while appointments exist. Extend or reschedule instead.",
          variant: "destructive",
        })
      } else if (code === "RESCHEDULE_REQUIRED_RULES_CHANGE_NOT_ALLOWED") {
        toast({
          title: "Change not allowed",
          description: message || "Cannot change slot duration or capacity when appointments already exist. Create a new schedule extension instead.",
          variant: "destructive",
        })
      } else {
        toast({ title: "Error", description: message || e?.message || "Failed to update schedule", variant: "destructive", duration: 2000 })
      }
    } finally {
      setUpdatingSchedule(false)
    }

  }

  function handleDayModalSelect(item: { scheduleId: string; location: string; start: string; end: string }) {
    const schedule = schedules.find(s => s.id === item.scheduleId)
    setLocation(item.location)
    setStartTime(item.start)
    setEndTime(item.end)
    if (schedule) {
      setStartDate(schedule.start_date)
      setEndDate(schedule.end_date)
      setSlotDuration(schedule.slot_duration_minutes)
      setPatientsPerSlot(schedule.patients_per_slot)
      setDaysOfWeek(schedule.days_of_week)
      setRecurringIntervalWeeks(schedule.recurring_interval_weeks)
    }
    setEditingScheduleId(item.scheduleId)
    setIsEditing(true)
    setDayModalOpen(false)
    setDrawerOpen(true)
  }

  async function handleSlotMenuReschedule() {
    if (currentView === "dayGridMonth") {
      toast({ title: 'Reschedule unavailable', description: 'Reschedule is only available in weekly and daily calendar views', variant: 'destructive' })
      return
    }
    setSlotMenuOpen(false)
    try {
      const s = slots.find(x => x.id === slotMenuSlotId)
      if (!slotMenuPatientId) {
        toast({ title: 'Missing patient id', description: 'Cannot determine appointment without patient id', variant: 'destructive' })
        return
      }
      setReschedulePayload({ patient: undefined, slot: s, slotId: slotMenuSlotId || undefined, patientId: slotMenuPatientId })
      setRescheduleOpen(true)
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to open reschedule', variant: 'destructive' })
    }
  }

  

  async function handleConfirmDeleteAppointmentClick() {
    setConfirmDeleteError(undefined)
    setDeletingAppointment(true)
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      const userId = user.id || user._id
      if (!userId) {
        toast({ title: "Not authorized", description: "Please login to manage appointments", variant: "destructive" })
        return
      }
      const api = await import('@/lib/api')
      const freshAppts = await api.appointmentsApi.getForUser(userId)
      const saneAppts = sanitizeAppointments(freshAppts || [])
      let freshAppt: any = null
      if (slotMenuPatientId) {
        freshAppt = saneAppts.find((a: any) => String(a.slot_id) === String(slotMenuSlotId) && String(a.patient_id || a.patient?.id || a.patient?._id) === String(slotMenuPatientId)) || null
      }
      if (!freshAppt && typeof slotMenuPatientIndex === 'number') {
        const list = (saneAppts || []).filter((a: any) => String(a.slot_id) === String(slotMenuSlotId))
        list.sort((x: any, y: any) => {
          const tx = Date.parse(String(x?.created_at || x?.createdAt || x?.created || 0)) || 0
          const ty = Date.parse(String(y?.created_at || y?.createdAt || y?.created || 0)) || 0
          return tx - ty
        })
        freshAppt = list[slotMenuPatientIndex] || null
      }
      if (!freshAppt) {
        const list = (saneAppts || []).filter((a: any) => String(a.slot_id) === String(slotMenuSlotId))
        if (list.length) {
          list.sort((x: any, y: any) => {
            const tx = Date.parse(String(x?.created_at || x?.createdAt || x?.created || 0)) || 0
            const ty = Date.parse(String(y?.created_at || y?.createdAt || y?.created || 0)) || 0
            return ty - tx
          })
          freshAppt = list[0]
        }
      }
      if (!freshAppt) {
        toast({ title: "Not found", description: "Appointment not found for this slot (it may have been removed)", variant: "destructive" })
        await refreshSlotsAndSchedules()
        setConfirmDeleteOpen(false)
        setSlotMenuSlotId(null)
        return
      }
      const status = (freshAppt.status || freshAppt.state || freshAppt.appointment_status || '').toString().toUpperCase()
      if (!(status === 'BOOKED' || status === 'RESCHEDULED')) {
        toast({ title: "Cannot delete", description: `Appointment status is ${status || 'unknown'}. Only BOOKED or RESCHEDULED appointments can be cancelled.`, variant: "destructive" })
        await refreshSlotsAndSchedules()
        setConfirmDeleteOpen(false)
        setSlotMenuSlotId(null)
        return
      }
      if (!confirmDeleteReason) {
        setConfirmDeleteError('Please select a cancellation reason')
        return
      }
      const payload: any = {
        patient_id: freshAppt.patient_id || freshAppt.patient?.id || freshAppt.patient?._id,
        slot_id: freshAppt.slot_id || slotMenuSlotId,
        reason: confirmDeleteReason
      }
      if (confirmDeleteNotes && confirmDeleteNotes.trim() !== '') payload.notes = confirmDeleteNotes.trim()
      const apptId = freshAppt._id || freshAppt.id || freshAppt.appointment_id
      await api.appointmentsApi.cancel(apptId, payload)
      toast({ title: "Deleted", description: "Appointment cancelled successfully", duration: 2000 })
      setConfirmDeleteOpen(false)
      setSlotMenuSlotId(null)
      // Remove only the canceled appointment from the active appointments list
      setAppointments(prev => (prev || []).filter(a => String(a._id || a.id || a.appointment_id) !== String(apptId)))
      // Immediately add the cancelled appointment to the allAppointments (historical) list
      try {
        const cancelledSnapshot = { ...(freshAppt || {}), status: 'CANCELLED' }
        setAllAppointments(prev => {
          const arr = (prev || []).slice()
          const getId = (a: any) => String(a?._id || a?.id || a?.appointment_id || '')
          const idx = arr.findIndex(a => getId(a) === String(apptId))
          if (idx >= 0) {
            arr[idx] = cancelledSnapshot
          } else {
            // If we don't find a matching appointment, append as fallback
            arr.push(cancelledSnapshot)
          }
          return arr
        })
        // Force a quick slots state clone to trigger `events` recompute immediately
        setSlots(prev => (prev || []).slice())
        // DEBUG: dump appointment lists to help trace UI update issues (temporary)
        try { console.debug('[DEBUG][cancel] appointments-after:', (appointments || []).map(a => ({ id: a._id||a.id||a.appointment_id, slot_id: a.slot_id, status: a.status }))) } catch(e){ }
        try { console.debug('[DEBUG][cancel] allAppointments-after:', (allAppointments || []).map(a => ({ id: a._id||a.id||a.appointment_id, slot_id: a.slot_id, status: a.status }))) } catch(e){ }
      } catch (e) {
        // ignore non-critical UI update errors
      }
      // Refresh server state in background to ensure consistency
      await refreshSlotsAndSchedules()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message || "Could not cancel appointment", variant: "destructive", duration: 2000 })
    }
    finally {
      setDeletingAppointment(false)
    }
  }

  // Reschedule functions
  async function refreshAll() {
    setLoadingAll(true)
    setLoadError("")
    try {
      const list = await schedulesApi.list()
      setSchedules(list)
      if (visibleFrom && visibleTo) {
        try {
          const [dates, rangeSlots] = await Promise.all([
            schedulesApi.getScheduleDatesRange(visibleFrom, visibleTo),
            schedulesApi.getSlotsRange(visibleFrom, visibleTo),
          ])
          setScheduleDates(dates)
          setSlots(rangeSlots)
        } catch (e) {}
      }
    } catch (e: any) {
      console.error("Failed to refresh schedules:", e)
      setLoadError(e?.message || "Failed to fetch schedules")
      toast({
        title: "Error",
        description: e?.message || "Failed to fetch schedules",
        variant: "destructive",
      })
    } finally {
      setLoadingAll(false)
    }
  }
  async function openRescheduleModal(
    scheduleId: string,
    location: string,
    totalToReschedule: number,
    scope: "this_day" | "subsequent_days" | "later_days",
    anchor: string
  ) {
    setRescheduleScheduleId(scheduleId)
    setRescheduleLocation(location)
    setInitialTotalToReschedule(totalToReschedule)
    setRemainingToReschedule(totalToReschedule)
    setSelectedRescheduleDate("")
    setLastRescheduleResult(null)
    setRescheduleScope(scope)
    setRescheduleAnchorDate(anchor)
    setRescheduleModalOpen(true)
    
    // Fetch available dates
    await loadAvailableDates(scheduleId, location)
  }

  async function loadAvailableDates(scheduleId: string, location: string) {
    try {
      // Use the schedule's start date instead of today's date
      // const schedule = schedules.find(s => s.id === scheduleId)
      const fromDate = new Date().toISOString().split('T')[0]
      const dates = await schedulesApi.getDatesWithSlots(location, fromDate, 30, scheduleId)
      setAvailableDates(dates)
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to load available dates",
        variant: "destructive",
      })
    }
  }

  async function handleBulkReschedule() {
    if (!rescheduleScheduleId || !selectedRescheduleDate || !rescheduleLocation) return
    
    setRescheduleLoading(true)
    try {
      const result = await schedulesApi.bulkReschedule(
        rescheduleScheduleId,
        selectedRescheduleDate,
        rescheduleLocation,
        { scope: rescheduleScope, anchor_date: rescheduleAnchorDate }
      )
      
      // Update remaining count
      setRemainingToReschedule(result.remainingCount)
      
      // Store last result for display
      setLastRescheduleResult({
        rescheduledCount: result.rescheduledCount,
        conflicts: result.conflicts
      })
      
      // Refresh available dates to remove filled dates
      await loadAvailableDates(rescheduleScheduleId, rescheduleLocation)
      
      // Clear selection if the selected date is no longer available
      const stillAvailable = availableDates.some(d => d.date === selectedRescheduleDate && d.available_slots > 0)
      if (!stillAvailable) {
        setSelectedRescheduleDate("")
      }
      
      // Show success message
      toast({
        title: "Reschedule successful",
        description: `Moved ${result.rescheduledCount} appointments. ${result.remainingCount} remaining.`,
      })
      
      // If conflicts occurred, show warning
      if (result.conflicts.length > 0) {
        toast({
          title: "Some conflicts occurred",
          description: `${result.conflicts.length} appointments could not be moved due to conflicts.`,
          variant: "destructive",
        })
      }
      // Refresh calendar data after reschedule
      await refreshAll()
      
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to reschedule appointments",
        variant: "destructive",
      })
    } finally {
      setRescheduleLoading(false)
    }
  }

  function closeRescheduleModal() {
    if (remainingToReschedule > 0) {
      // Ask for confirmation if there are still appointments to reschedule
      if (confirm(`You still have ${remainingToReschedule} appointments to reschedule. Are you sure you want to close?`)) {
        setRescheduleModalOpen(false)
        setRescheduleScheduleId(null)
        setRescheduleLocation("")
        setInitialTotalToReschedule(0)
        setRemainingToReschedule(0)
        setSelectedRescheduleDate("")
        setAvailableDates([])
        setLastRescheduleResult(null)
      }
    } else {
      // All appointments rescheduled, close modal
      setRescheduleModalOpen(false)
      setRescheduleScheduleId(null)
      setRescheduleLocation("")
      setInitialTotalToReschedule(0)
      setRemainingToReschedule(0)
      setSelectedRescheduleDate("")
      setAvailableDates([])
      setLastRescheduleResult(null)
    }
  }

  // Map slots/schedule_dates to FullCalendar events
  const events = useMemo(() => {
  const events: any[] = []
  // preserve insertion order for FullCalendar by attaching a numeric `order`
  // property to each event and instructing FullCalendar to use it via
  // the `eventOrder` option. This prevents FullCalendar from falling back
  // to alphabetical ordering by title when multiple events share the same
  // start/end times (common for stacked slot events).
  let orderCounter = 0

    if (currentView === "dayGridMonth") {
      // Month view: show one event per schedule_date
      scheduleDates.forEach(d => {
        const st = normalizeTime(d.start_time)
        const et = normalizeTime(d.end_time)
        events.push({
          id: d.id,
          title: `${d.location} ${st}-${et}`,
          start: `${d.date}T${st}:00`,
          end: `${d.date}T${et}:00`,
          order: orderCounter++,
          backgroundColor: "#dcfce7",
          borderColor: "#dcfce7",
          textColor: "#166534",
          extendedProps: {
            scheduleId: d.schedule_id,
            scheduleDateId: d.id,
            location: d.location,
            date: d.date,
            start_time: st,
            end_time: et,
          }
        })
      })
    } else {
      // Week/Day view: show individual patient slots
      // Build lookup maps for appointments per slot_id.
      // We prefer explicit `patient_index` when available so bookings target exact partitions.
      const apptBySlot = new Map<string, any[]>()
      const apptBySlotByIndex = new Map<string, Map<number, any>>()
        ; (appointments || []).forEach((a: any) => {
          const key = String(a.slot_id)
          const list = apptBySlot.get(key) || []
          list.push(a)
          apptBySlot.set(key, list)
          // if appointment carries an explicit patient_index, index it
          const idx = (typeof a.patient_index === 'number') ? a.patient_index : (typeof a.patientIndex === 'number' ? a.patientIndex : undefined)
          if (typeof idx === 'number') {
            const map = apptBySlotByIndex.get(key) || new Map<number, any>()
            map.set(idx, a)
            apptBySlotByIndex.set(key, map)
          }
        })

  // Also keep a map including cancelled/historical appointments so we can display them (struck-through)
      const apptBySlotAll = new Map<string, any[]>()
        ; (allAppointments || []).forEach((a: any) => {
          const key = String(a.slot_id)
          const list = apptBySlotAll.get(key) || []
          list.push(a)
          apptBySlotAll.set(key, list)
        })
      // deterministic ordering
      apptBySlotAll.forEach((list, key) => {
        list.sort((x: any, y: any) => {
          const tx = Date.parse(String(x?.created_at || x?.createdAt || x?.created || 0)) || 0
          const ty = Date.parse(String(y?.created_at || y?.createdAt || y?.created || 0)) || 0
          return tx - ty
        })
        apptBySlotAll.set(key, list)
      })
  console.debug('[schedules] built apptBySlotAll map, keys:', Array.from(apptBySlotAll.keys()).slice(0,10))

      // Ensure deterministic ordering per-slot so patientIndex maps are stable.
      // Sort by creation time (created_at / createdAt) ascending so older appointments appear first.
      apptBySlot.forEach((list, key) => {
        list.sort((x: any, y: any) => {
          const tx = Date.parse(String(x?.created_at || x?.createdAt || x?.created || 0)) || 0
          const ty = Date.parse(String(y?.created_at || y?.createdAt || y?.created || 0)) || 0
          return tx - ty
        })
        apptBySlot.set(key, list)
      })

      slots.forEach(s => {
        const st = normalizeTime(s.start_time)
        const et = normalizeTime(s.end_time)
        // style per-slot event based on slot.status and occupancy
        const baseColors = { backgroundColor: "#dcfce7", borderColor: "#dcfce7", textColor: "#166534" }
        if (s.status === "FULL") {
          baseColors.backgroundColor = "#fee2e2" // red-100
          baseColors.borderColor = "#fecaca"
          baseColors.textColor = "#991b1b"
        } else if (s.status === "BLOCKED") {
          baseColors.backgroundColor = "#f3f4f6" // gray-100
          baseColors.borderColor = "#e5e7eb"
          baseColors.textColor = "#374151"
        }

        // Handle blocked slots - show one "BLOCKED" event for the entire slot
        if (s.status === "BLOCKED") {
          events.push({
            id: `${s.id}-blocked`,
            title: "BLOCKED",
            start: `${s.date}T${st}:00`,
            end: `${s.date}T${et}:00`,
            order: orderCounter++,
            backgroundColor: baseColors.backgroundColor,
            borderColor: baseColors.borderColor,
            textColor: baseColors.textColor,
            extendedProps: {
              slotId: s.id,
              patientIndex: null,
              patientId: undefined,
              appointmentId: undefined,
              status: "BLOCKED",
              location: s.location,
              scheduleId: s.schedule_id,
              isBlocked: true
            }
          })
        } else {
          // Handle normal slots
          // Determine occupancy per patient position by checking whether
          // there is an appointment present for that index. This is
          // necessary when slots can have multiple patient positions
          // and the simple s.current_patients count isn't sufficient to
          // determine which exact indices are occupied.

          // Get active appointments (live) and all/historical appointments for this slot
          const apptsForSlotRaw = apptBySlot.get(String(s.id)) || []
          const apptsForSlotByIndex = apptBySlotByIndex.get(String(s.id)) || new Map<number, any>()
          const apptsAllForSlot = apptBySlotAll.get(String(s.id)) || []

          // Build an active sequence: start with live appointments, but also merge
          // any non-cancelled entries from the historical list that may not have
          // propagated into the live `appointments` yet (handles race where add
          // succeeded server-side but local `appointments` hasn't refreshed).
          const isCancelledAppt = (a: any) => !!(a && String((a.status || a.state || a.appointment_status || '').toString().toUpperCase()).includes('CANCEL'))
          const getApptId = (a: any) => String(a?._id || a?.id || a?.appointment_id || '')
          const apptsForSlot: any[] = (apptsForSlotRaw || []).slice()
          try {
            for (const a of apptsAllForSlot) {
              if (!isCancelledAppt(a) && !apptsForSlot.find(x => getApptId(x) === getApptId(a))) {
                apptsForSlot.push(a)
              }
            }
            // deterministic order by creation time
            apptsForSlot.sort((x: any, y: any) => {
              const tx = Date.parse(String(x?.created_at || x?.createdAt || x?.created || 0)) || 0
              const ty = Date.parse(String(y?.created_at || y?.createdAt || y?.created || 0)) || 0
              return tx - ty
            })
          } catch (e) {
            // ignore merge errors
          }

          const indicesAvailable: number[] = []
          const indicesOccupied: number[] = []
          const indicesCancelled: number[] = []
          // Classify each patient position into one of three groups:
          // - available (no appointment present)
          // - occupied (appointment present and NOT cancelled)
          // - cancelled (appointment present but cancelled)
          for (let i = 0; i < (s.max_patients || 0); i++) {
            const apptForIndex = apptsForSlot[i] || null
            const apptAllForIndex = apptsAllForSlot[i] || null
            const candidate = apptForIndex || apptAllForIndex || null
            const isCancelled = !!(candidate && String((candidate.status || candidate.state || candidate.appointment_status || '').toString().toUpperCase()).includes('CANCEL'))
            const isOccupied = !!candidate && !isCancelled
            if (isOccupied) indicesOccupied.push(i)
            else if (candidate && isCancelled) indicesCancelled.push(i)
            else indicesAvailable.push(i)
          }

          // Render order: available first, occupied next, cancelled last.
          // Putting cancelled indices last makes them top-most so clicks
          // on a cancelled patient-slot will target the cancelled event
          // (and open the add-appointment drawer) instead of falling
          // through to an occupied overlay from another index.
          const indices = [...indicesAvailable, ...indicesOccupied, ...indicesCancelled]
          // If slot supports multiple patients, create a single composite event
          const maxPartitions = Math.max(1, Math.min(3, s.max_patients || 1))
          if ((s.max_patients || 0) > 1) {
            const boxes: any[] = []
            const apptAllIsCancelled = (a: any) => !!(a && String((a.status || a.state || a.appointment_status || '').toString().toUpperCase()).includes('CANCEL'))
            const getId = (a: any) => String(a?._id || a?.id || a?.appointment_id || '')


            const usedAppointmentIds = new Set<string>()
            // Determine the most-recent cancelled appointment for this slot (if any)
            const cancelledCandidates = (apptsAllForSlot || []).filter(a => apptAllIsCancelled(a))
            let latestCancelledOverall: any = null
            if (cancelledCandidates.length) {
              cancelledCandidates.sort((x: any, y: any) => {
                const tx = Date.parse(String(x?.created_at || x?.createdAt || x?.created || 0)) || 0
                const ty = Date.parse(String(y?.created_at || y?.createdAt || y?.created || 0)) || 0
                return ty - tx
              })
              latestCancelledOverall = cancelledCandidates[0]
            }
            let cancelledShown = false
            for (let idx = 0; idx < maxPartitions; idx++) {
              // Prefer explicit patient_index-mapped appointment when present
              const apptIndexed = apptsForSlotByIndex.get(idx) || null
              const apptAllIndexed = apptsAllForSlot.find((a:any) => (typeof a.patient_index === 'number' && a.patient_index === idx)) || null

              // Also derive by deterministic ordering as fallback
              let apptForIndex = apptsForSlot[idx] || null
              let apptAllForIndex = apptsAllForSlot[idx] || null
              // If a positional appointment carries an explicit patient_index that
              // does not match this idx, ignore it here — explicit indices should
              // only be applied to their declared partition.
              if (apptForIndex && typeof apptForIndex.patient_index === 'number' && apptForIndex.patient_index !== idx) apptForIndex = null
              if (apptAllForIndex && typeof apptAllForIndex.patient_index === 'number' && apptAllForIndex.patient_index !== idx) apptAllForIndex = null

              // Prefer live active appointment for this exact index, with preference order:
              // 1) explicit indexed live appt, 2) explicit indexed historical appt (non-cancelled),
              // 3) positional appt from merged list (apptsForSlot), 4) positional historical appt
              let active = apptIndexed || null
              if (!active && apptAllIndexed && !apptAllIsCancelled(apptAllIndexed)) active = apptAllIndexed
              if (!active && apptForIndex) active = apptForIndex
              if (!active && apptAllForIndex && !apptAllIsCancelled(apptAllForIndex)) active = apptAllForIndex

              const lastCancelled = (apptAllForIndex && apptAllIsCancelled(apptAllForIndex)) ? apptAllForIndex : null

              // Avoid assigning the same appointment to multiple boxes. If this
              // appointment id has already been used for another partition, skip
              // it and fall through to other fallbacks.
              const activeId = getId(active)
              if (active && activeId && usedAppointmentIds.has(activeId)) {
                active = null
              }

              // DEBUG: when diagnosing partition mismatch for specific slot/time,
              // print relevant context to console. Limit to the suspected slot
              // date/time (2025-09-23 13:30) to avoid noisy logs in production.
              try {
                const debugTargetDate = '2025-09-23'
                const debugTargetStart = '13:30'
                if (String(s.date) === debugTargetDate && st === debugTargetStart) {
                  console.debug('[composite-debug] slotId', s.id, 'idx', idx, 'maxPartitions', maxPartitions)
                  console.debug('[composite-debug] apptsForSlotRaw', apptsForSlotRaw)
                  console.debug('[composite-debug] apptsAllForSlot', apptsAllForSlot)
                  console.debug('[composite-debug] apptsForSlotByIndex map', Array.from(apptsForSlotByIndex.entries()))
                  console.debug('[composite-debug] apptsForSlot (merged sorted)', apptsForSlot)
                  console.debug('[composite-debug] latestCancelledOverall', latestCancelledOverall)
                  console.debug('[composite-debug] active (selected for this idx)', active)
                }
              } catch (e) { /* ignore debug errors */ }

              // If there is a latest cancelled appointment for the slot, it must
              // be shown only at partition index 0. For idx > 0 we should not
              // render cancelled names — show only booked name or AVL.
              if (idx === 0 && latestCancelledOverall && !cancelledShown) {
                const cancelledIdOverall = getId(latestCancelledOverall)
                const fn = latestCancelledOverall.firstname || latestCancelledOverall.patient?.firstname || ''
                const ln = latestCancelledOverall.lastname || latestCancelledOverall.patient?.lastname || ''
                const cancelledName = `${fn} ${ln}`.trim() || 'Cancelled'
                if (active && !usedAppointmentIds.has(getId(active))) {
                  // Show cancelled name on left and booked overlay on right.
                  // Store cancelledName separately so overlay uses the active booking's name.
                  const afn = active.firstname || active.patient?.firstname || ''
                  const aln = active.lastname || active.patient?.lastname || ''
                  boxes.push({
                    patientIndex: idx,
                    // overlay title should show the active (booked) patient's name
                    title: `${afn} ${aln}`.trim() || 'Booked',
                    // keep flag so rendering knows there's a cancelled name to the left
                    cancelledName: cancelledName,
                    status: 'BOOKED',
                    isCancelled: true,
                    appointmentId: getId(active) || undefined,
                    cancelledAppointmentId: cancelledIdOverall || undefined,
                    // ensure we expose the active booking's patient id for click handling
                    patientId: (active.patient_id || active.patient?.id || active.patient?._id) || undefined,
                    // also expose cancelled patient's id for completeness
                    cancelledPatientId: (latestCancelledOverall.patient_id || latestCancelledOverall.patient?.id || latestCancelledOverall.patient?._id) || undefined,
                  })
                  const aid = getId(active)
                  if (aid) usedAppointmentIds.add(aid)
                  if (cancelledIdOverall) usedAppointmentIds.add(cancelledIdOverall)
                  cancelledShown = true
                  continue
                } else {
                  // Show cancelled as AVAILABLE overlay when no active booking on idx 0
                  boxes.push({
                    patientIndex: idx,
                    // overlay title in this case remains the cancelled name (visual bottom layer),
                    // and status AVAILABLE will make the right overlay show AVL
                    title: cancelledName,
                    cancelledName: cancelledName,
                    status: 'AVAILABLE',
                    isCancelled: true,
                    appointmentId: cancelledIdOverall || undefined,
                    // expose cancelled patient's id so clicks can identify the patient
                    patientId: (latestCancelledOverall.patient_id || latestCancelledOverall.patient?.id || latestCancelledOverall.patient?._id) || undefined,
                  })
                  if (cancelledIdOverall) usedAppointmentIds.add(cancelledIdOverall)
                  cancelledShown = true
                  continue
                }
              }

              if (active) {
                const fn = active.firstname || active.patient?.firstname || ''
                const ln = active.lastname || active.patient?.lastname || ''
                boxes.push({
                  patientIndex: idx,
                  title: `${fn} ${ln}`.trim() || 'Booked',
                  status: 'BOOKED',
                  isCancelled: false,
                  appointmentId: getId(active) || undefined,
                  patientId: (active.patient_id || active.patient?.id || active.patient?._id) || undefined,
                })
                const idAdded = getId(active)
                if (idAdded) usedAppointmentIds.add(idAdded)
              } else {
                // Empty partition: AVAILABLE
                boxes.push({
                  patientIndex: idx,
                  title: 'AVL',
                  status: 'AVAILABLE',
                  isCancelled: false,
                  appointmentId: undefined,
                  patientId: undefined,
                })
              }
            }
            // create single composite event
            events.push({
              id: `${s.id}-composite`,
              title: '',
              start: `${s.date}T${st}:00`,
              end: `${s.date}T${et}:00`,
              order: orderCounter++,
              backgroundColor: baseColors.backgroundColor,
              borderColor: baseColors.borderColor,
              textColor: baseColors.textColor,
              extendedProps: {
                composite: true,
                boxes,
                slotId: s.id,
                slot_id: s.id,
                scheduleId: s.schedule_id,
                location: s.location,
              }
            })
          } else {
            // single-patient slots: retain original per-index behavior
            for (const i of indices) {
              const apptForIndex = apptsForSlot[i] || null
              const apptAllForIndex = apptsAllForSlot[i] || null

              // Find cancelled appointment for this specific index.
              // For single-patient slots, pick the most-recent cancelled in the full list
              let lastCancelled = null
              const apptAllIsCancelled = (a: any) => !!(a && String((a.status || a.state || a.appointment_status || '').toString().toUpperCase()).includes('CANCEL'))
              if ((s.max_patients || 0) <= 1) {
                lastCancelled = (apptsAllForSlot || []).slice().reverse().find((a: any) => apptAllIsCancelled(a)) || null
              } else {
                lastCancelled = (apptAllForIndex && apptAllIsCancelled(apptAllForIndex)) ? apptAllForIndex : null
              }

              const active = apptForIndex || null
              const currentIsBooked = !!active

              if (lastCancelled) {
                const fn = lastCancelled.firstname || lastCancelled.patient?.firstname || ""
                const ln = lastCancelled.lastname || lastCancelled.patient?.lastname || ""
                const name = `${fn} ${ln}`.trim() || 'Cancelled'
                events.push({
                  id: `${s.id}-${i}-cancelled`,
                  title: name,
                  start: `${s.date}T${st}:00`,
                  end: `${s.date}T${et}:00`,
                  classNames: ['appt-cancelled', 'appt-cancelled-bottom'],
                  backgroundColor: '#f3f4f6',
                  borderColor: '#e5e7eb',
                  textColor: '#374151',
                  order: orderCounter++,
                  extendedProps: {
                    slotId: s.id,
                    patientIndex: i,
                    patientId: (lastCancelled.patient_id || lastCancelled.patient?.id) || undefined,
                    appointmentId: lastCancelled._id || lastCancelled.id || undefined,
                    isCancelled: true,
                    status: 'CANCELLED',
                    location: s.location,
                    scheduleId: s.schedule_id
                  }
                })
              }

              if (currentIsBooked) {
                const fn = active.firstname || active.patient?.firstname || ""
                const ln = active.lastname || active.patient?.lastname || ""
                const name = `${fn} ${ln}`.trim()
                const display = name || 'Booked'
                events.push({
                  id: `${s.id}-${i}`,
                  title: display,
                  start: `${s.date}T${st}:00`,
                  end: `${s.date}T${et}:00`,
                  order: orderCounter++,
                  classNames: undefined,
                  backgroundColor: baseColors.backgroundColor,
                  borderColor: baseColors.borderColor,
                  textColor: baseColors.textColor,
                  extendedProps: {
                    slotId: s.id,
                    patientIndex: i,
                    patientId: (active.patient_id || active.patient?.id) || undefined,
                    appointmentId: active._id || active.id || active.appointment_id || undefined,
                    isCancelled: false,
                    isOverlayForCancelled: !!lastCancelled,
                    status: 'BOOKED',
                    location: s.location,
                    scheduleId: s.schedule_id
                  }
                })
              } else {
                events.push({
                  id: `${s.id}-${i}-overlay`,
                  title: 'AVL',
                  start: `${s.date}T${st}:00`,
                  end: `${s.date}T${et}:00`,
                  classNames: ['appt-available-overlay'],
                  backgroundColor: '#dcfce7',
                  borderColor: '#dcfce7',
                  textColor: '#166534',
                  order: orderCounter++,
                  extendedProps: {
                    slotId: s.id,
                    patientIndex: i,
                    patientId: undefined,
                    appointmentId: undefined,
                    isCancelled: false,
                    isOverlayForCancelled: !!lastCancelled,
                    status: 'AVAILABLE',
                    location: s.location,
                    scheduleId: s.schedule_id
                  }
                })
              }
            }
          }
        }
      })
    }

    return events
  }, [slots, currentView,appointments, allAppointments, scheduleDates])

  async function handleCreateSchedule() {
    if (!startDate || !endDate || !location || !recurringIntervalWeeks || recurringIntervalWeeks < 1 || recurringIntervalWeeks > 52 || daysOfWeek.length === 0) return
    setCreating(true)
    try {
      const payload: CreateScheduleRequest = {
        start_date: startDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        slot_duration_minutes: slotDuration,
        patients_per_slot: patientsPerSlot,
        location,
        days_of_week: daysOfWeek,
        recurring_interval_weeks: recurringIntervalWeeks,
      }
      const res = await schedulesApi.create(payload)
      const created = (res as any)?.schedule as Schedule | undefined  
      const genSlots = (res as any)?.slots as Slot[] | undefined

      if (created) {
        setSchedules(prev => [created, ...prev])
      }

      // Always try to fetch slots for the created schedule to ensure we have the latest data
      let fetched: Slot[] = []
      try {
        if (created?.id) {
          const raw = await schedulesApi.getSlotsForSchedule(created.id)
          fetched = (raw || []).map(normalizeSlot)
        }
      } catch (e) {
        // ignore fetch error but keep genSlots if provided
      }

      // normalize generated slots if provided
      const normalizedGen = (genSlots || []).map(normalizeSlot)
      const slotsToAdd = (fetched && fetched.length) ? fetched : (normalizedGen && normalizedGen.length ? normalizedGen : [])
      if (slotsToAdd.length) {
        setSlots(prev => [...slotsToAdd, ...prev])
      }

      // Force calendar refresh
      setSlots(prev => [...prev])
      // Ensure server state is in sync
      // Optimistically merge visible-range data so month view doesn't briefly lose events
      try {
        if (visibleFrom && visibleTo) {
          const [dates, rangeSlots] = await Promise.all([
            schedulesApi.getScheduleDatesRange(visibleFrom, visibleTo),
            schedulesApi.getSlotsRange(visibleFrom, visibleTo),
          ])
          const datesKey = `${visibleFrom}|${visibleTo}|month`
          monthDatesCacheRef.current.set(datesKey, [ ...(monthDatesCacheRef.current.get(datesKey) || []), ...(dates || []) ])
          // dedupe by id
          const mergedDates = (monthDatesCacheRef.current.get(datesKey) || []).reduce((acc: any[], d: any) => {
            if (!acc.find(x => x.id === d.id)) acc.push(d)
            return acc
          }, [])
          monthDatesCacheRef.current.set(datesKey, mergedDates)
          setScheduleDates(mergedDates)

          const slotsKey = `${visibleFrom}|${visibleTo}|slots`
          rangeSlotsCacheRef.current.set(slotsKey, [ ...(rangeSlotsCacheRef.current.get(slotsKey) || []), ...(rangeSlots || []) ])
          const mergedSlots = (rangeSlotsCacheRef.current.get(slotsKey) || []).reduce((acc: any[], s: any) => {
            if (!acc.find(x => String(x.id) === String(s.id))) acc.push(s)
            return acc
          }, [])
          rangeSlotsCacheRef.current.set(slotsKey, mergedSlots)
          setSlots(prev => {
            // merge into existing slots state, preferring new ones
            const map = new Map<string, any>()
            mergedSlots.forEach((s: any) => map.set(String(s.id), normalizeSlot(s)))
            prev.forEach((s: any) => { if (!map.has(String(s.id))) map.set(String(s.id), s) })
            return Array.from(map.values())
          })
        }
      } catch (e) {
        // ignore optimistic merge errors and fall back to full refresh
      }
      await refreshAll()
      setDrawerOpen(false)
      console.log("Schedule created; slots added:", slotsToAdd.length)
      toast({
        title: "Success",
        description: `Schedule created successfully`,
      })
    } catch (e: any) {
      // Provide a clearer message for duplicate/transaction write conflicts
      const detail = (e?.response?.data?.detail as any) ?? e?.message ?? ""
      const detailStr = typeof detail === "string" ? detail : JSON.stringify(detail)
      const isDuplicate = /WriteConflict|TransientTransactionError|duplicate/i.test(detailStr) ||
        (typeof e?.code === "number" && e?.code === 112)

      if (isDuplicate) {
        toast({
          title: "Duplicate schedule",
          description: "A schedule with the same settings already exists. Try changing dates, days, or time.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Error",
          description: e?.message || "Failed to create schedule",
          variant: "destructive",
        })
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="relative p-6 space-y-4 flex-1">
      {/* Loading Overlay */}
      {loadingAll && (
        <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center">
          <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-xl shadow-lg border">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            <span className="text-gray-700 font-medium">Loading schedules...</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Schedules</h1>
        <div className="flex items-center">
          {currentView !== "dayGridMonth" && (
            <AppointmentDrawer
              open={apptDrawerOpen}
              initialDate={apptInitialDate}
              initialLocation={apptInitialLocation}
              initialSlotId={apptInitialSlotId}
              initialSlotTime={apptInitialSlotTime}
              initialPatientIndex={apptInitialPatientIndex}
              side={currentView === "dayGridMonth" ? "left" : "right"}
              onOpenChange={(v) => { if (!v) { setApptInitialDate(undefined); setApptInitialLocation(undefined); setApptInitialSlotId(undefined); setApptInitialSlotTime(undefined); setApptInitialPatientIndex(undefined) } setApptDrawerOpen(v) }}
              onBooked={(createdAppt?: any) => {
                try {
                  if (!createdAppt || !createdAppt.slot_id) {
                    refreshSlotsAndSchedules()
                    return
                  }

                  // Ensure we have an id to dedupe; if backend didn't provide one yet,
                  // create a lightweight client id to avoid duplicate insertion and flicker.
                  const appt = { ...(createdAppt || {}) } as any
                  if (!appt._id && !appt.id && !appt.appointment_id) {
                    appt.__client_id = `cli-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
                  }
                  const slotIdStr = String(appt.slot_id)
                  const apptIdKey = String(appt._id || appt.id || appt.appointment_id || appt.__client_id || '')
                  const pidx = (typeof appt.patient_index === 'number') ? appt.patient_index : (typeof appt.patientIndex === 'number' ? appt.patientIndex : undefined)

                  // Merge the appointment into local arrays first so occupancy checks use merged view
                  setAllAppointments(prev => {
                    const prevArr = prev || []
                    const exists = prevArr.find(a => String(a._id || a.id || a.appointment_id || a.__client_id || '') === apptIdKey)
                    if (exists) return prevArr
                    return [appt, ...prevArr]
                  })

                  setAppointments(prev => {
                    const prevArr = prev || []
                    const exists = prevArr.find(a => String(a._id || a.id || a.appointment_id || a.__client_id || '') === apptIdKey)
                    const merged = exists ? prevArr.slice() : [appt, ...prevArr]
                    return sanitizeAppointments(merged)
                  })

                  // Now rebuild the apptBySlotByIndex map from the merged appointments snapshot (use latest appointments state variable if available)
                  const mergedSnapshot = (appointments || []).slice()
                  // The `appointments` state may not reflect the immediate setState above yet; include the new appt manually to be safe.
                  const snapshotWithNew = (() => {
                    const found = mergedSnapshot.find(a => String(a._id || a.id || a.appointment_id || a.__client_id || '') === apptIdKey)
                    if (found) return mergedSnapshot
                    return [appt, ...mergedSnapshot]
                  })()

                  const apptBySlotByIndex = new Map<string, Map<number, any>>()
                  snapshotWithNew.forEach((a:any) => {
                    const key = String(a.slot_id)
                    const idx = (typeof a.patient_index === 'number') ? a.patient_index : (typeof a.patientIndex === 'number' ? a.patientIndex : undefined)
                    if (typeof idx === 'number') {
                      const map = apptBySlotByIndex.get(key) || new Map<number, any>()
                      map.set(idx, a)
                      apptBySlotByIndex.set(key, map)
                    }
                  })

                  const slotIndexMap = apptBySlotByIndex.get(slotIdStr) || new Map<number, any>()
                  const targetOccupied = (typeof pidx === 'number') ? slotIndexMap.has(pidx) : false

                  // Update slot occupancy only when target index was previously unoccupied in merged view
                  if (!targetOccupied) {
                    setSlots(prev => {
                      return (prev || []).map(s => {
                        if (String(s.id) !== slotIdStr) return s
                        const copy = { ...s }
                        if ((copy.current_patients || 0) < (copy.max_patients || 0)) copy.current_patients = (copy.current_patients || 0) + 1
                        return copy
                      })
                    })
                  }

                  // Background reconciliation
                  setTimeout(() => { refreshSlotsAndSchedules() }, 800)
                } catch (e) {
                  refreshSlotsAndSchedules()
                }
              }}
            />
          )}
          <Button onClick={() => {
            // Reset form for new schedule
            setStartDate("")
            setEndDate("")
            setStartTime("")
            setEndTime("")
            setSlotDuration(30)
            setPatientsPerSlot(1)
            setLocation("")
            setDaysOfWeek([])
            setRecurringIntervalWeeks(1)
            setEditingScheduleId("")
            setIsEditing(false)
            setDrawerOpen(true)
          }}>Add Schedule</Button>
        </div>
      </div>

      <div className="rounded-md border bg-white p-3">
        {typeof window !== "undefined" && (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: "prev today next", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
            buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
            allDayText={'all-day'}
            height="auto"
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            scrollTime="00:00:00"
              events={events}
              eventOrder="order"
              eventContent={(arg: any) => {
                try {
                  const ep = arg.event.extendedProps || {}
                  // Composite event (multi-patient slot) rendering
                  if (ep && ep.composite && Array.isArray(ep.boxes)) {
                    const boxes = ep.boxes as any[]
                    const containerStyle: any = { display: 'flex', width: '100%', height: '100%', alignItems: 'stretch' }
                    return (
                      <div className="fc-event-composite" style={containerStyle}>
                        {boxes.map((b, idx) => {
                          const status = (b.status || '').toString().toUpperCase()
                          const isCancelled = !!b.isCancelled
                          const boxClass = `composite-box ${status === 'BOOKED' ? 'box-booked' : (status === 'AVAILABLE' ? 'box-available' : '')} ${isCancelled ? 'box-cancelled' : ''}`
                          const style: any = {
                            flex: `1 1 ${100 / Math.max(1, boxes.length)}%`,
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'stretch',
                            padding: '0',
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            position: 'relative',
                            borderLeft: idx === 0 ? 'none' : '1px solid rgba(0,0,0,0.06)'
                          }
                          // left cancelled name (if any) and right overlay
                          // `cancelledName` may be stored separately from `title` so the
                          // overlay can show the active (booked) patient's name while
                          // the left side shows the most-recent cancelled name.
                          const cancelledName = b.cancelledName || (isCancelled ? (b.title || 'Cancelled') : null)
                          const overlayStatus = status === 'BOOKED' ? 'BOOKED' : (status === 'AVAILABLE' ? 'AVAILABLE' : status)

                          // left area width when cancelled name exists (reserve ~20%)
                          const leftStyle: any = cancelledName ? { flex: '0 0 20%', display: 'flex', alignItems: 'center', padding: '0 6px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', background: '#f3f4f6' } : { display: 'none' }

                          // right overlay fills remaining space; if no cancelled name, it uses full width
                          const rightStyle: any = {
                            flex: '1 1 0%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 6px',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            boxSizing: 'border-box',
                            borderLeft: cancelledName ? '1px solid rgba(0,0,0,0.02)' : 'none'
                          }
                          const overlayBg = overlayStatus === 'BOOKED' ? ep.backgroundColor || '#fee2e2' : '#dcfce7'
                          rightStyle.background = overlayBg

                          // When cancelled name exists and overlay is AVAILABLE, visually shrink overlay to ~80% by constraining left area
                          // (left reserved 20% + right fills remaining ~80%) — using flex ensures no overlap.

                          return (
                            <div key={String(idx)} className={boxClass} style={style}>
                              {cancelledName ? (
                                <div style={leftStyle} aria-hidden>
                                  <span style={{ textDecoration: 'line-through', color: '#374151', opacity: 0.95, fontWeight: 600, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cancelledName}</span>
                                </div>
                              ) : null}
                              <div
                                role="button"
                                tabIndex={0}
                                data-slot-id={String(ep.slotId || ep.slot_id || '')}
                                data-patient-index={String(b.patientIndex ?? idx)}
                                data-status={overlayStatus}
                                data-appointment-id={String(b.appointmentId || '')}
                                data-patient-id={String(b.patientId || '')}
                                className="composite-box-overlay"
                                style={rightStyle}
                              >
                                <span style={{ display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: overlayStatus === 'BOOKED' ? 600 : 500 }}>{overlayStatus === 'BOOKED' ? (b.title || 'Booked') : (overlayStatus === 'AVAILABLE' ? 'AVL' : (b.title || ''))}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  }

                  // Fallback: single-event rendering (existing behavior)
                  const isCancelled = !!ep?.isCancelled
                  const title = arg.event.title || ''
                  const baseStyle: any = {
                    display: 'block',
                    width: '100%',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }
                  if (isCancelled) {
                    return (
                      <div className="fc-event-custom-title" style={baseStyle}>
                        <span style={{ textDecoration: 'line-through', color: '#4b5563', opacity: 0.95, fontWeight: 600 }}>{title}</span>
                      </div>
                    )
                  }
                  return (
                    <div className="fc-event-custom-title" style={baseStyle}>
                      <span style={{ color: undefined }}>{title}</span>
                    </div>
                  )
                } catch (e) {
                  return null
                }
              }}
              eventDidMount={(arg: any) => {
                try {
                  const ep = arg.event.extendedProps || {}
                  const cancelled = !!ep?.isCancelled
                  const isOverlayForCancelled = !!ep?.isOverlayForCancelled
                  const isComposite = !!ep?.composite
                  // Apply stronger styling directly to the event element as a fallback
                  const el = (arg.el as HTMLElement)
                  if (!el) return
                  if (cancelled && !isComposite) {
                    // set background/border to muted gray and enforce text color/strike
                    el.style.backgroundColor = '#f3f4f6'
                    el.style.borderColor = '#e5e7eb'
                    el.style.opacity = '1'
                    // ensure css target class present
                    el.classList.add('appt-cancelled')
                    // try to find inner title span and set styles
                    const inner = el.querySelector('.fc-event-custom-title span') as HTMLElement | null
                    if (inner) {
                      inner.style.textDecoration = 'line-through'
                      inner.style.color = '#374151'
                      inner.style.opacity = '0.95'
                      inner.style.fontWeight = '600'
                    }
                  }
                  // If this event is an AVAILABLE overlay for a cancelled appointment and
                  // it's NOT a composite (single-patient) event, make it narrower and right-aligned.
                  if (isOverlayForCancelled && !isComposite) {
                    // add helper class for css control
                    el.classList.add('appt-available-overlay-for-cancelled')
                    // make sure overlay sits above cancelled bottom event
                    el.style.zIndex = '3'

                    // Anchor overlay to the right and let it expand leftwards so it
                    // overlaps most of the cancelled pill (visually right->left).
                    el.style.position = 'absolute'
                    el.style.top = '0'
                    el.style.bottom = '0'
                    el.style.right = '0'
                    el.style.left = 'auto'
                    el.style.width = '140%'
                    el.style.boxSizing = 'border-box'

                    // ensure the inner title fills the overlay and is aligned centered
                    const inner = el.querySelector('.fc-event-custom-title') as HTMLElement | null
                    if (inner) {
                      inner.style.width = '100%'
                      inner.style.textAlign = 'center'
                      inner.style.paddingLeft = '0.4rem'
                      inner.style.paddingRight = '0.4rem'
                    }
                  }
                  // For composite events, ensure overlay children are clickable and sit above cancelled name
                  if (isComposite) {
                    const overlays = el.querySelectorAll('.composite-box-overlay') as NodeListOf<HTMLElement>
                    overlays.forEach(o => {
                      o.style.zIndex = '3'
                      o.style.pointerEvents = 'auto'
                    })
                  }
                } catch (e) {
                  // ignore
                }
              }}
            eventDisplay="block"
            datesSet={(arg: any) => {
              const viewType = arg?.view?.type
              setCurrentView(viewType)
              const from = arg?.view?.currentStart as Date | undefined
              const to = arg?.view?.currentEnd as Date | undefined
              if (from && to) {
                // For month view, extend the range to include all visible days (including trailing days)
                let fromISO = from.toISOString().slice(0,10)
                let toISO = to.toISOString().slice(0,10)
                
                if (viewType === "dayGridMonth") {
                  // Get the actual visible start and end dates including trailing days
                  const visibleStart = arg?.view?.activeStart as Date | undefined
                  const visibleEnd = arg?.view?.activeEnd as Date | undefined
                  if (visibleStart && visibleEnd) {
                    fromISO = visibleStart.toISOString().slice(0,10)
                    toISO = visibleEnd.toISOString().slice(0,10)
                  }
                }
                
                setVisibleFrom(fromISO)
                setVisibleTo(toISO)
                ;(async () => {
                  try {
                    // Always prepare both datasets for the visible range so view switches are instant
                    const datesKey = `${fromISO}|${toISO}|month`
                    const slotsKey = `${fromISO}|${toISO}|slots`

                    // Fetch schedule_dates if not cached
                    if (monthDatesCacheRef.current.has(datesKey)) {
                      setScheduleDates(monthDatesCacheRef.current.get(datesKey) || [])
                    } else {
                      const dates = await schedulesApi.getScheduleDatesRange(fromISO, toISO)
                      monthDatesCacheRef.current.set(datesKey, dates)
                      setScheduleDates(dates)
                    }

                    // Fetch slots if not cached
                    if (rangeSlotsCacheRef.current.has(slotsKey)) {
                      setSlots(rangeSlotsCacheRef.current.get(slotsKey) || [])
                    } else {
                      const rangeSlots = await schedulesApi.getSlotsRange(fromISO, toISO)
                      rangeSlotsCacheRef.current.set(slotsKey, rangeSlots)
                      setSlots(rangeSlots)
                    }
                  } catch (e) {
                    toast({ title: "Error", description: (e as any)?.message || "Failed to load calendar data", variant: "destructive" })
                  }
                })()
              }
            }}
            eventClick={async (info: any) => {
              const props = info?.event?.extendedProps || {}
              // Month view: existing behavior to open schedule-day editor
              if (currentView === "dayGridMonth") {
              const scheduleId = props?.scheduleId as string | undefined
              if (!scheduleId) return
              const schedule = schedules.find(s => s.id === scheduleId)
              const start = info?.event?.start as Date | null
              // Prefer per-day fields from schedule_date (extendedProps)
              const dayStart = (props.start_time as string) || (start ? start.toTimeString().slice(0,5) : "")
              const dayEnd = (props.end_time as string) || (info?.event?.end ? (info.event.end as Date).toTimeString().slice(0,5) : "")
              const dayLoc = (props.location as string) || schedule?.location || ""
              const dayDate = (props.date as string) || (start ? start.toISOString().slice(0,10) : "")

              // Anchor is clicked date
              setOperationScope("this_day")
              setAnchorDate(dayDate)

              // Recurring fields from schedule (unchanged model fields)
              if (schedule) {
                setStartDate(schedule.start_date)
                setEndDate(schedule.end_date)
                setDaysOfWeek(schedule.days_of_week)
                setRecurringIntervalWeeks(schedule.recurring_interval_weeks)
              }

              // Per-day fields from schedule_date
              setStartTime(dayStart)
              setEndTime(dayEnd)
              setLocation(dayLoc)


              // Try to fetch a representative slot for this schedule so we can prefill
              // accurate duration and patients-per-slot values (slot may include slot_duration_minutes and max_patients)
              let resolvedSlotDuration = schedule?.slot_duration_minutes ?? slotDuration
              let resolvedPatientsPerSlot = schedule?.patients_per_slot ?? patientsPerSlot
              try {
                const rawSlots = await schedulesApi.getSlotsForSchedule(scheduleId)
                const firstRaw = (rawSlots && rawSlots.length) ? rawSlots[0] : null
                if (firstRaw) {
                  // prefer explicit fields from the raw slot response (use any to allow multiple possible shapes)
                  const rawAny = firstRaw as any
                  const sd = rawAny.slot_duration_minutes ?? rawAny.duration_minutes ?? rawAny.slot_duration ?? undefined
                  // map max_patients -> patients_per_slot; also accept other possible keys
                  const mp = rawAny.max_patients ?? rawAny.patients_per_slot ?? rawAny.capacity ?? undefined
                  if (sd !== undefined && sd !== null) resolvedSlotDuration = Number(sd)
                  if (mp !== undefined && mp !== null) resolvedPatientsPerSlot = Number(mp)
                }
              } catch (e) {
                // ignore slot fetch errors and fall back to schedule values
              }

              // Keep existing durations if available on schedule; otherwise use resolved values
              setSlotDuration(resolvedSlotDuration)
              setPatientsPerSlot(resolvedPatientsPerSlot)

              formReset({
                start_date: schedule?.start_date || "",
                end_date: schedule?.end_date || "",
                start_time: dayStart || "",
                end_time: dayEnd || "",
                slot_duration_minutes: resolvedSlotDuration,
                patients_per_slot: resolvedPatientsPerSlot,
                location: dayLoc || "",
                days_of_week: schedule ? [...schedule.days_of_week] : [],
                recurring_interval_weeks: schedule?.recurring_interval_weeks ?? recurringIntervalWeeks,
              })

              setEditingScheduleId(scheduleId)
              setIsEditing(true)
              setDrawerOpen(true)
                return
              }

              // Non-month views: individual slot events or composite events
              const slotTime = (props?.start_time as string) || (info?.event?.start ? (info.event.start as Date).toTimeString().slice(0,5) : "")
              const slotDate = (props?.date as string) || (info?.event?.start ? (info.event.start as Date).toISOString().slice(0,10) : "")
              const slotLocation = props?.location || ""

              // If this is a composite event, inspect clicked DOM to find which box was clicked
              const composite = !!props?.composite
              if (composite) {
                const jsEv = info?.jsEvent || info?.domEvent
                const target = jsEv?.target || jsEv?.srcElement || null
                // Walk up to find element with data-status
                let node: any = target
                let found = null
                while (node) {
                  if (node.dataset && node.dataset.status) { found = node; break }
                  node = node.parentElement
                }
                if (!found) {
                  // fallback: treat whole composite as unavailable
                  return
                }
                const status = (found.dataset.status || '').toString().toUpperCase()
                const slotId = found.dataset.slotId || props?.slotId || props?.slot_id || props?.slot
                // prefer explicit patient id when provided on the DOM (data-patient-id)
                const patientId = found.dataset.patientId || found.dataset.appointmentId || props?.patientId || null
                const patientIndex = (typeof found.dataset.patientIndex !== 'undefined' && found.dataset.patientIndex !== '') ? Number(found.dataset.patientIndex) : null

                // Debug click context to help trace UI vs drawer mismatches
                try {
                  console.debug('[composite-click] slotId', slotId, 'patientIndex', patientIndex, 'patientId', patientId, 'status', status)
                  // Also log the extendedProps for the composite event for context
                  console.debug('[composite-click] event.extendedProps', props)
                } catch (e) { /* ignore */ }

                // Blocked check (composite shouldn't be blocked but keep guard)
                if (status === 'BLOCKED') { toast({ title: 'Blocked', description: 'This slot is blocked and cannot be modified.', variant: 'destructive' }); return }

                // AVAILABLE or CANCELLED => open appointment drawer
                if (status === 'AVAILABLE' || status === 'CANCELLED') {
                  setApptInitialDate(slotDate)
                  setApptInitialLocation(slotLocation)
                  setApptInitialSlotId(slotId)
                  setApptInitialPatientIndex(typeof patientIndex === 'number' ? patientIndex : undefined)
                  setApptInitialSlotTime(slotTime)
                  if (currentView !== 'dayGridMonth') setApptDrawerOpen(true)
                  return
                }

                // BOOKED => open slot action menu
                if (status === 'BOOKED' || status === 'OCCUPIED') {
                  const ev = info?.jsEvent || info?.domEvent
                  const x = ev?.clientX || 0
                  const y = ev?.clientY || 0
                  setSlotMenuPos({ x, y })
                  setSlotMenuSlotId(slotId ? String(slotId) : null)
                  setSlotMenuPatientIndex(typeof patientIndex === 'number' ? patientIndex : null)
                  setSlotMenuPatientId(patientId)
                  setSlotMenuOpen(true)
                  return
                }
                return
              }

              // Non-composite (single-patient) behavior (preserve existing logic)
              const status = (props?.status || "").toString().toUpperCase()
              const isBlocked = !!props?.isBlocked
              // Consider event cancelled flag: cancelled appointments should behave like AVAILABLE
              // so clicking them opens the add-appointment drawer (to rebook), not the booked-slot menu.
              const eventIsCancelled = !!props?.isCancelled
              const slotId = props?.slotId || props?.slot_id || props?.slot

              // If slot is blocked, show a simple toast and do nothing
              if (isBlocked || status === "BLOCKED") {
                toast({ title: "Blocked", description: "This slot is blocked and cannot be modified.", variant: "destructive" })
                return
              }

              // If the event is marked cancelled, ignore the click for single-patient
              // events so the add-appointment drawer does not open (match composite behavior).
              if (eventIsCancelled) {
                return
              }

              // AVAILABLE -> open appointment drawer (pre-fill date/location/time but patient empty)
              if (status === "AVAILABLE") {
                // Fill appointment-drawer initial props
                setApptInitialDate(slotDate)
                setApptInitialLocation(slotLocation)
                setApptInitialSlotId(slotId)
                setApptInitialPatientIndex(typeof props?.patientIndex === 'number' ? props.patientIndex : undefined)
                setApptInitialSlotTime(slotTime)
                if (currentView !== 'dayGridMonth') setApptDrawerOpen(true)
                return
              }

              // OCCUPIED/BOOKED -> open slot action menu (reschedule/delete)
              if (status === "OCCUPIED" || status === "BOOKED") {
                // Position the menu near the click
                const ev = info?.jsEvent || info?.domEvent
                const x = ev?.clientX || 0
                const y = ev?.clientY || 0
                setSlotMenuPos({ x, y })
                setSlotMenuSlotId(slotId ? String(slotId) : null)
                // capture patient index/id if provided
                setSlotMenuPatientIndex(typeof props?.patientIndex === 'number' ? props.patientIndex : null)
                setSlotMenuPatientId(props?.patientId ? String(props.patientId) : null)
                setSlotMenuOpen(true)
                return
              }
            }}
            dateClick={(info: any) => {
              if (currentView !== "dayGridMonth") return
              const clickedDate = info?.dateStr as string
              if (!clickedDate) return
              // Build unique schedule entries for this date from scheduleDates (month view data)
              const dayDates = scheduleDates.filter(d => d.date === clickedDate)
              const items = dayDates.map(d => ({
                scheduleId: d.schedule_id,
                location: d.location,
                start: normalizeTime(d.start_time),
                end: normalizeTime(d.end_time),
              }))
              setDayModalItems(items)
              setDayModalDate(clickedDate)
              setDayModalOpen(true)
            }}
          />
        )}
        {/* Lightweight style tuning to better match app UI */}
        <style jsx global>{`
          .fc .fc-toolbar-title {
            font-size: 1.25rem;
            font-weight: 600;
            color: hsl(var(--foreground));
          }
          .fc .fc-button {
            background: hsl(var(--background));
            border: 1px solid hsl(var(--border));
            color: hsl(var(--foreground));
            border-radius: 0.5rem;
            padding: 0.375rem 0.625rem;
            text-transform: none;
            box-shadow: none;
          }
          .fc .fc-button:hover {
            background: hsl(var(--secondary));
            color: hsl(var(--secondary-foreground));
          }
          .fc .fc-button:focus { box-shadow: none; }
          .fc .fc-button-primary:not(:disabled).fc-button-active,
          .fc .fc-button-primary:not(:disabled):active {
            background: hsl(var(--secondary));
            color: hsl(var(--secondary-foreground));
            border-color: hsl(var(--border));
          }
          .fc .fc-col-header-cell-cushion {
            color: hsl(var(--muted-foreground));
            font-weight: 500;
          }
          .fc .fc-daygrid-day-number {
            color: hsl(var(--muted-foreground));
            font-weight: 500;
          }
          .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-frame {
            background: hsl(var(--muted) / 0.4);
          }
          .fc .fc-event {
            border-radius: 0.375rem;
          }
          .fc         .fc-event .fc-event-time {
          display: none;
        }
        
        .fc-event {
          cursor: pointer;
        }
        /* Composite multi-patient slot boxes */
        .fc .fc-event-composite {
          display: flex !important;
          width: 100% !important;
          height: 100% !important;
        }
        .fc .fc-event-composite .composite-box {
          display: flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          padding: 0 !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          position: relative !important;
          font-size: 0.875rem !important;
        }
        .fc .fc-event-composite .composite-box:last-child { border-right: none !important }
        .fc .fc-event-composite .composite-box > div[aria-hidden] { padding-left: 0.25rem !important; padding-right: 0.25rem !important }
        .fc .fc-event-composite .composite-box { border-right: 0 !important }
        .fc .fc-event-composite .composite-box-overlay {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          height: 100% !important;
          cursor: pointer !important;
          color: inherit !important;
        }
        `}</style>
        <style jsx global>{`
          /* Cancelled appointment (bottom) */
          .fc .appt-cancelled {
            background-color: #f3f4f6 !important;
            border-color: #e5e7eb !important;
            color: #374151 !important;
            opacity: 1 !important;
          }
          .fc .appt-cancelled .fc-event-custom-title span,
          .fc .appt-cancelled-bottom .fc-event-custom-title span {
            text-decoration: line-through !important;
            color: #374151 !important;
            opacity: 0.95;
            font-weight: 600;
          }

          /* The cancelled bottom event should render beneath overlays */
          .fc .appt-cancelled-bottom {
            z-index: 1 !important;
          }

          /* Green overlay for AVAILABLE on top of a cancelled slot */
          .fc .appt-available-overlay {
            background-color: #dcfce7 !important;
            border-color: #dcfce7 !important;
            color: #166534 !important;
            z-index: 2 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding-left: 0.25rem !important;
            padding-right: 0.25rem !important;
          }

          /* Special overlay variant when rendered above a cancelled event: shrink and right-align */
          .fc .appt-available-overlay-for-cancelled {
            /* overlay anchored to right: cover ~80% of the cancelled pill and extend leftwards */
            position: absolute;
            right: 0;
            width: 140% !important;
            margin-left: 0 !important;
            border-top-left-radius: 0.375rem !important;
            border-bottom-left-radius: 0.375rem !important;
          }

          /* Ensure event content uses our custom span for styling */
          .fc .fc-event .fc-event-custom-title span { display: inline-block; }
        `}</style>
      </div>

      {/* Month day modal */}
      {dayModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDayModalOpen(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-lg shadow-lg">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="text-base font-semibold">{new Date(dayModalDate).toLocaleDateString()}</div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setDayModalOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 space-y-2 max-h-[60vh] overflow-auto">
              {dayModalItems.length === 0 ? (
                <div className="text-sm text-muted-foreground">No schedules for this date.</div>
              ) : (
                dayModalItems.map(item => (
                  <button
                    key={item.scheduleId}
                    className="w-full text-left border rounded-md p-3 hover:bg-accent"
                    onClick={() => handleDayModalSelect(item)}
                  >
                    <div className="text-sm font-medium">{item.location}</div>
                    <div className="text-xs text-muted-foreground">{item.start} - {item.end}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reschedule drawer (UI only) */}
      <RescheduleDrawer
        open={rescheduleOpen}
        onOpenChange={(v) => { if (!v) setReschedulePayload(null); setRescheduleOpen(v) }}
        patient={reschedulePayload?.patient}
        initialDate={reschedulePayload?.slot?.date}
        initialLocation={reschedulePayload?.slot?.location}
        sourceSlotId={reschedulePayload?.slotId}
        sourcePatientId={reschedulePayload?.patientId}
        currentView={currentView}
        onDone={async () => { await refreshSlotsAndSchedules(); setRescheduleOpen(false); setReschedulePayload(null) }}
        // placeholders: we'll fill these from API later
        onConfirm={(payload) => {
          // stub: show toast and close; API integration will be added later
          toast({ title: "Rescheduled (stub)", description: `New date: ${payload.date || 'n/a'}, location: ${payload.location || 'n/a'}` })
          setRescheduleOpen(false)
        }}
      />

      {/* Right-side drawer (simple overlay panel) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="absolute top-0 right-0 h-screen w-96 bg-white shadow-xl flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="text-lg font-semibold">{isEditing ? "Update Schedule" : "Add Schedule"}</div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setDrawerOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4 overflow-auto">
              {!isEditing && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      min={new Date().toISOString().slice(0,10)}
                      value={startDate}
                      onChange={e => {
                        const v = e.target.value
                        setStartDate(v)
                        setFormValue("start_date", v, { shouldDirty: true })
                        // If endDate is before new startDate, clear it
                        if (endDate && endDate < v) {
                          setEndDate("")
                          setFormValue("end_date", "", { shouldDirty: true })
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      min={(startDate && startDate > new Date().toISOString().slice(0,10)) ? startDate : new Date().toISOString().slice(0,10)}
                      value={endDate}
                      onChange={e => { setEndDate(e.target.value); setFormValue("end_date", e.target.value, { shouldDirty: true }) }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input placeholder="--:--" type="time" value={startTime} onChange={e => { const v = e.target.value; setStartTime(v); setFormValue("start_time", v, { shouldDirty: true }) }} />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input placeholder="--:--" type="time" value={endTime} onChange={e => { const v = e.target.value; setEndTime(v); setFormValue("end_time", v, { shouldDirty: true }) }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Select value={String(slotDuration)} onValueChange={(v) => { const n = Number(v); setSlotDuration(n); setFormValue("slot_duration_minutes", n, { shouldDirty: true }) }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="15">15</SelectItem>
                      <SelectItem value="30">30</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Patients per slot</Label>
                  <Select value={String(patientsPerSlot)} onValueChange={(v) => { const n = Number(v); setPatientsPerSlot(n); setFormValue("patients_per_slot", n, { shouldDirty: true }) }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select patients per slot" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!isEditing && (
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input placeholder="Location" value={location} onChange={e => { setLocation(e.target.value); setFormValue("location", e.target.value, { shouldDirty: true }) }} />
                </div>
              )}

              <div className="space-y-2">
                <Label>Weekdays</Label>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(d => (
                    <Button key={d} type="button" variant={daysOfWeek.includes(d) ? "secondary" : "outline"} onClick={() => {
                      setDaysOfWeek(prev => {
                        const next = prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
                        setFormValue("days_of_week", next, { shouldDirty: true })
                        return next
                      })
                    }}>
                      {d.slice(0, 3)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Recurring Interval (weeks)</Label>
                <Input 
                  type="number" 
                  min="1" 
                  max="4" 
                  value={recurringIntervalWeeks} 
                  onChange={e => { const val = Number(e.target.value); setRecurringIntervalWeeks(val); setFormValue("recurring_interval_weeks", val, { shouldDirty: true }) }}
                  placeholder="1"
                />
                <div className="text-xs text-muted-foreground">
                  How often this schedule repeats (1-4 weeks)
                </div>
              </div>

              {isEditing && (
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <Select value={operationScope} onValueChange={(v: any) => setOperationScope(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="this_day">This day</SelectItem>
                      <SelectItem value="subsequent_days">This and subsequent days</SelectItem>
                      <SelectItem value="later_days">Later days only</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    Anchor date: {anchorDate || 'Not set'}
                  </div>
                </div>
              )}

            </div>
            <div className="p-4 border-t flex gap-2 justify-end">
                    {isEditing && (
                      <Button
                        variant="destructive"
                        onClick={handleDeleteScheduleClick}
                        disabled={deletingSchedule}
                      >
                        {deletingSchedule ? "Deleting..." : "Delete"}
                      </Button>
                    )}
              <Button variant="outline" onClick={() => setDrawerOpen(false)}>Close</Button>
              {isEditing ? (
                <Button
                  onClick={handleUpdateScheduleClick}
                  disabled={updatingSchedule || !startTime || !endTime || !location || !isDirty}
                >
                  {updatingSchedule ? "Updating...." : "Update Schedule"}
                </Button>
              ) : (
                <Button onClick={handleCreateSchedule} disabled={creating || !startDate || !endDate || !location || !recurringIntervalWeeks || recurringIntervalWeeks < 1 || recurringIntervalWeeks > 52 || daysOfWeek.length === 0}>{creating ? "Adding..." : "Add Schedule"}</Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={closeRescheduleModal} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-lg shadow-lg">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="text-lg font-semibold">Reschedule Appointments</div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={closeRescheduleModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4">
              {/* Progress Info */}
              <div className="bg-blue-50 p-3 rounded-md">
                <div className="text-sm font-medium text-blue-900">
                  Total appointments to reschedule: {initialTotalToReschedule}
                </div>
                <div className="text-sm text-blue-700">
                  Remaining: {remainingToReschedule}
                </div>
                {lastRescheduleResult && (
                  <div className="text-sm text-green-700 mt-1">
                    Last action: Moved {lastRescheduleResult.rescheduledCount} appointments
                    {lastRescheduleResult.conflicts.length > 0 && (
                      <span className="text-orange-600 ml-2">
                        ({lastRescheduleResult.conflicts.length} conflicts)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Location Info */}
              <div className="text-sm text-gray-600">
                Rescheduling appointments from: <span className="font-medium">{rescheduleLocation}</span>
              </div>

              {/* Date Selection */}
              <div className="space-y-2">
                <Label>Select target date</Label>
                <Select value={selectedRescheduleDate} onValueChange={setSelectedRescheduleDate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a date with available slots" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDates.length === 0 ? (
                      <div className="p-2 text-sm text-gray-500">No dates available for rescheduling. Please create a new schedule.</div>
                    ) : (
                      availableDates.map((dateInfo) => (
                        <SelectItem key={dateInfo.date} value={dateInfo.date}>
                          {new Date(dateInfo.date).toLocaleDateString()} - {dateInfo.available_slots} slots available
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={closeRescheduleModal}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleBulkReschedule}
                  disabled={!selectedRescheduleDate || rescheduleLoading || availableDates.length === 0}
                >
                  {rescheduleLoading ? "Rescheduling..." : "Reschedule to selected date"}
                </Button>
              </div>

              {/* Completion Message */}
              {remainingToReschedule === 0 && (
                <div className="bg-green-50 p-3 rounded-md">
                  <div className="text-sm font-medium text-green-900">
                    ✅ All appointments have been rescheduled successfully!
                  </div>
                  <div className="text-sm text-green-700 mt-1">
                    You can now proceed with your schedule changes or delete the schedule.
                  </div>
                </div>
              )}
                </div>
              </div>
        </div>
      )}
              
              
              
      {/* Slot action menu for booked slots (UI only) */}
      {slotMenuOpen && (
        <div
          className="fixed z-50 bg-white border rounded shadow-md"
          style={{ left: slotMenuPos.x, top: slotMenuPos.y, minWidth: 180 }}
          onMouseLeave={() => setSlotMenuOpen(false)}
        >
          <div className="p-2">
            <button
              className={cn(
                "w-full text-left px-3 py-2 hover:bg-gray-50",
                currentView === "dayGridMonth" && "opacity-50 cursor-not-allowed"
              )}
              disabled={currentView === "dayGridMonth"}
              onClick={handleSlotMenuReschedule}
            >
              Reschedule
            </button>
            <button
              className="w-full text-left px-3 py-2 text-red-600 hover:bg-gray-50"
              onClick={() => {
                setSlotMenuOpen(false)
                setConfirmDeleteOpen(true)
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Delete appointment drawer (use same structure as AppointmentDrawer to ensure z-index/overlay/transform behave the same) */}
      {confirmDeleteOpen && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmDeleteOpen(false)} />
          <aside className={`absolute top-0 h-full w-full max-w-sm bg-white shadow-xl transform transition-transform right-0 ${confirmDeleteOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="text-lg font-semibold">Delete appointment</div>
              <Button variant="ghost" size="icon" onClick={() => setConfirmDeleteOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              {/* Show patient name for the appointment tied to slotMenuSlotId - prefer the fresh snapshot in confirmDeleteSlot */}
              <div>
                <Label>Patient</Label>
                {(() => {
                  // prefer the snapshot captured when the drawer opened (fresh fetch), fallback to local appointments
                  const appt = confirmDeleteSlot?.appointment || appointments.find(a => String(a.slot_id) === String(slotMenuSlotId))
                  const fn = appt?.firstname || appt?.patient?.firstname || ""
                  const ln = appt?.lastname || appt?.patient?.lastname || ""
                  const name = `${fn} ${ln}`.trim() || "Unknown patient"
                  return (
                    <div className="mt-2 p-3 border rounded-md bg-gray-50">
                      <div className="text-sm font-medium">{name}</div>
                      {appt?.patient?.dob && <div className="text-xs text-muted-foreground">DOB: {appt.patient.dob}</div>}
                      {(appt?.patient?.email || appt?.email) && <div className="text-xs text-muted-foreground">{appt?.patient?.email || appt?.email}</div>}
                      {(appt?.patient?.phone || appt?.phone) && <div className="text-xs text-muted-foreground">{appt?.patient?.phone || appt?.phone}</div>}
                    </div>
                  )
                })()}
              </div>

              <div>
                <Label>Cancellation reason</Label>
                <Select value={confirmDeleteReason} onValueChange={(v) => setConfirmDeleteReason(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="patient_cancelled">Patient Cancelled</SelectItem>
                    <SelectItem value="doctor_cancelled">Doctor Cancelled</SelectItem>
                    <SelectItem value="not_specified">Reason Not Specified</SelectItem>
                  </SelectContent>
                </Select>
                {confirmDeleteError && <div className="text-sm text-red-600 mt-2">{confirmDeleteError}</div>}
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea value={confirmDeleteNotes} onChange={(e) => setConfirmDeleteNotes((e.target as HTMLTextAreaElement).value)} placeholder="Optional note about the cancellation" className="min-h-[6rem]" />
              </div>

              <div className="pt-2">
                <Button className="w-full" variant="destructive" onClick={handleConfirmDeleteAppointmentClick} disabled={deletingAppointment}>
                  {deletingAppointment ? "Deleting..." : "Delete appointment"}
                </Button>
              </div>
            </div>
          </aside>
        </div>, document.body)
      }
      </div>
    </div>
  )
}