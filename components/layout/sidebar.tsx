"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import React, { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  FileText,
  History,
  Calendar,
  Database,
  Settings,
  LogOut,
  Stethoscope,
  Upload,      
  Activity,
  FormInput, 
} from "lucide-react"


const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Generate SOAP", href: "/generate", icon: FileText },
  { name: "Form Builder", href: "/form-builder", icon: FormInput },
  { name: "EHR Integration", href: "/ehr", icon: Database },
  { name: "Biomarkers", href: "/biomarkers", icon: Activity },
  { name: "Schedules", href: "/schedules", icon: Calendar },
  { name: "History", href: "/history", icon: History },
  { name: "Upload Health Report", href: "/health-report", icon: Upload }, 
  { name: "Settings", href: "/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  // collapsed state persists after navigation; hover expands temporarily
  const [collapsed, setCollapsed] = useState<boolean>(false)
  const [hovering, setHovering] = useState<boolean>(false)

  // When user navigates to a module, collapse the sidebar to icons-only
  // We watch pathname changes to trigger collapse.
  useEffect(() => {
    // collapse after navigation to give the feeling of minimization
    setCollapsed(true)
  }, [pathname])

  const sidebarWidth = collapsed && !hovering ? 'w-16' : 'w-64'

  return (
    <div
      className={cn('flex h-full flex-col bg-white border-r border-gray-200 transition-all duration-150 ease-in-out', sidebarWidth)}
    onMouseEnter={() => setHovering(true)}
    onMouseLeave={() => setHovering(false)}
    >
      <div className={cn('flex items-center gap-2 px-4 py-3 border-b border-gray-200', collapsed && !hovering ? 'justify-center' : '')}>
        <div className={cn('p-2 rounded-lg', collapsed && !hovering ? 'bg-transparent' : 'bg-blue-100')}>
          <Stethoscope className={cn('', collapsed && !hovering ? 'text-blue-600 ' : 'text-blue-600 bg-blue-100')} />
        </div>
        {!(collapsed && !hovering) && (
          <div>
            <h1 className="text-lg font-semibold min-w-[200px] text-gray-900 leading-tight">SOAP Notes</h1>
            <p className="text-sm text-gray-500">Medical Documentation</p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-4 space-y-2 relative">
        {navigation.map((item, idx) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          return (
            <div key={item.name} className="relative">
              <Link href={item.href} legacyBehavior>
                <a>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={cn(
                      'w-full justify-start gap-3',
                      collapsed && !hovering ? 'justify-center py-2' : 'px-4 py-2',
                      isActive && 'bg-blue-50 text-blue-700 hover:bg-blue-50'
                    )}
                    onClick={() => {
                      // keep collapsed after clicking
                      setCollapsed(true)
                    }}
                  >
                    <Icon className="h-5 w-5" />
                    {!(collapsed && !hovering) && item.name}
                  </Button>
                </a>
              </Link>
            </div>
          )
        })}

        {/* No floating tooltip: hover expands the sidebar so labels are visible */}
      </nav>

      <div className={cn('border-t border-gray-200 p-3', collapsed && !hovering ? 'flex-col items-center' : '')}>
        <div className={cn('flex items-center gap-3 mb-3', collapsed && !hovering ? 'flex-col' : '')}>
          <div className={cn('h-8 w-8 rounded-full flex items-center justify-center', collapsed && !hovering ? 'bg-transparent' : 'bg-blue-100')}>
            <span className={cn('text-sm font-medium', collapsed && !hovering ? 'text-blue-600' : 'text-blue-600')}>{user?.firstname?.charAt(0) || 'U'}</span>
          </div>
          {!(collapsed && !hovering) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.firstname ? `${user.firstname} ${user.lastname}` : 'User'}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email || 'user@example.com'}</p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          className={cn('w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50', collapsed && !hovering ? 'justify-center' : '')}
          onClick={logout}
        >
          <LogOut className="h-5 w-5" />
          {!(collapsed && !hovering) && 'Sign Out'}
        </Button>
      </div>
    </div>
  )
}
