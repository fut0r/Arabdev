import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

import { docUrls, newTab } from '@/components/DocLinks';
import { InfoPage, InfoSections, type InfoSection } from '@/features/info/InfoPage';
import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { SOURCE_URL } from '@/site';
import { useSeo } from '@/utils/seo';

export default function AboutPage() {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const docs = docUrls(language);
  const sections = t('about.sections', { returnObjects: true }) as InfoSection[];
  useSeo({ title: t('about.metaTitle'), description: t('about.metaDescription'), canonical: '/about' });

  const links = [
    { href: docs.wiki, label: t('about.linkWiki') },
    { href: `${docs.wiki}#community-guidelines`, label: t('about.linkGuidelines') },
    { href: docs.privacy, label: t('about.linkPrivacy') },
    { href: docs.patchNotes, label: t('about.linkPatchNotes') },
    { href: SOURCE_URL, label: t('about.linkSource') },
  ];

  return (
    <InfoPage title={t('about.title')} lead={t('about.lead')}>
      <InfoSections sections={sections} />
      <Box component="section" sx={{ mt: 4 }}>
        <Typography variant="h5" component="h2" sx={{ mb: 1 }}>
          {t('about.linksTitle')}
        </Typography>
        <Box component="ul" sx={{ m: 0, paddingInlineStart: '1.25rem', lineHeight: 2 }}>
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} {...newTab}>
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <Link component={RouterLink} to="/contact">
              {t('about.linkContact')}
            </Link>
          </li>
        </Box>
      </Box>
      <Stack direction="row" sx={{ mt: 4 }}>
        <Button component={RouterLink} to="/explore" variant="contained">
          {t('about.browse')}
        </Button>
      </Stack>
    </InfoPage>
  );
}
