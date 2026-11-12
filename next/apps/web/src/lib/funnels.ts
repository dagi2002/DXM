import { FUNNEL_TEMPLATE_DEFS, type FunnelConfig } from '@pulse/contracts';
import { useTranslation } from 'react-i18next';

/** Builds a funnel from an Ethiopian template, with step labels in the owner's language. */
export function useTemplateConfig() {
  const { t } = useTranslation();
  return (id: string): FunnelConfig | null => {
    const def = FUNNEL_TEMPLATE_DEFS.find((d) => d.id === id);
    if (!def) return null;
    return {
      name: t(def.nameKey),
      template: def.id,
      steps: def.steps.map((s) => ({ label: t(s.labelKey), match: s.match })),
    };
  };
}
