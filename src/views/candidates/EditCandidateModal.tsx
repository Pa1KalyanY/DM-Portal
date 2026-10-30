import React, { useState } from 'react';
import { X, Check, AlertCircle, Save, Loader2, Sparkles, Building, MapPin, Mail, Phone, User, Briefcase, Globe } from 'lucide-react';
import { Person, CandidateStatus, CompanyName } from '../../types/masterDatabase';
import { dbService } from '../../services/masterDbService';
import { cleanJobTitle, formatPureDigitsPhone } from '../../shared/normalization';

interface EditCandidateModalProps {
  candidate: Person;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedPerson: Person, autoMerged?: boolean, mergedWithId?: string) => void;
}

const STATUS_OPTIONS: CandidateStatus[] = [
  'New',
  'Open',
  'Assigned',
  'Contacted',
  'Follow-up',
  'Review',
  'Not Interested',
  'Closed',
  'Dead',
];

export const EditCandidateModal: React.FC<EditCandidateModalProps> = ({
  candidate,
  isOpen,
  onClose,
  onSuccess,
}) => {
  // Form fields prefilled with candidate values
  const [fullName, setFullName] = useState(candidate.full_name || '');
  const [primaryEmail, setPrimaryEmail] = useState(candidate.primary_email || '');
  const [secondaryEmail, setSecondaryEmail] = useState(candidate.secondary_email || '');
  const [primaryPhone, setPrimaryPhone] = useState(candidate.primary_phone || '');
  const [secondaryPhone, setSecondaryPhone] = useState(candidate.secondary_phone || '');
  const [location, setLocation] = useState(candidate.location || '');
  const [preferredLocation, setPreferredLocation] = useState(candidate.preferred_location || '');
  const [currentTitle, setCurrentTitle] = useState(cleanJobTitle(candidate.current_title || candidate.headline || 'Data Analyst'));
  const [currentCompany, setCurrentCompany] = useState<CompanyName>(
    (candidate.current_company as CompanyName) || 'AaraTech'
  );
  const [currentStatus, setCurrentStatus] = useState<CandidateStatus>(candidate.current_status || 'Open');
  const [currentOwner, setCurrentOwner] = useState(candidate.current_owner || 'Unassigned');
  const [linkedinUrl, setLinkedinUrl] = useState(candidate.linkedin_url || '');
  const [resumeUrl, setResumeUrl] = useState(candidate.resume_url || '');
  const [greenCard, setGreenCard] = useState(candidate.green_card || '');
  const [h1bStatus, setH1bStatus] = useState(candidate.h1b_status || '');

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Candidate full name is required';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (primaryEmail.trim() && !emailRegex.test(primaryEmail.trim())) {
      newErrors.primaryEmail = 'Please enter a valid primary email address (e.g. user@domain.com)';
    }

    if (secondaryEmail.trim() && !emailRegex.test(secondaryEmail.trim())) {
      newErrors.secondaryEmail = 'Please enter a valid secondary email address';
    }

    if (primaryPhone.trim()) {
      const digits = primaryPhone.replace(/\D/g, '');
      if (digits.length < 7) {
        newErrors.primaryPhone = 'Primary phone must contain at least 7 digits';
      }
    }

    if (secondaryPhone.trim()) {
      const digits = secondaryPhone.replace(/\D/g, '');
      if (digits.length < 7) {
        newErrors.secondaryPhone = 'Secondary phone must contain at least 7 digits';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) {
      return;
    }

    setSaving(true);
    try {
      const updates = {
        full_name: fullName.trim(),
        primary_email: primaryEmail.trim() || null,
        secondary_email: secondaryEmail.trim() || null,
        primary_phone: formatPureDigitsPhone(primaryPhone) || null,
        secondary_phone: formatPureDigitsPhone(secondaryPhone) || null,
        location: location.trim() || null,
        preferred_location: preferredLocation.trim() || null,
        current_title: cleanJobTitle(currentTitle.trim()),
        headline: cleanJobTitle(currentTitle.trim()),
        current_status: currentStatus,
        current_owner: currentOwner.trim() || 'Adam',
        linkedin_url: linkedinUrl.trim() || null,
        resume_url: resumeUrl.trim() || null,
        green_card: greenCard.trim() || null,
        h1b_status: h1bStatus.trim() || null,
        current_company: currentCompany,
      };

      const result = await dbService.updateCandidateProfile(candidate.id, updates, 'Recruiter Admin');

      if (!result.success) {
        setServerError(result.error || 'Failed to save candidate changes');
        setSaving(false);
        return;
      }

      onSuccess(result.person || candidate, result.autoMerged, result.mergedWithPersonId);
      onClose();
    } catch (err: any) {
      console.error('Error updating candidate:', err);
      setServerError(err.message || 'An unexpected error occurred while saving profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Edit Candidate Profile</h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700">
                  {candidate.person_id}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Update verified contacts, locations, and identity records. All changes are audit-logged.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Server Error Alert */}
        {serverError && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Section 1: Core Identity */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1.5">
              Identity &amp; Role Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Candidate Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (errors.fullName) setErrors({ ...errors, fullName: '' });
                  }}
                  className={`w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.fullName ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'
                  }`}
                  placeholder="e.g. Uday Kiran"
                />
                {errors.fullName && <p className="text-[11px] text-rose-600 mt-1">{errors.fullName}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Role / Job Title
                </label>
                <input
                  type="text"
                  value={currentTitle}
                  onChange={(e) => setCurrentTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Data Analyst (DA), Python Developer"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Contact Numbers & Emails */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1.5 flex items-center justify-between">
              <span>Primary &amp; Secondary Contact Details</span>
              <span className="text-[10px] text-slate-400 font-normal lowercase">
                (Old contacts are preserved in history upon edit)
              </span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Primary Email */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                  <span>Primary Email Address</span>
                </label>
                <input
                  type="email"
                  value={primaryEmail}
                  onChange={(e) => {
                    setPrimaryEmail(e.target.value);
                    if (errors.primaryEmail) setErrors({ ...errors, primaryEmail: '' });
                  }}
                  className={`w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.primaryEmail ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'
                  }`}
                  placeholder="e.g. candidate@gmail.com"
                />
                {errors.primaryEmail && <p className="text-[11px] text-rose-600 mt-1">{errors.primaryEmail}</p>}
              </div>

              {/* Secondary Email */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>Secondary Email Address</span>
                </label>
                <input
                  type="email"
                  value={secondaryEmail}
                  onChange={(e) => {
                    setSecondaryEmail(e.target.value);
                    if (errors.secondaryEmail) setErrors({ ...errors, secondaryEmail: '' });
                  }}
                  className={`w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.secondaryEmail ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'
                  }`}
                  placeholder="e.g. secondary.work@domain.com"
                />
                {errors.secondaryEmail && <p className="text-[11px] text-rose-600 mt-1">{errors.secondaryEmail}</p>}
              </div>

              {/* Primary Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Primary Phone Number</span>
                </label>
                <input
                  type="text"
                  value={primaryPhone}
                  onChange={(e) => {
                    setPrimaryPhone(e.target.value);
                    if (errors.primaryPhone) setErrors({ ...errors, primaryPhone: '' });
                  }}
                  className={`w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.primaryPhone ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'
                  }`}
                  placeholder="e.g. (331) 304-3104 or 5109362511"
                />
                {errors.primaryPhone && <p className="text-[11px] text-rose-600 mt-1">{errors.primaryPhone}</p>}
              </div>

              {/* Secondary Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>Secondary Phone Number</span>
                </label>
                <input
                  type="text"
                  value={secondaryPhone}
                  onChange={(e) => {
                    setSecondaryPhone(e.target.value);
                    if (errors.secondaryPhone) setErrors({ ...errors, secondaryPhone: '' });
                  }}
                  className={`w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.secondaryPhone ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'
                  }`}
                  placeholder="e.g. (512) 658-2286"
                />
                {errors.secondaryPhone && <p className="text-[11px] text-rose-600 mt-1">{errors.secondaryPhone}</p>}
              </div>
            </div>
          </div>

          {/* Section 3: Geographic Location Fix (Section 10, 11, 12) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              <span>Location Management</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Current Location (City, State)
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Dallas, TX or Chicago, IL"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Visible in candidate list, profile header, search, and CSV exports.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Preferred Location (Open to US / Relocation)
                </label>
                <input
                  type="text"
                  value={preferredLocation}
                  onChange={(e) => setPreferredLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Open to US, Remote, NY/NJ"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Operational Fields & Links */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1.5">
              Status &amp; Ownership
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Operational Status
                </label>
                <select
                  value={currentStatus}
                  onChange={(e) => setCurrentStatus(e.target.value as CandidateStatus)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Recruiter Owner
                </label>
                <input
                  type="text"
                  value={currentOwner}
                  onChange={(e) => setCurrentOwner(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Adam, Alex"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Database Pool
                </label>
                <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-blue-600" />
                  <span>{currentCompany} (Isolated)</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-700" />
                <span>LinkedIn Profile URL</span>
              </label>
              <input
                type="text"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. linkedin.com/in/username"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-purple-700" />
                <span>Resume Document URL (Google Drive)</span>
              </label>
              <input
                type="text"
                value={resumeUrl}
                onChange={(e) => setResumeUrl(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. drive.google.com/file/d/..."
              />
            </div>

            {/* Work Authorization / Visa Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Green Card / US-C
                </label>
                <input
                  type="text"
                  value={greenCard}
                  onChange={(e) => setGreenCard(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Yes, No, GC EAD, USC"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  H1B - Y/N
                </label>
                <input
                  type="text"
                  value={h1bStatus}
                  onChange={(e) => setH1bStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Yes, No"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            Auto-deduplication checks rerun immediately when names or contacts are modified.
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
