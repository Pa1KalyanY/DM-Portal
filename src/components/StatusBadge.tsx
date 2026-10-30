import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, AlertOctagon } from 'lucide-react';
import { ScreeningStatus } from '../types';

interface StatusBadgeProps {
  status: ScreeningStatus | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', showIcon = true }) => {
  const normalized = (status || '').toUpperCase();

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs font-semibold gap-1',
    md: 'px-2.5 py-1 text-xs font-semibold gap-1.5',
    lg: 'px-3.5 py-1.5 text-sm font-semibold gap-2',
  }[size];

  if (normalized === 'PASS') {
    return (
      <span className={`inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 ${sizeClasses}`}>
        {showIcon && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
        <span>PASS</span>
      </span>
    );
  }

  if (normalized === 'FAIL') {
    return (
      <span className={`inline-flex items-center rounded-full bg-rose-50 text-rose-700 border border-rose-200 ${sizeClasses}`}>
        {showIcon && <XCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />}
        <span>FAIL</span>
      </span>
    );
  }

  if (normalized === 'MANUAL_REVIEW' || normalized === 'MANUAL REVIEW') {
    return (
      <span className={`inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-200 ${sizeClasses}`}>
        {showIcon && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />}
        <span>MANUAL REVIEW</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center rounded-full bg-slate-100 text-slate-700 border border-slate-200 ${sizeClasses}`}>
      {showIcon && <AlertOctagon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />}
      <span>{normalized || 'UNKNOWN'}</span>
    </span>
  );
};
