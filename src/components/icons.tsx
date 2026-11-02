import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number | string };

function Icon({ size = 24, className, ...props }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  );
}

export const AlertCircle = Icon;
export const AlertTriangle = Icon;
export const CalendarDays = Icon;
export const Check = Icon;
export const CheckCircle2 = Icon;
export const ChevronDown = Icon;
export const ChevronUp = Icon;
export const Download = Icon;
export const Dumbbell = Icon;
export const HelpCircle = Icon;
export const Minus = Icon;
export const Plus = Icon;
export const RotateCcw = Icon;
export const Settings = Icon;
export const ShieldCheck = Icon;
export const Sliders = Icon;
export const Timer = Icon;
export const Trash2 = Icon;
export const TrendingUp = Icon;
export const Trophy = Icon;
export const Upload = Icon;
export const Users = Icon;
export const Volume2 = Icon;
export const WifiOff = Icon;
export const X = Icon;
export const XCircle = Icon;
