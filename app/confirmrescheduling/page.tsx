"use client"

import React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"

interface RescheduleTokenPayload {
  appointment_id?: string
  new_slot_id?: string
  target_date?: string
  start_time?: string
  end_time?: string
  location?: string
  patient_id?: string
  patient_name?: string
  old_date?: string
  old_start_time?: string
  old_end_time?: string
  scope?: string
  anchor_date?: string
  exp?: number
  iat?: number
  [key: string]: any
}

function decodeJwtPayload(token: string | null): { payload: RescheduleTokenPayload | null; isExpired: boolean; expiresInSeconds: number | null } {
  if (!token) return { payload: null, isExpired: false, expiresInSeconds: null }
  try {
    const parts = token.split(".")
    if (parts.length < 2) return { payload: null, isExpired: false, expiresInSeconds: null }
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    )
    const payload: RescheduleTokenPayload = JSON.parse(json)
    const nowSec = Math.floor(Date.now() / 1000)
    const exp = typeof payload.exp === "number" ? payload.exp : null
    const isExpired = exp ? exp < nowSec : false
    const expiresInSeconds = exp ? exp - nowSec : null
    return { payload, isExpired, expiresInSeconds }
  } catch (e) {
    console.warn("Failed to decode token payload:", e)
    return { payload: null, isExpired: false, expiresInSeconds: null }
  }
}

export default function ConfirmReschedulingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const [open, setOpen] = React.useState(true)
  const { payload, isExpired, expiresInSeconds } = React.useMemo(() => decodeJwtPayload(token), [token])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) router.replace("/")
  }

  const handleConfirm = () => {
    if (isExpired) return
    toast({ title: "Rescheduling confirmed", description: "Thanks! We've recorded your confirmation." })
    setOpen(false)
    router.replace("/schedules")
  }

  const handleDecline = () => {
    toast({ title: "No changes made", description: "Your existing appointment remains unchanged." })
    setOpen(false)
    router.replace("/")
  }

  if (!token) {
    return (
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Missing token</AlertDialogTitle>
            <AlertDialogDescription>
              This link is missing the required token parameter. Please use the original link that was sent to you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction asChild>
              <Button onClick={() => router.replace("/")}>Close</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  const when = payload?.target_date && (payload.start_time || payload.old_start_time)
    ? `${payload.target_date} at ${payload.start_time || payload.old_start_time}`
    : null
  const location = payload?.location || null
  const patientName = payload?.patient_name || null
  const oldDateTime = payload?.old_date && payload?.old_start_time
    ? `${payload.old_date} at ${payload.old_start_time}`
    : null

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isExpired ? "Link expired" : "Confirm rescheduling?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {isExpired && (
              <span className="text-destructive">This rescheduling link has expired. Please request a new one.</span>
            )}
            {!isExpired && (
              <>
                {when && (
                  <div>
                    New time: <strong>{when}</strong>
                  </div>
                )}
                {oldDateTime && (
                  <div className="text-xs mt-1">Previous time: {oldDateTime}</div>
                )}
                {location && (
                  <div className="mt-1">Location: <strong>{location}</strong></div>
                )}
                {patientName && (
                  <div className="mt-1">Patient: <strong>{patientName}</strong></div>
                )}
                {!when && !location && !patientName && (
                  <span>Do you want to confirm the new appointment time?</span>
                )}
                {typeof expiresInSeconds === "number" && expiresInSeconds > 0 && (
                  <div className="text-xs mt-2 text-muted-foreground">
                    This link will expire in ~{Math.max(0, Math.floor(expiresInSeconds / 60))}m.
                  </div>
                )}
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDecline}>{isExpired ? "Close" : "No"}</AlertDialogCancel>
          {!isExpired && (
            <AlertDialogAction onClick={handleConfirm}>Yes</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
