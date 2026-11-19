import React, { useState, useEffect } from 'react';
import {
  Search,
  User,
  Mail,
  Phone,
  Globe,
  MapPin,
  Calendar,
  ArrowRight,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import { dbService } from '../services/masterDbService';
import { Person } from '../types/masterDatabase';
import { formatPureDigitsPhone } from '../shared/normalization';
import { formatDateDisplay } from '../shared/dateFormat';

interface GlobalSearchViewProps {
  initialQuery?: string;
  onSelectCandidate: (personId: string) => void;
}

export const GlobalSearchView: React.FC<GlobalSearchViewProps> = ({
  initialQuery = '',
  onSelectCandidate,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<{ person: Person; matchReason: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(initialQuery);
    if (initialQuery.trim()) {
      executeSearch(initialQuery);
    }
  }, [initialQuery]);

  const executeSearch = async (searchQuery: string) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const { candidates } = await dbService.getCandidates({ page: 1, pageSize: 200, search: q });

      // Determine match reason for each candidate
      const matchedWithReasons = candidates.map((cand) => {
        let reason = 'Matched Candidate Name';

        if (cand.person_id.toLowerCase().includes(q)) {
          reason = `Matched Person ID (${cand.person_id})`;
        } else if (cand.primary_email && cand.primary_email.toLowerCase().includes(q)) {
          reason = `Matched Primary Email (${cand.primary_email})`;
        } else if (cand.emails?.some((e) => e.email.toLowerCase().includes(q))) {
          const matchedEmail = cand.emails.find((e) => e.email.toLowerCase().includes(q))?.email;
          reason = `Matched Historical Email (${matchedEmail})`;
        } else if (cand.primary_phone && cand.primary_phone.includes(q)) {
          reason = `Matched Primary Phone (${cand.primary_phone})`;
        } else if (cand.phones?.some((p) => p.phone_normalized.includes(q) || p.phone_original.includes(q))) {
          const matchedPhone = cand.phones.find(
            (p) => p.phone_normalized.includes(q) || p.phone_original.includes(q)
          )?.phone_original;
          reason = `Matched Historical Phone (${matchedPhone})`;
        } else if (cand.linkedin_url && cand.linkedin_url.toLowerCase().includes(q)) {
          reason = `Matched LinkedIn Profile URL`;
        }

        return { person: cand, matchReason: reason };
      });

      setResults(matchedWithReasons);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Search Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Global Recruiting Database Search
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          High-performance search across names, multiple historical emails, normalized phones, LinkedIn URLs, and Person IDs.
        </p>
      </div>

      {/* Main Search Input Form */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              executeSearch(e.target.value);
            }}
            placeholder="Search e.g. John Smith, john@gmail.com, 2143349058, P-000123, linkedin.com/in/..."
            className="w-full pl-12 pr-28 py-3.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="absolute right-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            Search
          </button>
        </div>
      </form>

      {/* Results List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {query.trim()
              ? `Found ${results.length} matching candidate profiles for "${query}"`
              : 'Type a query above to search the database'}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">Searching master database...</div>
        ) : results.length === 0 && query.trim() ? (
          <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-400">
            No candidate profiles found matching &quot;{query}&quot;. Try a different phone number, email, or name.
          </div>
        ) : (
          <div className="space-y-3">
            {results.map(({ person, matchReason }) => (
              <div
                key={person.id}
                onClick={() => onSelectCandidate(person.id)}
                className="bg-white p-5 rounded-xl border border-slate-200/90 hover:border-blue-300 hover:shadow-xs transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {person.person_id}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base">
                      {person.full_name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                      {person.current_status}
                    </span>
                  </div>

                  {/* Match Reason Tag */}
                  <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{matchReason}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                    <div className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{person.primary_email || 'No email'}</span>
                    </div>
                    <div className="flex items-center gap-1 font-mono">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatPureDigitsPhone(person.primary_phone) || 'No phone'}</span>
                    </div>
                    {person.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{person.location}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col md:items-end gap-1 text-xs text-slate-500 shrink-0">
                  <div>
                    Owner: <strong className="text-slate-800">{person.current_owner || 'Unassigned'}</strong>
                  </div>
                  <div>
                    Last Activity: <span className="font-mono">{formatDateDisplay(person.last_activity_at, 'N/A')}</span>
                  </div>
                  <span className="text-xs font-semibold text-blue-600 flex items-center gap-1 mt-1">
                    <span>View Profile</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
