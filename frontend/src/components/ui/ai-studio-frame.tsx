import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Google AI Studio esinli çok renkli dönen çerçeve ve yumuşak dış hale katmanları.
 * Ebeveyn eleman stacking-context (isolate veya fixed+z-index) sağlamalıdır.
 */
export function AiStudioGlowLayers() {
  return (
    <>
      <div className="ai-studio-halo" aria-hidden="true">
        <div className="ai-studio-halo-clip">
          <div className="ai-studio-spinner" />
        </div>
      </div>
      <div className="ai-studio-ring" aria-hidden="true">
        <div className="ai-studio-spinner" />
      </div>
    </>
  );
}

interface AiStudioFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  contentClassName?: string;
}

export function AiStudioFrame({
  className,
  contentClassName,
  children,
  ...props
}: AiStudioFrameProps) {
  return (
    <div
      className={cn("relative isolate rounded-[10px]", className)}
      {...props}
    >
      <AiStudioGlowLayers />
      <div
        className={cn(
          "relative z-10 rounded-[10px] bg-card ring-1 ring-black/6 dark:ring-white/10",
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
