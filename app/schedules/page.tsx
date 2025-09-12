"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import dynamic from "next/dynamic"
import { format, parseISO } from "date-fns"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { schedulesApi, type CreateScheduleRequest, type Slot, type Schedule } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

// FullCalendar (client-only)
const FullCalendar = dynamic(() => import("@fullcalendar/react"), { ssr: false }) as any
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"


export default function SchedulesPage() {
  const { toast } = useToast()
  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)

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

  // Operation scope + anchor date for update/delete
  const [operationScope, setOperationScope] = useState<"this_day" | "subsequent_days" | "later_days">("this_day")
  const [anchorDate, setAnchorDate] = useState<string>("")

  const [creating, setCreating] = useState(false)
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
  const [loadingAll, setLoadingAll] = useState(false)
  const [loadError, setLoadError] = useState<string>("")
  const [currentView, setCurrentView] = useState<string>("dayGridMonth")
  const [dayModalOpen, setDayModalOpen] = useState(false)
  const [dayModalDate, setDayModalDate] = useState<string>("")
  const [dayModalItems, setDayModalItems] = useState<Array<{scheduleId: string; location: string; start: string; end: string}>>([])

  // Reschedule modal state
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
      slots.forEach(s => {
        if (s.status === "BLOCKED") return
        const st = normalizeTime(s.start_time)
        const et = normalizeTime(s.end_time)
        
        for (let i = 0; i < s.max_patients; i++) {
          const isOccupied = i < s.current_patients
          const status = isOccupied ? "OCCUPIED" : "AVAILABLE"
          
          events.push({
            id: `${s.id}-${i}`,
            title: "AVL",
            start: `${s.date}T${st}:00`,
            end: `${s.date}T${et}:00`,
            backgroundColor: "#dcfce7",
            borderColor: "#dcfce7",
            textColor: "#166534",
            extendedProps: {
              slotId: s.id,
              patientIndex: i,
              status,
              location: s.location,
              scheduleId: s.schedule_id
            }
          })
        }
      })
    }
    
    return events
  }, [slots, currentView, scheduleDates])

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
      
      if (genSlots && genSlots.length) {
        setSlots(prev => [...genSlots, ...prev])
      } else if (created?.id) {
        const fetched = await schedulesApi.getSlotsForSchedule(created.id)
        setSlots(prev => [...fetched, ...prev])
      }
      
      // Force calendar refresh
      setSlots(prev => [...prev])
      setDrawerOpen(false)
      console.log("Showing success toast")
      toast({
        title: "Success",
        description: "Schedule created successfully",
      })
      // Ensure all data is in sync with backend
      await refreshAll()
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
          formReset({
            start_date: "",
            end_date: "",
            start_time: "",
            end_time: "",
            slot_duration_minutes: 30,
            patients_per_slot: 1,
            location: "",
            days_of_week: [],
            recurring_interval_weeks: 1,
          })
          setDrawerOpen(true)
        }}>Add Schedule</Button>
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
            datesSet={(arg: any) => {
              const viewType = arg?.view?.type
              setCurrentView(viewType)
              const from = arg?.view?.currentStart as Date | undefined
              const to = arg?.view?.currentEnd as Date | undefined
              if (from && to) {
                const fromISO = from.toISOString().slice(0,10)
                const toISO = to.toISOString().slice(0,10)
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
              if (currentView !== "dayGridMonth") return
              const props = info?.event?.extendedProps || {}
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
              // Scope + anchor based on clicked day
              setOperationScope("this_day")
              setAnchorDate(clickedDate)
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
                        formReset({
                          start_date: schedule.start_date,
                          end_date: schedule.end_date,
                          start_time: schedule.start_time.slice(0, 5),
                          end_time: schedule.end_time.slice(0, 5),
                          slot_duration_minutes: schedule.slot_duration_minutes,
                          patients_per_slot: schedule.patients_per_slot,
                          location: schedule.location,
                          days_of_week: [...schedule.days_of_week],
                          recurring_interval_weeks: schedule.recurring_interval_weeks,
                        })
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

      {/* Right-side drawer (simple overlay panel) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white shadow-xl flex flex-col">
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
                    <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setFormValue("start_date", e.target.value, { shouldDirty: true }) }} />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setFormValue("end_date", e.target.value, { shouldDirty: true }) }} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input placeholder="--:--" type="time" value={startTime} onChange={e => { setStartTime(e.target.value); setFormValue("start_time", e.target.value, { shouldDirty: true }) }} />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input placeholder="--:--" type="time" value={endTime} onChange={e => { setEndTime(e.target.value); setFormValue("end_time", e.target.value, { shouldDirty: true }) }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Select value={String(slotDuration)} onValueChange={(v) => { setSlotDuration(Number(v)); setFormValue("slot_duration_minutes", Number(v), { shouldDirty: true }) }}>
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
                  <Select value={String(patientsPerSlot)} onValueChange={(v) => { setPatientsPerSlot(Number(v)); setFormValue("patients_per_slot", Number(v), { shouldDirty: true }) }}>
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

              {/* Operation Scope (only for update; anchor_date comes from clicked date) */}
              {isEditing && (
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <Select value={operationScope} onValueChange={(v) => setOperationScope(v as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="this_day">This day</SelectItem>
                      <SelectItem value="subsequent_days">This and subsequent days</SelectItem>
                      <SelectItem value="later_days">Later days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Weekdays</Label>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {[
                    "MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"
                  ].map(d => (
                    <Button key={d} type="button" variant={daysOfWeek.includes(d) ? "secondary" : "outline"} onClick={() => {
                      setDaysOfWeek(prev => {
                        const next = prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
                        setFormValue("days_of_week", next, { shouldDirty: true })
                        return next
                      })
                    }}>
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
                  max="4" 
                  value={recurringIntervalWeeks} 
                  onChange={e => { const val = Number(e.target.value); setRecurringIntervalWeeks(val); setFormValue("recurring_interval_weeks", val, { shouldDirty: true }) }}
                  placeholder="1"
                />
                <div className="text-xs text-muted-foreground">
                  How often this schedule repeats 
                </div>
              </div>

            </div>
            <div className="p-4 border-t flex gap-2 justify-end">
              {isEditing && (
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (!editingScheduleId) return
                    try {
                      await schedulesApi.delete(editingScheduleId, { scope: operationScope, anchor_date: anchorDate })
                      // Remove schedule and its slots locally
                      setSchedules(prev => prev.filter(s => s.id !== editingScheduleId))
                      setSlots(prev => prev.filter(s => s.schedule_id !== editingScheduleId))
                    setDrawerOpen(false)
                      toast({ title: "Deleted", description: "Schedule deleted successfully" })
                      // Refresh lists to reflect backend state
                      await refreshAll()
                    } catch (e: any) {
                      // Parse structured error to trigger reschedule modal when required
                      let code: string | undefined
                      let message: string | undefined
                      let bookedCount: number | undefined
                      if (typeof e?.message === "string") {
                        try {
                          const parsed = JSON.parse(e.message)
                          if (parsed && typeof parsed === "object") {
                            code = (parsed as any).code
                            message = (parsed as any).message
                            bookedCount = (parsed as any).booked_slots_count
                          }
                        } catch { /* ignore */ }
                      }
                      const detail = e?.response?.data?.detail
                      if (!code && typeof detail === "object") code = (detail as any)?.code
                      if (!message && typeof detail === "object") message = (detail as any)?.message
                      if (!bookedCount && typeof detail === "object") bookedCount = (detail as any)?.booked_slots_count

                      if (code === "RESCHEDULE_REQUIRED") {
                        const loc = await resolveLocationForAnchor(editingScheduleId, anchorDate)
                        if (loc) {
                          openRescheduleModal(editingScheduleId, loc, bookedCount || 0, operationScope, anchorDate)
                        } else {
                          toast({ title: "Error", description: message || "Location not found for rescheduling", variant: "destructive" })
                        }
                      } else {
                        toast({ title: "Error", description: message || e?.message || "Failed to delete schedule", variant: "destructive" })
                      }
                    }
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
                      // For update: do not send day range or location
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
                        // replace slots belonging to this schedule
                        setSlots(prev => [
                          ...prev.filter(s => s.schedule_id !== editingScheduleId),
                          ...regenerated,
                        ])
                      }
                      setDrawerOpen(false)
                      toast({ title: "Updated", description: "Schedule updated successfully" })
                      // Ensure UI reflects any backend-side changes
                      await refreshAll()
                    } catch (e: any) {
                      // Check if this is a reschedule required error
                      let code: string | undefined
                      let message: string | undefined
                      let bookedCount: number | undefined
                      
                      // Parse ApiError.message JSON if present
                      if (typeof e?.message === "string") {
                        try {
                          const parsed = JSON.parse(e.message)
                          if (parsed && typeof parsed === "object") {
                            code = (parsed as any).code
                            message = (parsed as any).message
                            bookedCount = (parsed as any).booked_slots_count
                          }
                        } catch { /* ignore */ }
                      }
                      
                      const detail = e?.response?.data?.detail
                      if (!code && typeof detail === "object") code = (detail as any)?.code
                      if (!message && typeof detail === "object") message = (detail as any)?.message
                      if (!bookedCount && typeof detail === "object") bookedCount = (detail as any)?.booked_slots_count
                      
                      if (code === "RESCHEDULE_REQUIRED") {
                        const loc = await resolveLocationForAnchor(editingScheduleId, anchorDate)
                        if (loc) {
                          openRescheduleModal(editingScheduleId, loc, bookedCount || 0, operationScope, anchorDate)
                        } else {
                          toast({ title: "Error", description: message || "Location not found for rescheduling", variant: "destructive" })
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
                        toast({ title: "Error", description: message || e?.message || "Failed to update schedule", variant: "destructive" })
                      }
                    }
                  }}
                  disabled={!startTime || !endTime || !location || !isDirty}
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
    </div>
  )
}


