import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import { Surface } from '@/components/common';
import { headingFont } from '@/theme/typography';

/** One titled block of paragraphs, as stored in the translation files. */
export interface InfoSection {
  title: string;
  body: string[];
}

/** A plain reading page: the layout shared by About and Contact. */
export function InfoPage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <Surface component="article" aria-labelledby="info-title">
      <Box sx={{ px: { xs: 2, sm: 3.5 }, py: { xs: 3, sm: 4 }, maxWidth: 760 }}>
        <Typography
          id="info-title"
          component="h1"
          sx={{ fontFamily: headingFont, fontWeight: 700, fontSize: { xs: '1.625rem', md: '2rem' }, lineHeight: 1.35 }}
        >
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1.5, fontSize: '1.0625rem', lineHeight: 1.85 }}>
          {lead}
        </Typography>
        {children}
      </Box>
    </Surface>
  );
}

export function InfoSections({ sections }: { sections: InfoSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <Box component="section" key={section.title} sx={{ mt: 4 }}>
          <Typography variant="h5" component="h2" sx={{ mb: 1 }}>
            {section.title}
          </Typography>
          {section.body.map((paragraph) => (
            <Typography key={paragraph} sx={{ mt: 1, lineHeight: 1.85 }}>
              {paragraph}
            </Typography>
          ))}
        </Box>
      ))}
    </>
  );
}
