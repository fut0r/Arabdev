import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker, useNavigate, useParams } from 'react-router';

import { apiErrorBody, errorMessage } from '@/api/errors';
import { mediaApi } from '@/api/misc';
import { draftsApi, postsApi } from '@/api/posts';
import { queryKeys } from '@/api/queryKeys';
import { ErrorState, Surface } from '@/components/common';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoadingState } from '@/components/LoadingState';
import { useNotify } from '@/components/Notifier';
import { useCurrentUser } from '@/features/auth/AuthProvider';
import { ImageAttachment, isValidLink, LinkAttachment, TagInput } from '@/features/editor/Attachments';
import { PostEditor } from '@/features/editor/PostEditor';
import { PostPreview } from '@/features/editor/PostPreview';
import { TurnstileWidget, useTurnstile } from '@/features/security/Turnstile';
import { useSeo } from '@/utils/seo';
import { layout } from '@/theme/tokens';
import type { Image, PostInput } from '@/types/api';
import { isEditorEmpty } from '@/utils/html';

interface Initial {
  title: string;
  html: string;
  tags: string[];
  linkUrl: string;
  image: Image | null;
}

const BLANK: Initial = { title: '', html: '', tags: [], linkUrl: '', image: null };

/** One page for writing a new post, continuing a draft, or editing a published post. */
export default function EditorPage() {
  const params = useParams();
  const postId = params.postId ? Number(params.postId) : null;
  const draftId = params.draftId ? Number(params.draftId) : null;
  const { t } = useTranslation();

  const postQuery = useQuery({
    queryKey: queryKeys.post(postId ?? 0),
    queryFn: () => postsApi.get(postId!),
    enabled: postId !== null,
  });
  const draftQuery = useQuery({
    queryKey: queryKeys.draft(draftId ?? 0),
    queryFn: () => draftsApi.get(draftId!),
    enabled: draftId !== null,
  });
  const user = useCurrentUser();

  const source = postId !== null ? postQuery : draftId !== null ? draftQuery : null;
  if (source?.isPending) return <LoadingState minHeight={480} />;
  if (source?.isError) {
    return (
      <Surface>
        <ErrorState message={errorMessage(source.error, t)} />
      </Surface>
    );
  }
  if (postQuery.data && postQuery.data.author.id !== user.id) {
    return (
      <Surface>
        <ErrorState message={t('errors.not_post_author')} />
      </Surface>
    );
  }

  let initial = BLANK;
  if (postQuery.data) {
    const post = postQuery.data;
    initial = {
      title: post.title ?? '',
      html: post.content_html,
      tags: post.tags.map((tag) => tag.name),
      linkUrl: post.link_url ?? '',
      image: post.image,
    };
  } else if (draftQuery.data) {
    const draft = draftQuery.data;
    initial = {
      title: draft.title ?? '',
      html: draft.content_html,
      tags: draft.tags,
      linkUrl: draft.link_url ?? '',
      image: draft.image,
    };
  }

  return (
    <EditorWorkspace
      key={`${postId ?? 'new'}-${draftId ?? 'none'}`}
      initial={initial}
      postId={postId}
      draftId={draftId}
    />
  );
}

