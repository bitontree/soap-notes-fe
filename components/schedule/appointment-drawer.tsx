"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { UserPlus, X, Calendar } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { authApi, schedulesApi } from "@/lib/api"
import { appointmentsApi } from "@/lib/api"
import { parseISO, isValid, format, differenceInYears } from 'date-fns'
// Use country-list-with-dial-code-and-flag package (installed)
import CountryList from 'country-list-with-dial-code-and-flag'

type Props = {
  open?: boolean
  initialDate?: string
  initialLocation?: string
  initialSlotId?: string
  initialSlotTime?: string
  initialPatientIndex?: number
  onOpenChange?: (open: boolean) => void
  onBooked?: (appt?: any) => void
  side?: "left" | "right"
}

export function AppointmentDrawer({ open: controlledOpen, initialDate, initialLocation, initialSlotId, initialSlotTime, initialPatientIndex, onOpenChange, onBooked, side = "left" }: Props) {
  const { toast } = useToast()
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = typeof controlledOpen === 'boolean' ? controlledOpen : internalOpen
  // local partition index target when booking from composite slots
  const [apptInitialPatientIndex, setApptInitialPatientIndex] = React.useState<number | undefined>(undefined)

  const setOpen = (v: boolean) => {
    if (typeof onOpenChange === 'function') onOpenChange(v)
    if (typeof controlledOpen !== 'boolean') setInternalOpen(v)
    // clear any local initial patient index when closing
    if (!v) setApptInitialPatientIndex(undefined)
  }

  const [query, setQuery] = React.useState("")
  const [patients, setPatients] = React.useState<any[]>([])
  const [loadingPatients, setLoadingPatients] = React.useState(false)
  const [selected, setSelected] = React.useState<any | null>(null)
  const [date, setDate] = React.useState("")
  const [location, setLocation] = React.useState("")
  const [slotId, setSlotId] = React.useState<string | undefined>(undefined)
  const [slotTime, setSlotTime] = React.useState<string | undefined>(undefined)
  const [showAddPatientForm, setShowAddPatientForm] = React.useState(false)
  const [newFirstname, setNewFirstname] = React.useState("")
  const [newLastname, setNewLastname] = React.useState("")
  const [newDobIso, setNewDobIso] = React.useState("") // yyyy-MM-dd for API
  const [newPhone, setNewPhone] = React.useState("")
  const [newEmail, setNewEmail] = React.useState("")
  const [newPhoneCountry, setNewPhoneCountry] = React.useState("+91")
  const [newGender, setNewGender] = React.useState("")
  const [creatingPatient, setCreatingPatient] = React.useState(false)
  const [booking, setBooking] = React.useState(false)
  const searchRef = React.useRef<HTMLInputElement | null>(null)

  // Reset inline new-patient fields whenever the inline form is opened
  React.useEffect(() => {
    if (showAddPatientForm) {
      setNewFirstname("")
      setNewLastname("")
      setNewDobIso("")
      setNewPhone("")
      setNewEmail("")
      setNewPhoneCountry("+91")
      setNewGender("")
    }
  }, [showAddPatientForm])

  // Derived validation state for enabling the Create button
  const phoneDigits = (newPhone || '').replace(/[^0-9]/g, '')
  const isPhoneValid = phoneDigits.length >= 5 && phoneDigits.length <= 11
  const isEmailValid = newEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)
  const isDobValid = (() => {
    if (!newDobIso) return false
    const m = newDobIso.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (!m) return false
    try { const dt = parseISO(newDobIso); return isValid(dt) } catch { return false }
  })()
  const canCreate = Boolean(newFirstname.trim() && newLastname.trim() && isPhoneValid && isEmailValid && isDobValid && newGender)

  // Load patients when drawer opens and sync initial props into local state
  React.useEffect(() => {
    let cancelled = false
    if (!open) return
    ;(async () => {
      try {
        setLoadingPatients(true)
        const list = await authApi.getPatients()
        if (!cancelled) setPatients(list || [])
      } catch (e: any) {
        toast({ title: "Failed to load patients", description: e?.message || "Please try again", variant: "destructive", duration: 2000 })
      } finally {
        if (!cancelled) setLoadingPatients(false)
      }
    })()

  // Always overwrite local slot/date/location state from incoming props when opening
  setDate(initialDate ?? "")
  setLocation(initialLocation ?? "")
  setSlotId(initialSlotId)
  // Accept an initial patient index (partition) so bookings target the right partition
  setApptInitialPatientIndex(initialPatientIndex)
  setSlotTime(initialSlotTime)
  // Clear any previously entered patient search or selection so the drawer is fresh per-slot
  setSelected(null)
  setQuery("")
  setShowAddPatientForm(false)

    // autofocus search field when drawer opens
    setTimeout(() => { try { searchRef.current?.focus() } catch (e) {} }, 50)

    return () => { cancelled = true }
  }, [open, initialDate, initialLocation, initialSlotId, initialSlotTime, initialPatientIndex, toast])

  // Debounced server search when query changes
  React.useEffect(() => {
    let cancelled = false
    if (!open) return
    if (!query || query.trim() === "") return
    const t = setTimeout(() => {
      ;(async () => {
        try {
          setLoadingPatients(true)
          const list = await authApi.getPatients()
          if (!cancelled) setPatients(list || [])
        } catch (e: any) {
          toast({ title: "Search failed", description: e?.message || "Could not search patients", variant: "destructive", duration: 2000 })
        } finally {
          setLoadingPatients(false)
        }
      })()
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, open, toast])

  const filtered = patients.filter(p => {
  if (!query) return true
  const q = query.toLowerCase()
  // search only by patient name
  return (`${p.firstname} ${p.lastname}`.toLowerCase().includes(q))
  })

  // Build country list from installed package
  const allCountries = React.useMemo(() => {
    const list = CountryList.getAll()
    return list.map((c: any) => ({ code: c.code, callingCode: c.dial_code, label: `${c.name} (${c.dial_code})` }))
  }, [])

  const handleAddPatient = async () => {
    // legacy quick-add via search box
    const name = query.trim()
  if (!name) { toast({ title: "Enter name", description: "Type a name to add", variant: "destructive", duration: 2000 }); return }
    const parts = name.split(/\s+/)
    const firstname = parts.slice(0, -1).join(" ") || parts[0]
    const lastname = parts.length > 1 ? parts[parts.length - 1] : ""
    try {
      // quick-add has no DOB input; default age 0
      const created = await authApi.createPatient({ firstname, lastname, age: 0, gender: "Other", dob: new Date().toISOString().slice(0,10) } as any)
  setPatients(prev => [created, ...prev])
  setSelected(created)
  // clear query to hide list after selection
  setQuery("")
  toast({ title: "Patient added", description: `${created.firstname} ${created.lastname} added.`, duration: 2000 })
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message || "Could not add patient", variant: "destructive", duration: 2000 })
    }
  }

  const handleCreatePatientInline = async () => {
    const firstname = newFirstname.trim()
    const lastname = newLastname.trim()
  if (!firstname) { toast({ title: "Missing", description: "Enter first name", variant: "destructive", duration: 2000 }); return }

    // validate phone number length (number part only)
    if (newPhone && newPhone.trim() !== "") {
      const digits = newPhone.replace(/[^0-9]/g, "")
        if (digits.length < 5 || digits.length > 11) {
        toast({ title: "Invalid phone", description: "Phone number must be between 5 and 11 digits (excluding country code)", variant: "destructive", duration: 2000 })
        return
      }
    }

    // validate email if provided
    if (newEmail && newEmail.trim() !== "") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        toast({ title: "Invalid email", description: "Enter a valid email address", variant: "destructive", duration: 2000 })
        return
      }
    }

    // validate/normalize DOB and ensure year is 4 digits when provided
    let dobToSend: string | undefined = undefined
  if (newDobIso && newDobIso.trim() !== "") {
      // require a 4-digit year somewhere in the input
      const yearMatch = newDobIso.match(/(\d{4})/)
      if (!yearMatch) {
        toast({ title: "Invalid DOB", description: "Year must be 4 digits (yyyy)", variant: "destructive", duration: 2000 })
        return
      }
      try {
        const dt = parseISO(newDobIso)
        if (!isValid(dt)) { throw new Error('invalid') }
        dobToSend = format(dt, 'yyyy-MM-dd')
      } catch (e) {
        toast({ title: "Invalid DOB", description: "Enter a valid date", variant: "destructive", duration: 2000 })
        return
      }
    } else {
      dobToSend = new Date().toISOString().slice(0,10)
    }

    if (creatingPatient) return
    setCreatingPatient(true)
    try {
      const fullPhone = newPhone ? `${newPhoneCountry}${newPhone}` : undefined
      // compute age from dobToSend
      let ageToSend = 0
      try {
        const dt = parseISO(dobToSend!)
        if (isValid(dt)) {
          ageToSend = Math.max(0, differenceInYears(new Date(), dt))
        }
      } catch (e) { /* ignore and keep age 0 */ }

      const created = await authApi.createPatient({ firstname, lastname, age: ageToSend, gender: newGender || "Other", dob: dobToSend, phone: fullPhone || undefined, email: newEmail || undefined } as any)

      // Try to reload the full patients list from server so UI is authoritative
      try {
        const list = await authApi.getPatients()
        setPatients(list || [])
        // Do not auto-select the created patient; leave the patient field empty
      } catch (reloadErr: any) {
        // If reload fails, fall back to prepending the created patient locally
        setPatients(prev => [created, ...prev])
  toast({ title: "Partial success", description: "Patient created but failed to reload list. Showing the new patient locally.", duration: 2000 })
      }

      // hide inline form and clear query to hide list
      setShowAddPatientForm(false)
      setQuery("")
      setNewFirstname("")
      setNewLastname("")
      setNewDobIso("")
      setNewGender("Other")
      setNewPhone("")
      setNewEmail("")
      setNewPhoneCountry("+91")

  toast({ title: "Patient added", description: `${created.firstname} ${created.lastname} added.`, duration: 2000 })
    } catch (e: any) {
  toast({ title: "Failed", description: e?.message || "Could not add patient", variant: "destructive", duration: 2000 })
    } finally {
      setCreatingPatient(false)
    }
  }

