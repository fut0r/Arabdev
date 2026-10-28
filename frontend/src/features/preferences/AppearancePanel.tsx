import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ACCENT_PRESETS, type AppearancePreferences } from './appearance';
import { LanguageToggle, ThemeModeToggle } from './AppearanceControls';
import { useAppearance } from './useAppearance';

export function AppearancePanel() {
  const { t } = useTranslation();
  const { appearance, setAppearance, resetAppearance } = useAppearance();
  const choices = {
    font_family: ['tajawal', 'alexandria', 'system'],
    font_size: [14, 16, 18, 20],
    background: ['plain', 'dots', 'grid', 'gradient'],
    density: ['comfortable', 'compact'],
    reading_width: ['standard', 'wide'],
  } as const;
  return (
    <Stack spacing={3} sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography color="text.secondary">{t('appearance.help')}</Typography>
      <Box>
        <Typography gutterBottom>{t('settings.theme')}</Typography>
        <ThemeModeToggle size="medium" />
      </Box>
      <Box>
        <Typography gutterBottom>{t('settings.language')}</Typography>
        <LanguageToggle size="medium" />
      </Box>
      <Box>
        <Typography gutterBottom>{t('appearance.accent_color')}</Typography>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
          {ACCENT_PRESETS.map((color) => (
            <Button
              key={color}
              onClick={() => setAppearance({ accent_color: color })}
              aria-label={`${t('appearance.accent_color')} ${color}`}
              aria-pressed={appearance.accent_color === color}
              sx={{
                minWidth: 44,
                width: 44,
                height: 44,
                bgcolor: color,
                border: appearance.accent_color === color ? '3px solid' : '1px solid',
                borderColor: 'text.primary',
                '&:hover': { bgcolor: color, opacity: 0.8 },
              }}
            />
          ))}
        </Stack>
        <TextField
          type="color"
          label={t('appearance.customColor')}
          value={appearance.accent_color}
          onChange={(e) => setAppearance({ accent_color: e.target.value })}
          sx={{ width: 160 }}
        />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
        {(Object.keys(choices) as (keyof typeof choices)[]).map((key) => (
          <TextField
            select
            key={key}
            label={t(`appearance.${key}`)}
            value={appearance[key]}
            onChange={(e) =>
              setAppearance({
                [key]: key === 'font_size' ? Number(e.target.value) : e.target.value,
              } as Partial<AppearancePreferences>)
            }
          >
            {choices[key].map((value) => (
              <MenuItem key={value} value={value}>
                {typeof value === 'number' ? `${value}px` : t(`appearance.${value}`)}
              </MenuItem>
            ))}
          </TextField>
        ))}
      </Box>
      <Box sx={{ p: 3, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <Typography variant="h3" gutterBottom>
          {t('appearance.preview')}
        </Typography>
        <Typography sx={{ mb: 2 }}>{t('appearance.previewText')}</Typography>
        <Button variant="contained">{t('appearance.previewButton')}</Button>
      </Box>
      <Button onClick={resetAppearance} sx={{ alignSelf: 'flex-start' }}>
        {t('appearance.reset')}
      </Button>
    </Stack>
  );
}
