import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import TagIcon from '@mui/icons-material/Tag';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import ListSubheader from '@mui/material/ListSubheader';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import type { Modifier } from '@popperjs/core';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { discoveryApi } from '@/api/misc';
import { queryKeys } from '@/api/queryKeys';
import { UserAvatar } from '@/components/common';
import { useDebouncedValue } from '@/hooks';

interface Option {
  id: string;
  group: 'users' | 'tags' | 'posts' | 'all';
  to: string;
  primary: string;
  secondary?: string;
  icon: ReactNode;
}

/**
 * Global search with live, debounced suggestions (combobox pattern: arrow keys move
 * through results, Enter opens one or runs a full search).
 */
/** Keeps the suggestions exactly as wide as the search field. */
const sameWidth: Modifier<'sameWidth', object> = {
  name: 'sameWidth',
  enabled: true,
  phase: 'beforeWrite',
  requires: ['computeStyles'],
  fn: ({ state }) => {
    state.styles.popper.width = `${state.rects.reference.width}px`;
  },
};

export function SearchBar({ autoFocus = false, initialQuery = '' }: { autoFocus?: boolean; initialQuery?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const listboxId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebouncedValue(query.trim(), 300);

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.searchPreview(debounced),
    queryFn: ({ signal }) => discoveryApi.search({ q: debounced, type: 'all' }, signal),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  const options = useMemo<Option[]>(() => {
    if (!data || debounced.length < 2) return [];
    const result: Option[] = [];
    data.users?.items.forEach((user) =>
      result.push({
        id: `u-${user.id}`,
        group: 'users',
        to: `/u/${user.username}`,
        primary: user.display_name,
        secondary: `@${user.username}`,
        icon: <UserAvatar name={user.display_name} src={user.avatar_url} size={28} />,
      }),
    );
    data.tags?.items.forEach((tag) =>
      result.push({
        id: `t-${tag.slug}`,
        group: 'tags',
        to: `/tags/${encodeURIComponent(tag.slug)}`,
        primary: `#${tag.slug}`,
        secondary: t('explore.postsCount', { count: tag.posts_count }),
        icon: <TagIcon fontSize="small" color="action" />,
      }),
    );
    data.posts?.items.forEach((post) =>
      result.push({
        id: `p-${post.id}`,
        group: 'posts',
        to: `/posts/${post.id}`,
        primary: post.title || post.author.display_name,
        secondary: `@${post.author.username}`,
        icon: <SearchIcon fontSize="small" color="action" />,
      }),
    );
    result.push({
      id: 'all',
      group: 'all',
      to: `/search?q=${encodeURIComponent(debounced)}`,
      primary: t('search.seeAllResults'),
      secondary: `“${debounced}”`,
      icon: <SearchIcon fontSize="small" color="primary" />,
    });
    return result;
  }, [data, debounced, t]);

  const go = (to: string) => {
    setOpen(false);
    setActive(-1);
    navigate(to);
  };

  const submit = () => {
    const q = query.trim();
    if (q) go(`/search?q=${encodeURIComponent(q)}`);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && active >= 0 && options[active]) go(options[active].to);
      else submit();
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  const showPopup = open && debounced.length >= 2 && (options.length > 0 || isFetching);
  const groups: { key: Option['group']; label: string }[] = [
    { key: 'users', label: t('search.users') },
    { key: 'tags', label: t('search.tags') },
    { key: 'posts', label: t('search.posts') },
    { key: 'all', label: '' },
  ];

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: 'relative', width: '100%' }}>
        <Box
          ref={anchorRef}
          role="search"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            height: 42,
            px: 1.5,
            borderRadius: 2,
            border: 1,
            borderColor: 'surface.borderStrong',
            bgcolor: 'surface.sunken',
            transition: 'border-color 120ms, background-color 120ms',
            '&:focus-within': { borderColor: 'primary.main', bgcolor: 'background.paper' },
          }}
        >
          <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} aria-hidden />
          <InputBase
            value={query}
            autoFocus={autoFocus}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            sx={{ flex: 1, fontSize: '0.9375rem' }}
            slotProps={{
              input: {
                role: 'combobox',
                'aria-label': t('search.label'),
                'aria-expanded': showPopup,
                'aria-controls': listboxId,
                'aria-autocomplete': 'list',
                'aria-activedescendant':
                  active >= 0 && options[active] ? `${listboxId}-${options[active].id}` : undefined,
                enterKeyHint: 'search',
              },
            }}
          />
          {isFetching && <CircularProgress size={16} aria-hidden />}
          {query && (
            <IconButton
              size="small"
              aria-label={t('search.clear')}
              onClick={() => {
                setQuery('');
                setActive(-1);
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>

        <Popper
          open={showPopup}
          anchorEl={() => anchorRef.current as HTMLDivElement}
          placement="bottom-start"
          modifiers={[sameWidth]}
          sx={{ zIndex: (theme) => theme.zIndex.modal }}
        >
          <Paper sx={{ mt: 0.75, maxHeight: 440, overflowY: 'auto', py: 0.5 }}>
            <Box
              component="ul"
              id={listboxId}
              role="listbox"
              aria-label={t('search.label')}
              sx={{ m: 0, p: 0, listStyle: 'none' }}
            >
              {groups.map(({ key, label }) => {
                const items = options.filter((option) => option.group === key);
                if (!items.length) return null;
                return (
                  <li key={key} role="presentation">
                    {label && (
                      <ListSubheader
                        component="div"
                        sx={{ lineHeight: '32px', fontWeight: 700, bgcolor: 'background.paper' }}
                      >
                        {label}
                      </ListSubheader>
                    )}
                    <Box component="ul" role="group" sx={{ m: 0, p: 0, listStyle: 'none' }}>
                      {items.map((option) => {
                        const index = options.indexOf(option);
                        const selected = index === active;
                        return (
                          <Box
                            component="li"
                            key={option.id}
                            id={`${listboxId}-${option.id}`}
                            role="option"
                            aria-selected={selected}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => go(option.to)}
                            onMouseEnter={() => setActive(index)}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1.5,
                              px: 2,
                              py: 1,
                              cursor: 'pointer',
                              bgcolor: selected ? 'action.hover' : 'transparent',
                              borderTop: key === 'all' ? 1 : 0,
                              borderColor: 'divider',
                            }}
                          >
                            {option.icon}
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>
                                {option.primary}
                              </Typography>
                              {option.secondary && (
                                <Typography variant="caption" color="text.secondary" noWrap component="p">
                                  {option.secondary}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </li>
                );
              })}
            </Box>
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}
