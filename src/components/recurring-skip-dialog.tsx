import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/ui';
import { createOnce } from '@/components/ui/once';
import { formatShortDate } from '@/services/format-date';
import { dayToDate } from '@/services/recurring';
import type { Day, RecurringPayment } from '@/services/recurring';
import { useRecurringStore } from '@/stores/recurring-store';
import { showSuccess } from '@/stores/success-store';

type Props = {
  payment: RecurringPayment;
  // The occurrence being skipped (named in the question).
  occurrence: Day;
  // Called once when the dialog is finished: after a skip, when the occurrence
  // had already been handled (stale row; no success card), or on cancel.
  onDone: () => void;
};

// "Skip Nov 1?" with the payment's name. Skipping marks the occurrence handled
// without an expense and cannot be undone. A failure keeps the dialog open with
// the error, so the user can try again or cancel.
export function RecurringSkipDialog({ payment, occurrence, onDone }: Props) {
  const { t, i18n } = useTranslation();
  const skip = useRecurringStore((state) => state.skip);
  const [error, setError] = useState(false);
  // Set synchronously: a second tap on Skip arrives before a re-render could
  // disable anything.
  const [inFlight] = useState(createOnce);

  const confirm = async () => {
    if (!inFlight.tryStart()) return;
    setError(false);
    const outcome = await skip(payment.id, occurrence);
    if (outcome === 'failed') {
      inFlight.reset();
      setError(true);
      return;
    }
    // The dialog closes first, then the card shows over the screen below it.
    onDone();
    if (outcome === 'skipped') {
      showSuccess({
        icon: 'check',
        tone: 'neutral',
        message: t('recurring.skip.done'),
        detail: payment.name,
      });
    }
  };

  return (
    <ConfirmDialog
      visible
      title={t('recurring.skip.title', {
        date: formatShortDate(dayToDate(occurrence), i18n.language),
      })}
      message={error ? t('recurring.skip.error') : t('recurring.skip.message', { name: payment.name })}
      confirmLabel={t('recurring.skip.confirm')}
      cancelLabel={t('common.cancel')}
      onConfirm={() => void confirm()}
      onCancel={onDone}
    />
  );
}
