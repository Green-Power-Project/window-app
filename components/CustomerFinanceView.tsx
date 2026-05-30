'use client';

import { useState, useEffect, useMemo } from 'react';
import { auth } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';

type IncomeType =
  | 'progress_payment'
  | 'cash'
  | 'bank_transfer'
  | 'partial_payment'
  | 'discount_skonto';

interface PaymentEntry {
  id: string;
  type: IncomeType;
  amount: number;
  dateMs: number;
  note: string;
}

interface FinanceData {
  payments: PaymentEntry[];
  contractValueGross: number | null;
}

const TYPE_COLORS: Record<IncomeType, { color: string; bg: string }> = {
  progress_payment: { color: 'text-blue-700',   bg: 'bg-blue-100'   },
  cash:             { color: 'text-green-700',  bg: 'bg-green-100'  },
  bank_transfer:    { color: 'text-indigo-700', bg: 'bg-indigo-100' },
  partial_payment:  { color: 'text-purple-700', bg: 'bg-purple-100' },
  discount_skonto:  { color: 'text-orange-700', bg: 'bg-orange-100' },
};

function fmt(value: number): string {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export default function CustomerFinanceView({ projectId }: { projectId: string }) {
  const { t } = useLanguage();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    (async () => {
      try {
        const user = auth?.currentUser;
        if (!user) {
          if (!cancelled) setError('Not authenticated');
          setLoading(false);
          return;
        }

        const token = await user.getIdToken();
        const res = await fetch(`/api/project-finance/${projectId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          if (!cancelled) setError('Failed to load');
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
          setError('Failed to load');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [projectId]);

  const totalPaid = useMemo(
    () => (data?.payments ?? []).reduce((sum, p) => sum + p.amount, 0),
    [data]
  );

  const outstanding = useMemo(() => {
    if (data?.contractValueGross == null) return null;
    return Math.max(0, data.contractValueGross - totalPaid);
  }, [data, totalPaid]);

  const isFullyPaid = outstanding === 0;
  const payments = data?.payments ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center text-sm text-gray-500">{error}</div>
    );
  }

  return (
    <div className="space-y-5 pb-8">

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

        {/* Contract value */}
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            {t('customerFinance.contractValue')}
          </p>
          <p className="text-2xl font-bold text-gray-800">
            {data?.contractValueGross != null
              ? fmt(data.contractValueGross)
              : <span className="text-base font-normal text-gray-400">{t('customerFinance.notSet')}</span>}
          </p>
        </div>

        {/* Amount paid */}
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">
            {t('customerFinance.totalPaid')}
          </p>
          <p className="text-2xl font-bold text-green-700">{fmt(totalPaid)}</p>
          <p className="text-xs text-green-500 mt-0.5">
            {payments.length} {payments.length === 1 ? 'payment' : 'payments'}
          </p>
        </div>

        {/* Outstanding */}
        <div className={`rounded-2xl border px-5 py-4 shadow-sm ${
          isFullyPaid
            ? 'border-emerald-200 bg-emerald-50'
            : outstanding != null
            ? 'border-orange-200 bg-orange-50'
            : 'border-gray-200 bg-gray-50'
        }`}>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${
            isFullyPaid ? 'text-emerald-600' : outstanding != null ? 'text-orange-600' : 'text-gray-500'
          }`}>
            {t('customerFinance.outstanding')}
          </p>
          {outstanding != null ? (
            <>
              <p className={`text-2xl font-bold ${isFullyPaid ? 'text-emerald-700' : 'text-orange-700'}`}>
                {fmt(outstanding)}
              </p>
              {isFullyPaid && (
                <p className="text-xs text-emerald-500 mt-0.5 font-semibold">
                  ✓ {t('customerFinance.fullyPaid')}
                </p>
              )}
            </>
          ) : (
            <p className="text-base font-normal text-gray-400">{t('customerFinance.notSet')}</p>
          )}
        </div>

      </div>

      {/* Payment history */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">{t('customerFinance.paymentHistory')}</h3>
        </div>

        {payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <span className="text-3xl">📭</span>
            <p className="text-sm">{t('customerFinance.noPayments')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {payments.map((p) => {
              const cfg = TYPE_COLORS[p.type] ?? TYPE_COLORS.progress_payment;
              const label = t(`customerFinance.paymentTypes.${p.type}`);
              const date = new Date(p.dateMs).toLocaleDateString('de-DE');
              return (
                <li key={p.id} className="px-5 py-4 flex items-center gap-4">
                  {/* Type badge */}
                  <span className={`flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                    {label}
                  </span>

                  {/* Date + note */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 font-medium">{date}</p>
                    {p.note && (
                      <p className="text-sm text-gray-700 mt-0.5 truncate">{p.note}</p>
                    )}
                  </div>

                  {/* Amount */}
                  <p className="flex-shrink-0 text-base font-bold text-green-600">
                    +{fmt(p.amount)}
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
