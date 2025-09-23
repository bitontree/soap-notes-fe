"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { X } from "lucide-react"
import { schedulesApi, appointmentsApi, authApi } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

type Props = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  patient?: any
  initialDate?: string
  initialLocation?: string
  onConfirm?: (payload: any) => void
  onDone?: () => void
  // source identifiers to locate the appointment to reschedule
  sourceSlotId?: string | null
  sourcePatientId?: string | null
  // current calendar view to determine availability
  currentView?: string
}

export function RescheduleDrawer({ open: controlledOpen, onOpenChange, patient, initialDate, initialLocation, onConfirm, onDone, sourceSlotId, sourcePatientId, currentView }: Props) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = typeof controlledOpen === 'boolean' ? controlledOpen : internalOpen
  const setOpen = (v: boolean) => {
    if (typeof onOpenChange === 'function') onOpenChange(v)
    if (typeof controlledOpen !== 'boolean') setInternalOpen(v)
  }

  const { toast } = useToast()

  // Do not pre-select date/location — always start blank when opening
  const [selectedDate, setSelectedDate] = React.useState<string | undefined>(undefined)
  const [selectedLocation, setSelectedLocation] = React.useState<string | undefined>(undefined)
  const [displayPatient, setDisplayPatient] = React.useState<any | null>(patient || null)
  const [loadingPatient, setLoadingPatient] = React.useState<boolean>(false)

  const [dates, setDates] = React.useState<string[]>([])
  const [locations, setLocations] = React.useState<string[]>([])
  const [loadingDates, setLoadingDates] = React.useState(false)
  const [loadingLocations, setLoadingLocations] = React.useState(false)
  const [rescheduling, setRescheduling] = React.useState(false)
  const [candidateSlots, setCandidateSlots] = React.useState<Array<any>>([])
  const [selectedSlotId, setSelectedSlotId] = React.useState<string | null>(null)
  const [showSlotList, setShowSlotList] = React.useState<boolean>(true)

  React.useEffect(() => {
    if (!open) return
  // Always clear selection state when opening the drawer. We still use
  // `initialDate`/`initialLocation` to anchor backend queries where helpful,
  // but nothing should be pre-selected or shown in the UI other than patient info.
  setSelectedDate(undefined)
  setSelectedLocation(undefined)
  setCandidateSlots([])
  setSelectedSlotId(null)
  setLocations([])
  setDates([])
  // Clear or set immediate snapshot of displayPatient so previous patient's info
  // does not flash while we fetch the target patient's data asynchronously.
  setDisplayPatient(patient || null)
  // If we need to fetch the patient (we have only an id), show loading state
  setLoadingPatient(!patient && !!sourcePatientId)
    // populate displayPatient if not provided but we have sourcePatientId
    let cancelled = false
      ; (async () => {
        if (!patient && sourcePatientId) {
          try {
            setLoadingPatient(true)
            const list = await authApi.getPatients()
            if (cancelled) return
            const found = (list || []).find((p: any) => String(p.id || p._id) === String(sourcePatientId)) || null
            setDisplayPatient(found)
          } catch (e) {
            // ignore
          } finally {
            if (!cancelled) setLoadingPatient(false)
          }
        } else {
          // already set synchronously above; ensure consistent state
          setDisplayPatient(patient || null)
          setLoadingPatient(false)
        }
      })()
      // load available dates from schedules
      ; (async () => {
        setLoadingDates(true)
        try {
          // If we have an initial booked date, prefer the backend endpoint
          // which returns a 30-day window anchored to that booked_date.
          if (initialDate) {
            try {
              const datesResp = await schedulesApi.getDatesWithAvailableSlots(initialDate)
              if (cancelled) return
              const onlyDates = (datesResp || []).map((d: any) => d.date).filter(Boolean)
              setDates(Array.from(new Set(onlyDates)).sort())
              return
            } catch (err) {
              console.warn('getDatesWithAvailableSlots failed, falling back to aggregation', err)
            }
          }

          // Fallback: aggregate dates from schedules/slots
          const list = await schedulesApi.list()
          if (cancelled) return
          const datesSet = new Set<string>()
          for (const sched of list) {
            try {
              const sSlots = await schedulesApi.getSlotsForSchedule(sched.id)
                ; (sSlots || []).forEach((ss: any) => { if (ss?.date) datesSet.add(ss.date) })
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
      ; (async () => {
        setLoadingLocations(true)
        try {
          // Prefer backend endpoint that returns locations with available slots for the date
          try {
            const locs = await schedulesApi.getLocationsWithAvailableSlots(selectedDate)
            if (cancelled) return
            const onlyLocations = (locs || []).map((l: any) => l.location).filter(Boolean)
            setLocations(Array.from(new Set(onlyLocations)))
            return
          } catch (err) {
            console.warn('getLocationsWithAvailableSlots failed, falling back', err)
          }

          // Fallback: fetch all slots for the date in a single call and derive locations
          try {
            const allSlots = await schedulesApi.getSlotsRange(selectedDate, selectedDate)
            if (cancelled) return
            const locSet = new Set<string>()
            ;(allSlots || []).forEach((ss: any) => {
              if (ss?.date === selectedDate && ss?.location) locSet.add(ss.location)
            })
            setLocations(Array.from(locSet))
            return
          } catch (err) {
            // Fallback to per-schedule loop only if getSlotsRange is unavailable
            console.warn('getSlotsRange failed, falling back to per-schedule aggregation', err)
            const list = await schedulesApi.list()
            if (cancelled) return
            const locSet = new Set<string>()
            for (const sched of list) {
              try {
                const sSlots = await schedulesApi.getSlotsForSchedule(sched.id)
                  ; (sSlots || []).forEach((ss: any) => {
                    if (ss?.date === selectedDate && ss?.location) locSet.add(ss.location)
                  })
              } catch (e) {
                // ignore per-schedule errors
              }
            }
            setLocations(Array.from(locSet))
            return
          }
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
    setShowSlotList(true)
    if (!selectedDate || !selectedLocation) return
      ; (async () => {
        try {
          // Prefer backend single-call to fetch slots for the location+date
          try {
            const slots = await schedulesApi.getSlotsForLocationAndDate(selectedLocation, selectedDate)
            if (cancelled) return
            const slotsAcc: any[] = (slots || []).map((ss: any) => ({ id: String(ss.id || ss.slot_id), start: ss.start_time || ss.start, end: ss.end_time || ss.end, schedule_id: ss.schedule_id || ss.scheduleId || undefined, raw: ss }))
            // filter availability
            const filtered = slotsAcc.filter((s: any) => {
              const raw = s.raw || {}
              const status = raw.status || raw.state || null
              const maxPatients = Number(raw.max_patients ?? raw.patients_per_slot ?? raw.capacity ?? 1)
              const current = Number(raw.current_patients ?? raw.filled_count ?? raw.booked_count ?? 0)
              return (!status || String(status).toUpperCase() === 'AVAILABLE' || current < maxPatients)
            })
            filtered.sort((a: any, b: any) => String(a.start).localeCompare(String(b.start)))
            if (!cancelled) setCandidateSlots(filtered)
            return
          } catch (err) {
            console.warn('getSlotsForLocationAndDate failed, falling back', err)
          }

          // Fallback: fetch all slots for the date in a single call and filter by location
          try {
            const allSlots = await schedulesApi.getSlotsRange(selectedDate, selectedDate)
            if (cancelled) return
            const slotsAcc: any[] = []
            ;(allSlots || []).forEach((ss: any) => {
              if (ss?.date === selectedDate && ss?.location === selectedLocation) {
                if (!ss.status || String(ss.status).toUpperCase() === 'AVAILABLE' || ss.current_patients < (ss.max_patients || 1)) {
                  slotsAcc.push({ id: String(ss.id || ss.slot_id), start: ss.start_time || ss.start, end: ss.end_time || ss.end, schedule_id: ss.schedule_id || ss.scheduleId || undefined, raw: ss })
                }
              }
            })
            slotsAcc.sort((a, b) => String(a.start).localeCompare(String(b.start)))
            if (!cancelled) setCandidateSlots(slotsAcc)
            return
          } catch (err) {
            console.warn('getSlotsRange failed, falling back to per-schedule aggregation', err)
            const list = await schedulesApi.list()
            if (cancelled) return
            const slotsAcc: any[] = []
            for (const sched of list) {
              try {
                const sSlots = await schedulesApi.getSlotsForSchedule(sched.id)
                  ; (sSlots || []).forEach((ss: any) => {
                    if (ss?.date === selectedDate && ss?.location === selectedLocation) {
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
            slotsAcc.sort((a, b) => String(a.start).localeCompare(String(b.start)))
            if (!cancelled) setCandidateSlots(slotsAcc)
            return
          }
        } catch (e) {
          // ignore
        }
      })()
    return () => { cancelled = true }
  }, [selectedDate, selectedLocation])

  const handleConfirm = async () => {
    if (!sourceSlotId || !sourcePatientId) return toast({ title: 'Missing identifiers', description: 'slot id and patient id required to locate appointment', variant: 'destructive' })
    if (!selectedDate || !selectedLocation) return
    if (rescheduling) return
    setRescheduling(true)
    try {
      // require a specific slot selection (from candidateSlots)
      if (!selectedSlotId) {
        toast({ title: 'Choose slot', description: 'Please select a specific slot/time', variant: 'destructive', duration: 2000 })
        return
      }

      const user = JSON.parse(localStorage.getItem('user') || '{}')
      const userId = user.id || user._id
      const patientId = patient?.id || patient?._id || sourcePatientId
      if (!userId || !patientId) {
        toast({ title: 'Missing user/patient', description: 'Login and patient info required', variant: 'destructive', duration: 2000 })
        return
      }
      // Validate the selected slot by fetching the parent schedule's slots to get freshest state
      let scheduleId = candidateSlots.find(c => c.id === selectedSlotId)?.schedule_id || candidateSlots[0]?.schedule_id

      // If schedule_id is missing, try a single-range fetch for the selected date to resolve mapping
      if (!scheduleId && selectedDate) {
        try {
          const allSlots = await schedulesApi.getSlotsRange(selectedDate, selectedDate)
          const mapping: Record<string, string> = {}
          ;(allSlots || []).forEach((s: any) => {
            const sid = String(s.id ?? s.slot_id ?? s._id ?? '')
            const sched = s.schedule_id ?? s.scheduleId ?? s.parent_schedule_id ?? undefined
            if (sid && sched) mapping[sid] = String(sched)
          })
          scheduleId = mapping[selectedSlotId] || undefined
          if (scheduleId) {
            // update candidateSlots in-memory so subsequent code can use schedule_id
            setCandidateSlots(prev => prev.map(p => p.id === selectedSlotId ? { ...p, schedule_id: scheduleId } : p))
          }
        } catch (err) {
          console.warn('getSlotsRange failed while resolving schedule_id', err)
        }
      }

      if (!scheduleId) {
        console.warn('Could not resolve schedule_id for selected slot', { selectedSlotId, candidateSlots, selectedDate })
        toast({ title: 'Validation failed', description: 'Could not determine schedule for selected slot — please refresh and try again', variant: 'destructive' })
        return
      }

      try {
        const freshSlots = await schedulesApi.getSlotsForSchedule(String(scheduleId))
        const match = (freshSlots || []).map((s: any) => ({ id: String(s.id || s.slot_id), start: s.start_time, end: s.end_time, schedule_id: String(scheduleId), raw: s })).find((x: any) => x.id === selectedSlotId)
        if (!match) {
          toast({ title: 'Slot unavailable', description: 'Selected slot is no longer available. Please pick another slot.', variant: 'destructive', duration: 2000 })
          // refresh candidate slots list
          setCandidateSlots(prev => prev.filter(p => p.id !== selectedSlotId))
          return
        }

        // check capacity on the fresh slot record
        const raw = match.raw || {}
        const maxPatients = Number(raw.max_patients ?? raw.patients_per_slot ?? raw.capacity ?? 1)
        const current = Number(raw.current_patients ?? raw.filled_count ?? raw.booked_count ?? 0)
        if (current >= maxPatients) {
          toast({ title: 'Slot full', description: 'Selected slot is already full. Choose another time.', variant: 'destructive', duration: 2000 })
          return
        }
      } catch (e) {
        // If validation fetch fails, proceed but warn (best-effort)
        console.warn('Failed to validate slot before reschedule', e)
      }

      // call reschedule API with the selected slot id (include schedule_id and appointment_id if available)
      const payload: any = { slot_id: selectedSlotId, patient_id: String(patientId) }

      // Resolve appointment id by strict match: slot_id + patient_id
      let appointmentIdToUse: string | null = null
      try {
        const api = await import('@/lib/api')
        const freshAppts = await api.appointmentsApi.getForUser(userId)
        const saneAppts = (freshAppts || [])
        const found = (saneAppts || []).find((a: any) => String(a.slot_id) === String(sourceSlotId) && String(a.patient_id || a.patient?.id || a.patient?._id) === String(sourcePatientId)) || null
        if (!found) {
          toast({ title: 'Appointment not found', description: 'Could not find appointment for given slot and patient. Please refresh and try again.', variant: 'destructive' })
          setRescheduling(false)
          return
        }
        appointmentIdToUse = found?._id || found?.id || found?.appointment_id || null
        if (!appointmentIdToUse) {
          toast({ title: 'Appointment id missing', description: 'Found appointment but id field is missing', variant: 'destructive' })
          setRescheduling(false)
          return
        }
        // include source appointment id in body as some backends expect it
        payload.appointment_id = String(appointmentIdToUse)
      } catch (e) {
        toast({ title: 'Failed', description: 'Could not lookup appointment for reschedule', variant: 'destructive', duration: 2000 })
        setRescheduling(false)
        return
      }
      const candidate = candidateSlots.find(c => c.id === selectedSlotId)
      if (candidate && candidate.schedule_id) payload.schedule_id = String(candidate.schedule_id)

        const res = await appointmentsApi.reschedule(appointmentIdToUse, payload)
        toast({ title: 'Rescheduled', description: res?.message || 'Appointment rescheduled', duration: 2000 })
      // call parent refresh if provided
      try { if (typeof onDone === 'function') onDone() } catch (e) { }
      setOpen(false)
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message || 'Could not reschedule', variant: 'destructive', duration: 3000 })
    } finally {
      setRescheduling(false)
    }
  }

  // Only allow reschedule drawer in weekly and daily views, not monthly
  const isViewAllowed = currentView === "timeGridWeek" || currentView === "timeGridDay"

  // If the view is not allowed, don't render the drawer
  if (!isViewAllowed && open) {
    // Close the drawer if it's opened in an unsupported view
    if (onOpenChange) {
      onOpenChange(false)
    }
    return null
  }

  // Render overlay into document.body to avoid transform/stacking context issues
  if (!open) return null

  const overlay = (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
      <aside className={`absolute top-0 h-full w-full max-w-sm bg-white shadow-xl transform transition-transform ${open ? 'translate-x-0' : 'translate-x-full'} right-0`}>
        <div className="p-4 border-b flex items-center justify-between">
          <div className="text-lg font-semibold">Reschedule appointment</div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-4 space-y-4 overflow-auto">
          <div>
            <Label>Patient</Label>
            <div className="mt-2 p-3 border rounded-md bg-gray-50">
              <div className="text-sm font-medium">
                {loadingPatient ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-gray-300" />
                    <span>Loading patient...</span>
                  </div>
                ) : (
                  (displayPatient ? `${displayPatient.firstname || ''} ${displayPatient.lastname || ''}`.trim() : 'Unknown patient')
                )}
              </div>
              {!loadingPatient && displayPatient?.email && <div className="text-xs text-muted-foreground">{displayPatient.email}</div>}
              {!loadingPatient && displayPatient?.phone && <div className="text-xs text-muted-foreground">{displayPatient.phone}</div>}
            </div>
          </div>

          <div>
            <Label>Select date</Label>
            <Select value={selectedDate} onValueChange={(v) => setSelectedDate(v)}>
              <SelectTrigger>
                <SelectValue placeholder={loadingDates ? 'Loading dates...' : 'Choose a date'} />
              </SelectTrigger>
              <SelectContent>
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
            <div className="mt-2">
              {selectedSlotId && !showSlotList ? (
                (() => {
                  const sel = candidateSlots.find(c => c.id === selectedSlotId)
                  return (
                    <div className="flex items-center justify-between p-3 border rounded bg-gray-50">
                      <div>
                        <div className="text-sm">{sel ? `${sel.start} - ${sel.end}` : 'Selected time'}</div>
                      </div>
                      <div>
                        <Button variant="ghost" size="sm" onClick={() => setShowSlotList(true)}>Change</Button>
                      </div>
                    </div>
                  )
                })()
              ) : (
                <div className="mt-2 space-y-2 max-h-40 overflow-auto border rounded p-2">
                  {candidateSlots.length === 0 && <div className="text-sm text-muted-foreground">Please select a date and location first</div>}
                  {candidateSlots.map(cs => (
                    <button key={cs.id} className={`w-full text-left p-2 rounded ${selectedSlotId === cs.id ? 'bg-blue-50 border' : 'hover:bg-gray-50'}`} onClick={() => { setSelectedSlotId(cs.id); setShowSlotList(false); }}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm">{`${cs.start} - ${cs.end}`}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-2">
            <Button className="w-full" onClick={handleConfirm} disabled={!selectedDate || !selectedLocation || rescheduling}>{rescheduling ? 'Rescheduling...' : 'Confirm'}</Button>
          </div>
        </div>
      </aside>
    </div>
  )

  return createPortal(overlay, document.body)
}
