import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border border-[#f4d98f]/40 bg-primary text-primary-foreground shadow-lg shadow-primary/15 hover:-translate-y-px hover:bg-[#e4c66f] hover:shadow-primary/25",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-white/[0.12] bg-white/[0.025] text-foreground hover:-translate-y-px hover:border-primary/45 hover:bg-primary/10 hover:text-white",
        secondary: "bg-muted text-foreground hover:bg-muted/80",
        ghost: "text-muted-foreground hover:bg-primary/[0.08] hover:text-primary",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-5",
        icon: "h-10 w-10 px-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
