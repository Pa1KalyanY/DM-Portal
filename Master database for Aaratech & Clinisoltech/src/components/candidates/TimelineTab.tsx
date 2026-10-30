import React from 'react';
import {
  FileText,
  PhoneCall,
  UserCheck,
  RefreshCw,
  GitMerge,
  UploadCloud,
  CheckCircle2,
  Calendar,
  Building,
} from 'lucide-react';
import { Person } from '../../types/database';
import { cleanJobTitle } from '../../lib/normalization';

interface TimelineTabProps {
  candidate: Person;
}

interface TimelineItem {
  id: string;
  date: string;
  type: 'application' | 'recruiter_contact' | 'status_change' | 'import' | 'merge';
  title: string;
  subtitle?: string;
  content?: string;
  source?: string;
  badge?: string;
  author?: string;
}

export const TimelineTab: React.FC<TimelineTabProps> = ({ candidate }) => {
  // Aggregate all events into a single chronological timeline
  const items: TimelineItem[] = [];

  // Applications
  if (candidate.applications) {
    candidate.applications.forEach((app) => {
      items.push({
        id: 'app-' + app.id,
        date: app.date_applied,
        type: 'application',
        title: `APPLICATION SUBMITTED`,
        subtitle: `${app.company} — ${cleanJobTitle(app.job_title)} ${app.job_id ? `(${app.job_id})` : ''}`,
        content: `Current Pipeline Stage: ${app.current_stage}`,
        source: app.source_file ? `${app.source_file}${app.source_row ? ` (Row ${app.source_row})` : ''}` : undefined,
        badge: app.company,
      });
    });
  }

  // Recruiter Contacts
  if (candidate.recruiter_contacts) {
    candidate.recruiter_contacts.forEach((contact) => {
      const label = contact.feedback_label || (
        contact.source && contact.source.includes('|')
          ? contact.source.split('|').slice(1).join('|').trim()
          : null
      );
      items.push({
        id: 'rec-' + contact.id,
        date: contact.contact_date,
        type: 'recruiter_contact',
        title: label ? `RECRUITER INTERACTION (${label.toUpperCase()})` : `RECRUITER INTERACTION`,
        subtitle: `${contact.recruiter_name} via ${contact.contact_type}`,
        content: contact.original_feedback, // Exact verbatim
        source: contact.source_file ? `${contact.source_file}${contact.source_row ? ` (Row ${contact.source_row})` : ''}` : undefined,
        author: contact.recruiter_name,
        badge: label || undefined,
      });
    });
  }

  // Status History
  if (candidate.status_history) {
    candidate.status_history.forEach((sh) => {
      items.push({
        id: 'sh-' + sh.id,
        date: sh.created_at.split('T')[0],
        type: 'status_change',
        title: `OPERATIONAL STATUS UPDATED`,
        subtitle: `${sh.old_status || 'Initial'} → ${sh.new_status}`,
        content: sh.reason ? `Reason: ${sh.reason}` : undefined,
        author: sh.changed_by,
      });
    });
  }

  // Profile Created / Initial Ingestion
  items.push({
    id: 'created-' + candidate.id,
    date: candidate.created_at.split('T')[0],
    type: 'import',
    title: `MASTER IDENTITY CREATED`,
    subtitle: `Person ID ${candidate.person_id} initialized in Master Database`,
    content: `Initial candidate profile registered with verified identifiers.`,
  });

  // Sort descending by date
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getIcon = (type: TimelineItem['type']) => {
    switch (type) {
      case 'application':
        return <FileText className="w-4 h-4 text-blue-600" />;
      case 'recruiter_contact':
        return <PhoneCall className="w-4 h-4 text-emerald-600" />;
      case 'status_change':
        return <RefreshCw className="w-4 h-4 text-amber-600" />;
      case 'merge':
        return <GitMerge className="w-4 h-4 text-purple-600" />;
      case 'import':
        return <UploadCloud className="w-4 h-4 text-slate-600" />;
    }
  };

  const getBadgeColor = (type: TimelineItem['type']) => {
    switch (type) {
      case 'application':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'recruiter_contact':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'status_change':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'merge':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'import':
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Chronological Activity Timeline
          </h3>
          <p className="text-xs text-slate-500">
            Unified view of applications, recruiter touchpoints, status changes, and file imports.
          </p>
        </div>
      </div>

      <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
        {items.map((item) => (
          <div key={item.id} className="relative group">
            {/* Dot marker */}
            <div className="absolute -left-6 top-1 w-6 h-6 rounded-full bg-white border-2 border-slate-300 group-hover:border-blue-600 flex items-center justify-center shadow-xs transition-colors">
              {getIcon(item.type)}
            </div>

            {/* Event Content Card */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${getBadgeColor(
                      item.type
                    )}`}
                  >
                    {item.title}
                  </span>
                  {item.badge && (
                    <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {item.badge}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{item.date}</span>
                </div>
              </div>

              {item.subtitle && (
                <div className="text-sm font-semibold text-slate-900 mt-1">
                  {item.subtitle}
                </div>
              )}

              {item.content && (
                <div className="text-xs text-slate-700 mt-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100 font-mono leading-relaxed whitespace-pre-wrap">
                  {item.content}
                </div>
              )}

              {/* Source traceability tag */}
              {item.source && (
                <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                  <span className="font-semibold text-slate-500">Source:</span>
                  <span>{item.source}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
