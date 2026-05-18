'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export function InfoTooltip({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span className="ml-1.5 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500">
            ?
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className="max-w-[270px] border-slate-700 bg-slate-800 p-3 text-xs leading-relaxed text-slate-200"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
