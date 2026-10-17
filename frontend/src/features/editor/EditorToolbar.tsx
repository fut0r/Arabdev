import CodeIcon from '@mui/icons-material/Code';
import DataObjectIcon from '@mui/icons-material/DataObject';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatColorTextIcon from '@mui/icons-material/FormatColorText';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import FormatStrikethroughIcon from '@mui/icons-material/FormatStrikethrough';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import InsertLinkIcon from '@mui/icons-material/InsertLink';
import RedoIcon from '@mui/icons-material/Redo';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEditorState, type Editor } from '@tiptap/react';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreferences } from '@/features/preferences/PreferencesProvider';
import { displayFont, headingFont } from '@/theme/typography';

import { ALIGNMENTS, COLOR_OPTIONS, colorValue, FONT_OPTIONS, SIZE_OPTIONS } from './editorConfig';

function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  children: ReactNode;
}) {
  return (
    <Tooltip title={label}>
      <span>
        <ToggleButton
          value={label}
          size="small"
          selected={active}
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          sx={{
            border: 0,
            borderRadius: 1.5,
            width: 34,
            height: 34,
            color: 'text.secondary',
            '&.Mui-selected': { bgcolor: 'accent.subtle', color: 'accent.text' },
            '&.Mui-selected:hover': { bgcolor: 'accent.hover' },
          }}
        >
          {children}
        </ToggleButton>
      </span>
    </Tooltip>
  );
}

const Separator = () => <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.75 }} />;

