"use client"

import { useState, useMemo } from "react"
import { parseISO, isBefore, isValid, subDays, startOfToday, differenceInYears } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DatePicker } from "@/components/ui/date-picker"
import { Loader2, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { authApi } from "@/lib/api"
import { useNameValidation } from "@/hooks/use-name-validation"
import { useEmailValidation } from "@/hooks/use-email-validation"
import { Drawer, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle } from "@/components/ui/drawer"

interface Patient {
  id: string
  firstname: string
  lastname: string
  age: number
  gender: string
  dob: string
  email?: string
  phone?: string
  address?: string
  created_at: string
}

export default function AddPatientDrawer({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated?: (p: Patient) => void }) {
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()

  const firstNameValidation = useNameValidation("", { fieldName: "First Name" })
  const lastNameValidation = useNameValidation("", { fieldName: "Last Name" })
  const emailValidation = useEmailValidation("")

  const [form, setForm] = useState({ age: "", gender: "", dob: "", phone: "", address: "" })
  const [fieldErrors, setFieldErrors] = useState<{ age?: string; gender?: string; phone?: string }>({})

  const latestDob = useMemo(() => subDays(startOfToday(), 1), [])
  const earliestDob = useMemo(() => new Date(1900, 0, 1), [])

  const resetForm = () => {
    firstNameValidation.reset()
    lastNameValidation.reset()
    emailValidation.reset()
    setForm({ age: "", gender: "", dob: "", phone: "", address: "" })
    setFieldErrors({})
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setFieldErrors({})

    const isFirstNameValid = firstNameValidation.validate()
    const isLastNameValid = lastNameValidation.validate()
    if (!isFirstNameValid || !isLastNameValid) {
      toast({ title: "Name Required", description: "Please enter both first and last names", variant: "destructive" })
      return
    }

    if (!form.dob) {
      toast({ title: "DOB Required", description: "Please select a valid date of birth", variant: "destructive" })
      return
    }

    const dobDate = parseISO(form.dob)
    if (!isValid(dobDate) || !isBefore(dobDate, startOfToday())) {
      toast({ title: "Invalid DOB", description: "Date of birth must be before today", variant: "destructive" })
      return
    }

    if (isBefore(dobDate, earliestDob)) {
      toast({ title: "Invalid DOB", description: "Date of birth must be after Jan 1, 1900", variant: "destructive" })
      return
    }

    // Age
    const ageNum = Number(form.age)
    if (!form.age || Number.isNaN(ageNum) || ageNum < 0 || ageNum > 150) {
      setFieldErrors(prev => ({ ...prev, age: "Please enter a valid age between 0 and 150" }))
      toast({ title: "Age Required", description: "Please enter a valid age", variant: "destructive" })
      return
    }

    // Gender
    if (!form.gender) {
      setFieldErrors(prev => ({ ...prev, gender: "Please select a gender" }))
      toast({ title: "Gender Required", description: "Please select a gender", variant: "destructive" })
      return
    }

    // Email
    const isEmailValid = emailValidation.validate()
    if (!isEmailValid) {
      toast({ title: "Email Required", description: "Please enter a valid email address", variant: "destructive" })
      return
    }

    // Phone
    if (!form.phone || form.phone.trim().length === 0) {
      setFieldErrors(prev => ({ ...prev, phone: "Please enter a phone number" }))
      toast({ title: "Phone Required", description: "Please enter a phone number", variant: "destructive" })
      return
    }

    setIsCreating(true)

    try {
      const patientData = {
        firstname: firstNameValidation.value,
        lastname: lastNameValidation.value,
        age: parseInt(form.age),
        gender: form.gender,
        dob: form.dob,
        email: emailValidation.value || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
      }

      const created = await authApi.createPatient(patientData)

      toast({ title: "Patient Created", description: `${created.firstname} ${created.lastname} has been added successfully` })
      onCreated?.(created)
      resetForm()
      onOpenChange(false)
    } catch (err: any) {
      console.error("Failed to create patient", err)
      toast({ title: "Error", description: err?.message || "Failed to create patient", variant: "destructive" })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Patient</DrawerTitle>
        </DrawerHeader>

        <div className="p-4 space-y-4">
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name <span className="text-red-500">*</span></Label>
                <Input value={firstNameValidation.value} onChange={firstNameValidation.handleChange} onBlur={firstNameValidation.handleBlur} placeholder="John" className={firstNameValidation.displayError ? 'border-red-500' : ''} required />
                {firstNameValidation.displayError && <p className="text-sm text-red-500">{firstNameValidation.displayError}</p>}
              </div>

              <div className="space-y-2">
                <Label>Last Name <span className="text-red-500">*</span></Label>
                <Input value={lastNameValidation.value} onChange={lastNameValidation.handleChange} onBlur={lastNameValidation.handleBlur} placeholder="Doe" className={lastNameValidation.displayError ? 'border-red-500' : ''} required />
                {lastNameValidation.displayError && <p className="text-sm text-red-500">{lastNameValidation.displayError}</p>}
              </div>

              <div className="space-y-2">
                <Label>Date of Birth <span className="text-red-500">*</span></Label>
                <DatePicker value={form.dob || null} onChange={(v) => {
                  const newDob = v ?? ""
                  let calculatedAge = ""
                  if (newDob) {
                    const dobDate = parseISO(newDob)
                    if (isValid(dobDate) && isBefore(dobDate, startOfToday())) {
                      calculatedAge = String(differenceInYears(startOfToday(), dobDate))
                    }
                  }
                  setForm({ ...form, dob: newDob, age: calculatedAge })
                  setFieldErrors(prev => ({ ...prev, age: undefined }))
                }} maxDate={latestDob} minDate={earliestDob} placeholder="Select date" />
              </div>

              <div className="space-y-2">
                <Label>Age <span className="text-red-500">*</span></Label>
                <Input type="number" min={0} max={150} value={form.age} readOnly disabled placeholder="Auto-calculated from DOB" className={`${fieldErrors.age ? 'border-red-500' : ''} bg-muted`} />
                {fieldErrors.age && <p className="text-sm text-red-500">{fieldErrors.age}</p>}
              </div>

              <div className="space-y-2">
                <Label>Gender <span className="text-red-500">*</span></Label>
                <Select value={form.gender} onValueChange={(v) => { setForm({ ...form, gender: v }); setFieldErrors(prev => ({ ...prev, gender: undefined })) }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Email <span className="text-red-500">*</span></Label>
                <Input type="email" value={emailValidation.value} onChange={emailValidation.handleChange} onBlur={emailValidation.validate} placeholder="john@example.com" className={emailValidation.error ? 'border-red-500' : ''} />
                {emailValidation.error && <p className="text-sm text-red-500">{emailValidation.error}</p>}
              </div>

              <div className="space-y-2">
                <Label>Phone <span className="text-red-500">*</span></Label>
                <Input type="tel" value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setFieldErrors(prev => ({ ...prev, phone: undefined })) }} placeholder="+1 (555) 123-4567" className={fieldErrors.phone ? 'border-red-500' : ''} />
                {fieldErrors.phone && <p className="text-sm text-red-500">{fieldErrors.phone}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St, City, State 12345" />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isCreating} onClick={() => handleSubmit()}>
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Patient
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => { resetForm(); onOpenChange(false) }}>
                Cancel
              </Button>
            </div>
          </form>
        </div>

        <DrawerFooter />
      </DrawerContent>
    </Drawer>
  )
}
