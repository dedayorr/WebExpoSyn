import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-royal text-white hover:-translate-y-0.5 hover:bg-royal-hover hover:shadow-[0_10px_30px_rgba(27,44,193,0.45)]',
        ghost:
          'border border-sky/25 bg-transparent text-sky hover:border-periwinkle hover:bg-sky/10 hover:text-white',
        light:
          'border border-navy/20 bg-transparent text-navy hover:border-royal hover:bg-royal/5 hover:text-royal',
        white:
          'bg-white text-royal hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(3,8,30,0.35)]',
        outlineWhite:
          'border border-white/45 bg-transparent text-white hover:bg-white/10',
      },
      size: {
        sm: 'h-10 px-4 text-sm',
        md: 'h-11 px-5 text-[15px]',
        lg: 'h-13 px-7 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'