function LinkDialog({ editor, open, onClose }: { editor: Editor; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const value = url.trim();
    if (!value) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      onClose();
      return;
    }
    const href = /^(https?:|mailto:)/i.test(value) ? value : `https://${value}`;
    if (!URL.canParse(href)) {
      setError(t('errors.url_invalid'));
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        transition: {
          onEnter: () => {
            setUrl((editor.getAttributes('link').href as string | undefined) ?? '');
            setError(null);
          },
        },
      }}
    >
      <DialogTitle>{editor.isActive('link') ? t('editor.editLink') : t('editor.insertLink')}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={t('editor.linkUrl')}
          placeholder="https://"
          value={url}
          error={Boolean(error)}
          helperText={error}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), apply())}
          slotProps={{ htmlInput: { dir: 'ltr', inputMode: 'url' } }}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {editor.isActive('link') && (
          <Button
            color="error"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              onClose();
            }}
            sx={{ marginInlineEnd: 'auto' }}
          >
            {t('editor.removeLink')}
          </Button>
        )}
        <Button onClick={onClose} color="inherit">
          {t('common.cancel')}
        </Button>
        <Button onClick={apply} variant="contained">
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TableControl({ editor, inTable }: { editor: Editor; inTable: boolean }) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [header, setHeader] = useState(true);
  const close = () => setAnchor(null);
  const run = (action: () => void) => () => {
    action();
    close();
  };

  return (
    <>
      <ToolButton label={t('editor.table')} active={inTable} onClick={(event) => setAnchor(event.currentTarget)}>
        <TableChartOutlinedIcon fontSize="small" />
      </ToolButton>
      {inTable ? (
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
          <MenuItem onClick={run(() => editor.chain().focus().addRowAfter().run())}>{t('editor.addRowAfter')}</MenuItem>
          <MenuItem onClick={run(() => editor.chain().focus().addColumnAfter().run())}>
            {t('editor.addColumnAfter')}
          </MenuItem>
          <Divider />
          <MenuItem onClick={run(() => editor.chain().focus().deleteRow().run())}>{t('editor.deleteRow')}</MenuItem>
          <MenuItem onClick={run(() => editor.chain().focus().deleteColumn().run())}>
            {t('editor.deleteColumn')}
          </MenuItem>
          <MenuItem onClick={run(() => editor.chain().focus().deleteTable().run())} sx={{ color: 'error.main' }}>
            {t('editor.deleteTable')}
          </MenuItem>
        </Menu>
      ) : (
        <Popover
          anchorEl={anchor}
          open={Boolean(anchor)}
          onClose={close}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Box sx={{ p: 2, width: 240 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              {t('editor.insertTable')}
            </Typography>
            <Stack direction="row" spacing={1.5}>
              <TextField
                label={t('editor.rows')}
                type="number"
                size="small"
                value={rows}
                onChange={(event) => setRows(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
                slotProps={{ htmlInput: { min: 1, max: 20 } }}
              />
              <TextField
                label={t('editor.columns')}
                type="number"
                size="small"
                value={cols}
                onChange={(event) => setCols(Math.min(8, Math.max(1, Number(event.target.value) || 1)))}
                slotProps={{ htmlInput: { min: 1, max: 8 } }}
              />
            </Stack>
            <FormControlLabel
              control={<Checkbox checked={header} onChange={(event) => setHeader(event.target.checked)} size="small" />}
              label={<Typography variant="body2">{t('editor.withHeader')}</Typography>}
              sx={{ mt: 1 }}
            />
            <Button
              fullWidth
              variant="contained"
              sx={{ mt: 1 }}
              onClick={run(() => editor.chain().focus().insertTable({ rows, cols, withHeaderRow: header }).run())}
            >
              {t('editor.insertTable')}
            </Button>
          </Box>
        </Popover>
      )}
    </>
  );
}

function ColorControl({ editor, current }: { editor: Editor; current: string }) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const choose = (value: string | null) => {
    if (value) editor.chain().focus().setColor(value).run();
    else editor.chain().focus().unsetColor().run();
    setAnchor(null);
  };
  return (
    <>
      <Tooltip title={t('editor.textColor')}>
        <IconButton
          size="small"
          aria-label={t('editor.textColor')}
          aria-haspopup="menu"
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={{ width: 34, height: 34, borderRadius: 1.5, flexDirection: 'column', gap: 0 }}
        >
          <FormatColorTextIcon fontSize="small" sx={{ color: current || 'text.secondary' }} />
          <Box sx={{ width: 16, height: 3, borderRadius: 1, bgcolor: current || 'text.secondary', mt: '-3px' }} />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => choose(null)} selected={!current}>
          <ListItemIcon>
            <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: 2, borderColor: 'text.primary' }} />
          </ListItemIcon>
          {t('editor.colorDefault')}
        </MenuItem>
        {COLOR_OPTIONS.map((option) => {
          const value = colorValue(option.name);
          return (
            <MenuItem key={option.name} onClick={() => choose(value)} selected={current === value}>
              <ListItemIcon>
                <Box
                  sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: value, border: 1, borderColor: 'divider' }}
                />
              </ListItemIcon>
              <Box component="span" sx={{ color: value, fontWeight: 700 }}>
                {t(option.labelKey)}
              </Box>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}

const selectSx = {
  height: 34,
  fontSize: '0.875rem',
  '& .MuiSelect-select': { py: 0.5 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
};

/** A compact, grouped toolbar. Scrolls horizontally on small screens rather than wrapping into rows. */
export function EditorToolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const { direction } = usePreferences();
  const [linkOpen, setLinkOpen] = useState(false);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      block: e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p',
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      blockquote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      fontFamily: (e.getAttributes('textStyle').fontFamily as string | undefined) ?? '',
      fontSize: (e.getAttributes('textStyle').fontSize as string | undefined) ?? '',
      color: (e.getAttributes('textStyle').color as string | undefined) ?? '',
      align: ALIGNMENTS.find((alignment) => e.isActive({ textAlign: alignment })) ?? null,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();
  const startIcon =
    direction === 'rtl' ? <FormatAlignRightIcon fontSize="small" /> : <FormatAlignLeftIcon fontSize="small" />;
  const endIcon =
    direction === 'rtl' ? <FormatAlignLeftIcon fontSize="small" /> : <FormatAlignRightIcon fontSize="small" />;
  const alignIcons = {
    start: startIcon,
    center: <FormatAlignCenterIcon fontSize="small" />,
    end: endIcon,
    justify: <FormatAlignJustifyIcon fontSize="small" />,
  };
  const alignLabels = {
    start: t('editor.alignStart'),
    center: t('editor.alignCenter'),
    end: t('editor.alignEnd'),
    justify: t('editor.alignJustify'),
  };

  return (
    <Box
      role="toolbar"
      aria-label={t('editor.toolbar')}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        px: 1,
        py: 0.75,
        overflowX: 'auto',
        scrollbarWidth: 'thin',
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <ToolButton label={t('editor.undo')} disabled={!state.canUndo} onClick={() => chain().undo().run()}>
        <UndoIcon fontSize="small" sx={{ transform: direction === 'rtl' ? 'scaleX(-1)' : undefined }} />
      </ToolButton>
      <ToolButton label={t('editor.redo')} disabled={!state.canRedo} onClick={() => chain().redo().run()}>
        <RedoIcon fontSize="small" sx={{ transform: direction === 'rtl' ? 'scaleX(-1)' : undefined }} />
      </ToolButton>
      <Separator />

      <Select
        size="small"
        value={state.block}
        onChange={(event) => {
          const value = event.target.value;
          if (value === 'p') chain().setParagraph().run();
          else
            chain()
              .setHeading({ level: value === 'h2' ? 2 : 3 })
              .run();
        }}
        inputProps={{ 'aria-label': t('editor.blockType') }}
        sx={{ ...selectSx, minWidth: 116 }}
      >
        <MenuItem value="p">{t('editor.paragraph')}</MenuItem>
        <MenuItem value="h2" sx={{ fontFamily: headingFont, fontWeight: 700 }}>
          {t('editor.heading2')}
        </MenuItem>
        <MenuItem value="h3" sx={{ fontFamily: headingFont, fontWeight: 600 }}>
          {t('editor.heading3')}
        </MenuItem>
      </Select>
      <Select
        size="small"
        value={state.fontFamily}
        displayEmpty
        onChange={(event) => {
          const value = event.target.value;
          if (value) chain().setFontFamily(value).run();
          else chain().unsetFontFamily().run();
        }}
        inputProps={{ 'aria-label': t('editor.font') }}
        sx={{ ...selectSx, minWidth: 124, mx: 0.5 }}
      >
        <MenuItem value="">{t('editor.fontDefault')}</MenuItem>
        {FONT_OPTIONS.map((font) => (
          <MenuItem
            key={font}
            value={font}
            sx={{ fontFamily: font === 'Anton' ? displayFont : font === 'Alexandria' ? headingFont : undefined }}
          >
            {font}
          </MenuItem>
        ))}
      </Select>
      <Select
        size="small"
        value={state.fontSize}
        displayEmpty
        onChange={(event) => {
          const value = event.target.value;
          if (value) chain().setFontSize(value).run();
          else chain().unsetFontSize().run();
        }}
        inputProps={{ 'aria-label': t('editor.fontSize') }}
        renderValue={(value) => (value ? value.replace('px', '') : t('editor.fontSize'))}
        sx={{ ...selectSx, minWidth: 86 }}
      >
        <MenuItem value="">{t('editor.sizeDefault')}</MenuItem>
        {SIZE_OPTIONS.map((size) => (
          <MenuItem key={size} value={size} dir="ltr">
            {size.replace('px', '')}
          </MenuItem>
        ))}
      </Select>
      <Separator />

      <ToolButton label={t('editor.bold')} active={state.bold} onClick={() => chain().toggleBold().run()}>
        <FormatBoldIcon fontSize="small" />
      </ToolButton>
      <ToolButton label={t('editor.italic')} active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <FormatItalicIcon fontSize="small" />
      </ToolButton>
      <ToolButton
        label={t('editor.underline')}
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <FormatUnderlinedIcon fontSize="small" />
      </ToolButton>
      <ToolButton label={t('editor.strike')} active={state.strike} onClick={() => chain().toggleStrike().run()}>
        <FormatStrikethroughIcon fontSize="small" />
      </ToolButton>
      <ToolButton label={t('editor.inlineCode')} active={state.code} onClick={() => chain().toggleCode().run()}>
        <CodeIcon fontSize="small" />
      </ToolButton>
      <ColorControl editor={editor} current={state.color} />
      <Separator />

      {ALIGNMENTS.map((alignment) => (
        <ToolButton
          key={alignment}
          label={alignLabels[alignment]}
          active={state.align === alignment}
          onClick={() =>
            state.align === alignment ? chain().unsetTextAlign().run() : chain().setTextAlign(alignment).run()
          }
        >
          {alignIcons[alignment]}
        </ToolButton>
      ))}
      <Separator />

      <ToolButton
        label={t('editor.bulletList')}
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      >
        <FormatListBulletedIcon fontSize="small" sx={{ transform: direction === 'rtl' ? 'scaleX(-1)' : undefined }} />
      </ToolButton>
      <ToolButton
        label={t('editor.orderedList')}
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <FormatListNumberedIcon fontSize="small" sx={{ transform: direction === 'rtl' ? 'scaleX(-1)' : undefined }} />
      </ToolButton>
      <ToolButton label={t('editor.quote')} active={state.blockquote} onClick={() => chain().toggleBlockquote().run()}>
        <FormatQuoteIcon fontSize="small" />
      </ToolButton>
      <ToolButton
        label={t('editor.codeBlock')}
        active={state.codeBlock}
        onClick={() => chain().toggleCodeBlock().run()}
      >
        <DataObjectIcon fontSize="small" />
      </ToolButton>
      <ToolButton label={t('editor.link')} active={state.link} onClick={() => setLinkOpen(true)}>
        <InsertLinkIcon fontSize="small" />
      </ToolButton>
      <TableControl editor={editor} inTable={state.table} />

      <LinkDialog editor={editor} open={linkOpen} onClose={() => setLinkOpen(false)} />
    </Box>
  );
}
