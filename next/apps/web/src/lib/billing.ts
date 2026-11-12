import type { BillingOverview, BillingPayLink, BillingSubscribe } from '@pulse/contracts';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/**
 * Settings → Billing (owner only). After the owner comes back from Chapa (`paidInvoiceId`), it
 * polls until that invoice is no longer open: the server marks it paid when Chapa confirms.
 */
export const billingQuery = (orgId: string, paidInvoiceId?: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'billing'],
    queryFn: ({ signal }) => api<BillingOverview>('/billing', { signal }),
    refetchInterval: (query) =>
      paidInvoiceId && query.state.data?.invoices.find((i) => i.id === paidInvoiceId)?.status === 'open'
        ? 3000
        : false,
  });

export function useBillingActions(orgId: string) {
  const qc = useQueryClient();
  return {
    subscribe: useMutation({
      mutationFn: (body: BillingSubscribe) =>
        api<{ billing: BillingOverview }>('/billing/subscribe', { method: 'POST', body }),
      onSuccess: async ({ billing }) => {
        qc.setQueryData(billingQuery(orgId).queryKey, billing);
        // The team-wide storage status (billingStatusQuery in components/pulse) follows the plan.
        await qc.invalidateQueries({ queryKey: ['orgs', orgId, 'billing', 'status'] });
      },
    }),
    /** Makes the hosted checkout and sends the browser there. */
    pay: useMutation({
      mutationFn: (invoiceId: string) =>
        api<BillingPayLink>(`/billing/invoices/${invoiceId}/pay`, { method: 'POST' }),
      onSuccess: ({ checkoutUrl }) => window.location.assign(checkoutUrl),
    }),
  };
}
