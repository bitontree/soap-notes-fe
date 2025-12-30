"use client"
import { useEffect, useMemo, useState, Suspense } from "react"
import AddPatientDrawer from "@/components/add-patient-drawer"

import { format, isBefore, isValid, parseISO, startOfToday, subDays } from "date-fns"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Eye, Download, MoreHorizontal, Loader2, Edit, Search, Mail, Phone, Calendar } from "lucide-react"
import { authApi } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { sanitizeName, sanitizeEmail, validateName, validateEmail } from "@/lib/utils"
import { useNameSearch } from "@/hooks/use-name-search"
import { DatePicker } from "@/components/ui/date-picker"

interface Patient {
  id: string
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
  dob?: string
}

export default function ManagePatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null)
  const [editForm, setEditForm] = useState<Partial<Patient>>({})
  const [isUpdating, setIsUpdating] = useState(false)
  const { toast } = useToast()

  // Name search functionality
  const searchQuery = useNameSearch("", { 
    fieldName: "Patient Search", 
    autoSanitize: true, 
    validateOnChange: false 
  })
    const [isAddOpen, setIsAddOpen] = useState(false)

  async function loadPatients() {
    setIsLoading(true)
    try {
      const list = await authApi.getPatients()
      setPatients(list || [])
    } catch (err: any) {
      console.error('Failed to load patients', err)
      toast({ title: 'Error', description: err?.message || 'Failed to load patients', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadPatients() }, [])

  function openDeleteDialog(patient: Patient) {
    setPatientToDelete(patient)
    setIsDeleteOpen(true)
  }

  async function confirmDelete() {
    if (!patientToDelete) return
    setDeletingId(patientToDelete.id)
    try {
      // Call the actual API to delete the patient
      await authApi.deletePatient(patientToDelete.id)
      
      // Remove from local state after successful soft deletion
      setPatients(prev => prev.filter(p => p.id !== patientToDelete.id))
      toast({ title: 'Patient Removed', description: 'Patient has been removed from your list.' })
      setIsDeleteOpen(false)
      setPatientToDelete(null)
    } catch (err: any) {
      console.error('Delete failed', err)
      toast({ title: 'Error', description: err?.message || 'Failed to delete patient', variant: 'destructive' })
    } finally {
      setDeletingId(null)
    }
  }

  // Export a single patient's data as CSV and trigger download
  function exportPatient(patient: Patient) {
    try {
      const headers = ["id", "firstname", "lastname", "email", "phone", "dob"]
      const row = [
        patient.id || "",
        patient.firstname || "",
        patient.lastname || "",
        patient.email || "",
        patient.phone || "",
        patient.dob || "",
      ]

      const csv = [headers.join(","), row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")].join("\n")

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${(patient.firstname || 'patient').replace(/\s+/g, '_')}_${patient.id || Date.now()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: "Exported", description: `Exported ${patient.firstname || 'patient'} as CSV` })
    } catch (err: any) {
      console.error('Export failed', err)
      toast({ title: 'Export Failed', description: err?.message || 'Failed to export patient', variant: 'destructive' })
    }
  }

  // Filter patients based on search query
  const filteredPatients = patients.filter(patient => {
    if (!searchQuery.value.trim()) return true
    
    const searchTerm = searchQuery.value.toLowerCase()
    const fullName = `${patient.firstname || ''} ${patient.lastname || ''}`.toLowerCase()
    const email = (patient.email || '').toLowerCase()
    return fullName.includes(searchTerm) || email.includes(searchTerm)
  })

  return (
    <div>
      <Header title="Manage Patients" description="View and manage patients" />
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="mb-2">Patients</CardTitle>
            <div className="flex items-center justify-between gap-4 mt-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 min-w-[300px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchQuery.value}
                    onChange={searchQuery.handleChange}
                    onBlur={searchQuery.handleBlur}
                    className={`pl-10 ${searchQuery.displayError ? "border-red-500" : ""}`}
                  />
                  {searchQuery.displayError && (
                    <p className="text-sm text-red-500 mt-1">{searchQuery.displayError}</p>
                  )}
                </div>
                {filteredPatients.length !== patients.length && (
                  <p className="text-sm text-gray-500">
                    Showing {filteredPatients.length} of {patients.length} patients
                  </p>
                )}
              </div>
              <Button onClick={() => setIsAddOpen(true)}>
                + Add Patient
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading patients...</div>
            ) : (
              // limit list height and make it scrollable so the whole page doesn't grow indefinitely
              <div className="space-y-4 max-h-[60vh] overflow-auto pr-2">
                {filteredPatients.length === 0 && patients.length === 0 && (
                  <div className="text-sm text-gray-500">No patients found.</div>
                )}
                {filteredPatients.length === 0 && patients.length > 0 && (
                  <div className="text-sm text-gray-500">
                    No patients match your search. Try adjusting your search terms.
                  </div>
                )}
                {filteredPatients.map(p => (
                  <Card key={p.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{`${p.firstname || ''} ${p.lastname || ''}`.trim() || 'Unknown Patient'}</h3>
                        <div className="text-sm text-gray-600 mt-1 space-y-1">
                          {p.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-gray-500" />
                              <span>{p.email}</span>
                            </div>
                          )}
                          {p.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-gray-500" />
                              <span>{p.phone}</span>
                            </div>
                          )}
                          {p.dob && (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-gray-500" />
                              <span>{p.dob}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setSelectedPatient(p); setIsViewOpen(true) }}>
                          <Eye className="mr-2 h-4 w-4" /> View
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>

        
                            <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelectedPatient(p); setEditForm(p); setIsEditOpen(true) }}>
                              <Edit className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportPatient(p)}>
                              <Download className="mr-2 h-4 w-4" /> Export
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600" 
                              onClick={() => openDeleteDialog(p)}
                              disabled={deletingId === p.id}
                            >
                              {deletingId === p.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {typeof window !== "undefined" && (
        <Suspense fallback={null}>
          <AddPatientDrawer open={isAddOpen} onOpenChange={setIsAddOpen} onCreated={(p: any) => setPatients((prev: any) => [p, ...prev])} />
        </Suspense>
      )}

      <ManagePatientDialogs
        selectedPatient={selectedPatient}
        isViewOpen={isViewOpen}
        setIsViewOpen={setIsViewOpen}
        isEditOpen={isEditOpen}
        setIsEditOpen={setIsEditOpen}
        editForm={editForm}
        setEditForm={setEditForm}
        setSelectedPatient={setSelectedPatient}
        setPatients={setPatients}
        isDeleteOpen={isDeleteOpen}
        setIsDeleteOpen={setIsDeleteOpen}
        patientToDelete={patientToDelete}
        setPatientToDelete={setPatientToDelete}
        confirmDelete={confirmDelete}
        deletingId={deletingId}
        isUpdating={isUpdating}
        setIsUpdating={setIsUpdating}
      />
    </div>
  )
}

function ManagePatientDialogs({ 
  selectedPatient, isViewOpen, setIsViewOpen, isEditOpen, setIsEditOpen, 
  editForm, setEditForm, setSelectedPatient, setPatients,
  isDeleteOpen, setIsDeleteOpen, patientToDelete, setPatientToDelete, 
  confirmDelete, deletingId, isUpdating, setIsUpdating 
}: any) {
  const { toast } = useToast()
  const latestDob = useMemo(() => subDays(startOfToday(), 1), [])
  const earliestDob = useMemo(() => new Date(1900, 0, 1), [])

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPatient) return
    
    // Smart validation: Only check for business rules that sanitization can't fix
    if (editForm.firstname !== undefined && editForm.firstname !== selectedPatient.firstname) {
      const firstNameValidation = validateName(editForm.firstname, "First Name")
      if (!firstNameValidation.isValid) {
        const error = firstNameValidation.error
        // Only show toast for business rule violations (empty, too long)
        if (error?.includes('required') || error?.includes('must be')) {
          toast({
            title: "Invalid First Name",
            description: error,
            variant: "destructive",
          })
          return
        }
      }
    }
    
    if (editForm.lastname !== undefined && editForm.lastname !== selectedPatient.lastname) {
      const lastNameValidation = validateName(editForm.lastname, "Last Name")
      if (!lastNameValidation.isValid) {
        const error = lastNameValidation.error
        // Only show toast for business rule violations (empty, too long)
        if (error?.includes('required') || error?.includes('must be')) {
          toast({
            title: "Invalid Last Name", 
            description: error,
            variant: "destructive",
          })
          return
        }
      }
    }

    if (editForm.email !== undefined && editForm.email !== selectedPatient.email && editForm.email.trim()) {
      const emailValidation = validateEmail(editForm.email)
      if (!emailValidation.isValid) {
        const error = emailValidation.error
        // Only show toast for business rule violations (incomplete structure)
        if (error?.includes('required') || error?.includes('must contain') || error?.includes('must have')) {
          toast({
            title: "Invalid Email",
            description: error,
            variant: "destructive",
          })
          return
        }
      }
    }
    
    // Only send fields that have actually changed
    const changedFields: Partial<Patient> = {}
    
    if (editForm.firstname !== undefined && editForm.firstname !== selectedPatient.firstname) {
      changedFields.firstname = editForm.firstname
    }
    if (editForm.lastname !== undefined && editForm.lastname !== selectedPatient.lastname) {
      changedFields.lastname = editForm.lastname
    }
    if (editForm.email !== undefined && editForm.email !== selectedPatient.email) {
      changedFields.email = editForm.email
    }
    if (editForm.phone !== undefined && editForm.phone !== selectedPatient.phone) {
      changedFields.phone = editForm.phone
    }
    if (editForm.dob !== undefined && editForm.dob !== selectedPatient.dob) {
      const dobDate = parseISO(editForm.dob)
      if (!isValid(dobDate) || !isBefore(dobDate, startOfToday())) {
        toast({
          title: "Invalid DOB",
          description: "Date of birth must be before today.",
          variant: "destructive",
        })
        return
      }
      if (isBefore(dobDate, earliestDob)) {
        toast({
          title: "Invalid DOB",
          description: "Date of birth must be after Jan 1, 1900.",
          variant: "destructive",
        })
        return
      }
      changedFields.dob = format(dobDate, "yyyy-MM-dd")
    }
    
    // If no fields were changed, show message and return
    if (Object.keys(changedFields).length === 0) {
      toast({ 
        title: 'No Changes', 
        description: 'No fields were modified.' 
      })
      return
    }
    
    setIsUpdating(true)
    try {
      // Call the actual API to update the patient with only changed fields
      const updatedPatient = await authApi.updatePatient(selectedPatient.id, changedFields)
      
      // Update local state with the response from server
      setPatients((prev: any) => prev.map((p: any) => 
        p.id === updatedPatient.id ? updatedPatient : p
      ))
      
      const fieldNames = Object.keys(changedFields).join(', ')
      toast({ 
        title: 'Updated', 
        description: `Updated ${fieldNames} successfully.` 
      })
      setIsEditOpen(false)
      setSelectedPatient(null)
      setEditForm({})
    } catch (err: any) {
      console.error('Update failed', err)
      toast({ 
        title: 'Error', 
        description: err?.message || 'Failed to update patient', 
        variant: 'destructive' 
      })
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <>
      <Dialog open={isViewOpen} onOpenChange={(v:any) => { setIsViewOpen(v); if (!v) setSelectedPatient(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Patient Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <div><strong>Name: </strong>{selectedPatient ? `${selectedPatient.firstname || ''} ${selectedPatient.lastname || ''}` : ''}</div>
            <div><strong>Email: </strong>{selectedPatient?.email || '-'}</div>
            <div><strong>Phone: </strong>{selectedPatient?.phone || '-'}</div>
            <div><strong>DOB: </strong>{selectedPatient?.dob || '-'}</div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={(v:any) => { setIsEditOpen(v); if (!v) setSelectedPatient(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Patient</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4 mt-2">
            <div>
              <Label>First name</Label>
              <Input 
                value={editForm?.firstname || ''} 
                onChange={(e) => {
                  const sanitized = sanitizeName(e.target.value)
                  setEditForm((s:any) => ({ ...s, firstname: sanitized }))
                }} 
              />
            </div>
            <div>
              <Label>Last name</Label>
              <Input 
                value={editForm?.lastname || ''} 
                onChange={(e) => {
                  const sanitized = sanitizeName(e.target.value)
                  setEditForm((s:any) => ({ ...s, lastname: sanitized }))
                }} 
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input 
                value={editForm?.email || ''} 
                onChange={(e) => {
                  const sanitized = sanitizeEmail(e.target.value)
                  setEditForm((s:any) => ({ ...s, email: sanitized }))
                }} 
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={editForm?.phone || ''} onChange={(e) => setEditForm((s:any) => ({ ...s, phone: e.target.value }))} />
            </div>
            <div>
              <Label>DOB</Label>
              <DatePicker
                value={editForm?.dob ?? null}
                onChange={(value) =>
                  setEditForm((s: any) => {
                    const next = { ...s }
                    if (!value) {
                      delete next.dob
                    } else {
                      next.dob = value
                    }
                    return next
                  })
                }
                maxDate={latestDob}
                minDate={earliestDob}
                placeholder="Select date"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button 
                variant="ghost" 
                onClick={() => { 
                  setIsEditOpen(false); 
                  setSelectedPatient(null);
                  setEditForm({});
                }}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdating}>
                {isUpdating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={(v:any) => { 
        setIsDeleteOpen(v); 
        if (!v) setPatientToDelete(null) 
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Patient</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p>Are you sure you want to remove <strong>{patientToDelete ? `${patientToDelete.firstname || ''} ${patientToDelete.lastname || ''}`.trim() : 'this patient'}</strong> from your list?</p>
            <p className="text-sm text-gray-600">The patient will be removed from your view but their data will be preserved.</p>
            <div className="flex justify-end gap-2">
              <Button 
                variant="ghost" 
                onClick={() => { 
                  setIsDeleteOpen(false); 
                  setPatientToDelete(null) 
                }}
                disabled={deletingId === patientToDelete?.id}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmDelete}
                disabled={deletingId === patientToDelete?.id}
              >
                {deletingId === patientToDelete?.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  'Remove'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

