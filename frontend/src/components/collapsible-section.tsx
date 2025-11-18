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

    // Check if icon is a React component (has render method)
    if (typeof icon === "function") {
      const IconComponent = icon as React.ComponentType<{ className?: string }>
      return <IconComponent className="h-5 w-5" />
    }

    // Otherwise render as ReactNode
    return icon
  }

  return (
    <Collapsible defaultOpen={defaultOpen} className="w-full">
      <Card>
        <CollapsibleTrigger asChild>
          <button className="w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
              <div className="flex items-center gap-3">
                {icon && <div className="text-primary">{renderIcon()}</div>}
                <div className="text-left">
                  <CardTitle>{title}</CardTitle>
                  {description && <CardDescription>{description}</CardDescription>}
                </div>
              </div>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
