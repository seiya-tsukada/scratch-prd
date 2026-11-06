import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, FolderPlus, Loader2, X } from 'lucide-react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import {
  PrdGeneratorModal,
  PrdGenerateFromTextParams,
  PrdGenerateParams,
} from './components/PrdGeneratorModal';
import { PrdViewerModal } from './components/PrdViewerModal';
import { LegacyImportDialog } from './components/LegacyImportDialog';
import { AuthDialog, AuthMode } from './components/AuthDialog';
import { AccountDialog } from './components/AccountDialog';
import { SignupPrompt } from './components/SignupPrompt';
import { finishOnboarding } from './services/session';
import { shouldShowOnboarding } from './utils/onboarding';
import {
  answeredDecisions,
  buildPreviousPrd,
  decisionContent,
  decisionTitle,
  findDecisionNote,
} from './utils/prdLoop';
import { useSession } from './components/GuestGate';
import { isSnoozed, signupPromptStorage, SignupPromptTrigger } from './utils/signupPrompt';
import { track } from './services/analytics';
import { ProjectData, PrdInput, TagExistsError, workspaceRepository } from './services/apiWorkspaceRepository';
import { NoteSaveQueue } from './services/noteSaveQueue';
import { clearLegacyData, findLegacyProjects, LegacyProjectSummary, removeLegacyProject } from './services/legacyImport';
import { generatePrd } from './services/apiClient';
import { AI_INPUT_LIMITS, FallbackReason } from './config/api';
import {
  APP_NAME,
  DEFAULT_ACTIVE_PANE_ID,
  DEFAULT_PANE_COUNT,
  FALLBACK_PROJECT_NAME,
  QUICK_CAPTURE_SHORTCUT_KEY,
  QUOTA_UPGRADE_EVENT,
  SIGNUP_PROMPT,
  TIMING,
  UNTITLED_SHORT_LABEL,
  createEmptyPanes,
} from './config/app';
import { LAST_PROJECT_STORAGE_KEY } from './config/legacyStorage';
import { getPrdModeMeta, toGenerationMode } from './config/prd';
import type { SidebarTab } from './components/Sidebar';
import { Project, Note, PrdDocument, PaneCount, PaneInfo, SaveStatus, Tag, TagColor } from './types';
import { TagManagerDialog } from './components/TagManagerDialog';
import { sortTags } from './utils/tags';

type LoadState = 'loading' | 'ready' | 'error';

const CONFLICT_COPY_SUFFIX = '（競合コピー）';
const DUPLICATE_SUFFIX = ' (コピー)';

/** 接尾辞を付けたタイトルが保存上限（AI の入力上限と同じ 200 文字）を超えないようにする */
const withSuffix = (title: string, suffix: string) =>
  title.slice(0, AI_INPUT_LIMITS.MAX_TITLE_CHARS - suffix.length) + suffix;
const CONFLICT_NOTICE =
  '他の画面で先に更新されていたため、最新の内容を表示しました。入力していた内容は「（競合コピー）」として別のメモに保存しました。';

