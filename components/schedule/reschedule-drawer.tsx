"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { X } from "lucide-react"
import { schedulesApi, appointmentsApi } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

type Props = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  patient?: any
  initialDate?: string
  initialLocation?: string
  onConfirm?: (payload: any) => void
  onDone?: () => void
  // appointmentId to reschedule
  appointmentId?: string | null
}

export function RescheduleDrawer({ open: controlledOpen, onOpenChange, patient, initialDate, initialLocation, onConfirm, onDone, appointmentId }: Props) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = typeof controlledOpen === 'boolean' ? controlledOpen : internalOpen
  const setOpen = (v: boolean) => {
    if (typeof onOpenChange === 'function') onOpenChange(v)
    if (typeof controlledOpen !== 'boolean') setInternalOpen(v)
  }

  const { toast } = useToast()

  const [selectedDate, setSelectedDate] = React.useState<string | undefined>(initialDate)
  const [selectedLocation, setSelectedLocation] = React.useState<string | undefined>(initialLocation)

  const [dates, setDates] = React.useState<string[]>([])
  const [locations, setLocations] = React.useState<string[]>([])
  const [loadingDates, setLoadingDates] = React.useState(false)
  const [loadingLocations, setLoadingLocations] = React.useState(false)
  const [rescheduling, setRescheduling] = React.useState(false)
  const [candidateSlots, setCandidateSlots] = React.useState<Array<any>>([])
  const [selectedSlotId, setSelectedSlotId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setSelectedDate(initialDate)
    setSelectedLocation(initialLocation)

    // load available dates from schedules
    let cancelled = false
    ;(async () => {
      setLoadingDates(true)
      try {
        const list = await schedulesApi.list()
        if (cancelled) return
        const datesSet = new Set<string>()
        for (const sched of list) {
          try {
            const sSlots = await schedulesApi.getSlotsForSchedule(sched.id)
            ;(sSlots || []).forEach((ss: any) => { if (ss?.date) datesSet.add(ss.date) })
          } catch (e) {
            // ignore per-schedule fetch errors
          }
        }
        setDates(Array.from(datesSet).sort())
      } catch (e) {
        // ignore
      } finally {
        if (!cancelled) setLoadingDates(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, initialDate, initialLocation])

  // When date changes, compute available locations for that date from slots
  React.useEffect(() => {
    let cancelled = false
    if (!selectedDate) return
    ;(async () => {
      setLoadingLocations(true)
      try {
        const list = await schedulesApi.list()
        if (cancelled) return
        const locSet = new Set<string>()
        for (const sched of list) {
          try {
            const sSlots = await schedulesApi.getSlotsForSchedule(sched.id)
            ;(sSlots || []).forEach((ss: any) => {
              if (ss?.date === selectedDate && ss?.location) locSet.add(ss.location)
            })
          } catch (e) {
            // ignore per-schedule errors
          }
        }
        setLocations(Array.from(locSet))
      } catch (e) {
        // ignore
      } finally {
        if (!cancelled) setLoadingLocations(false)
      }
    })()
    return () => { cancelled = true }
  }, [selectedDate])

  // When both date and location change, compute exact candidate slots (times)
  React.useEffect(() => {
    let cancelled = false
    setCandidateSlots([])
    setSelectedSlotId(null)
    if (!selectedDate || !selectedLocation) return
    ;(async () => {
      try {
        const list = await schedulesApi.list()
        if (cancelled) return
        const slotsAcc: any[] = []
        for (const sched of list) {
          try {
            const sSlots = await schedulesApi.getSlotsForSchedule(sched.id)
            ;(sSlots || []).forEach((ss: any) => {
              if (ss?.date === selectedDate && ss?.location === selectedLocation) {
                // consider available slots only
                if (!ss.status || String(ss.status).toUpperCase() === 'AVAILABLE' || ss.current_patients < (ss.max_patients || 1)) {
                  slotsAcc.push({ id: String(ss.id || ss.slot_id), start: ss.start_time, end: ss.end_time, schedule_id: sched.id, raw: ss })
                }
              }
            })
          } catch (e) {
            // ignore per-schedule error
          }
        }
        // sort by start time
        slotsAcc.sort((a,b) => String(a.start).localeCompare(String(b.start)))
        if (!cancelled) setCandidateSlots(slotsAcc)
      } catch (e) {
        // ignore
      }
    })()
    return () => { cancelled = true }
  }, [selectedDate, selectedLocation])

  const handleConfirm = async () => {
    if (!appointmentId) return toast({ title: 'Missing appointment', description: 'Appointment id not found', variant: 'destructive' })
    if (!selectedDate || !selectedLocation) return
    if (rescheduling) return
    setRescheduling(true)
    try {
      // require a specific slot selection (from candidateSlots)
      if (!selectedSlotId) {
        toast({ title: 'Choose slot', description: 'Please select a specific slot/time', variant: 'destructive' })
        return
      }

      const user = JSON.parse(localStorage.getItem('user') || '{}')
      const userId = user.id || user._id
      const patientId = patient?.id || patient?._id
      if (!userId || !patientId) {
        toast({ title: 'Missing user/patient', description: 'Login and patient info required', variant: 'destructive' })
        return
      }
      // Validate the selected slot by fetching the parent schedule's slots to get freshest state
      const scheduleId = candidateSlots.find(c => c.id === selectedSlotId)?.schedule_id || candidateSlots[0]?.schedule_id
      if (!scheduleId) {
        toast({ title: 'Validation failed', description: 'Could not determine schedule for selected slot', variant: 'destructive' })
        return
      }

      try {
        const freshSlots = await schedulesApi.getSlotsForSchedule(String(scheduleId))
        const match = (freshSlots || []).map((s: any) => ({ id: String(s.id || s.slot_id), start: s.start_time, end: s.end_time, schedule_id: String(scheduleId), raw: s })).find((x: any) => x.id === selectedSlotId)
        if (!match) {
          toast({ title: 'Slot unavailable', description: 'Selected slot is no longer available. Please pick another slot.', variant: 'destructive' })
          // refresh candidate slots list
          setCandidateSlots(prev => prev.filter(p => p.id !== selectedSlotId))
          return
        }

        // check capacity on the fresh slot record
        const raw = match.raw || {}
        const maxPatients = Number(raw.max_patients ?? raw.patients_per_slot ?? raw.capacity ?? 1)
        const current = Number(raw.current_patients ?? raw.filled_count ?? raw.booked_count ?? 0)
        if (current >= maxPatients) {
          toast({ title: 'Slot full', description: 'Selected slot is already full. Choose another time.', variant: 'destructive' })
          return
        }
      } catch (e) {
        // If validation fetch fails, proceed but warn (best-effort)
        console.warn('Failed to validate slot before reschedule', e)
      }

  // call reschedule API with the selected slot id (include schedule_id and appointment_id if available)
  const payload: any = { slot_id: selectedSlotId, patient_id: String(patientId) }
  // include source appointment id in body as some backends expect it
  if (appointmentId) payload.appointment_id = String(appointmentId)
      const candidate = candidateSlots.find(c => c.id === selectedSlotId)
      if (candidate && candidate.schedule_id) payload.schedule_id = String(candidate.schedule_id)

      const res = await appointmentsApi.reschedule(appointmentId, payload)
      toast({ title: 'Rescheduled', description: res?.message || 'Appointment rescheduled' })
      // call parent refresh if provided
      try { if (typeof onDone === 'function') onDone() } catch (e) {}
      setOpen(false)
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message || 'Could not reschedule', variant: 'destructive' })
    } finally {
      setRescheduling(false)
    }
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className={`absolute top-0 h-full w-full max-w-sm bg-white shadow-xl transform transition-transform right-0 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="text-lg font-semibold">Reschedule appointment</div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="h-4 w-4"/></Button>
            </div>
            <div className="p-4 space-y-4 overflow-auto">
              <div>
                <Label>Patient</Label>
                <div className="mt-2 p-3 border rounded-md bg-gray-50">
                  <div className="text-sm font-medium">{patient ? `${patient.firstname || ''} ${patient.lastname || ''}`.trim() : 'Unknown patient'}</div>
                  {patient?.email && <div className="text-xs text-muted-foreground">{patient.email}</div>}
                  {patient?.phone && <div className="text-xs text-muted-foreground">{patient.phone}</div>}
                </div>
              </div>

              <div>
                <Label>Select date</Label>
                <Select value={selectedDate} onValueChange={(v) => setSelectedDate(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingDates ? 'Loading dates...' : 'Choose a date'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(dates.length === 0 && initialDate) && <SelectItem value={initialDate}>{initialDate}</SelectItem>}
                    {dates.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Select location</Label>
                <Select value={selectedLocation} onValueChange={(v) => setSelectedLocation(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingLocations ? 'Loading locations...' : 'Choose location'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(locations.length === 0 && initialLocation) && <SelectItem value={initialLocation}>{initialLocation}</SelectItem>}
                    {locations.map(l => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedDate && (
                  <div className="mt-2 text-xs text-muted-foreground">Showing locations available on {selectedDate}</div>
                )}
              </div>

              {/* Candidate exact slots for chosen date+location */}
              <div>
                <Label>Available times</Label>
                <div className="mt-2 space-y-2 max-h-40 overflow-auto border rounded p-2">
                  {candidateSlots.length === 0 && <div className="text-sm text-muted-foreground">No available slots for selected date/location</div>}
                  {candidateSlots.map(cs => (
                    <button key={cs.id} className={`w-full text-left p-2 rounded ${selectedSlotId === cs.id ? 'bg-blue-50 border' : 'hover:bg-gray-50'}`} onClick={() => setSelectedSlotId(cs.id)}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm">{`${cs.start} - ${cs.end}`}</div>
                        <div className="text-xs text-muted-foreground">{cs.schedule_id}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <Button className="w-full" onClick={handleConfirm} disabled={!selectedDate || !selectedLocation || rescheduling}>{rescheduling ? 'Rescheduling...' : 'Confirm'}</Button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
