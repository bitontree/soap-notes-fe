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
  Users,
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
  { name: "Manage Patients", href: "/manage-patients", icon: Users },
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
      className={cn('sticky top-0 flex-shrink-0 h-screen flex flex-col bg-[#2a2f35] border-r border-[#363b42] transition-all duration-150 ease-in-out', sidebarWidth)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className={cn('flex items-center gap-2 px-4 py-4 border-b border-[#363b42]', collapsed && !hovering ? 'justify-center' : '')}>
        <div className={cn('p-2 rounded-xl', collapsed && !hovering ? 'bg-transparent' : 'bg-emerald-500')}>
          <Stethoscope className={cn('text-white', collapsed && !hovering ? 'text-emerald-500' : '')} />
        </div>
        {!(collapsed && !hovering) && (
          <div>
            <h1 className="text-lg font-semibold min-w-[200px] text-white leading-tight">SOAP Notes</h1>
            <p className="text-sm text-gray-400">Medical Documentation</p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1 relative">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          return (
            <div key={item.name} className="relative">
              <Link href={item.href} legacyBehavior>
                <a>
                  <Button
                    variant="ghost"
                    className={cn(
                      'w-full justify-start gap-3 text-gray-400 hover:text-white hover:bg-[#363b42] rounded-xl',
                      collapsed && !hovering ? 'justify-center py-2' : 'px-4 py-2',
                      isActive && 'bg-emerald-500 text-white hover:bg-emerald-500 hover:text-white'
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
      </nav>

      <div className={cn('border-t border-[#363b42] p-3', collapsed && !hovering ? 'flex-col items-center' : '')}>
        <div className={cn('flex items-center gap-3 mb-3', collapsed && !hovering ? 'flex-col' : '')}>
          <div className={cn('h-8 w-8 rounded-full flex items-center justify-center', collapsed && !hovering ? 'bg-transparent' : 'bg-emerald-500')}>
            <span className={cn('text-sm font-medium text-white')}>{user?.firstname?.charAt(0) || 'U'}</span>
          </div>
          {!(collapsed && !hovering) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.firstname ? `${user.firstname} ${user.lastname}` : 'User'}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email || 'user@example.com'}</p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          className={cn('w-full justify-start gap-3 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl', collapsed && !hovering ? 'justify-center' : '')}
          onClick={logout}
        >
          <LogOut className="h-5 w-5" />
          {!(collapsed && !hovering) && 'Sign Out'}
        </Button>
      </div>
    </div>
  )
}
