"use client"

import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import dynamic from "next/dynamic"
import { format, parseISO } from "date-fns"
import { Button } from "@/components/ui/button"
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

  const [creating, setCreating] = useState(false)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingAll, setLoadingAll] = useState(false)
  const [loadError, setLoadError] = useState<string>("")
  const [currentView, setCurrentView] = useState<string>("dayGridMonth")
  const [dayModalOpen, setDayModalOpen] = useState(false)
  const [dayModalDate, setDayModalDate] = useState<string>("")
  const [dayModalItems, setDayModalItems] = useState<Array<{scheduleId: string; location: string; start: string; end: string}>>([])

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
            allSlots.push(...sSlots)
          } catch (e) {
            // ignore per-schedule error to continue others
          }
        }
        if (cancelled) return
        setSlots(allSlots)
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
      slots.forEach(s => {
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
  }, [slots, currentView])

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
            datesSet={(arg: any) => setCurrentView(arg?.view?.type)}
            eventClick={(info: any) => {
              if (currentView !== "dayGridMonth") return
              const scheduleId = info?.event?.extendedProps?.scheduleId as string | undefined
              if (!scheduleId) return
              // Prefill drawer from schedule and event times
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
              setEditingScheduleId(scheduleId)
              setIsEditing(true)
              setDrawerOpen(true)
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
              <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Close</Button>
            </div>
            <div className="p-4 space-y-4 overflow-auto">
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

              <div className="space-y-2">
                <Label>Location</Label>
                <Input placeholder="Location" value={location} onChange={e => { setLocation(e.target.value); setFormValue("location", e.target.value, { shouldDirty: true }) }} />
              </div>

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
                  max="52" 
                  value={recurringIntervalWeeks} 
                  onChange={e => { const val = Number(e.target.value); setRecurringIntervalWeeks(val); setFormValue("recurring_interval_weeks", val, { shouldDirty: true }) }}
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
                  disabled={!isDirty}
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
    </div>
  )
}


