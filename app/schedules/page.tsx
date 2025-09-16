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
import { X } from "lucide-react"
import { createPortal } from "react-dom"


export default function SchedulesPage() {
  const { toast } = useToast()
  // Schedule drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Appointment drawer open state (separate from schedule drawer)
  const [apptDrawerOpen, setApptDrawerOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  // Appointment drawer specific initial values
  const [apptInitialDate, setApptInitialDate] = useState<string | undefined>(undefined)
  const [apptInitialLocation, setApptInitialLocation] = useState<string | undefined>(undefined)
  const [apptInitialSlotId, setApptInitialSlotId] = useState<string | undefined>(undefined)
  const [apptInitialSlotTime, setApptInitialSlotTime] = useState<string | undefined>(undefined)

  const [operationScope, setOperationScope] = useState<"this_day" | "subsequent_days" | "later_days">("this_day")
  const [anchorDate, setAnchorDate] = useState<string>("")

  // Create form state (in drawer)
  const [startDate, setStartDate] = useState<string>("") // yyyy-MM-dd
  const [endDate, setEndDate] = useState<string>("")
  const [startTime, setStartTime] = useState<string>("")
  const [endTime, setEndTime] = useState<string>("")
  const [slotDuration, setSlotDuration] = useState<number>(30)
  const [patientsPerSlot, setPatientsPerSlot] = useState<number>(1)
  const [location, setLocation] = useState<string>("")
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>([])
  const [recurringIntervalWeeks, setRecurringIntervalWeeks] = useState<number>(1)

  const [creating, setCreating] = useState(false)
  const [updatingSchedule, setUpdatingSchedule] = useState(false)
  const [deletingSchedule, setDeletingSchedule] = useState(false)
  const [deletingAppointment, setDeletingAppointment] = useState(false)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [scheduleDates, setScheduleDates] = useState<Array<{ id: string; schedule_id: string; date: string; start_time: string; end_time: string; location: string }>>([])
  const [visibleFrom, setVisibleFrom] = useState<string>("")
  const [visibleTo, setVisibleTo] = useState<string>("")
  // Simple in-memory caches keyed by range
  const monthDatesCacheRef = useRef<Map<string, Array<{ id: string; schedule_id: string; date: string; start_time: string; end_time: string; location: string }>>>(new Map())
  const rangeSlotsCacheRef = useRef<Map<string, Slot[]>>(new Map())
  // Fine-grained caches by date to prevent refetch between day/week switches
  const scheduleDatesByDateRef = useRef<Map<string, Array<{ id: string; schedule_id: string; date: string; start_time: string; end_time: string; location: string }>>>(new Map())
  const slotsByDateRef = useRef<Map<string, Slot[]>>(new Map())

  function enumerateDates(fromISO: string, toISO: string): string[] {
    const out: string[] = []
    const start = new Date(fromISO + "T00:00:00Z")
    const end = new Date(toISO + "T00:00:00Z")
    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push(d.toISOString().slice(0,10))
    }
    return out
  }
  function nextDayISO(dateISO: string): string {
    const d = new Date(dateISO + "T00:00:00Z")
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0,10)
  }

  async function resolveLocationForAnchor(scheduleId: string, anchorISO: string): Promise<string | null> {
    // 1) Try schedule_dates cache
    const dayDates = scheduleDatesByDateRef.current.get(anchorISO) || []
    const fromDates = dayDates.find(d => d.schedule_id === scheduleId)
    if (fromDates?.location) return fromDates.location

    // 2) Try slots cache
    const daySlots = slotsByDateRef.current.get(anchorISO) || []
    const fromSlots = daySlots.find(s => s.schedule_id === scheduleId)
    if (fromSlots?.location) return fromSlots.location

    // 3) Fallback: fetch one-day schedule_dates to determine location
    try {
      const dates = await schedulesApi.getScheduleDatesRange(anchorISO, nextDayISO(anchorISO))
      // populate per-day cache
      dates.forEach(item => {
        const arr = scheduleDatesByDateRef.current.get(item.date) || []
        scheduleDatesByDateRef.current.set(item.date, [...arr, item])
      })
      const match = dates.find(d => d.schedule_id === scheduleId)
      if (match?.location) return match.location
    } catch {}
    return null
  }
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false)
  const [rescheduleScheduleId, setRescheduleScheduleId] = useState<string | null>(null)
  const [rescheduleLocation, setRescheduleLocation] = useState<string>("")
  const [initialTotalToReschedule, setInitialTotalToReschedule] = useState<number>(0)
  const [remainingToReschedule, setRemainingToReschedule] = useState<number>(0)
  const [selectedRescheduleDate, setSelectedRescheduleDate] = useState<string>("")
  const [availableDates, setAvailableDates] = useState<Array<{date: string; available_slots: number}>>([])
  const [lastRescheduleResult, setLastRescheduleResult] = useState<{
    rescheduledCount: number;
    conflicts: any[];
  } | null>(null)
  const [rescheduleLoading, setRescheduleLoading] = useState(false)
  const [rescheduleScope, setRescheduleScope] = useState<"this_day" | "subsequent_days" | "later_days">("this_day")
  const [rescheduleAnchorDate, setRescheduleAnchorDate] = useState<string>("")

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
      const allSlots: Slot[] = []
      for (const s of list) {
        try {
          const sSlots = await schedulesApi.getSlotsForSchedule(s.id)
          if (cancelled) return
          allSlots.push(...(sSlots || []).map(normalizeSlot))
        } catch (e) {
          // continue
        }
      }
      if (cancelled) return
      setSlots(allSlots)
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
      if (status !== 'BOOKED') {
        toast({ title: "Cannot delete", description: `Appointment status is ${status || 'unknown'}. Only BOOKED appointments can be cancelled.`, variant: "destructive" })
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
      setAppointments(prev => prev.filter(a => String(a.slot_id) !== String(slotMenuSlotId)))
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
      // Build a lookup map for appointments per slot_id (array) so we can show correct patient per index
      const apptBySlot = new Map<string, any[]>()
        ; (appointments || []).forEach((a: any) => {
          const key = String(a.slot_id)
          const list = apptBySlot.get(key) || []
          list.push(a)
          apptBySlot.set(key, list)
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
          // Handle normal slots - show individual patient positions
          for (let i = 0; i < s.max_patients; i++) {
            const isOccupied = i < s.current_patients
            const status = isOccupied ? "OCCUPIED" : "AVAILABLE"

            const apptsForSlot = apptBySlot.get(String(s.id)) || []
            const apptForIndex = apptsForSlot[i] || null
            const apptsAllForSlot = apptBySlotAll.get(String(s.id)) || []
            const apptAllForIndex = apptsAllForSlot[i] || null

            // Determine what to show
            let title = ""
            let shouldShow = true

            // Prefer appointment data from the full list (including cancelled) so we keep names visible
            const candidateAppt = apptAllForIndex || apptForIndex || null

            if (candidateAppt && (candidateAppt.firstname || candidateAppt.lastname || candidateAppt.patient)) {
              const fn = candidateAppt.firstname || candidateAppt.patient?.firstname || ""
              const ln = candidateAppt.lastname || candidateAppt.patient?.lastname || ""
              const name = `${fn} ${ln}`.trim()
              if (name) {
                title = name
                if (String((candidateAppt.status || candidateAppt.state || candidateAppt.appointment_status || '').toString().toUpperCase()).includes('CANCEL')) {
                  // log when we're showing a cancelled appointment name on an available slot
                  console.debug('[schedules] showing cancelled patient name for AVAILABLE slot', s.id, 'index', i, 'name', name)
                }
              }
            } else {
              // No appointment name available: fall back to availability text or hide
              if (status === "AVAILABLE") {
                title = "AVL"
              } else {
                // OCCUPIED without name
                shouldShow = false
              }
            }

            // Only add event if we should show it
            if (shouldShow) {
              const isCancelled = !!(apptAllForIndex && String((apptAllForIndex.status || apptAllForIndex.state || apptAllForIndex.appointment_status || '').toString().toUpperCase()).includes('CANCEL'))
              if (isCancelled) console.debug('[schedules] slot', s.id, 'index', i, 'isCancelled true, apptId:', apptAllForIndex?._id || apptAllForIndex?.id)
              // prefer name from the full list (apptAllForIndex) when available (so cancelled names display)
              if (!title && apptAllForIndex) {
                const fn = apptAllForIndex.firstname || apptAllForIndex.patient?.firstname || ""
                const ln = apptAllForIndex.lastname || apptAllForIndex.patient?.lastname || ""
                const name = `${fn} ${ln}`.trim()
                if (name) title = name
              }
              events.push({
                id: `${s.id}-${i}`,
                title,
                start: `${s.date}T${st}:00`,
                end: `${s.date}T${et}:00`,
                classNames: isCancelled ? ['appt-cancelled'] : undefined,
                backgroundColor: baseColors.backgroundColor,
                borderColor: baseColors.borderColor,
                textColor: baseColors.textColor,
                extendedProps: {
                  slotId: s.id,
                  patientIndex: i,
                  patientId: (apptForIndex && (apptForIndex.patient_id || apptForIndex.patient?.id)) || undefined,
                  appointmentId: apptForIndex?._id || apptForIndex?.id || apptForIndex?.appointment_id || (apptAllForIndex?._id || apptAllForIndex?.id),
                  isCancelled,
                  status,
                  location: s.location,
                  scheduleId: s.schedule_id
                }
              })
              console.debug('[schedules] pushed event', { slotId: s.id, index: i, title, isCancelled })
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
    <div className="relative p-6 space-y-4">
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
              side={currentView === "dayGridMonth" ? "left" : "right"}
              onOpenChange={(v) => { if (!v) { setApptInitialDate(undefined); setApptInitialLocation(undefined); setApptInitialSlotId(undefined); setApptInitialSlotTime(undefined) } setApptDrawerOpen(v) }}
              onBooked={() => { refreshSlotsAndSchedules() }}
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
      <div className="text-sm text-muted-foreground">
        {/* {loadingAll ? "Loading schedules and slots..." : `Loaded ${schedules.length} schedules, ${slots.length} slots`} */}
        {loadError && <span className="ml-2 text-red-600">{loadError}</span>}
      </div>

      <div className="rounded-md border">
        {typeof window !== "undefined" && (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: "prev today next", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
            height="auto"
            slotMinTime="07:00:00"
            scrollTime="07:00:00"
            events={events}
            eventContent={(arg: any) => {
              try {
                const isCancelled = !!arg.event.extendedProps?.isCancelled
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
                const cancelled = !!arg.event.extendedProps?.isCancelled
                // Apply stronger styling directly to the event element as a fallback
                const el = (arg.el as HTMLElement)
                if (!el) return
                if (cancelled) {
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
            eventClick={(info: any) => {
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

              // Keep existing durations if available on schedule; otherwise don't overwrite
              if (schedule?.slot_duration_minutes) setSlotDuration(schedule.slot_duration_minutes)
              if (schedule?.patients_per_slot) setPatientsPerSlot(schedule.patients_per_slot)

              formReset({
                start_date: schedule?.start_date || "",
                end_date: schedule?.end_date || "",
                start_time: dayStart || "",
                end_time: dayEnd || "",
                slot_duration_minutes: schedule?.slot_duration_minutes ?? slotDuration,
                patients_per_slot: schedule?.patients_per_slot ?? patientsPerSlot,
                location: dayLoc || "",
                days_of_week: schedule ? [...schedule.days_of_week] : [],
                recurring_interval_weeks: schedule?.recurring_interval_weeks ?? recurringIntervalWeeks,
              })

              setEditingScheduleId(scheduleId)
              setIsEditing(true)
              setDrawerOpen(true)
                return
              }

              // Non-month views: individual slot events
              const status = (props?.status || "").toString().toUpperCase()
              const isBlocked = !!props?.isBlocked
              const slotId = props?.slotId || props?.slot_id || props?.slot
              const slotTime = (props?.start_time as string) || (info?.event?.start ? (info.event.start as Date).toTimeString().slice(0,5) : "")
              const slotDate = (props?.date as string) || (info?.event?.start ? (info.event.start as Date).toISOString().slice(0,10) : "")
              const slotLocation = props?.location || ""

              // If slot is blocked, show a simple toast and do nothing
              if (isBlocked || status === "BLOCKED") {
                toast({ title: "Blocked", description: "This slot is blocked and cannot be modified.", variant: "destructive" })
                return
              }

              // AVAILABLE -> open appointment drawer (pre-fill date/location/time but patient empty)
              if (status === "AVAILABLE") {
                // Fill appointment-drawer initial props
                setApptInitialDate(slotDate)
                setApptInitialLocation(slotLocation)
                setApptInitialSlotId(slotId)
                setApptInitialSlotTime(slotTime)
                setApptDrawerOpen(true)
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
                        {deletingSchedule ? "Deleting......" : "Delete"}
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
                <Button onClick={handleCreateSchedule} disabled={creating || !startDate || !endDate || !location || !recurringIntervalWeeks || recurringIntervalWeeks < 1 || recurringIntervalWeeks > 52 || daysOfWeek.length === 0}>{creating ? "Adding....." : "Add Schedule"}</Button>
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
                  {deletingAppointment ? "Deleting......" : "Delete appointment"}
                </Button>
              </div>
            </div>
          </aside>
        </div>, document.body)
      }
    </div>
  )
}