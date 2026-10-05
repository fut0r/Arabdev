import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { docUrls, newTab } from '@/components/DocLinks';
import { InfoPage, InfoSections, type InfoSection } from '@/features/info/InfoPage';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { HELLO_EMAIL, SUPPORT_EMAIL } from '@/site';
import { useSeo } from '@/utils/seo';

function Address({ title, body, email }: { title: string; body: string; email: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5 }}>
      <Typography variant="h6" component="h2">
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.8 }}>
        {body}
      </Typography>
      <Link href={`mailto:${email}`} dir="ltr" sx={{ display: 'inline-block', mt: 1.5, fontWeight: 700 }}>
        {email}
      </Link>
    </Paper>
  );
}

export default function ContactPage() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const docs = docUrls(language);
  const sections = t('contact.sections', { returnObjects: true }) as InfoSection[];
  const tips = t('contact.tips', { returnObjects: true }) as string[];
  useSeo({ title: t('contact.metaTitle'), description: t('contact.metaDescription'), canonical: '/contact' });

  return (
    <InfoPage title={t('contact.title')} lead={t('contact.lead')}>
      <Box sx={{ mt: 3, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <Address title={t('contact.supportTitle')} body={t('contact.supportBody')} email={SUPPORT_EMAIL} />
        <Address title={t('contact.helloTitle')} body={t('contact.helloBody')} email={HELLO_EMAIL} />
      </Box>

      <Box component="section" sx={{ mt: 4 }}>
        <Typography variant="h5" component="h2" sx={{ mb: 1 }}>
          {t('contact.tipsTitle')}
        </Typography>
        <Box component="ul" sx={{ m: 0, paddingInlineStart: '1.25rem', lineHeight: 1.9 }}>
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </Box>
      </Box>

      <InfoSections sections={sections} />
      <Link href={docs.wiki} {...newTab} sx={{ display: 'inline-block', mt: 3, fontWeight: 700 }}>
        {t('contact.wikiLink')}
      </Link>
    </InfoPage>
  );
}
