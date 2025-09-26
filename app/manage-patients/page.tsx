"use client"

import { useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Eye, Download, MoreHorizontal, Loader2, Edit } from "lucide-react"
import { authApi } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

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

  return (
    <div>
      <Header title="Manage Patients" description="View and manage patients" />
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Patients</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading patients...</div>
            ) : (
              // limit list height and make it scrollable so the whole page doesn't grow indefinitely
              <div className="space-y-4 max-h-[60vh] overflow-auto pr-2">
                {patients.length === 0 && (
                  <div className="text-sm text-gray-500">No patients found.</div>
                )}
                {patients.map(p => (
                  <Card key={p.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{`${p.firstname || ''} ${p.lastname || ''}`.trim() || 'Unknown Patient'}</h3>
                        <div className="text-sm text-gray-600 mt-1">
                          {p.email && <div>{p.email}</div>}
                          {p.phone && <div>{p.phone}</div>}
                          {p.dob && <div>DOB: {p.dob}</div>}
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
                            <DropdownMenuItem onClick={() => toast({ title: 'Export', description: 'Export not implemented' })}>
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

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPatient) return
    
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
      changedFields.dob = editForm.dob
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
              <Input value={editForm?.firstname || ''} onChange={(e) => setEditForm((s:any) => ({ ...s, firstname: e.target.value }))} />
            </div>
            <div>
              <Label>Last name</Label>
              <Input value={editForm?.lastname || ''} onChange={(e) => setEditForm((s:any) => ({ ...s, lastname: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={editForm?.email || ''} onChange={(e) => setEditForm((s:any) => ({ ...s, email: e.target.value }))} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={editForm?.phone || ''} onChange={(e) => setEditForm((s:any) => ({ ...s, phone: e.target.value }))} />
            </div>
            <div>
              <Label>DOB</Label>
              <Input type="date" value={editForm?.dob || ''} onChange={(e) => setEditForm((s:any) => ({ ...s, dob: e.target.value }))} />
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

