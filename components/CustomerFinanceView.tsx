'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import type { CustomerPaymentType } from '@/lib/customerProjectFinance';

interface PaymentEntry {
  id: string;
  type: CustomerPaymentType;
  amount: number;
  dateMs: number;
  note: string;
}

interface FinanceData {
  payments: PaymentEntry[];
  totalProjectGross: number | null;
  totalPaidGross: number;
  outstandingGross: number | null;
}

const TYPE_COLORS: Record<CustomerPaymentType, { color: string; bg: string }> = {
  progress_payment: { color: 'text-blue-700', bg: 'bg-blue-100' },
  final_invoice: { color: 'text-teal-700', bg: 'bg-teal-100' },
  cash: { color: 'text-green-700', bg: 'bg-green-100' },
  bank_transfer: { color: 'text-indigo-700', bg: 'bg-indigo-100' },
  partial_payment: { color: 'text-purple-700', bg: 'bg-purple-100' },
  discount_skonto: { color: 'text-orange-700', bg: 'bg-orange-100' },
};

function fmt(value: number, locale: string): string {
  return value.toLocaleString(locale, { style: 'currency', currency: 'EUR' });
}

function paymentTypeLabel(type: string, t: (key: string) => string): string {
  const key = `customerFinance.paymentTypes.${type}`;
  const label = t(key);
  return label === key ? t('customerFinance.paymentTypes.other') : label;
}

export default function CustomerFinanceView({ projectId }: { projectId: string }) {
  const { t, language } = useLanguage();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<'auth' | 'load' | null>(null);

  const dateLocale = language === 'de' ? 'de-DE' : 'en-GB';

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    (async () => {
      try {
        const user = auth?.currentUser;
        if (!user) {
          if (!cancelled) setErrorKey('auth');
          setLoading(false);
          return;
        }

        const token = await user.getIdToken();
        const res = await fetch(`/api/project-finance/${projectId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          if (!cancelled) setErrorKey('load');
          setLoading(false);
          return;
        }

        const json: FinanceData = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setErrorKey('load');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  if (errorKey) {
    return (
      <div className="py-10 px-4 text-center text-sm text-gray-500">
        {errorKey === 'auth' ? t('customerFinance.notAuthenticated') : t('customerFinance.loadFailed')}
      </div>
    );
  }

  const payments = data?.payments ?? [];
  const totalPaid = data?.totalPaidGross ?? 0;
  const totalProject = data?.totalProjectGross ?? null;
  const outstanding = data?.outstandingGross ?? null;
  const isFullyPaid = outstanding != null && outstanding <= 0 && totalProject != null && totalProject > 0;
  const paymentCountLabel = t('customerFinance.paymentCount', { count: payments.length });

  return (
    <div className="space-y-4 sm:space-y-5 pb-8 max-w-3xl mx-auto w-full">

      {/* Summary cards — stack on mobile, 3 cols on larger screens */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">

        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5 shadow-sm">
          <p className="text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 leading-snug">
            {t('customerFinance.contractValue')}
          </p>
          <p className="text-xl sm:text-2xl font-bold text-gray-800 break-words">
            {totalProject != null ? (
              fmt(totalProject, dateLocale)
            ) : (
              <span className="text-sm sm:text-base font-normal text-gray-400">{t('customerFinance.notSet')}</span>
            )}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">{t('customerFinance.contractValueHint')}</p>
        </div>

        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-4 sm:px-5 shadow-sm">
          <p className="text-[11px] sm:text-xs font-semibold text-green-600 uppercase tracking-wide mb-1 leading-snug">
            {t('customerFinance.totalPaid')}
          </p>
          <p className="text-xl sm:text-2xl font-bold text-green-700 break-words">{fmt(totalPaid, dateLocale)}</p>
          <p className="text-[11px] sm:text-xs text-green-600 mt-1">{paymentCountLabel}</p>
        </div>

        <div
          className={`rounded-2xl border px-4 py-4 sm:px-5 shadow-sm ${
            isFullyPaid
              ? 'border-emerald-200 bg-emerald-50'
              : outstanding != null
              ? 'border-orange-200 bg-orange-50'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <p
            className={`text-[11px] sm:text-xs font-semibold uppercase tracking-wide mb-1 leading-snug ${
              isFullyPaid ? 'text-emerald-600' : outstanding != null ? 'text-orange-600' : 'text-gray-500'
            }`}
          >
            {t('customerFinance.outstanding')}
          </p>
          {outstanding != null ? (
            <>
              <p
                className={`text-xl sm:text-2xl font-bold break-words ${
                  isFullyPaid ? 'text-emerald-700' : 'text-orange-700'
                }`}
              >
                {fmt(outstanding, dateLocale)}
              </p>
              {isFullyPaid && (
                <p className="text-[11px] sm:text-xs text-emerald-600 mt-1 font-semibold">
                  ✓ {t('customerFinance.fullyPaid')}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm sm:text-base font-normal text-gray-400">{t('customerFinance.notSet')}</p>
          )}
        </div>
      </div>

      {/* Payment history */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">{t('customerFinance.paymentHistory')}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{t('customerFinance.paymentHistoryHint')}</p>
        </div>

        {payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 sm:py-12 gap-2 text-gray-400 px-4 text-center">
            <span className="text-3xl">📭</span>
            <p className="text-sm">{t('customerFinance.noPayments')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {payments.map((p) => {
              const cfg = TYPE_COLORS[p.type as CustomerPaymentType] ?? TYPE_COLORS.progress_payment;
              const label = paymentTypeLabel(p.type, t);
              const date = new Date(p.dateMs).toLocaleDateString(dateLocale);
              return (
                <li
                  key={p.id}
                  className="px-4 sm:px-5 py-3 sm:py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex items-start justify-between gap-3 sm:min-w-0 sm:flex-1">
                    <span
                      className={`inline-flex items-center max-w-[75%] sm:max-w-none px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold leading-tight ${cfg.bg} ${cfg.color}`}
                    >
                      {label}
                    </span>
                    <p className="sm:hidden text-base font-bold text-green-600 whitespace-nowrap flex-shrink-0">
                      +{fmt(p.amount, dateLocale)}
                    </p>
                  </div>

                  <div className="flex-1 min-w-0 sm:order-none">
                    <p className="text-xs text-gray-500 font-medium">{date}</p>
                    {p.note && (
                      <p className="text-sm text-gray-700 mt-0.5 break-words">{p.note}</p>
                    )}
                  </div>

                  <p className="hidden sm:block flex-shrink-0 text-base font-bold text-green-600 whitespace-nowrap">
                    +{fmt(p.amount, dateLocale)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
