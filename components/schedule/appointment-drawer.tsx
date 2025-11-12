"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { UserPlus, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { authApi, schedulesApi } from "@/lib/api"
import { appointmentsApi } from "@/lib/api"
import { parseISO, isValid, format, differenceInYears, isBefore, startOfToday, subDays } from 'date-fns'
import { useNameValidation } from "@/hooks/use-name-validation"
import { useEmailValidation } from "@/hooks/use-email-validation"
import { validateName, sanitizeName } from "@/lib/utils"
import { DatePicker } from "@/components/ui/date-picker"
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
    if (!v) {
      setApptInitialPatientIndex(undefined)
      // ensure waitlist checkbox resets when closing
      setAddToWaitlist(false)
    }
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
  
  // Name validation hooks
  const firstNameValidation = useNameValidation("", { fieldName: "First Name" })
  const lastNameValidation = useNameValidation("", { fieldName: "Last Name" })
  
  // Email validation hook
  const emailValidation = useEmailValidation("")
  
  const [newDobIso, setNewDobIso] = React.useState("") // yyyy-MM-dd for API
  const [newPhone, setNewPhone] = React.useState("")
  const [newPhoneCountry, setNewPhoneCountry] = React.useState("+91")
  const [newGender, setNewGender] = React.useState("")
  const [creatingPatient, setCreatingPatient] = React.useState(false)
  const [booking, setBooking] = React.useState(false)
  const [addToWaitlist, setAddToWaitlist] = React.useState(false)
  const searchRef = React.useRef<HTMLInputElement | null>(null)

  // Reset inline new-patient fields whenever the inline form is opened
  React.useEffect(() => {
    if (showAddPatientForm) {
      firstNameValidation.reset()
      lastNameValidation.reset()
      emailValidation.reset()
      setNewDobIso("")
      setNewPhone("")
      setNewPhoneCountry("+91")
      setNewGender("")
    }
  }, [showAddPatientForm]) // Removed the validation objects from dependencies

  // Derived validation state for enabling the Create button
  const phoneDigits = (newPhone || '').replace(/[^0-9]/g, '')
  const isPhoneValid = phoneDigits.length >= 5 && phoneDigits.length <= 11
  const isEmailValid = emailValidation.value && emailValidation.isValid
  const today = React.useMemo(() => startOfToday(), [])
  const dobMaxDate = React.useMemo(() => subDays(today, 1), [today])
  const dobMinDate = React.useMemo(() => new Date(1900, 0, 1), [])

  const isDobValid = React.useMemo(() => {
    if (!newDobIso) return false
    try {
      const dt = parseISO(newDobIso)
      return isValid(dt) && isBefore(dt, today) && !isBefore(dt, dobMinDate)
    } catch {
      return false
    }
  }, [newDobIso, today, dobMinDate])
  const canCreate = Boolean(firstNameValidation.isValid && firstNameValidation.value.trim() && 
                           lastNameValidation.isValid && lastNameValidation.value.trim() && 
                           isPhoneValid && isEmailValid && isDobValid && newGender)

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
  // Reset waitlist to unchecked by default on each open
  setAddToWaitlist(false)

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
    if (!name) { 
      toast({ title: "Enter name", description: "Type a name to add", variant: "destructive", duration: 2000 })
      return 
    }
    
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
    // Validate names
    const isFirstNameValid = firstNameValidation.validate()
    const isLastNameValid = lastNameValidation.validate()

    if (!isFirstNameValid) {
      toast({ title: "Invalid First Name", description: firstNameValidation.error || "Enter a valid first name", variant: "destructive", duration: 2000 })
      return
    }
    
    if (!isLastNameValid) {
      toast({ title: "Invalid Last Name", description: lastNameValidation.error || "Enter a valid last name", variant: "destructive", duration: 2000 })
      return
    }

    const firstname = firstNameValidation.value.trim()
    const lastname = lastNameValidation.value.trim()

    // validate phone number length (number part only)
    if (newPhone && newPhone.trim() !== "") {
      const digits = newPhone.replace(/[^0-9]/g, "")
        if (digits.length < 5 || digits.length > 11) {
        toast({ title: "Invalid phone", description: "Phone number must be between 5 and 11 digits (excluding country code)", variant: "destructive", duration: 2000 })
        return
      }
    }

    // validate/normalize DOB and ensure it's before today
    if (!newDobIso) {
      toast({ title: "Invalid DOB", description: "Select a date of birth", variant: "destructive", duration: 2000 })
      return
    }
    let dobToSend: string
    try {
      const dt = parseISO(newDobIso)
      if (!isValid(dt) || !isBefore(dt, today) || isBefore(dt, dobMinDate)) {
        throw new Error('invalid')
      }
      dobToSend = format(dt, 'yyyy-MM-dd')
    } catch (e) {
      toast({ title: "Invalid DOB", description: "Date of birth must be between Jan 1, 1900 and yesterday", variant: "destructive", duration: 2000 })
      return
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

      const created = await authApi.createPatient({ firstname, lastname, age: ageToSend, gender: newGender || "Other", dob: dobToSend, phone: fullPhone || undefined, email: emailValidation.value || undefined } as any)

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
      firstNameValidation.reset()
      lastNameValidation.reset()
      emailValidation.reset()
      setNewDobIso("")
      setNewGender("Other")
      setNewPhone("")
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
      toast({ title: "Missing", description: "Select patient", variant: "destructive", duration: 2000 });
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
        const firstname = (src?.firstname || firstNameValidation.value || "").trim();
        const lastname = (src?.lastname || lastNameValidation.value || "").trim();
          if (!firstname || !lastname) {
          toast({ title: "Missing", description: "Patient must have a first and last name", variant: "destructive", duration: 2000 });
          return null;
        }
        let dobRaw = src?.dob || newDobIso || new Date().toISOString().slice(0, 10);
        let dobIso = dobRaw;
        try {
          const dt = parseISO(dobRaw);
          if (!isValid(dt) || !isBefore(dt, today) || isBefore(dt, dobMinDate)) throw new Error("invalid");
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
      const patientInline = buildPatient(selected) || buildPatient({ firstname: firstNameValidation.value, lastname: lastNameValidation.value, dob: newDobIso, gender: newGender }) || undefined;

      const payload: any = {
        slot_id: slotId,
        // include patient_id when selecting an existing patient
        patient_id: selected?.id || undefined,
        // include patient object so backend can persist firstname/lastname (backend prefers patient_inline)
        patient: patientInline,
        // target partition index for multi-patient slots (optional)
        patient_index: typeof apptInitialPatientIndex === 'number' ? apptInitialPatientIndex : undefined,
        notes: undefined,
        // Explicit flag to indicate whether booking should be placed on the waitlist
        // Always include the flag (default false) so backend receives a deterministic value
        add_to_waitlist: addToWaitlist === true,
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
  // Normalize backend error responses so we show a clean, human message in the toast.
  let description = "Could not book appointment";
  try {
    // Preferred location: { detail: { message: "..." } }
    if (e?.detail?.message) {
      description = e.detail.message;
    } else if (e?.data?.detail?.message) {
      description = e.data.detail.message;
    } else if (e?.message) {
      // e.message might be a JSON string with detail — try to parse it.
      if (typeof e.message === "string") {
        try {
          const parsed = JSON.parse(e.message);
          if (parsed?.detail?.message) description = parsed.detail.message;
          else if (parsed?.message) description = parsed.message;
          else description = e.message;
        } catch {
          description = e.message;
        }
      } else {
        description = String(e.message);
      }
    } else if (typeof e === "string") {
      description = e;
    } else if (e?.data && typeof e.data === "string") {
      description = e.data;
    }
  } catch {
    description = "Could not book appointment";
  }
  toast({ title: "Booking failed", description, variant: "destructive", duration: 2000 });
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
                  <Input 
                    ref={searchRef} 
                    placeholder="Search Name..." 
                    value={selected ? `${selected.firstname} ${selected.lastname}` : query} 
                    onChange={e => { 
                      // Sanitize the search input for names
                      const sanitizedValue = sanitizeName(e.target.value)
                      setQuery(sanitizedValue)
                      setSelected(null) 
                    }} 
                  />
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
                          <Input 
                            value={firstNameValidation.value} 
                            onChange={firstNameValidation.handleChange}
                            onBlur={firstNameValidation.handleBlur}
                            className={firstNameValidation.displayError ? "border-red-500" : ""}
                          />
                          {firstNameValidation.displayError && (
                            <p className="text-sm text-red-500">{firstNameValidation.displayError}</p>
                          )}
                          <Label>Last name</Label>
                          <Input 
                            value={lastNameValidation.value} 
                            onChange={lastNameValidation.handleChange}
                            onBlur={lastNameValidation.handleBlur}
                            className={lastNameValidation.displayError ? "border-red-500" : ""}
                          />
                          {lastNameValidation.displayError && (
                            <p className="text-sm text-red-500">{lastNameValidation.displayError}</p>
                          )}
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
                          <Input 
                            placeholder="name@example.com" 
                            value={emailValidation.value} 
                            onChange={emailValidation.handleChange}
                            className={emailValidation.error ? "border-red-500" : ""}
                          />
                          {emailValidation.error && (
                            <p className="text-sm text-red-500">{emailValidation.error}</p>
                          )}
                          <Label>DOB</Label>
                          <DatePicker
                            value={newDobIso || null}
                            onChange={(value) => setNewDobIso(value ?? "")}
                            maxDate={dobMaxDate}
                            minDate={dobMinDate}
                            placeholder="Select date"
                          />
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

              <div className="flex items-center gap-2">
                <Checkbox checked={addToWaitlist} onCheckedChange={(v) => setAddToWaitlist(Boolean(v))} />
                <Label className="mb-0">Get added to waitlist</Label>
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
