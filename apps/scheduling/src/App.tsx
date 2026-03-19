import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard } from '@erp-qween/ui';
import { systemKey } from './system';

type ProjectRow = {
  id: number;
  code?: string | null;
  nameAr?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

type PhaseRow = {
  id: number;
  nameAr: string;
  sequence?: number | null;
  status?: string | null;
};

type TaskRow = {
  id: number;
  projectId: number;
  phaseId?: number | null;
  title: string;
  status?: string | null;
  priority?: string | null;
  progress?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  estimatedHours?: number | string | null;
};

type ProgressRow = {
  id: number;
  taskId?: number | null;
  progressPercent: number;
  entryDate?: string | null;
  notes?: string | null;
  task?: {
    id: number;
    title: string;
  } | null;
};

type RowsEnvelope<T> = {
  rows: T[];
};

type GanttPayload = {
  project?: ProjectRow | null;
  phases: PhaseRow[];
  tasks: TaskRow[];
};

type CriticalPayload = {
  totalTasks: number;
  criticalTasks: number;
  tasks: TaskRow[];
};

function shortDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function normalizeRows<T>(payload: T[] | RowsEnvelope<T> | null | undefined) {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : payload.rows ?? [];
}

export default function App() {
  const system = useMemo(() => getSystemByKey(systemKey), []);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [gantt, setGantt] = useState<GanttPayload | null>(null);
  const [critical, setCritical] = useState<CriticalPayload | null>(null);
  const [progressEntries, setProgressEntries] = useState<ProgressRow[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const [taskForm, setTaskForm] = useState({
    title: '',
    phaseId: '',
    priority: 'MEDIUM',
    status: 'TODO',
    startDate: '',
    endDate: '',
    estimatedHours: '0'
  });
  const [progressForm, setProgressForm] = useState({
    progressPercent: '0',
    entryDate: new Date().toISOString().slice(0, 10),
    notes: ''
  });

  const selectedTask = gantt?.tasks.find((task) => task.id === selectedTaskId) ?? null;

  async function loadProjects() {
    const projectsRes = await getJson<ProjectRow[] | RowsEnvelope<ProjectRow>>('/projects?limit=50');
    const normalized = normalizeRows(projectsRes.data);
    setProjects(normalized);
    if (!selectedProjectId && normalized[0]) {
      setSelectedProjectId(normalized[0].id);
    }
  }

  async function loadProjectData(projectId: number) {
    const [ganttRes, criticalRes, progressRes] = await Promise.all([
      getJson<GanttPayload>(`/scheduling/projects/${projectId}/gantt`),
      getJson<CriticalPayload>(`/scheduling/projects/${projectId}/critical-path`),
      getJson<ProgressRow[] | RowsEnvelope<ProgressRow>>(`/scheduling/projects/${projectId}/progress?limit=20`)
    ]);

    setGantt(ganttRes.data);
    setCritical(criticalRes.data);
    setProgressEntries(normalizeRows(progressRes.data));
    setSelectedTaskId((current) => current ?? ganttRes.data.tasks[0]?.id ?? null);
  }

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      await loadProjects();
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : pickLocalized(locale, 'تعذر تحميل بيانات الجدولة', 'Failed to load scheduling data')
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    void loadProjectData(selectedProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  function toggleLocale() {
    const nextLocale = locale === 'ar' ? 'en' : 'ar';
    setLocale(nextLocale);
    setLocaleState(nextLocale);
  }

  function logout() {
    clearSession();
    setSessionState(null);
    window.location.href = '/portal';
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) return;

    setSubmitting('task');
    setError(null);
    setMessage(null);

    try {
      const response = await postJson<TaskRow>('/scheduling/tasks', {
        projectId: selectedProjectId,
        phaseId: taskForm.phaseId ? Number(taskForm.phaseId) : undefined,
        title: taskForm.title,
        priority: taskForm.priority,
        status: taskForm.status,
        startDate: taskForm.startDate || undefined,
        endDate: taskForm.endDate || undefined,
        estimatedHours: Number(taskForm.estimatedHours || 0)
      });

      setTaskForm({
        title: '',
        phaseId: '',
        priority: 'MEDIUM',
        status: 'TODO',
        startDate: '',
        endDate: '',
        estimatedHours: '0'
      });
      setSelectedTaskId(response.data.id);
      setMessage(pickLocalized(locale, 'تم إنشاء المهمة بنجاح', 'Task created successfully'));
      await loadProjectData(selectedProjectId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : pickLocalized(locale, 'تعذر إنشاء المهمة', 'Failed to create task'));
    } finally {
      setSubmitting(null);
    }
  }

  async function handlePostProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || !selectedTaskId) return;

    setSubmitting('progress');
    setError(null);
    setMessage(null);

    try {
      await postJson<ProgressRow>(`/scheduling/tasks/${selectedTaskId}/progress`, {
        projectId: selectedProjectId,
        phaseId: selectedTask?.phaseId ?? undefined,
        taskId: selectedTaskId,
        progressPercent: Number(progressForm.progressPercent),
        entryDate: progressForm.entryDate || undefined,
        notes: progressForm.notes || undefined
      });

      setProgressForm((current) => ({
        ...current,
        notes: ''
      }));
      setMessage(pickLocalized(locale, 'تم تسجيل التقدم بنجاح', 'Progress entry created successfully'));
      await loadProjectData(selectedProjectId);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : pickLocalized(locale, 'تعذر تسجيل التقدم', 'Failed to register progress')
      );
    } finally {
      setSubmitting(null);
    }
  }

  if (!system) {
    return null;
  }

  return (
    <AppShell
      locale={locale}
      title={locale === 'ar' ? system.titleAr : system.titleEn}
      subtitle={locale === 'ar' ? system.descriptionAr : system.descriptionEn}
      breadcrumbs={<span className="ui-muted">{system.routeBase}</span>}
      actions={
        <div className="ui-actions">
          <a className="ui-link" href="/portal">
            {pickLocalized(locale, 'العودة إلى البوابة', 'Back to Portal')}
          </a>
          <button type="button" className="ui-link" onClick={() => void loadData()}>
            {pickLocalized(locale, 'تحديث', 'Refresh')}
          </button>
          <button type="button" className="ui-link" onClick={toggleLocale}>
            {locale === 'ar' ? 'English' : 'العربية'}
          </button>
          {session?.token ? (
            <button type="button" className="ui-button" onClick={logout}>
              {pickLocalized(locale, 'تسجيل الخروج', 'Logout')}
            </button>
          ) : null}
        </div>
      }
    >
      <SectionCard title={pickLocalized(locale, 'اختيار المشروع', 'Select Project')} eyebrow="Context">
        <div className="ui-form">
          <label>
            <span>{pickLocalized(locale, 'المشروع', 'Project')}</span>
            <select
              value={selectedProjectId ?? ''}
              onChange={(event) => setSelectedProjectId(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">{pickLocalized(locale, 'اختر مشروعاً', 'Select project')}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code || `PRJ-${project.id}`} - {project.nameAr || pickLocalized(locale, 'مشروع', 'Project')}
                </option>
              ))}
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'لوحة الجدولة', 'Scheduling Dashboard')} eyebrow="Overview">
        <div className="ui-grid">
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'إجمالي المهام', 'Total Tasks')}</span>
            <strong>{critical?.totalTasks ?? gantt?.tasks.length ?? 0}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'مهام حرجة', 'Critical Tasks')}</span>
            <strong>{critical?.criticalTasks ?? 0}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'تحديثات التقدم', 'Progress Entries')}</span>
            <strong>{progressEntries.length}</strong>
          </div>
          <div className="ui-kpi">
            <span>{pickLocalized(locale, 'مراحل المشروع', 'Project Phases')}</span>
            <strong>{gantt?.phases.length ?? 0}</strong>
          </div>
        </div>
      </SectionCard>

      {message ? <div className="ui-card">{message}</div> : null}
      {error ? <div className="ui-card">{error}</div> : null}
      {loading ? <div className="ui-card">{pickLocalized(locale, 'جارٍ تحميل البيانات...', 'Loading data...')}</div> : null}

      <SectionCard title={pickLocalized(locale, 'إنشاء مهمة', 'Create Task')} eyebrow="Tasks">
        <form className="ui-form" onSubmit={handleCreateTask}>
          <label>
            <span>{pickLocalized(locale, 'عنوان المهمة', 'Task Title')}</span>
            <input required value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'المرحلة', 'Phase')}</span>
            <select value={taskForm.phaseId} onChange={(event) => setTaskForm((current) => ({ ...current, phaseId: event.target.value }))}>
              <option value="">{pickLocalized(locale, 'بدون مرحلة', 'No phase')}</option>
              {gantt?.phases.map((phase) => (
                <option key={phase.id} value={phase.id}>
                  {phase.sequence || '-'} - {phase.nameAr}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'الأولوية', 'Priority')}</span>
            <select value={taskForm.priority} onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))}>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'الحالة', 'Status')}</span>
            <select value={taskForm.status} onChange={(event) => setTaskForm((current) => ({ ...current, status: event.target.value }))}>
              <option value="TODO">TODO</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="DONE">DONE</option>
            </select>
          </label>
          <label>
            <span>{pickLocalized(locale, 'تاريخ البدء', 'Start Date')}</span>
            <input type="date" value={taskForm.startDate} onChange={(event) => setTaskForm((current) => ({ ...current, startDate: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'تاريخ النهاية', 'End Date')}</span>
            <input type="date" value={taskForm.endDate} onChange={(event) => setTaskForm((current) => ({ ...current, endDate: event.target.value }))} />
          </label>
          <label>
            <span>{pickLocalized(locale, 'الساعات التقديرية', 'Estimated Hours')}</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={taskForm.estimatedHours}
              onChange={(event) => setTaskForm((current) => ({ ...current, estimatedHours: event.target.value }))}
            />
          </label>
          <button type="submit" className="ui-button" disabled={!selectedProjectId || submitting === 'task'}>
            {submitting === 'task' ? pickLocalized(locale, 'جارٍ الحفظ...', 'Saving...') : pickLocalized(locale, 'إنشاء المهمة', 'Create Task')}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'قائمة المهام', 'Task List')} eyebrow="Gantt Data">
        <div className="ui-list">
          {(gantt?.tasks ?? []).map((task) => (
            <button key={task.id} type="button" className="ui-list-item" onClick={() => setSelectedTaskId(task.id)}>
              <span>
                #{task.id} - {task.title}
              </span>
              <span>{task.status || '-'}</span>
            </button>
          ))}
          {!gantt?.tasks.length ? <div className="ui-list-item">{pickLocalized(locale, 'لا توجد مهام للمشروع', 'No tasks for this project')}</div> : null}
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'تسجيل التقدم', 'Post Progress')} eyebrow="Progress">
        {selectedTask ? (
          <div className="ui-list">
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'المهمة', 'Task')}</strong>
              <span>{selectedTask.title}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'الحالة الحالية', 'Current Status')}</strong>
              <span>{selectedTask.status || '-'}</span>
            </div>
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'نسبة التقدم الحالية', 'Current Progress')}</strong>
              <span>{selectedTask.progress ?? 0}%</span>
            </div>
            <form className="ui-form" onSubmit={handlePostProgress}>
              <label>
                <span>{pickLocalized(locale, 'نسبة التقدم %', 'Progress %')}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  value={progressForm.progressPercent}
                  onChange={(event) => setProgressForm((current) => ({ ...current, progressPercent: event.target.value }))}
                />
              </label>
              <label>
                <span>{pickLocalized(locale, 'تاريخ الإدخال', 'Entry Date')}</span>
                <input
                  type="date"
                  value={progressForm.entryDate}
                  onChange={(event) => setProgressForm((current) => ({ ...current, entryDate: event.target.value }))}
                />
              </label>
              <label>
                <span>{pickLocalized(locale, 'ملاحظات', 'Notes')}</span>
                <input value={progressForm.notes} onChange={(event) => setProgressForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <button type="submit" className="ui-button" disabled={submitting === 'progress'}>
                {submitting === 'progress'
                  ? pickLocalized(locale, 'جارٍ التسجيل...', 'Saving...')
                  : pickLocalized(locale, 'تسجيل التقدم', 'Post Progress')}
              </button>
            </form>
          </div>
        ) : (
          <div className="ui-list-item">{pickLocalized(locale, 'اختر مهمة لتسجيل التقدم', 'Select a task to post progress')}</div>
        )}
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'آخر تحديثات التقدم', 'Recent Progress Entries')} eyebrow="History">
        <div className="ui-list">
          {progressEntries.map((entry) => (
            <div key={entry.id} className="ui-list-item">
              <span>
                {entry.task?.title || `Task #${entry.taskId || '-'}`} - {entry.progressPercent}%
              </span>
              <span>{shortDate(entry.entryDate)}</span>
            </div>
          ))}
          {!progressEntries.length ? <div className="ui-list-item">{pickLocalized(locale, 'لا توجد تحديثات تقدم', 'No progress entries')}</div> : null}
        </div>
      </SectionCard>
    </AppShell>
  );
}
