import type { ComputedRef, Ref } from 'vue'
import { computed, ref } from 'vue'

import {
  appendDebugLog,
  copyProjectMasks,
  createProject,
  createProjectFolder,
  deleteProjectEntries,
  listProjectFolders,
  listProjects,
  moveManagedProject,
  openManagedProject,
  openProject,
  renameManagedProject,
  renameProjectFolder,
  saveManagedProject,
  saveProject,
  type ProjectSummary,
} from '@/lib/backend'
import { createDefaultHandout, type HandoutDocument } from '@/lib/handout'
import { useWorkspaceStore } from '@/stores/workspace'

export function createProjectStore(deps: {
  document: ComputedRef<HandoutDocument>
  replaceDocument: (next: HandoutDocument, dir?: string) => void
  selectedLayerId: Ref<string | undefined>
  selectedLayerIds: Ref<string[]>
  status: Ref<string>
  persistProjectMasks: () => Promise<void>
}) {
  const workspace = useWorkspaceStore()
  const projectDir = ref('')
  const currentProjectId = ref<string>()
  const view = computed(() => workspace.activeView === 'handout-editor' ? 'editor' : 'manager')
  const projects = ref<ProjectSummary[]>([])
  const projectFolders = ref<string[]>([])
  const latestProjects = computed(() => projects.value)

  async function refreshProjects() {
    const [nextProjects, nextFolders] = await Promise.all([listProjects(), listProjectFolders()])
    projects.value = nextProjects
    projectFolders.value = nextFolders
  }

  async function addProjectFolder(folder: string) {
    projectFolders.value = await createProjectFolder(folder)
    deps.status.value = `Created handout folder ${folder.trim()}`
  }

  async function renameProjectFolderPath(oldFolder: string, newFolder: string) {
    projectFolders.value = await renameProjectFolder(oldFolder, newFolder)
    await refreshProjects()
    deps.status.value = `Renamed folder ${oldFolder} to ${newFolder.trim()}`
  }

  async function renameProject(projectId: string, title: string) {
    const payload = await renameManagedProject(projectId, title)
    if (currentProjectId.value === projectId) deps.replaceDocument(payload.document)
    await refreshProjects()
    deps.status.value = `Renamed project to ${title.trim()}`
  }

  async function moveProjectToFolder(projectId: string, folder: string) {
    const payload = await moveManagedProject(projectId, folder)
    if (currentProjectId.value === projectId) deps.replaceDocument(payload.document)
    await refreshProjects()
    deps.status.value = `Moved project to ${folder.trim() || 'root'}`
  }

  async function deleteProjectEntriesFromLibrary(entries: { ids: string[]; folders: string[] }) {
    projectFolders.value = await deleteProjectEntries(entries)
    if (currentProjectId.value && entries.ids.includes(currentProjectId.value)) await closeEditor({ save: false })
    await refreshProjects()
    deps.status.value = `Deleted handout item${entries.ids.length + entries.folders.length === 1 ? '' : 's'}`
  }

  async function saveCurrentProject() {
    await deps.persistProjectMasks()
    if (currentProjectId.value) {
      await saveManagedProject(currentProjectId.value, deps.document.value)
      await refreshProjects()
      deps.status.value = `Saved project ${deps.document.value.title}`
      return true
    }
    if (!projectDir.value.trim()) {
      deps.status.value = 'Set a project folder path before saving.'
      return false
    }
    await saveProject(projectDir.value.trim(), deps.document.value)
    deps.status.value = `Saved project to ${projectDir.value.trim()}`
    return true
  }

  async function saveProjectDocumentSnapshot() {
    try {
      if (currentProjectId.value) {
        await saveManagedProject(currentProjectId.value, deps.document.value)
        return true
      }
      if (projectDir.value.trim()) {
        await saveProject(projectDir.value.trim(), deps.document.value)
        return true
      }
    } catch (error) {
      void appendDebugLog('mask', 'save-mask-cache-document-failed', {
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      })
    }
    return false
  }

  async function openProjectFromPath(path: string) {
    const payload = await openProject(path.trim())
    deps.replaceDocument(payload.document, path.trim())
    currentProjectId.value = undefined
    workspace.openHandoutEditor()
    deps.status.value = `Opened project from ${path.trim()}`
  }

  async function createManagedHandout(
    title: string,
    options?: {
      width?: number
      height?: number
      backgroundId?: string
      folder?: string
    },
  ) {
    const next = createDefaultHandout(title.trim() || 'Untitled handout')
    if (options?.width && options?.height) {
      next.canvas.width = Math.max(1, Math.round(options.width))
      next.canvas.height = Math.max(1, Math.round(options.height))
    }
    if (options?.backgroundId) {
      next.canvas.backgroundAssetId = options.backgroundId
    }
    const payload = await createProject(next.title, next, options?.folder ?? '')
    deps.replaceDocument(payload.document)
    currentProjectId.value = String(payload.metadata.id ?? '')
    workspace.openHandoutEditor()
    await refreshProjects()
    deps.status.value = `Created project ${payload.document.title}`
  }

  function nextProjectCloneTitle(title: string, folder: string) {
    const base = (title.trim() || 'Untitled handout').replace(/-\d+$/, '')
    const used = new Set(
      projects.value
        .filter((project) => (project.folder || '') === (folder || ''))
        .map((project) => project.title),
    )
    for (let index = 2; index < 10000; index += 1) {
      const candidate = `${base}-${index}`
      if (!used.has(candidate)) return candidate
    }
    return `${base}-${Date.now()}`
  }

  async function cloneManagedHandout(projectId: string) {
    const project = projects.value.find((item) => item.id === projectId)
    if (!project) return
    const payload = await openManagedProject(projectId)
    const title = nextProjectCloneTitle(project.title, project.folder)
    const document = {
      ...payload.document,
      id: crypto.randomUUID(),
      title,
      updatedAt: new Date().toISOString(),
    }
    const cloned = await createProject(title, document, project.folder)
    const targetProjectId = String(cloned.metadata.id ?? '')
    if (targetProjectId) await copyProjectMasks(projectId, targetProjectId)
    await refreshProjects()
    deps.status.value = `Cloned project ${title}`
  }

  async function openManagedHandout(projectId: string) {
    const payload = await openManagedProject(projectId)
    deps.replaceDocument(payload.document)
    currentProjectId.value = projectId
    workspace.openHandoutEditor()
    deps.status.value = `Opened project ${payload.document.title}`
  }

  async function closeEditor(options: { save?: boolean } = {}) {
    if (options.save !== false && (currentProjectId.value || projectDir.value.trim())) {
      await saveCurrentProject()
    }
    deps.selectedLayerId.value = undefined
    deps.selectedLayerIds.value = []
    workspace.openManager()
  }

  return {
    projectDir,
    currentProjectId,
    view,
    projects,
    projectFolders,
    latestProjects,
    refreshProjects,
    addProjectFolder,
    renameProjectFolderPath,
    renameProject,
    moveProjectToFolder,
    deleteProjectEntriesFromLibrary,
    saveCurrentProject,
    saveProjectDocumentSnapshot,
    openProjectFromPath,
    createManagedHandout,
    cloneManagedHandout,
    openManagedHandout,
    closeEditor,
  }
}
