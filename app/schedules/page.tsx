"use client"

import { useEffect, useMemo, useState } from "react"
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
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [appointments, setAppointments] = useState<any[]>([])

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
  const [slotMenuPos, setSlotMenuPos] = useState<{x: number; y: number}>({ x: 0, y: 0 })
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
  const [dayModalItems, setDayModalItems] = useState<Array<{scheduleId: string; location: string; start: string; end: string}>>([])

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

  // Auto-load all schedules and aggregate slots
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
            if (!cancelled) setAppointments(sanitizeAppointments(appts || []))
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
    ;(async () => {
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
            setSlots(prev => [ ...prev.filter(s => s.schedule_id !== scheduleId), ...normalized ])
            const matched = (normalized || []).find((s: any) => String(s.id) === String(targetSlotId))
            if (matched) freshSlot = matched
          } catch (e) {
            // ignore per-schedule fetch error
          }
        } else {
          // fallback: refresh everything
          try { await refreshSlotsAndSchedules() } catch (e) {}
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

  // Map slots to FullCalendar events
  const events = useMemo(() => {
    const events: any[] = []
    
    if (currentView === "dayGridMonth") {
      // Month view: show one event per schedule (grouped by schedule_id and date)
      // Use the original schedule data to get the full day time range
      const scheduleMap = new Map<string, {scheduleId: string; location: string; startTime: string; endTime: string; date: string}>()
      
      // Group slots by schedule_id and date to get the schedule's full time range
      slots.forEach(s => {
        const key = `${s.schedule_id}-${s.date}`
        if (!scheduleMap.has(key)) {
          // Find the original schedule to get the full day time range
          const originalSchedule = schedules.find(sched => sched.id === s.schedule_id)
          if (originalSchedule) {
            scheduleMap.set(key, {
              scheduleId: s.schedule_id,
              location: s.location,
              startTime: originalSchedule.start_time,
              endTime: originalSchedule.end_time,
              date: s.date
            })
          }
        }
      })
      
      scheduleMap.forEach((schedule, key) => {
        const st = normalizeTime(schedule.startTime)
        const et = normalizeTime(schedule.endTime)
        
        events.push({
          id: key,
          title: `${schedule.location} ${schedule.startTime}-${schedule.endTime}`,
          start: `${schedule.date}T${st}:00`,
          end: `${schedule.date}T${et}:00`,
          backgroundColor: "#dcfce7",
          borderColor: "#dcfce7",
          textColor: "#166534",
          extendedProps: {
            scheduleId: schedule.scheduleId,
            location: schedule.location
          }
        })
      })
    } else {
  // Week/Day view: show individual patient slots
  // Build a lookup map for appointments per slot_id (array) so we can show correct patient per index
  const apptBySlot = new Map<string, any[]>()
  ;(appointments || []).forEach((a: any) => {
    const key = String(a.slot_id)
    const list = apptBySlot.get(key) || []
    list.push(a)
    apptBySlot.set(key, list)
  })

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

        for (let i = 0; i < s.max_patients; i++) {
          const isOccupied = i < s.current_patients
          const status = isOccupied ? "OCCUPIED" : "AVAILABLE"
          // If occupied, pick the appointment that corresponds to this patient index (if available)
          let title = status === "OCCUPIED" ? "OCC" : "AVL"
          const apptsForSlot = apptBySlot.get(String(s.id)) || []
          const apptForIndex = apptsForSlot[i] || null
          if (isOccupied && apptForIndex && (apptForIndex.firstname || apptForIndex.lastname || apptForIndex.patient)) {
            const fn = apptForIndex.firstname || apptForIndex.patient?.firstname || ""
            const ln = apptForIndex.lastname || apptForIndex.patient?.lastname || ""
            const name = `${fn} ${ln}`.trim()
            if (name) title = name
          }

          events.push({
            id: `${s.id}-${i}`,
            title,
            start: `${s.date}T${st}:00`,
            end: `${s.date}T${et}:00`,
            backgroundColor: baseColors.backgroundColor,
            borderColor: baseColors.borderColor,
            textColor: baseColors.textColor,
            extendedProps: {
              slotId: s.id,
              patientIndex: i,
              patientId: (apptForIndex && (apptForIndex.patient_id || apptForIndex.patient?.id)) || undefined,
              appointmentId: apptForIndex?._id || apptForIndex?.id || apptForIndex?.appointment_id,
              status,
              location: s.location,
              scheduleId: s.schedule_id
            }
          })
        }
      })
    }
    
    return events
  }, [slots, currentView, appointments])

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
      setDrawerOpen(false)
      console.log("Schedule created; slots added:", slotsToAdd.length)
      toast({
        title: "Success",
        description: `Schedule created successfully — ${slotsToAdd.length} slots added`,
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
            eventDisplay="block"
            datesSet={(arg: any) => setCurrentView(arg?.view?.type)}
            eventClick={(info: any) => {
              const ext = info?.event?.extendedProps || {}
              if (currentView === "dayGridMonth") {
                const scheduleId = ext?.scheduleId as string | undefined
                if (!scheduleId) return
                // Prefill drawer from schedule and event times (editing schedule)
                const schedule = schedules.find(s => s.id === scheduleId)
                const start = info?.event?.start as Date | null
                const end = info?.event?.end as Date | null
                if (start) setStartTime(start.toTimeString().slice(0,5))
                if (end) setEndTime(end.toTimeString().slice(0,5))
                if (schedule) {
                  setStartDate(schedule.start_date)
                  setEndDate(schedule.end_date)
                  setStartTime(schedule.start_time.slice(0, 5)) // Convert HH:MM:SS to HH:MM
                  setEndTime(schedule.end_time.slice(0, 5)) // Convert HH:MM:SS to HH:MM
                  setLocation(schedule.location)
                  setSlotDuration(schedule.slot_duration_minutes)
                  setPatientsPerSlot(schedule.patients_per_slot)
                  setDaysOfWeek(schedule.days_of_week)
                  setRecurringIntervalWeeks(schedule.recurring_interval_weeks)
                }
                setEditingScheduleId(scheduleId)
                setIsEditing(true)
                setDrawerOpen(true)
              } else {
                // Week/Day view: clicking a slot should either open appointment drawer (if AVAILABLE)
                // or show a small action menu (Reschedule/Delete) if the slot is occupied/booked.
                const slotId = ext?.slotId as string | undefined
                const dateStr = (info?.event?.start as Date | null)?.toISOString().slice(0,10)
                const location = ext?.location as string | undefined
                const status = ext?.status as string | undefined

                if (status === "AVAILABLE") {
                  // set appointment drawer initial values and open
                  setApptInitialSlotId(slotId)
                  if (dateStr) setApptInitialDate(dateStr)
                  if (location) setApptInitialLocation(location)
                  // compute slot time from event start/end
                  const s = info?.event?.start as Date | null
                  const e = info?.event?.end as Date | null
                  const computedSlotTime: string | undefined = s && e ? `${s.toTimeString().slice(0,5)} - ${e.toTimeString().slice(0,5)}` : undefined
                  setApptInitialSlotTime(computedSlotTime)
                  // open appointment drawer (ensure schedule drawer remains closed)
                  setDrawerOpen(false)
                  setApptDrawerOpen(true)
                } else {
                  // Booked/occupied slot: open a small floating menu at click position
                  const ev = info?.jsEvent as MouseEvent | undefined
                  if (ev) {
                      setSlotMenuPos({ x: ev.clientX, y: ev.clientY })
                    } else {
                      setSlotMenuPos({ x: 200, y: 200 })
                    }
                    // capture patientIndex and patientId if present on the event
                    const pIndex = Number(ext?.patientIndex ?? null)
                    const pId = ext?.patientId ? String(ext.patientId) : null
                    setSlotMenuPatientIndex(Number.isFinite(pIndex) ? pIndex : null)
                    setSlotMenuPatientId(pId)
                    setSlotMenuSlotId(slotId ?? null)
                    setSlotMenuOpen(true)
                }
              }
            }}
            dateClick={(info: any) => {
              if (currentView !== "dayGridMonth") return
              const clickedDate = info?.dateStr as string
              if (!clickedDate) return
              // Build unique schedule entries for this date from slots
              const daySlots = slots.filter(s => s.date === clickedDate)
              const map = new Map<string, {scheduleId: string; location: string; start: string; end: string}>()
              daySlots.forEach(s => {
                const prev = map.get(s.schedule_id)
                const st = normalizeTime(s.start_time)
                const et = normalizeTime(s.end_time)
                if (!prev) {
                  map.set(s.schedule_id, { scheduleId: s.schedule_id, location: s.location, start: st, end: et })
                } else {
                  // expand range
                  if (st < prev.start) prev.start = st
                  if (et > prev.end) prev.end = et
                }
              })
              const items = Array.from(map.values())
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
              <Button variant="ghost" onClick={() => setDayModalOpen(false)}>Close</Button>
            </div>
            <div className="p-4 space-y-2 max-h-[60vh] overflow-auto">
              {dayModalItems.length === 0 ? (
                <div className="text-sm text-muted-foreground">No schedules for this date.</div>
              ) : (
                dayModalItems.map(item => (
                  <button
                    key={item.scheduleId}
                    className="w-full text-left border rounded-md p-3 hover:bg-accent"
                    onClick={() => {
                      // Prefill drawer for update
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
                    }}
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
          <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white shadow-xl flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="text-lg font-semibold">{isEditing ? "Update Schedule" : "Add Schedule"}</div>
              <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Close</Button>
            </div>
            <div className="p-4 space-y-4 overflow-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input placeholder="--:--" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input placeholder="--:--" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Select value={String(slotDuration)} onValueChange={(v) => setSlotDuration(Number(v))}>
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
                  <Select value={String(patientsPerSlot)} onValueChange={(v) => setPatientsPerSlot(Number(v))}>
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

              <div className="space-y-2">
                <Label>Location</Label>
                <Input placeholder="Location" value={location} onChange={e => setLocation(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Weekdays</Label>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"].map(d => (
                    <Button key={d} type="button" variant={daysOfWeek.includes(d) ? "secondary" : "outline"} onClick={() => setDaysOfWeek(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}>
                      {d.slice(0,3)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Recurring Interval (weeks)</Label>
                <Input 
                  type="number" 
                  min="1" 
                  max="52" 
                  value={recurringIntervalWeeks} 
                  onChange={e => setRecurringIntervalWeeks(Number(e.target.value))}
                  placeholder="1"
                />
                <div className="text-xs text-muted-foreground">
                  How often this schedule repeats (1-52 weeks)
                </div>
              </div>

            </div>
            <div className="p-4 border-t flex gap-2 justify-end">
              {isEditing && (
                <Button
                  variant="destructive"
                  onClick={async () => {
                    // optimistic: simply close; deletion API can be added if provided later
                    setDrawerOpen(false)
                    toast({ title: "Deleted", description: "Schedule deleted (stub)." })
                  }}
                >
                  Delete
                </Button>
              )}
              <Button variant="outline" onClick={() => setDrawerOpen(false)}>Close</Button>
              {isEditing ? (
                <Button
                  onClick={async () => {
                    if (!editingScheduleId) return
                    try {
                      const payload: Partial<CreateScheduleRequest> = {
                        start_time: startTime,
                        end_time: endTime,
                        slot_duration_minutes: slotDuration,
                        patients_per_slot: patientsPerSlot,
                        location,
                        days_of_week: daysOfWeek,
                        recurring_interval_weeks: recurringIntervalWeeks,
                      }
                      const res = await schedulesApi.update(editingScheduleId, payload)
                      const updated = (res as any)?.schedule as Schedule | undefined
                      const regenerated = (res as any)?.slots as Slot[] | undefined
                      if (updated) {
                        setSchedules(prev => prev.map(s => (s.id === updated.id ? updated : s)))
                      }
                      if (regenerated) {
                        // replace slots belonging to this schedule
                        setSlots(prev => [
                          ...prev.filter(s => s.schedule_id !== editingScheduleId),
                          ...regenerated,
                        ])
                      }
                      setDrawerOpen(false)
                      toast({ title: "Updated", description: "Schedule updated successfully" })
                    } catch (e: any) {
                      toast({ title: "Error", description: e?.message || "Failed to update schedule", variant: "destructive" })
                    }
                  }}
                  disabled={!startTime || !endTime || !location}
                >
                  Update Schedule
                </Button>
              ) : (
                <Button onClick={handleCreateSchedule} disabled={creating || !startDate || !endDate || !location || !recurringIntervalWeeks || recurringIntervalWeeks < 1 || recurringIntervalWeeks > 52 || daysOfWeek.length === 0}>{creating ? "Adding..." : "Add Schedule"}</Button>
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
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
              onClick={async () => {
                // Open the reschedule drawer; do NOT resolve appointment id here. Only allow lookup by slotId + patientId
                setSlotMenuOpen(false)
                try {
                  const s = slots.find(x => x.id === slotMenuSlotId)
                  // require patient id to be present for strict lookup
                  if (!slotMenuPatientId) {
                    toast({ title: 'Missing patient id', description: 'Cannot determine appointment without patient id', variant: 'destructive' })
                    return
                  }
                  setReschedulePayload({ patient: undefined, slot: s, slotId: slotMenuSlotId || undefined, patientId: slotMenuPatientId })
                  setRescheduleOpen(true)
                } catch (e: any) {
                  toast({ title: 'Error', description: e?.message || 'Failed to open reschedule', variant: 'destructive' })
                }
              }}
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
      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmDeleteOpen(false)} />
          <aside className={`absolute top-0 h-full w-full max-w-sm bg-white shadow-xl transform transition-transform right-0 ${confirmDeleteOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="text-lg font-semibold">Delete appointment</div>
              <Button variant="ghost" size="icon" onClick={() => setConfirmDeleteOpen(false)}><X className="h-4 w-4"/></Button>
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
                <Button className="w-full" variant="destructive" onClick={async () => {
                  setConfirmDeleteError(undefined)
                  try {
                    const user = JSON.parse(localStorage.getItem('user') || '{}')
                    const userId = user.id || user._id
                    if (!userId) {
                      toast({ title: "Not authorized", description: "Please login to manage appointments", variant: "destructive" })
                      return
                    }

                    const api = await import('@/lib/api')
                    // Fetch freshest appointments for this user and ignore cancelled/historical records
                    const freshAppts = await api.appointmentsApi.getForUser(userId)
                    const saneAppts = sanitizeAppointments(freshAppts || [])

                    // Prefer matching by patient_id when available (slot can have multiple patients)
                    let freshAppt: any = null
                    if (slotMenuPatientId) {
                      freshAppt = saneAppts.find((a: any) => String(a.slot_id) === String(slotMenuSlotId) && String(a.patient_id || a.patient?.id || a.patient?._id) === String(slotMenuPatientId)) || null
                    }

                    // If not found and patientIndex was captured, pick the appointment at that index after deterministic ordering
                    if (!freshAppt && typeof slotMenuPatientIndex === 'number') {
                      const list = (saneAppts || []).filter((a: any) => String(a.slot_id) === String(slotMenuSlotId))
                      list.sort((x: any, y: any) => {
                        const tx = Date.parse(String(x?.created_at || x?.createdAt || x?.created || 0)) || 0
                        const ty = Date.parse(String(y?.created_at || y?.createdAt || y?.created || 0)) || 0
                        return tx - ty
                      })
                      freshAppt = list[slotMenuPatientIndex] || null
                    }

                    // Final fallback: pick the most-recent BOOKED appointment for this slot (by created_at desc)
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

                    // Verify status is BOOKED
                    const status = (freshAppt.status || freshAppt.state || freshAppt.appointment_status || '').toString().toUpperCase()
                    if (status !== 'BOOKED') {
                      toast({ title: "Cannot delete", description: `Appointment status is ${status || 'unknown'}. Only BOOKED appointments can be cancelled.`, variant: "destructive" })
                      await refreshSlotsAndSchedules()
                      setConfirmDeleteOpen(false)
                      setSlotMenuSlotId(null)
                      return
                    }

                    // require reason
                    if (!confirmDeleteReason) {
                      setConfirmDeleteError('Please select a cancellation reason')
                      return
                    }

                    // Build payload including patient_id and slot_id (so backend has full context)
                    const payload: any = {
                      patient_id: freshAppt.patient_id || freshAppt.patient?.id || freshAppt.patient?._id,
                      slot_id: freshAppt.slot_id || slotMenuSlotId,
                      reason: confirmDeleteReason
                    }
                    if (confirmDeleteNotes && confirmDeleteNotes.trim() !== '') payload.notes = confirmDeleteNotes.trim()

                    // Use the appointment's id when calling cancel
                    const apptId = freshAppt._id || freshAppt.id || freshAppt.appointment_id
                    await api.appointmentsApi.cancel(apptId, payload)

                    toast({ title: "Deleted", description: "Appointment cancelled successfully" })
                    setConfirmDeleteOpen(false)
                    setSlotMenuSlotId(null)
                    setAppointments(prev => prev.filter(a => String(a.slot_id) !== String(slotMenuSlotId)))
                    await refreshSlotsAndSchedules()
                  } catch (e: any) {
                    toast({ title: "Failed", description: e?.message || "Could not cancel appointment", variant: "destructive" })
                  }
                }}>
                  Delete appointment
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}