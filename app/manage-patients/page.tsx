"use client"

import { useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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

  async function handleDelete(id: string) {
    if (!confirm('Delete this patient? This action cannot be undone.')) return
    setDeletingId(id)
    try {
      // Try to call deletePatient if available
      // @ts-ignore
      if (typeof authApi.deletePatient === 'function') {
        // @ts-ignore
        await authApi.deletePatient(id)
      } else {
        // Fallback: call API directly
        await fetch(`/patients/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
      }
      setPatients(prev => prev.filter(p => p.id !== id))
      toast({ title: 'Deleted', description: 'Patient removed.' })
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
                        <Button variant="outline" size="sm" onClick={() => toast({ title: 'Info', description: 'View patient not implemented' })}>
                          <Eye className="mr-2 h-4 w-4" /> View
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => toast({ title: 'Edit', description: 'Edit patient not implemented' })}>
                              <Edit className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast({ title: 'Export', description: 'Export not implemented' })}>
                              <Download className="mr-2 h-4 w-4" /> Export
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(p.id)}>
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
    </div>
  )
}
