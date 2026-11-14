import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, Lock, ArrowRight, BookOpen, Clock } from 'lucide-react';
import type { CourseDocument, UserDocument } from '../types';

interface CheckoutModalProps {
  course: CourseDocument | null;
  currentUser: UserDocument;
  onClose: () => void;
  onConfirmEnrollment: (courseId: string, amountPaid: number) => Promise<string | null>;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  course,
  currentUser,
  onClose,
  onConfirmEnrollment,
}) => {
  const [cardHolder, setCardHolder] = useState(currentUser.name);
  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 8891');
  const [expiry, setExpiry] = useState('09/29');
  const [cvc, setCvc] = useState('842');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!course) return null;

  const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      setError(await onConfirmEnrollment(course._id, course.price));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0707]/85 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
    >
      <div className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-[28px] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--red)] font-semibold block">
              Instant Seat Allocation
            </span>
            <h2
              id="checkout-modal-title"
              className="text-xl font-bold text-[var(--text-primary)] mt-0.5"
            >
              Complete Course Enrollment
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout modal"
            className="icon-circle-crimson cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
          {/* Selected Course Summary */}
          <div className="p-5 rounded-[20px] bg-[var(--surface-2)] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                {course.category} · {course.level} Track
              </div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">
                {course.title}
              </h3>
              <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-body)] pt-1">
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-[var(--red)]" />
                  {course.modules.length} Modules ({totalLessons} Lessons)
                </span>
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-[var(--red)]" />
                  {course.durationHours} Hours Content
                </span>
              </div>
            </div>
            <div className="text-left sm:text-right shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-[var(--border)]">
              <span className="text-xs text-[var(--text-muted)] block">Full Lifetime Access</span>
              <span className="text-3xl font-bold text-[var(--text-primary)] font-mono-num">
                ₹{course.price.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Simulated Payment Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Enrolling Learner Name
              </label>
              <input
                type="text"
                required
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--red)] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Simulated Card Number (Instant Sandbox Mode)
              </label>
              <input
                type="text"
                required
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--text-primary)] font-mono-num focus:border-[var(--red)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Expiration
              </label>
              <input
                type="text"
                required
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--text-primary)] font-mono-num focus:border-[var(--red)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Security Code
              </label>
              <input
                type="text"
                required
                value={cvc}
                onChange={(e) => setCvc(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--text-primary)] font-mono-num focus:border-[var(--red)] focus:outline-none"
              />
            </div>
          </div>

          {/* Included Deliverables */}
          <div className="border-t border-[var(--border)] pt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-body)]">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--red)]" />
              HD Video Modules & Source Code
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--red)]" />
              Timestamped Lesson Note-Taking
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--red)]" />
              Signed Completion Certificate
            </span>
          </div>

          {/* Actions */}
          {error && (
            <p role="alert" className="text-sm text-[var(--red)]">
              {error}
            </p>
          )}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto btn-secondary-outline rounded-full px-6 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto btn-crimson rounded-full px-7 py-3 text-xs font-semibold uppercase tracking-wider inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-[var(--red)]" />
              <span>
                {submitting
                  ? 'Confirming Seat...'
                  : `Confirm Enrollment · ₹${course.price.toLocaleString('en-IN')}`}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