function EditorWorkspace({
  initial,
  postId,
  draftId,
}: {
  initial: Initial;
  postId: number | null;
  draftId: number | null;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const split = useMediaQuery(theme.breakpoints.up('lg'));
  const navigate = useNavigate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const editing = postId !== null;
  useSeo({ title: editing ? t('editor.editTitle') : t('editor.createTitle'), noindex: true });

  const [title, setTitle] = useState(initial.title);
  const [html, setHtml] = useState(initial.html);
  const [tags, setTags] = useState(initial.tags);
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl);
  const [image, setImage] = useState<Image | null>(initial.image);
  const [currentDraftId, setCurrentDraftId] = useState<number | null>(draftId);
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);
  // Publishing is the one step bots are interested in, so it carries a token.
  const turnstile = useTurnstile({ action: 'publish_post', mode: 'invisible' });
  const [contentError, setContentError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const uploadedThisSession = useRef<Set<number>>(new Set());
  const leaving = useRef(false);

  const touch =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setDirty(true);
    };

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (leaving.current || !dirty) return false;
    return currentLocation.pathname !== nextLocation.pathname;
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const changeImage = (next: Image | null) => {
    const previous = image;
    touch(setImage)(next);
    // Clean up an upload the user discarded before it was ever saved.
    if (previous && previous.id !== next?.id && uploadedThisSession.current.has(previous.id)) {
      void mediaApi.remove(previous.id).catch(() => undefined);
      uploadedThisSession.current.delete(previous.id);
    }
  };

  const payload = (): PostInput => ({
    title: title.trim() || null,
    content_html: html,
    link_url: linkUrl.trim() || null,
    image_media_id: image?.id ?? null,
    tags,
  });

  const validLink = () => {
    if (isValidLink(linkUrl)) return true;
    setLinkError(t('errors.url_invalid'));
    return false;
  };

  const handleServerError = (error: unknown) => {
    const body = apiErrorBody(error);
    const field = body?.field ?? body?.errors?.[0]?.field;
    const message = errorMessage(error, t);
    if (field === 'link_url') setLinkError(message);
    else if (field === 'content_html' || body?.code === 'post_empty') setContentError(message);
    else notify(message, 'error');
  };

  const saveDraft = async () => {
    if (!validLink()) return;
    setBusy('draft');
    try {
      const draft = currentDraftId
        ? await draftsApi.update(currentDraftId, payload())
        : await draftsApi.create(payload());
      uploadedThisSession.current.clear();
      setCurrentDraftId(draft.id);
      setDirty(false);
      queryClient.setQueryData(queryKeys.draft(draft.id), draft);
      void queryClient.invalidateQueries({ queryKey: ['drafts'] });
      notify(t('editor.draftSaved'));
      if (!currentDraftId) {
        leaving.current = true;
        navigate(`/drafts/${draft.id}`, { replace: true });
      }
    } catch (error) {
      handleServerError(error);
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    setContentError(null);
    if (isEditorEmpty(html)) {
      setContentError(t('errors.post_empty'));
      return;
    }
    if (!validLink()) return;
    setBusy('publish');
    try {
      const post = editing
        ? await postsApi.update(postId!, payload())
        : await postsApi.create({ ...payload(), draft_id: currentDraftId }, await turnstile.getToken());
      queryClient.setQueryData(queryKeys.post(post.id), post);
      for (const root of ['feed', 'user-posts', 'drafts', 'tag-posts', 'popular-tags', 'profile', 'trending']) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
      notify(editing ? t('editor.updated') : t('editor.published'));
      leaving.current = true;
      navigate(`/posts/${post.id}`, { replace: true });
    } catch (error) {
      handleServerError(error);
      setBusy(null);
    } finally {
      turnstile.reset();
    }
  };

  const editorPane = (
    <Stack spacing={2.5}>
      <PostEditor
        title={title}
        onTitleChange={touch(setTitle)}
        initialHtml={initial.html}
        onHtmlChange={(value) => {
          setHtml(value);
          setDirty(true);
          if (contentError) setContentError(null);
        }}
        contentError={contentError}
      />
      <TagInput value={tags} onChange={touch(setTags)} />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <ImageAttachment
          image={image}
          onChange={changeImage}
          onUploaded={(id) => uploadedThisSession.current.add(id)}
        />
        <LinkAttachment
          value={linkUrl}
          error={linkError}
          onChange={(value) => {
            touch(setLinkUrl)(value);
            setLinkError(null);
          }}
        />
      </Box>
    </Stack>
  );

  const preview = <PostPreview title={title} html={html} tags={tags} image={image} linkUrl={linkUrl} />;

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 2, sm: 0 },
          py: { xs: 1.5, sm: 0 },
          mb: { sm: 2 },
          position: { xs: 'sticky', sm: 'static' },
          top: layout.appBarHeight,
          zIndex: 3,
          bgcolor: { xs: 'background.paper', sm: 'transparent' },
          borderBottom: { xs: 1, sm: 0 },
          borderColor: 'divider',
        }}
      >
        <Typography variant="h3" component="h1" noWrap>
          {editing ? t('editor.editTitle') : t('editor.createTitle')}
        </Typography>
        <Stack direction="row" spacing={1}>
          {!editing && (
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<SaveOutlinedIcon />}
              onClick={() => void saveDraft()}
              loading={busy === 'draft'}
              disabled={busy === 'publish'}
            >
              {t('editor.saveDraft')}
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<SendOutlinedIcon sx={{ transform: theme.direction === 'rtl' ? 'scaleX(-1)' : undefined }} />}
            onClick={() => void publish()}
            loading={busy === 'publish'}
            disabled={busy === 'draft'}
          >
            {editing ? t('editor.update') : t('editor.publish')}
          </Button>
        </Stack>
      </Stack>

      {/* Usually invisible: it only appears if Turnstile decides to ask something. */}
      <TurnstileWidget handle={turnstile} />

      {split ? (
        <Box
          sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)', gap: 3, alignItems: 'start' }}
        >
          {editorPane}
          <Surface
            sx={{
              position: 'sticky',
              top: layout.appBarHeight + 16,
              maxHeight: `calc(100vh - ${layout.appBarHeight + 32}px)`,
              overflowY: 'auto',
            }}
          >
            <Typography
              variant="overline"
              component="h2"
              color="text.secondary"
              sx={{ px: 3, pt: 2, display: 'block' }}
            >
              {t('editor.preview')}
            </Typography>
            {preview}
          </Surface>
        </Box>
      ) : (
        <>
          <Tabs
            value={view}
            onChange={(_, value: 'write' | 'preview') => setView(value)}
            sx={{ mb: 2, px: { xs: 2, sm: 0 } }}
          >
            <Tab value="write" label={t('editor.write')} />
            <Tab value="preview" label={t('editor.preview')} />
          </Tabs>
          <Box sx={{ px: { xs: 1.5, sm: 0 }, pb: 2 }}>
            <Box sx={{ display: view === 'write' ? 'block' : 'none' }}>{editorPane}</Box>
            {view === 'preview' && <Surface>{preview}</Surface>}
          </Box>
        </>
      )}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title={t('editor.leaveTitle')}
        description={t('editor.leaveBody')}
        confirmLabel={t('editor.leaveConfirm')}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </Box>
  );
}
