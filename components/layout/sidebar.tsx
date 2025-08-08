"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import {
  LayoutDashboard,
  FileText,
  History,
  Database,
  Settings,
  LogOut,
  Stethoscope,
  Upload,      
} from "lucide-react"

// Add your new navigation item here:
const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Generate SOAP", href: "/generate", icon: FileText },
  { name: "History", href: "/history", icon: History },
  { name: "EHR Integration", href: "/ehr", icon: Database },
  { name: "Upload Health Report", href: "/health-report", icon: Upload }, 
  { name: "Settings", href: "/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  return (
    <div className="flex h-full w-64 flex-col bg-white border-r border-gray-200">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-200">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Stethoscope className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">SOAP Notes</h1>
          <p className="text-sm text-gray-500">Medical Documentation</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link key={item.name} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn("w-full justify-start gap-3", isActive && "bg-blue-50 text-blue-700 hover:bg-blue-50")}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Button>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-blue-600">{user?.firstname?.charAt(0) || "U"}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.firstname && user?.lastname ? `${user.firstname} ${user.lastname}` : "User"}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email || "user@example.com"}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={logout}
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
