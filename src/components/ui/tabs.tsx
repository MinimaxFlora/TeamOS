import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '../../lib/utils'

export const Tabs = TabsPrimitive.Root

export function TabsList({
  variant = 'underline',
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  variant?: 'underline' | 'pills'
}) {
  return (
    <TabsPrimitive.List
      className={cn(
        variant === 'underline'
          ? 'flex w-full items-center gap-1 border-b border-line'
          : 'inline-flex items-center gap-1 rounded-lg bg-sunken p-1',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  variant = 'underline',
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
  variant?: 'underline' | 'pills'
}) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex select-none items-center gap-1.5 whitespace-nowrap text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
        variant === 'underline'
          ? '-mb-px border-b-2 border-transparent px-3 py-2.5 text-muted hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink'
          : 'rounded-md px-3 py-1.5 text-muted hover:text-ink data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-card',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('outline-none data-[state=active]:animate-fade-in', className)}
      {...props}
    />
  )
}
