"use client"

import React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { confirmRescheduleDecision, checkRescheduleValidity } from "@/lib/api"
// no toast; we show an inline final message and then close the tab

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
  const [finalMessage, setFinalMessage] = React.useState<string | null>(null)
  const [closing, setClosing] = React.useState(false)
  // Track which decision was clicked to show loader in-button and disable the other
  const [selectedDecision, setSelectedDecision] = React.useState<"yes" | "no" | null>(null)
  const [validityStatus, setValidityStatus] = React.useState<string | null>(null)
  const [validityError, setValidityError] = React.useState<string | null>(null)
  const [checkingValidity, setCheckingValidity] = React.useState<boolean>(false)
  // No close behavior; keep dialog visible and do not navigate away

  const handleOpenChange = (nextOpen: boolean) => {
    // Keep the dialog open; we control closing by blanking/closing the tab
    if (finalMessage) {
      setOpen(true)
      return
    }
    setOpen(nextOpen)
  }

  // On initial load, call validity API
  React.useEffect(() => {
    if (!token) return
    setCheckingValidity(true)
    // Derive patient_id & notification_id from token payload or query
    const patientId = (payload as any)?.patient_id
      || (payload as any)?.patient?.id
      || searchParams.get("patient_id")
      || searchParams.get("pid")
      || ""
    const notificationId = searchParams.get("notification_id")
      || searchParams.get("notificationId")
      || searchParams.get("nid")
      || (payload as any)?.notification_id
      || (payload as any)?.notification?.id
      || ""
    if (!notificationId || !patientId) {
      // If missing critical ids, show expired-like message
      setValidityStatus("no_response")
      setCheckingValidity(false)
      return
    }
    ;(async () => {
      try {
        const res = await checkRescheduleValidity({ patient_id: patientId, notification_id: notificationId })
        setValidityStatus(res.status)
      } catch (e: any) {
        setValidityError(e?.message || "Failed to check status")
      } finally {
        setCheckingValidity(false)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleConfirm = async () => {
    if (isExpired || closing) return
    setClosing(true)
    setSelectedDecision("yes")
    try {
      // Extract identifiers from URL or token with multiple fallback key variants
      const appointmentId = searchParams.get("appointment_id")
        || searchParams.get("appointmentId")
        || searchParams.get("appt_id")
        || searchParams.get("aid")
        || (payload as any)?.appointment_id
        || (payload as any)?.appointmentId
        || ""
      const patientId = (payload as any)?.patient_id
        || (payload as any)?.patient?.id
        || searchParams.get("patient_id")
        || searchParams.get("pid")
        || ""
      const newSlotId = (payload as any)?.new_slot_id
        || (payload as any)?.new_slot?.id
        || (payload as any)?.slot_id
        || (payload as any)?.slots?.primary?.id
        || searchParams.get("new_slot_id")
        || searchParams.get("slot_id")
        || searchParams.get("slotId")
        || ""
        const rawSlotId = searchParams.get("slot_id")
          || searchParams.get("slotId")
          || (payload as any)?.slot_id
          || (payload as any)?.slot?.id
          || (payload as any)?.slots?.primary?.id
          || ""
      const userId = (payload as any)?.user_id || (payload as any)?.doctor_id || undefined
      const notificationId = searchParams.get("notification_id")
        || searchParams.get("notificationId")
        || searchParams.get("nid")
        || (payload as any)?.notification_id
        || (payload as any)?.notification?.id
        || ""

      const payloadToSend = {
        appointment_id: appointmentId,
        patient_id: patientId || undefined,
        new_slot_id: newSlotId || undefined,
          slot_id: rawSlotId || undefined,
        confirm_reschedule: true,
        user_id: userId,
        notification_id: notificationId,
        token: token || undefined,
      }
      console.log("[ConfirmRescheduling] Prepared payload", payloadToSend)

      // Only absolutely required: appointment_id & notification_id; attempt call even if patient_id/new_slot_id absent
      if (!appointmentId) {
        setFinalMessage("Missing appointment id; cannot confirm rescheduling.")
      } else if (!notificationId) {
        setFinalMessage("Missing notification id; cannot confirm rescheduling.")
      } else {
        try {
          await confirmRescheduleDecision(payloadToSend as any)
          // Show immediate success message, then refine based on validity in background
          setFinalMessage("Rescheduling done.")
          setCheckingValidity(true)
          try {
            const res = await checkRescheduleValidity({ patient_id: patientId || "", notification_id: notificationId })
            setValidityStatus(res.status)
            // Build a message that includes decoded slot details based on status
            setFinalMessage(buildFinalMessage(res.status, validityError))
          } catch {
            // Keep the initial friendly message
          } finally {
            setCheckingValidity(false)
          }
        } catch (err: any) {
          console.error("[ConfirmRescheduling] API error", err)
          // If backend returns 410 Gone => token expired. Show expired message regardless of validity API.
          if (err?.status === 410) {
            setFinalMessage("This rescheduling link has expired. Please request a new one.")
          } else {
            setFinalMessage(err?.message || "Failed to confirm rescheduling.")
          }
        }
      }
    } catch (e: any) {
      console.error("Reschedule confirm error", e)
      setFinalMessage(e?.message || "Failed to confirm rescheduling.")
    } finally {
      // Do NOT auto close; keep dialog open showing final message
      setClosing(false)
    }
  }

  const handleDecline = async () => {
    if (closing) return
    setClosing(true)
    setSelectedDecision("no")
    try {
      const appointmentId = searchParams.get("appointment_id")
        || searchParams.get("appointmentId")
        || searchParams.get("appt_id")
        || searchParams.get("aid")
        || (payload as any)?.appointment_id
        || (payload as any)?.appointmentId
        || ""
      const patientId = (payload as any)?.patient_id
        || (payload as any)?.patient?.id
        || searchParams.get("patient_id")
        || searchParams.get("pid")
        || ""
      const userId = (payload as any)?.user_id || (payload as any)?.doctor_id || undefined
      const notificationId = searchParams.get("notification_id")
        || searchParams.get("notificationId")
        || searchParams.get("nid")
        || (payload as any)?.notification_id
        || (payload as any)?.notification?.id
        || ""
      // Decline path: confirm_reschedule false; new_slot_id optional
      const declinePayload = {
        appointment_id: appointmentId,
        patient_id: patientId || undefined,
        confirm_reschedule: false,
        user_id: userId,
        notification_id: notificationId,
          // For decline we can still pass slot identifiers for backend auditing
          new_slot_id: undefined,
          slot_id: searchParams.get("slot_id") || (payload as any)?.slot_id || undefined,
          token: token || undefined,
      }
      console.log("[ConfirmRescheduling] Decline payload", declinePayload)
      if (!appointmentId) {
        setFinalMessage("Missing appointment id; cannot record decision.")
      } else if (!notificationId) {
        setFinalMessage("Missing notification id; cannot record decision.")
      } else {
        try {
          await confirmRescheduleDecision(declinePayload as any)
          // Show immediate acknowledgement, then refine based on validity
          setFinalMessage("Thank you for your cooperation.")
          setCheckingValidity(true)
          try {
            const res = await checkRescheduleValidity({ patient_id: patientId || "", notification_id: notificationId })
            setValidityStatus(res.status)
            // Build a message that includes decoded slot details based on status
            // For 'no_response' we keep the slightly different wording used previously
            if (res.status === 'no_response') {
              setFinalMessage('Your link has expired, please contact the clinic if you wish to reschedule.')
            } else {
              setFinalMessage(buildFinalMessage(res.status, validityError))
            }
          } catch {
            // Keep initial acknowledgement
          } finally {
            setCheckingValidity(false)
          }
        } catch (err: any) {
          console.error("[ConfirmRescheduling] Decline API error", err)
          if (err?.status === 410) {
            setFinalMessage("This rescheduling link has expired. Please request a new one.")
          } else {
            setFinalMessage(err?.message || "Failed to record decision.")
          }
        }
      }
    } catch (e: any) {
      console.error("Reschedule decline error", e)
      setFinalMessage(e?.message || "Failed to record decision.")
    } finally {
      // Do NOT auto close; keep dialog open showing final message
      setClosing(false)
    }
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
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  // Adapt to backend payload shape (slots.primary / slots.secondary) as seen in logs.
  const primarySlotRaw: any = (payload as any)?.slots?.primary || (payload as any)?.slot1 || (payload as any)?.s1 || {}
  const secondarySlotRaw: any = (payload as any)?.slots?.secondary || (payload as any)?.slot2 || (payload as any)?.s2 || {}

  const newSlotInfo = React.useMemo(() => {
    const s: any = (payload as any)?.new_slot || primarySlotRaw || {}
    return {
      date: s.date || (payload as any)?.target_date || (payload as any)?.slot_date_1 || (payload as any)?.slot_date || null,
      start_time: s.start_time || s.start || (payload as any)?.start_time || (payload as any)?.slot_start_1 || (payload as any)?.slot_start || null,
      end_time: s.end_time || s.end || (payload as any)?.end_time || (payload as any)?.slot_end_1 || (payload as any)?.slot_end || null,
      location: s.location || s.loc || (payload as any)?.location || (payload as any)?.new_location || (payload as any)?.slot_location_1 || null,
    }
  }, [payload, primarySlotRaw])

  const oldSlotInfo = React.useMemo(() => {
    const s: any = (payload as any)?.old_slot || secondarySlotRaw || {}
    return {
      date: s.date || (payload as any)?.old_date || (payload as any)?.slot_date_2 || null,
      start_time: s.start_time || s.start || (payload as any)?.old_start_time || (payload as any)?.slot_start_2 || null,
      end_time: s.end_time || s.end || (payload as any)?.old_end_time || (payload as any)?.slot_end_2 || null,
      location: s.location || s.loc || (payload as any)?.old_location || (payload as any)?.location || (payload as any)?.slot_location_2 || null,
    }
  }, [payload, secondarySlotRaw])

  const patientInfo = React.useMemo(() => {
    const p: any = (payload as any)?.patient || (payload as any)?.patient_info || {}
    const first = p.firstname || p.first_name || null
    const last = p.lastname || p.last_name || null
    const name = p.name || [first, last].filter(Boolean).join(" ") || (payload as any)?.patient_name || null
    return {
      name,
      firstname: first,
      lastname: last,
      email: p.email || (payload as any)?.patient_email || null,
      phone: p.phone || p.mobile || (payload as any)?.patient_phone || null,
      age: p.age || (payload as any)?.patient_age || null,
      gender: p.gender || (payload as any)?.patient_gender || null,
    }
  }, [payload])

  // Formatting helpers
  const fmtDate = React.useCallback((iso: string | null | undefined) => {
    if (!iso) return null
    try {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return iso
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    } catch { return iso }
  }, [])

  const fmtTime = React.useCallback((hhmmss: string | null | undefined) => {
    if (!hhmmss) return null
    try {
      const [hh, mm] = hhmmss.split(":")
      const d = new Date()
      d.setHours(Number(hh), Number(mm), 0, 0)
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    } catch { return hhmmss }
  }, [])

  // Build human friendly slot-detail string from decoded payload values
  const formatSlotDetails = React.useCallback((slot: { date?: string | null; start_time?: string | null; end_time?: string | null; location?: string | null } | null) => {
    if (!slot) return null
    const d = slot.date ? fmtDate(slot.date) : null
    const s = slot.start_time ? fmtTime(slot.start_time) : null
    const e = slot.end_time ? fmtTime(slot.end_time) : null
    const loc = slot.location || null
    const parts: string[] = []
    if (d) parts.push(String(d))
    if (s) parts.push(`at ${s}`)
    if (e) parts.push(`– ${e}`)
    const when = parts.length ? parts.join(" ") : null
    return [when, loc].filter(Boolean).join(loc ? " (Location: " : "").replace(/\(Location: /, " (Location: ") + (loc ? ")" : "").replace("()", "").trim()
  }, [fmtDate, fmtTime])

  // Return a final message string including decoded slot values for the relevant slot
  const buildFinalMessage = React.useCallback((status: string | null | undefined, fallback?: string | null) => {
    const normalized = String(status || "").toLowerCase()
    // For accepted/booked show primary / slot_id_1 (newSlotInfo), for rejected show secondary / slot_id_2 (oldSlotInfo)
    if (normalized === 'booked' || normalized === 'accepted') {
      const details = formatSlotDetails(newSlotInfo)
      return `Your appointment is rescheduled successfully.${details ? '\n' + details : ''}`
    }
    if (normalized === 'rejected') {
      const details = formatSlotDetails(oldSlotInfo)
      return `Thank you for your response.${details ? '\n' + details : ''}`
    }
    if (normalized === 'no_response') {
      return 'Link expired'
    }
    return fallback || ('Status: ' + String(status))
  }, [formatSlotDetails, newSlotInfo, oldSlotInfo])

  // Choose which slot to show: prefer server validityStatus, fallback to user's selected decision
  const chooseRelevantSlot = React.useCallback(() => {
    const s = String(validityStatus || "").toLowerCase()
    if (s === 'booked' || s === 'accepted') return newSlotInfo
    if (s === 'rejected') return oldSlotInfo
    if (selectedDecision === 'yes') return newSlotInfo
    if (selectedDecision === 'no') return oldSlotInfo
    return null
  }, [validityStatus, selectedDecision, newSlotInfo, oldSlotInfo])

  // Render a small, user-friendly slot block (date / time / location)
  const renderSlotBlock = React.useCallback((slot: any, title?: string | null) => {
    if (!slot) return null
    const hasAny = slot.date || slot.start_time || slot.end_time || slot.location
    if (!hasAny) return null
    return (
      <div className="mt-3">
        {title && <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>}
        <div className="mt-0.5">
          {slot.date && (<div><strong>{fmtDate(slot.date)}</strong>{slot.start_time && <> at <strong>{fmtTime(slot.start_time)}</strong></>}</div>)}
          {slot.end_time && slot.start_time && (<div className="text-sm text-muted-foreground">Ends at {fmtTime(slot.end_time)}</div>)}
          {slot.location && (<div className="text-sm mt-1">Location: <strong>{slot.location}</strong></div>)}
        </div>
      </div>
    )
  }, [fmtDate, fmtTime])

  // Render the exact appointment details lines the user requested
  const renderAppointmentDetails = React.useCallback((slot: any) => {
    if (!slot) return null
    const hasAny = slot.date || slot.start_time || slot.end_time || slot.location
    if (!hasAny) return null
    const date = slot.date ? fmtDate(slot.date) : ""
    const start = slot.start_time ? fmtTime(slot.start_time) : ""
    const end = slot.end_time ? fmtTime(slot.end_time) : ""
    const location = slot.location || ""
    const slotTime = start && end ? `${start} - ${end}` : start || end || ""
    return (
      <div className="mt-3 text-sm">
        <div className="text-base font-semibold text-muted-foreground">Thank you for your response, your appointment details are:</div>
        <div className="mt-2">
          <div><strong>date:</strong> {date}</div>
          <div className="mt-1"><strong>location:</strong> {location}</div>
          <div className="mt-1"><strong>slot_time:</strong> {slotTime}</div>
        </div>
      </div>
    )
  }, [fmtDate, fmtTime])

  const when = newSlotInfo.date && newSlotInfo.start_time ? `${fmtDate(newSlotInfo.date)} at ${fmtTime(newSlotInfo.start_time)}` : null
  const location = newSlotInfo.location
  const patientName = (payload as any)?.patient_name || patientInfo.name
  // const oldDateTime = oldSlotInfo.date && oldSlotInfo.start_time ? `${fmtDate(oldSlotInfo.date)} at ${fmtTime(oldSlotInfo.start_time)}` : null

  // Build richer patient details directly from token (no network calls)
  // (Already defined above; keep this spot clear to avoid duplicate declarations.)

  // Loader for validity checks
  if (checkingValidity && !finalMessage) {
    return (
      <AlertDialog open={true}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle></AlertDialogTitle>
            <AlertDialogDescription>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <svg className="h-5 w-5 animate-spin text-muted-foreground" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Checking status...
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  // Status mapping messages (override normal UI when not pending)
  if (!finalMessage && validityStatus && validityStatus !== 'pending') {
    // const message = buildFinalMessage(validityStatus, validityError)
    const relevantSlot = chooseRelevantSlot()
    return (
      <AlertDialog open={true}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle></AlertDialogTitle>
            <AlertDialogDescription>
              {renderAppointmentDetails(relevantSlot)}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {finalMessage ? "" : isExpired ? "Link expired" : "Confirm rescheduling?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {finalMessage && renderAppointmentDetails(chooseRelevantSlot())}
            {!finalMessage && isExpired && (
              <span className="text-destructive">This rescheduling link has expired. Please request a new one.</span>
            )}
            {!finalMessage && !isExpired && (
              <>
                {/* New Slot */}
                {newSlotInfo.date && (
                  <div className="mt-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New Slot</div>
                    <div className="mt-0.5">
                      <strong>{fmtDate(newSlotInfo.date)}</strong>
                      {newSlotInfo.start_time && <> at <strong>{fmtTime(newSlotInfo.start_time)}</strong></>}
                      {newSlotInfo.end_time && <> – <strong>{fmtTime(newSlotInfo.end_time)}</strong></>}
                    </div>
                    {newSlotInfo.location && (
                      <div className="text-xs mt-0.5">Location: <strong>{newSlotInfo.location}</strong></div>
                    )}
                  </div>
                )}

                {/* Previous Slot */}
                {oldSlotInfo.date && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous Slot</div>
                    <div className="mt-0.5">
                      {fmtDate(oldSlotInfo.date)}
                      {oldSlotInfo.start_time && <> at {fmtTime(oldSlotInfo.start_time)}</>}
                      {oldSlotInfo.end_time && <> – {fmtTime(oldSlotInfo.end_time)}</>}
                    </div>
                    {oldSlotInfo.location && (
                      <div className="text-xs mt-0.5">Location: {oldSlotInfo.location}</div>
                    )}
                  </div>
                )}

                {/* Patient */}
                {(patientInfo.name || patientInfo.email || patientInfo.phone) && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient</div>
                    {patientInfo.name && (
                      <div className="mt-0.5">
                        <strong>{patientInfo.name}</strong>
                        {patientInfo.age && <span className="text-xs ml-2">({patientInfo.age}y{patientInfo.gender ? ` • ${patientInfo.gender}` : ""})</span>}
                      </div>
                    )}
                    {patientInfo.email && (
                      <div className="text-xs mt-0.5">Email: {patientInfo.email}</div>
                    )}
                    {patientInfo.phone && (
                      <div className="text-xs">Phone: {patientInfo.phone}</div>
                    )}
                  </div>
                )}
                {!when && !location && !patientName && (
                  <span>Do you want to confirm the reschedule?</span>
                )}
                {typeof expiresInSeconds === "number" && expiresInSeconds > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expiration</div>
                    <div className="text-xs mt-0.5 text-muted-foreground">
                      This link will expire in ~{Math.max(0, Math.floor(expiresInSeconds / 60))}m.
                    </div>
                  </div>
                )}
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!finalMessage && !isExpired && (
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={handleDecline}
              disabled={closing && selectedDecision === "yes"}
            >
              {selectedDecision === "no" && closing ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  No
                </span>
              ) : (
                <>No</>
              )}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={closing && selectedDecision === "no"}
            >
              {selectedDecision === "yes" && closing ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Yes
                </span>
              ) : (
                <>Yes</>
              )}
            </Button>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
