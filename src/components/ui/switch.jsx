import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

// Toggle estilo ON/OFF: trilho VERDE quando ligado (botão à direita) e VERMELHO
// quando desligado (botão à esquerda), com rótulos ON/OFF para deixar o estado
// bem visível.
const Switch = React.forwardRef(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "group relative peer inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500",
      className
    )}
    {...props}
    ref={ref}>
    <span className="pointer-events-none absolute left-1.5 text-[8px] font-bold leading-none text-white opacity-0 transition-opacity group-data-[state=checked]:opacity-100">
      ON
    </span>
    <span className="pointer-events-none absolute right-1 text-[8px] font-bold leading-none text-white opacity-0 transition-opacity group-data-[state=unchecked]:opacity-100">
      OFF
    </span>
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none z-10 block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-6 data-[state=unchecked]:translate-x-0"
      )} />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