const handleConfirm = () => {
  (async () => {
    if (!selected || !date || !location || !slotId) {
      toast({ title: "Missing", description: "Select patient, date, location and slot", variant: "destructive", duration: 2000 });
      return;
    }
    if (booking) return;
    setBooking(true);

    try {
      // Pre-flight: verify slot status by searching schedules/slots for this slotId
      try {
        if (slotId) {
          const list = await schedulesApi.list()
          let found: any = null
          for (const sched of list) {
            try {
              const rawSlots = await schedulesApi.getSlotsForSchedule(sched.id)
              if (!rawSlots) continue
              const match = (rawSlots as any[]).find(rs => String(rs.id) === String(slotId) || String(rs.slot_id) === String(slotId))
              if (match) { found = match; break }
            } catch (e) { /* continue */ }
          }
          if (found) {
            const status = (found.status ?? found.state ?? (found.current_patients >= (found.max_patients ?? found.capacity ?? 0) ? 'FULL' : 'AVAILABLE')) as string
              if (String(status).toUpperCase() !== 'AVAILABLE') {
              toast({ title: "Slot not available", description: "This slot is no longer available. Please choose another slot.", variant: "destructive", duration: 2000 })
              setBooking(false)
              return
            }
          }
        }
      } catch (e) {
        // If pre-flight fails, log and continue with booking attempt (optimistic)
        console.error('Slot pre-flight check failed', e)
      }

      const buildPatient = (src: any) => {
        const firstname = (src?.firstname || newFirstname || "").trim();
        const lastname = (src?.lastname || newLastname || "").trim();
          if (!firstname || !lastname) {
          toast({ title: "Missing", description: "Patient must have a first and last name", variant: "destructive", duration: 2000 });
          return null;
        }
        let dobRaw = src?.dob || newDobIso || new Date().toISOString().slice(0, 10);
        let dobIso = dobRaw;
        try {
          const dt = parseISO(dobRaw);
          if (!isValid(dt)) throw new Error("invalid");
          dobIso = format(dt, "yyyy-MM-dd");
        } catch (err) {
          toast({ title: "Invalid DOB", description: "Enter a valid date for patient DOB", variant: "destructive", duration: 2000 });
          return null;
        }
        const age = Math.max(0, differenceInYears(new Date(), parseISO(dobIso)));
        const gender = src?.gender || newGender || "Other";
        const patient: any = { firstname, lastname, dob: dobIso, gender, age };
        if (src?.email) patient.email = src.email;
        if (src?.phone) patient.phone = src.phone;
        if (src?.address) patient.address = src.address;
        return patient;
      };

      // Build inline patient from selected OR inline inputs — include even when selected.id exists
      const patientInline = buildPatient(selected) || buildPatient({ firstname: newFirstname, lastname: newLastname, dob: newDobIso, gender: newGender }) || undefined;

      const payload: any = {
        slot_id: slotId,
        // include patient_id when selecting an existing patient
        patient_id: selected?.id || undefined,
        // include patient object so backend can persist firstname/lastname (backend prefers patient_inline)
        patient: patientInline,
        // target partition index for multi-patient slots (optional)
        patient_index: typeof apptInitialPatientIndex === 'number' ? apptInitialPatientIndex : undefined,
        notes: undefined,
      };

      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const userId = user.id || user._id;
      const res = await appointmentsApi.createForUser(userId, payload);

  toast({ title: "Appointment confirmed", description: `Appointment booked successfully.`, duration: 2000 });
      try {
        // Ensure we surface the intended patient_index to the parent even if
        // the backend does not echo it back. Use the local apptInitialPatientIndex
        // (set from incoming props) as the authoritative index when present.
        const created = (res as any) || {}
        if (typeof apptInitialPatientIndex === 'number' && typeof created.patient_index !== 'number') {
          created.patient_index = apptInitialPatientIndex
        }
        if (typeof onBooked === "function") onBooked(created);
      } catch (e) {}
      setOpen(false);
   // clear local initial index on close
   setApptInitialPatientIndex(undefined)
      setSelected(null);
      setDate("");
      setLocation("");
      setSlotId(undefined);
      setSlotTime(undefined);
    } catch (e: any) {
  toast({ title: "Booking failed", description: e?.message || "Could not book appointment", variant: "destructive", duration: 2000 });
    } finally {
      setBooking(false);
    }
  })();
};

  return (
    <>
      {/* If uncontrolled, render a trigger button. If controlled, parent manages opening. */}
      {typeof controlledOpen !== 'boolean' && (
        <Button onClick={() => setOpen(true)} className="mr-2">Add Appointment</Button>
      )}

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className={`absolute top-0 h-full w-full max-w-sm bg-white shadow-xl transform transition-transform ${side === 'right' ? 'right-0' : 'left-0'} ${open ? 'translate-x-0' : side === 'right' ? 'translate-x-full' : '-translate-x-full'}`}>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="text-lg font-semibold">Add Appointment</div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="h-4 w-4"/></Button>
            </div>
              <div className={`p-4 space-y-4 ${showAddPatientForm ? 'overflow-hidden' : 'overflow-auto'}`}>
              <div>
                <Label>Patient</Label>
                <div className="flex gap-2 relative">
                  <Input ref={searchRef} placeholder="Search Name..." value={selected ? `${selected.firstname} ${selected.lastname}` : query} onChange={e => { setQuery(e.target.value); setSelected(null) }} />
                  <div className="flex items-center gap-2">
                    {/* Primary Add button now opens the inline Quick Add form */}
                    <Button variant="outline" size="sm" onClick={() => setShowAddPatientForm(true)}><UserPlus className="h-4 w-4 mr-2"/>Add</Button>
                  </div>

                  {showAddPatientForm && (
                    // Fixed centered overlay so the form is fully visible and drawer doesn't need to scroll
                    <div className="fixed inset-0 z-50 flex items-center justify-center">
                      <div className="absolute inset-0 bg-black/30" onClick={() => setShowAddPatientForm(false)} />
                      <div className="relative w-80 bg-white border rounded shadow p-4 z-10">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">New Patient</div>
                          <Button variant="ghost" size="icon" onClick={() => setShowAddPatientForm(false)}><X className="h-4 w-4"/></Button>
                        </div>
                        <div className="mt-3 space-y-3">
                          <Label>First name</Label>
                          <Input value={newFirstname} onChange={e => setNewFirstname(e.target.value)} />
                          <Label>Last name</Label>
                          <Input value={newLastname} onChange={e => setNewLastname(e.target.value)} />
                          <Label>Phone</Label>
                          <div className="flex items-center gap-2">
                            <Select value={newPhoneCountry} onValueChange={(v: string) => setNewPhoneCountry(v)}>
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {allCountries.map((c:any) => (
                                  <SelectItem key={c.callingCode} value={c.callingCode}>{c.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input placeholder="Phone number" value={newPhone} onChange={e => {
                              const cleaned = e.target.value.replace(/[^0-9]/g, '')
                              setNewPhone(cleaned.slice(0, 11))
                            }} />
                          </div>
                          <Label>Email</Label>
                          <Input placeholder="name@example.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                          <Label>DOB</Label>
                          <div className="relative">
                            <Input
                              type="text"
                              inputMode="numeric"
                              placeholder="yyyy-mm-dd"
                              value={newDobIso}
                              className="pr-10"
                              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                // allow control keys and digits; block letters
                                const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End']
                                if (allowed.includes(e.key)) return
                                // allow hyphen as well
                                if (e.key === '-') return
                                // allow digits
                                if (/^[0-9]$/.test(e.key)) return
                                e.preventDefault()
                              }}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                // Accept only digits, build yyyy-mm-dd progressively
                                const raw = (e.target.value || '').replace(/[^0-9]/g, '')
                                const y = raw.slice(0,4)
                                const m = raw.slice(4,6)
                                const d = raw.slice(6,8)
                                let out = y
                                if (m.length) out += '-' + m
                                if (d.length) out += '-' + d
                                setNewDobIso(out)
                              }}
                              onBlur={() => {
                                if (!newDobIso) return
                                // require 4-digit year
                                const match = newDobIso.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
                                if (!match) {
                                  toast({ title: 'Invalid DOB', description: 'Enter date as yyyy-mm-dd', variant: 'destructive' })
                                  return
                                }
                                try {
                                  const dt = parseISO(newDobIso)
                                  if (!isValid(dt)) throw new Error('invalid')
                                  // normalize
                                  setNewDobIso(format(dt, 'yyyy-MM-dd'))
                                } catch (err) {
                                  toast({ title: 'Invalid DOB', description: 'Enter a valid date', variant: 'destructive' })
                                }
                              }}
                            />
                            <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                          </div>
                          <Label>Gender</Label>
                          <Select value={newGender} onValueChange={v => setNewGender(v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Male">Male</SelectItem>
                              <SelectItem value="Female">Female</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="flex justify-end items-center">
                            {!canCreate && <div className="text-xs text-gray-500 mr-2">Fill all fields correctly to create a new Patient</div>}
                            <Button onClick={handleCreatePatientInline} disabled={creatingPatient || !canCreate}>
                              {creatingPatient ? 'Creating...' : 'Create'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
                { (query.trim() !== "" && !showAddPatientForm) && (
                  <div className="mt-2 max-h-40 overflow-auto border rounded">
                    {filtered.map((p:any) => (
                      <button key={p.id} onClick={() => { setSelected(p); setQuery("") }} className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${selected?.id === p.id ? 'bg-blue-50' : ''}`}>
                        {p.firstname} {p.lastname}
                      </button>
                    ))}
                    {filtered.length === 0 && <div className="p-3 text-sm text-gray-500">No patients</div>}
                  </div>
                )}
              </div>

              <div>
                <Label>Date</Label>
                <Input
                  value={date ? (() => { try { const d = parseISO(date); return isValid(d) ? format(d, 'dd-MM-yyyy') : date } catch { return date } })() : ''}
                  readOnly
                />
              </div>

              <div>
                <Label>Slot time</Label>
                <Input placeholder="Slot time" value={slotTime || ""} readOnly />
              </div>

              <div>
                <Label>Location</Label>
                <Input placeholder="Location" value={location || ""} readOnly />
              </div>

              <div className="pt-2">
                <Button onClick={handleConfirm} className="w-full" disabled={booking}>{booking ? 'Booking...' : 'Book Appointment'}</Button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
