'use client'

import * as React from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { Matcher } from 'react-day-picker'
import { CalendarIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

export type DatePickerValue = string | null | undefined

export interface DatePickerProps {
  /** ISO date string (yyyy-MM-dd) or any parseable ISO string */
  value?: DatePickerValue
  /** Called with a normalized ISO date string (yyyy-MM-dd) or null when cleared */
  onChange?: (value: string | null) => void
  /** Sets the underlying input id and button id for accessibility */
  id?: string
  /** Optional name, rendered via a hidden input for native form submissions */
  name?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  buttonClassName?: string
  /** Latest selectable date. Use startOfDay or earlier to avoid tz drift */
  maxDate?: Date
  /** Earliest selectable date. */
  minDate?: Date
  /** Disable dates with a custom matcher. Return true to block the date. */
  disableDate?: (date: Date) => boolean
  /** Custom display formatter. Defaults to `MMM d, yyyy`. */
  formatString?: string
  /** Allow clearing the value from a footer action. */
  allowClear?: boolean
  /** Align the popover relative to the trigger. */
  align?: 'start' | 'center' | 'end'
  /** Called when the popover open state changes */
  onOpenChange?: (open: boolean) => void
  /** Switch caption layout (defaults to dropdown for easier year/month jumps). */
  captionLayout?: React.ComponentProps<typeof Calendar>['captionLayout']
  /** Earliest month/year shown in the dropdown navigation. Defaults to minDate. */
  fromDate?: Date
  /** Latest month/year shown in the dropdown navigation. Defaults to maxDate. */
  toDate?: Date
}

/**
 * Shared date picker built on top of the shadcn Calendar component.
 * Emits ISO strings so callers can feed API payloads directly.
 */
export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  id,
  name,
  placeholder = 'Select a date',
  disabled,
  required,
  className,
  buttonClassName,
  maxDate,
  minDate,
  disableDate,
  formatString = 'MMM d, yyyy',
  allowClear,
  align = 'start',
  captionLayout = 'dropdown',
  fromDate,
  toDate,
  onOpenChange,
}) => {
  const [open, setOpen] = React.useState(false)

  const calendarMinDate = React.useMemo(() => minDate ?? fromDate, [minDate, fromDate])
  const calendarMaxDate = React.useMemo(() => maxDate ?? toDate, [maxDate, toDate])
  const dropdownBounds = React.useMemo(() => {
    const fromYear = calendarMinDate?.getFullYear()
    const toYear = calendarMaxDate?.getFullYear()
    const fromMonth = calendarMinDate
      ? new Date(calendarMinDate.getFullYear(), calendarMinDate.getMonth(), 1)
      : undefined
    const toMonth = calendarMaxDate
      ? new Date(calendarMaxDate.getFullYear(), calendarMaxDate.getMonth(), 1)
      : undefined
    return { fromYear, toYear, fromMonth, toMonth }
  }, [calendarMinDate, calendarMaxDate])

  const parsedValue = React.useMemo(() => {
    if (!value) return undefined
    try {
      const date = typeof value === 'string' ? parseISO(value) : undefined
      return date && isValid(date) ? date : undefined
    } catch {
      return undefined
    }
  }, [value])

  const displayValue = React.useMemo(() => {
    if (!parsedValue) return placeholder
    try {
      return format(parsedValue, formatString)
    } catch {
      return placeholder
    }
  }, [parsedValue, placeholder, formatString])

  const disabledMatchers = React.useMemo(() => {
    const matchers: Matcher[] = []
    if (calendarMaxDate) {
      matchers.push({ after: calendarMaxDate })
    }
    if (calendarMinDate) {
      matchers.push({ before: calendarMinDate })
    }
    if (disableDate) {
      matchers.push(disableDate)
    }
    if (matchers.length === 0) return undefined
    return matchers
  }, [calendarMaxDate, calendarMinDate, disableDate])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
  }

  const handleSelect = (date?: Date) => {
    if (!date || !isValid(date)) {
      onChange?.(null)
      return
    }
    const next = format(date, 'yyyy-MM-dd')
    onChange?.(next)
    handleOpenChange(false)
  }

  const handleClear = () => {
    onChange?.(null)
    handleOpenChange(false)
  }

  return (
    <div className={cn('space-y-1', className)}>
      {name ? (
        <input
          type="hidden"
          name={name}
          value={value ?? ''}
          required={required}
          aria-hidden
        />
      ) : null}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            id={id}
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full justify-start text-left font-normal flex items-center gap-2',
              !parsedValue && 'text-muted-foreground',
              buttonClassName
            )}
          >
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span>{displayValue}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={align} sideOffset={8}>
          <Calendar
            mode="single"
            selected={parsedValue}
            onSelect={handleSelect}
            disabled={disabledMatchers}
            captionLayout={captionLayout}
            fromDate={calendarMinDate}
            toDate={calendarMaxDate}
            fromYear={captionLayout === 'dropdown' ? dropdownBounds.fromYear : undefined}
            toYear={captionLayout === 'dropdown' ? dropdownBounds.toYear : undefined}
            fromMonth={captionLayout === 'dropdown' ? dropdownBounds.fromMonth : undefined}
            toMonth={captionLayout === 'dropdown' ? dropdownBounds.toMonth : undefined}
            initialFocus
          />
          {allowClear && parsedValue ? (
            <div className="border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-center"
                onClick={handleClear}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}

DatePicker.displayName = 'DatePicker'