/** 最後に開いていたプロジェクト（表示の利便のためだけ。読めなくても動く） */
const lastProject = {
  get: (): string | undefined => {
    try {
      return localStorage.getItem(LAST_PROJECT_STORAGE_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set: (projectId: string) => {
    try {
      localStorage.setItem(LAST_PROJECT_STORAGE_KEY, projectId);
    } catch {
      // 保存できなくても動作に影響しない
    }
  },
};

const toPrdInput = (prd: PrdDocument): PrdInput => ({
  title: prd.title,
  content: prd.content,
  generationMode: prd.generationMode,
  detailLevel: prd.detailLevel,
  sourceNoteIds: prd.sourceNoteIds,
  facts: prd.facts,
  proposals: prd.proposals,
  openQuestions: prd.openQuestions,
  contradictions: prd.contradictions,
});

export default function App() {
  const { user, setUser } = useSession();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const currentProject = projects.find((p) => p.id === currentProjectId) || projects[0];

  // Active project data
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [prds, setPrds] = useState<PrdDocument[]>([]);
  // 競合で最新の内容を取り込んだメモ。値が変わると NotePane が入力中の内容を読み直す
  const [noteRevisions, setNoteRevisions] = useState<Record<string, number>>({});

  // Workspace pane preferences
  const [paneCount, setPaneCount] = useState<PaneCount>(DEFAULT_PANE_COUNT);
  const [panes, setPanes] = useState<PaneInfo[]>(createEmptyPanes);
  const [activePaneId, setActivePaneId] = useState<string>(DEFAULT_ACTIVE_PANE_ID);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('notes');
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  // PRD 生成ダイアログ。entry は開き方（ヘッダー・再生成 / 初回の案内）、basePrdId は再生成の元にする PRD
  const [prdGenerator, setPrdGenerator] = useState<{
    entry: 'default' | 'onboarding';
    basePrdId: string | null;
  } | null>(null);
  const [activePrdId, setActivePrdId] = useState<string | null>(null);
  // 直前の PRD 生成が内蔵ジェネレータによるものだった場合に、ビューアで知らせる
  const [prdFallback, setPrdFallback] = useState<{ prdId: string; reason: FallbackReason } | null>(null);
  const [legacyProjects, setLegacyProjects] = useState<LegacyProjectSummary[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [signupPrompt, setSignupPrompt] = useState<SignupPromptTrigger | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  // 同じきっかけで何度も出さない（このページを開いている間）
  const shownPromptTriggers = useRef(new Set<SignupPromptTrigger>());

  const showError = (e: unknown) => {
    console.error(e);
    setErrorMessage(e instanceof Error && e.message ? e.message : '操作に失敗しました。もう一度お試しください。');
  };

  // --- メモの自動保存 ---
  const currentProjectRef = useRef<Project | undefined>(currentProject);
  currentProjectRef.current = currentProject;

  const saveQueueRef = useRef<NoteSaveQueue | null>(null);
  saveQueueRef.current ??= new NoteSaveQueue({
    save: (noteId, updates, baseUpdatedAt) => workspaceRepository.updateNote(noteId, updates, baseUpdatedAt),
    onStatusChange: setSaveStatus,
    onSaved: (saved) =>
      setNotes((prev) => prev.map((n) => (n.id === saved.id ? { ...n, updatedAt: saved.updatedAt } : n))),
    onConflict: (latest, unsaved) => {
      setNotes((prev) => prev.map((n) => (n.id === latest.id ? latest : n)));
      setNoteRevisions((prev) => ({ ...prev, [latest.id]: (prev[latest.id] ?? 0) + 1 }));
      // 入力していた内容は失わないよう、別のメモとして残す
      if (unsaved.title === undefined && unsaved.content === undefined) return;
      const title = withSuffix((unsaved.title ?? latest.title) || UNTITLED_SHORT_LABEL, CONFLICT_COPY_SUFFIX);
      workspaceRepository
        .createNote(latest.projectId, title, unsaved.content ?? latest.content)
        .then((copy) => {
          if (currentProjectRef.current?.id === copy.projectId) {
            saveQueueRef.current?.track([copy]);
            setNotes((prev) => [copy, ...prev]);
          }
          setErrorMessage(CONFLICT_NOTICE);
        })
        .catch(showError);
    },
  });
  const saveQueue = saveQueueRef.current;

  // 未保存の変更があるまま閉じようとしたら警告する
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveQueue.hasUnsaved()) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveQueue]);

  // --- 読み込み ---
  const applyProjectData = useCallback(
    (data: ProjectData) => {
      const { preferences: prefs } = data;
      saveQueue.track(data.notes);
      setNotes(data.notes);
      setTags(sortTags(data.tags));
      setPrds(data.prds);
      setPaneCount(prefs.paneCount);

      // 存在しないメモを指すペインには先頭から順にメモを割り当てる
      const validPanes = prefs.panes.map((pane, idx) =>
        data.notes.some((n) => n.id === pane.noteId) ? pane : { ...pane, noteId: data.notes[idx]?.id || null }
      );
      setPanes(validPanes);
      setActivePaneId(prefs.activePaneId || validPanes[0]?.id || DEFAULT_ACTIVE_PANE_ID);
    },
    [saveQueue]
  );

  const clearProjectData = () => {
    setNotes([]);
    setTags([]);
    setPrds([]);
    setPanes(createEmptyPanes());
  };

  const loadWorkspace = useCallback(
    async (projectId?: string) => {
      const result = await workspaceRepository.bootstrap(projectId);
      setProjects(result.projects);
      setCurrentProjectId(result.currentProjectId ?? null);
      if (result.data) applyProjectData(result.data);
      else clearProjectData();
      if (result.currentProjectId) lastProject.set(result.currentProjectId);
    },
    [applyProjectData]
  );

  useEffect(() => {
    track({ name: 'app_opened' });
    loadWorkspace(lastProject.get())
      .then(() => {
        setLoadState('ready');
        setLegacyProjects(findLegacyProjects());
      })
      .catch((e) => {
        console.error(e);
        setLoadState('error');
      });
  }, [loadWorkspace]);

  const handleSelectProject = async (projectId: string) => {
    try {
      applyProjectData(await workspaceRepository.getProjectData(projectId));
      setCurrentProjectId(projectId);
      lastProject.set(projectId);
    } catch (e) {
      showError(e);
    }
  };

  // ペイン構成の保存（デバウンス）。失敗しても作業は止めない
  const savePrefsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePreferences = useCallback(
    (newCount: PaneCount, newPanes: PaneInfo[], newActivePaneId: string) => {
      if (!currentProject) return;
      const projectId = currentProject.id;
      if (savePrefsTimer.current) clearTimeout(savePrefsTimer.current);
      savePrefsTimer.current = setTimeout(() => {
        workspaceRepository
          .savePreferences(projectId, { paneCount: newCount, panes: newPanes, activePaneId: newActivePaneId })
          .catch((e) => console.warn('ワークスペース設定を保存できませんでした', e));
      }, TIMING.PREFERENCES_SAVE_DEBOUNCE_MS);
    },
    [currentProject]
  );

  const getActivePaneIndex = () => {
    const index = panes.findIndex((p) => p.id === activePaneId);
    return index !== -1 ? index : 0;
  };

  // --- Panes ---
  const handleChangePaneCount = (count: PaneCount) => {
    setPaneCount(count);
    savePreferences(count, panes, activePaneId);
  };

  const handleSelectNoteInPane = (paneIndex: number, noteId: string) => {
    setPanes((prev) => {
      const next = [...prev];
      next[paneIndex] = { ...next[paneIndex], noteId };
      savePreferences(paneCount, next, activePaneId);
      return next;
    });
  };

  /** サイドバー等から開くメモはアクティブなペインに表示する */
  const handleOpenNoteInActivePane = (noteId: string) => {
    handleSelectNoteInPane(getActivePaneIndex(), noteId);
  };

  const handleActivatePane = (paneId: string) => {
    setActivePaneId(paneId);
    savePreferences(paneCount, panes, paneId);
  };

  // --- Notes ---
  const addNote = (note: Note) => {
    saveQueue.track([note]);
    setNotes((prev) => [note, ...prev]);
  };

  const handleCreateNoteInPane = async (paneIndex: number) => {
    if (!currentProject) return;
    try {
      const newNote = await workspaceRepository.createNote(currentProject.id);
      addNote(newNote);
      setPanes((prev) => {
        const next = [...prev];
        next[paneIndex] = { ...next[paneIndex], noteId: newNote.id };
        savePreferences(paneCount, next, next[paneIndex].id);
        return next;
      });
      setActivePaneId(panes[paneIndex].id);
    } catch (e) {
      showError(e);
    }
  };

  /** サイドバー / ショートカットからの即時メモ作成 */
  const handleFastCapture = () => {
    setSidebarTab('notes');
    void handleCreateNoteInPane(getActivePaneIndex());
  };

  /** 画面は即座に更新し、保存はキューに任せる */
  const handleUpdateNote = (noteId: string, updates: Partial<Note>) => {
    const { title, content } = updates;
    const fields = Object.fromEntries(Object.entries({ title, content }).filter(([, value]) => value !== undefined));
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, ...fields } : n)));
    saveQueue.enqueue(noteId, fields);
  };

  const removeNotesLocally = (removedIds: string[]) => {
    removedIds.forEach((id) => saveQueue.forget(id));
    const replacementId = notes.find((n) => !removedIds.includes(n.id))?.id ?? null;
    setNotes((prev) => prev.filter((n) => !removedIds.includes(n.id)));
    // 削除したメモを開いていたペインは先頭のメモに切り替える
    setPanes((prev) =>
      prev.map((p) => (p.noteId && removedIds.includes(p.noteId) ? { ...p, noteId: replacementId } : p))
    );
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await workspaceRepository.deleteNote(noteId);
      removeNotesLocally([noteId]);
    } catch (e) {
      showError(e);
    }
  };

  const handleDuplicateNote = async (noteId: string) => {
    if (!currentProject) return;
    const target = notes.find((n) => n.id === noteId);
    if (!target) return;
    try {
      const dup = await workspaceRepository.createNote(
        currentProject.id,
        withSuffix(target.title || UNTITLED_SHORT_LABEL, DUPLICATE_SUFFIX),
        target.content
      );
      // タグも複製する
      addNote(target.tagIds.length > 0 ? await workspaceRepository.setNoteTags(dup.id, target.tagIds) : dup);
      handleOpenNoteInActivePane(dup.id);
    } catch (e) {
      showError(e);
    }
  };

  // --- タグ（付け外し・作成・名前変更・色・削除は API の結果を待ってから画面に反映する） ---
  /** メモのタグを置き換える。本文の自動保存とぶつからないよう、tagIds だけを反映する */
  const handleSetNoteTags = async (noteId: string, tagIds: string[]) => {
    const saved = await workspaceRepository.setNoteTags(noteId, tagIds);
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, tagIds: saved.tagIds } : n)));
  };

  /** 新しいタグを作る。同じ名前のタグがあれば、それを使う */
  const handleCreateTag = async (name: string): Promise<Tag> => {
    if (!currentProject) throw new Error('プロジェクトがありません。');
    let tag: Tag;
    try {
      tag = await workspaceRepository.createTag(currentProject.id, name);
    } catch (e) {
      if (!(e instanceof TagExistsError)) throw e;
      tag = e.existing;
    }
    setTags((prev) => sortTags([...prev.filter((t) => t.id !== tag.id), tag]));
    return tag;
  };

  const handleUpdateTag = async (tagId: string, updates: { name?: string; color?: TagColor | null }) => {
    const updated = await workspaceRepository.updateTag(tagId, updates);
    setTags((prev) => sortTags(prev.map((t) => (t.id === tagId ? updated : t))));
  };

  /** タグを削除し、メモからも外す */
  const handleDeleteTag = async (tagId: string) => {
    await workspaceRepository.deleteTag(tagId);
    setTags((prev) => prev.filter((t) => t.id !== tagId));
    setNotes((prev) =>
      prev.map((n) => (n.tagIds.includes(tagId) ? { ...n, tagIds: n.tagIds.filter((id) => id !== tagId) } : n))
    );
  };

  // --- Projects ---
  const handleCreateProject = async () => {
    const name = window.prompt('新しいプロジェクト名を入力してください:');
    if (!name || !name.trim()) return;
    try {
      const newProj = await workspaceRepository.createProject(name.trim());
      setProjects((prev) => [newProj, ...prev]);
      await handleSelectProject(newProj.id);
    } catch (e) {
      showError(e);
    }
  };

  const handleRenameProject = async (newName: string) => {
    if (!currentProject) return;
    try {
      const updated = await workspaceRepository.updateProject(currentProject.id, { name: newName });
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (e) {
      showError(e);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await workspaceRepository.deleteProject(projectId);
      const remaining = projects.filter((p) => p.id !== projectId);
      setProjects(remaining);
      if (projectId !== currentProject?.id) return;
      if (remaining.length > 0) {
        await handleSelectProject(remaining[0].id);
      } else {
        setCurrentProjectId(null);
        clearProjectData();
      }
    } catch (e) {
      showError(e);
    }
  };

  // --- PRD ---
  const upsertPrd = (prd: PrdDocument) =>
    setPrds((prev) => [prd, ...prev.filter((p) => p.id !== prd.id)]);

  /**
   * sourceNotes から PRD を生成して新しい PRD として保存し、PRD タブに切り替えてビューアで開く。
   * basePrdId（再生成の元）があれば、その PRD の要約を AI に渡す。元の PRD は変更しない
   */
  const generatePrdFromNotes = async (sourceNotes: Note[], params: Omit<PrdGenerateParams, 'selectedNoteIds'>) => {
    if (!currentProject) return;
    const basePrd = params.basePrdId ? prds.find((p) => p.id === params.basePrdId) : undefined;

    // 本文以外（タイトル・名前）は文脈として渡すだけなので、上限を超える分は切り詰める
    const clipTitle = (text: string | undefined) => text?.slice(0, AI_INPUT_LIMITS.MAX_TITLE_CHARS);
    const data = await generatePrd({
      projectName: clipTitle(currentProject.name) ?? '',
      mode: params.mode,
      detailLevel: params.detailLevel,
      notes: sourceNotes.map((n) => ({
        id: n.id,
        title: clipTitle(n.title) ?? '',
        content: n.content,
      })),
      // 再生成では本文ではなく、前回の構成・事実・未決事項と、未決事項への回答（決定事項）を渡す
      previousPrd: basePrd ? buildPreviousPrd(basePrd, answeredDecisions(basePrd, notes)) : undefined,
    });

    const title = basePrd?.title || `${currentProject.name} 仕様書 (${getPrdModeMeta(params.mode).titleLabel}版)`;
    const input: PrdInput = {
      title: clipTitle(title) ?? '',
      content: data.markdown,
      generationMode: params.mode,
      detailLevel: params.detailLevel,
      sourceNoteIds: data.sourceNoteIds,
      facts: data.facts,
      proposals: data.proposals,
      openQuestions: data.openQuestions,
      contradictions: data.contradictions,
    };

    const savedPrd = await workspaceRepository.createPrd(currentProject.id, input);

    upsertPrd(savedPrd);
    setPrdFallback(data.usedFallback ? { prdId: savedPrd.id, reason: data.fallbackReason ?? 'ai_error' } : null);
    setSidebarTab('prds');
    setActivePrdId(savedPrd.id);
    if (!basePrd) offerSignup('first_prd');
  };

  // --- 未決事項への回答（タイトルが「決定: 〜」のメモ）と、回答を反映した再生成 ---
  const handleAnswerQuestion = async (question: string, answer: string) => {
    if (!currentProject) return;
    const content = decisionContent(question, answer);
    const existing = findDecisionNote(notes, question);
    if (existing) {
      handleUpdateNote(existing.id, { content });
      // ペインで開いていれば入力欄も読み直す
      setNoteRevisions((prev) => ({ ...prev, [existing.id]: (prev[existing.id] ?? 0) + 1 }));
    } else {
      addNote(await workspaceRepository.createNote(currentProject.id, decisionTitle(question), content));
    }
    track({ name: 'open_question_answered' });
  };

  const handleRegenerateWithAnswers = async (prdId: string) => {
    const prd = prds.find((p) => p.id === prdId);
    if (!prd) return;
    const decisions = answeredDecisions(prd, notes);
    const decisionNoteIds = new Set(decisions.map((d) => d.note.id));
    const sourceNotes = notes.filter((n) => prd.sourceNoteIds?.includes(n.id) || decisionNoteIds.has(n.id));
    await generatePrdFromNotes(sourceNotes, {
      mode: toGenerationMode(prd.generationMode),
      detailLevel: prd.detailLevel,
      basePrdId: prd.id,
    });
    track({ name: 'prd_regenerated_with_answers', properties: { answers: decisions.length } });
  };

  const handleGeneratePrd = (params: PrdGenerateParams) =>
    generatePrdFromNotes(
      notes.filter((n) => params.selectedNoteIds.includes(n.id)),
      params
    );

  // --- 貼り付けからの PRD 生成・初回の案内 ---
  const showOnboarding =
    prdGenerator === null &&
    shouldShowOnboarding({
      user,
      hasProject: Boolean(currentProject),
      hasPendingDialog: legacyProjects.length > 0,
      dismissed: onboardingDismissed,
    });

  useEffect(() => {
    if (loadState === 'ready' && showOnboarding) {
      setPrdGenerator({ entry: 'onboarding', basePrdId: null });
      track({ name: 'onboarding_started' });
    }
  }, [loadState, showOnboarding]);

  const endOnboarding = (result: 'completed' | 'skipped') => {
    setOnboardingDismissed(true);
    setUser({ ...user, onboardingDone: true });
    finishOnboarding(result).catch((e) => console.warn('案内の状態を保存できませんでした', e));
  };

  /** 貼り付けた内容をメモとして保存し、そのメモだけから PRD を作る */
  const handleGeneratePrdFromText = async ({ title, content, mode, detailLevel }: PrdGenerateFromTextParams) => {
    if (!currentProject) return;
    const note = await workspaceRepository.createNote(currentProject.id, title, content);
    addNote(note);
    handleOpenNoteInActivePane(note.id);
    await generatePrdFromNotes([note], { mode, detailLevel });
    if (prdGenerator?.entry !== 'onboarding') track({ name: 'quick_prd_used' });
  };

  const closePrdViewer = () => {
    setActivePrdId(null);
    setPrdFallback(null);
  };

  const handleUpdatePrd = async (prdId: string, updates: Partial<PrdDocument>) => {
    const existing = prds.find((p) => p.id === prdId);
    if (!existing) return;
    try {
      upsertPrd(await workspaceRepository.updatePrd(prdId, toPrdInput({ ...existing, ...updates })));
    } catch (e) {
      showError(e);
    }
  };

  const handleDeletePrd = async (prdId: string) => {
    try {
      await workspaceRepository.deletePrd(prdId);
      setPrds((prev) => prev.filter((p) => p.id !== prdId));
      if (activePrdId === prdId) setActivePrdId(null);
    } catch (e) {
      showError(e);
    }
  };

  const openPrdGenerator = (basePrdId: string | null) => {
    // ビューアの上に重ねると操作できないため閉じる（生成後に結果のビューアを開く）
    closePrdViewer();
    setPrdGenerator({ entry: 'default', basePrdId });
  };

  const closePrdGenerator = (generated: boolean) => {
    if (prdGenerator?.entry === 'onboarding') endOnboarding(generated ? 'completed' : 'skipped');
    setPrdGenerator(null);
  };

  // --- 登録の案内（ゲストのみ。閉じたら一定期間は出さない） ---
  const offerSignup = useCallback(
    (trigger: SignupPromptTrigger) => {
      if (!user.isGuest || shownPromptTriggers.current.has(trigger)) return;
      if (isSnoozed(signupPromptStorage.read())) return;
      shownPromptTriggers.current.add(trigger);
      setSignupPrompt(trigger);
      track({ name: 'signup_prompt_shown', properties: { trigger } });
    },
    [user.isGuest]
  );

  const dismissSignupPrompt = () => {
    signupPromptStorage.dismiss();
    setSignupPrompt(null);
  };

  useEffect(() => {
    if (notes.length > SIGNUP_PROMPT.NOTE_COUNT_THRESHOLD) offerSignup('note_count');
  }, [notes.length, offerSignup]);

  useEffect(() => {
    const onQuota = () => offerSignup('quota');
    window.addEventListener(QUOTA_UPGRADE_EVENT, onQuota);
    return () => window.removeEventListener(QUOTA_UPGRADE_EVENT, onQuota);
  }, [offerSignup]);

  const openAuth = (mode: AuthMode) => {
    if (mode === 'register') track({ name: 'signup_started', properties: { method: 'password' } });
    setSignupPrompt(null);
    setIsAccountOpen(false);
    setAuthMode(mode);
  };

  /** 別のユーザーに切り替わった・セッションが終わったので読み直す（未保存の変更があればブラウザが確認する） */
  const restartApp = () => {
    window.location.reload();
  };

  // --- 旧 localStorage データの取り込み ---
  const handleImportLegacy = async () => {
    let lastError: unknown = null;
    for (const legacy of legacyProjects) {
      try {
        await workspaceRepository.importLegacyProject(legacy.payload);
        removeLegacyProject(legacy.id);
      } catch (e) {
        lastError = e;
      }
    }
    await loadWorkspace(currentProject?.id);
    setLegacyProjects(findLegacyProjects());
    if (lastError) throw lastError;
  };

  const handleDiscardLegacy = () => {
    clearLegacyData();
    setLegacyProjects([]);
  };

  // Cmd/Ctrl + N でクイックメモ
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === QUICK_CAPTURE_SHORTCUT_KEY) {
        e.preventDefault();
        handleFastCapture();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panes, activePaneId, currentProject]);

  if (loadState !== 'ready') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-100/50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400">
        {loadState === 'loading' ? (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
            <span>ワークスペースを読み込んでいます…</span>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <p className="text-sm">ワークスペースを読み込めませんでした。</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500"
            >
              再読み込み
            </button>
          </div>
        )}
      </div>
    );
  }

  const activePane = panes.find((p) => p.id === activePaneId);
  const activeNoteId = activePane?.noteId || notes[0]?.id || null;
  const activePrd = prds.find((p) => p.id === activePrdId) || null;
  const projectName = currentProject?.name || FALLBACK_PROJECT_NAME;

  const errorBanner = errorMessage && (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] max-w-lg w-[calc(100%-2rem)] px-4 py-2.5 rounded-xl shadow-lg bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2"
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="flex-1">{errorMessage}</span>
      <button type="button" onClick={() => setErrorMessage(null)} className="shrink-0" aria-label="閉じる">
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  const legacyDialog = legacyProjects.length > 0 && (
    <LegacyImportDialog
      projects={legacyProjects}
      onImport={handleImportLegacy}
      onDiscard={handleDiscardLegacy}
      onLater={() => setLegacyProjects([])}
    />
  );

  if (!currentProject) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-100/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <div className="text-center space-y-3">
          <p className="text-sm font-semibold">{APP_NAME} にプロジェクトがありません</p>
          <button
            type="button"
            onClick={handleCreateProject}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500"
          >
            <FolderPlus className="w-4 h-4" />
            <span>プロジェクトを作成</span>
          </button>
        </div>
        {errorBanner}
        {legacyDialog}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-100/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans">
      <Header
        currentProject={currentProject}
        projects={projects}
        paneCount={paneCount}
        saveStatus={saveStatus}
        selectedNotesCount={notes.length}
        sidebarOpen={sidebarOpen}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onChangePaneCount={handleChangePaneCount}
        onOpenPrdGenerator={() => openPrdGenerator(null)}
        onRetrySave={() => saveQueue.retryAll()}
        user={user}
        onOpenAuth={openAuth}
        onOpenAccount={() => setIsAccountOpen(true)}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          notes={notes}
          tags={tags}
          prds={prds}
          panes={panes.slice(0, paneCount)}
          activePaneId={activePaneId}
          isOpen={sidebarOpen}
          activeTab={sidebarTab}
          onChangeTab={setSidebarTab}
          onSelectNote={handleOpenNoteInActivePane}
          onCreateNote={handleFastCapture}
          onDeleteNote={handleDeleteNote}
          onDuplicateNote={handleDuplicateNote}
          onOpenPrd={setActivePrdId}
          onOpenTagManager={() => setIsTagManagerOpen(true)}
        />

        <Workspace
          paneCount={paneCount}
          panes={panes}
          notes={notes}
          tags={tags}
          noteRevisions={noteRevisions}
          activePaneId={activePaneId}
          onActivatePane={handleActivatePane}
          onSelectNoteInPane={handleSelectNoteInPane}
          onCreateNoteInPane={handleCreateNoteInPane}
          onUpdateNote={handleUpdateNote}
          onDeleteNote={handleDeleteNote}
          onSetNoteTags={handleSetNoteTags}
          onCreateTag={handleCreateTag}
        />
      </div>

      <PrdGeneratorModal
        isOpen={prdGenerator !== null}
        notes={notes}
        existingPrds={prds}
        projectName={projectName}
        basePrdId={prdGenerator?.basePrdId}
        initialSource={prdGenerator?.entry === 'onboarding' || notes.length === 0 ? 'paste' : 'notes'}
        isOnboarding={prdGenerator?.entry === 'onboarding'}
        onClose={closePrdGenerator}
        onGenerate={handleGeneratePrd}
        onGenerateFromText={handleGeneratePrdFromText}
      />

      {activePrd && (
        <PrdViewerModal
          prd={activePrd}
          notes={notes}
          fallbackReason={prdFallback?.prdId === activePrd.id ? prdFallback.reason : undefined}
          onClose={closePrdViewer}
          onUpdatePrd={handleUpdatePrd}
          onDeletePrd={handleDeletePrd}
          onRegenerate={openPrdGenerator}
          onOpenNoteInPane={handleOpenNoteInActivePane}
          onAnswerQuestion={handleAnswerQuestion}
          onRegenerateWithAnswers={handleRegenerateWithAnswers}
        />
      )}

      {isTagManagerOpen && (
        <TagManagerDialog
          tags={tags}
          notes={notes}
          onUpdate={handleUpdateTag}
          onDelete={handleDeleteTag}
          onClose={() => setIsTagManagerOpen(false)}
        />
      )}

      {errorBanner}
      {legacyDialog}

      {signupPrompt && !authMode && !prdGenerator && (
        <SignupPrompt trigger={signupPrompt} onRegister={() => openAuth('register')} onDismiss={dismissSignupPrompt} />
      )}

      {authMode && (
        <AuthDialog
          initialMode={authMode}
          isGuest={user.isGuest}
          onClose={() => setAuthMode(null)}
          onRegistered={(registered) => {
            setUser(registered);
            setAuthMode(null);
          }}
          onLoggedIn={restartApp}
        />
      )}

      {isAccountOpen && (
        <AccountDialog
          user={user}
          onClose={() => setIsAccountOpen(false)}
          onUserUpdated={setUser}
          onSessionEnded={restartApp}
          onRegister={() => openAuth('register')}
        />
      )}
    </div>
  );
}
