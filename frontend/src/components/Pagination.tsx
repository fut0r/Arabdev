import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Button from '@mui/material/Button';
import MuiPagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { useIsMobile } from '@/hooks';

interface PaginationProps {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}

/**
 * ← Previous  1 2 3 … 20  Next →
 * Numbered, server-side pages instead of infinite scroll. The arrows follow the reading
 * direction, so "previous" points right in Arabic.
 */
export function Pagination({ page, pages, onChange }: PaginationProps) {
  const { t } = useTranslation();
  const { direction } = usePreferences();
  const isMobile = useIsMobile();
  if (pages <= 1) return null;

  const PrevIcon = direction === 'rtl' ? ChevronRightIcon : ChevronLeftIcon;
  const NextIcon = direction === 'rtl' ? ChevronLeftIcon : ChevronRightIcon;

  return (
    <Stack
      component="nav"
      aria-label={t('common.pagination')}
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', justifyContent: 'space-between', px: { xs: 1, sm: 2 }, py: 2.5 }}
    >
      <Button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label={t('common.previous')}
        startIcon={isMobile ? undefined : <PrevIcon />}
        color="inherit"
        sx={{ minWidth: 44, minHeight: 44 }}
      >
        {isMobile ? <PrevIcon /> : t('common.previous')}
      </Button>

      {isMobile ? (
        <Typography variant="body2" color="text.secondary" aria-live="polite">
          {t('common.pageOf', { page, pages })}
        </Typography>
      ) : (
        <MuiPagination
          page={page}
          count={pages}
          onChange={(_, value) => onChange(value)}
          hidePrevButton
          hideNextButton
          siblingCount={1}
          boundaryCount={1}
          shape="rounded"
          color="primary"
        />
      )}

      <Button
        onClick={() => onChange(page + 1)}
        disabled={page >= pages}
        aria-label={t('common.next')}
        endIcon={isMobile ? undefined : <NextIcon />}
        color="inherit"
        sx={{ minWidth: 44, minHeight: 44 }}
      >
        {isMobile ? <NextIcon /> : t('common.next')}
      </Button>
    </Stack>
  );
}
