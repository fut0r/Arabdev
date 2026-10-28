import { PageHeader, Surface } from '@/components/common';
import { AppearancePanel } from '@/features/preferences/AppearancePanel';
import { useTranslation } from 'react-i18next';
import { useSeo } from '@/utils/seo';
export default function AppearancePage() {
  const { t } = useTranslation();
  useSeo({ title: t('appearance.title'), noindex: true });
  return (
    <Surface>
      <PageHeader title={t('appearance.title')} />
      <AppearancePanel />
    </Surface>
  );
}
