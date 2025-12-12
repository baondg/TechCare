"use client"

import type React from "react"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ReactNode } from "react"

interface CollapsibleSectionProps {
  title: string
  description?: string
  icon?: ReactNode | React.ComponentType<{ className?: string }>
  defaultOpen?: boolean
  children: ReactNode
}

export function CollapsibleSection({
  title,
  description,
  icon,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const renderIcon = () => {
    if (!icon) return null

    if (typeof icon === "function") {
      const IconComponent = icon as React.ComponentType<{ className?: string }>
      return <IconComponent className="h-5 w-5" />
    }

    return icon
  }

  return (
    <Collapsible defaultOpen={defaultOpen} className="w-full group">
      <Card className="card-feature overflow-visible border-slate-200/60">
        <CollapsibleTrigger asChild>
          <button className="w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 cursor-pointer transition-all duration-300 rounded-t-xl">
              <div className="flex items-center gap-3">
                {icon && (
                  <div className="card-icon-wrapper h-12 w-12">
                    {renderIcon()}
                  </div>
                )}
                <div className="text-left">
                  <CardTitle className="text-xl font-bold text-slate-900 group-hover:text-cyan-600 transition-colors duration-300">
                    {title}
                  </CardTitle>
                  {description && (
                    <CardDescription className="text-slate-600 mt-1">
                      {description}
                    </CardDescription>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ChevronDown className="h-5 w-5 text-slate-400 transition-all duration-300 group-data-[state=open]:rotate-180 group-hover:text-cyan-500" />
              </div>
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="transition-all duration-300">
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}