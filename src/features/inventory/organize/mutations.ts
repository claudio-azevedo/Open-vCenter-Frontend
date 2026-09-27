import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createCluster, deleteCluster, updateCluster } from '~/api/endpoints/clusters'
import { createHost, deleteHost, updateHost } from '~/api/endpoints/hosts'
import { createFolder, deleteFolder, renameFolder } from '~/api/endpoints/folders'
import { createVlan, deleteVlan, updateVlan } from '~/api/endpoints/vlans'
import {
  createTag,
  createTagCategory,
  deleteTag,
  deleteTagCategory,
  renameTagCategory,
  updateTag,
} from '~/api/endpoints/tags'
import { cloneVm, createVm, moveVm, setVmTags } from '~/api/endpoints/vms'
import type { TagColor, VmCloneBody, VmCreateBody } from '~/api/types'
import { qk } from '~/api/queryKeys'
import { ApiError } from '~/api/client'
import { activeTasks } from '../actions/activeTasks'
import { statusMessage } from '../actions/statusMessage'

/** Everything organization-related touches the same handful of query trees. */
const INVENTORY_KEYS = [
  ['clusters'],
  ['hosts'],
  ['folders'],
  ['vlans'],
  ['vms'],
] as const

function useInventoryMutation<TArgs, TData>(
  fn: (args: TArgs) => Promise<TData>,
  message: (data: TData, args: TArgs) => string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, args) => {
      for (const key of INVENTORY_KEYS) {
        queryClient.invalidateQueries({ queryKey: key })
      }
      statusMessage.set(message(data, args))
    },
    onError: (err) => {
      statusMessage.set(err instanceof ApiError ? err.message : String(err))
    },
  })
}

export const useCreateCluster = () =>
  useInventoryMutation(
    (name: string) => createCluster({ name }),
    (c) => `Created cluster "${c.name}"`,
  )

export const useRenameCluster = () =>
  useInventoryMutation(
    (input: { id: string; name: string }) => updateCluster(input.id, { name: input.name }),
    (c) => `Renamed cluster to "${c.name}"`,
  )

export const useDeleteCluster = () =>
  useInventoryMutation(
    (id: string) => deleteCluster(id),
    () => 'Cluster deleted',
  )

export const useCreateHost = () =>
  useInventoryMutation(
    (input: { name: string; clusterId: string | null }) => createHost(input),
    (h) => `Added host "${h.name}"`,
  )

export const useUpdateHost = () =>
  useInventoryMutation(
    (input: { id: string; clusterId: string | null }) =>
      updateHost(input.id, { clusterId: input.clusterId }),
    (h) =>
      h.clusterId
        ? `Moved "${h.name}" into a cluster`
        : `"${h.name}" is now standalone`,
  )

export const useEditHost = () =>
  useInventoryMutation(
    (input: {
      id: string
      name: string
      fqdn?: string
      clusterId: string | null
    }) =>
      updateHost(input.id, {
        name: input.name,
        ...(input.fqdn !== undefined ? { fqdn: input.fqdn } : {}),
        clusterId: input.clusterId,
      }),
    (h) => `Updated host "${h.name}"`,
  )

export const useDeleteHost = () =>
  useInventoryMutation(
    (id: string) => deleteHost(id),
    () => 'Host removed',
  )

export const useCreateFolder = () =>
  useInventoryMutation(
    (input: { name: string; clusterId?: string; hostId?: string }) =>
      createFolder(input),
    (f) => `Created folder "${f.name}"`,
  )

export const useRenameFolder = () =>
  useInventoryMutation(
    (input: { id: string; name: string }) => renameFolder(input.id, input.name),
    (f) => `Renamed folder to "${f.name}"`,
  )

export const useDeleteFolder = () =>
  useInventoryMutation(
    (id: string) => deleteFolder(id),
    () => 'Folder deleted',
  )

export const useCreateVlan = () =>
  useInventoryMutation(
    (input: {
      name: string
      vlanId: number
      description?: string
      isDefault?: boolean
      clusterId?: string
      hostId?: string
    }) => createVlan(input),
    (v) => `Created VLAN "${v.name}" (tag ${v.vlanId})`,
  )

export const useUpdateVlan = () =>
  useInventoryMutation(
    (input: {
      id: string
      name?: string
      description?: string
      isDefault?: boolean
    }) => {
      const { id, ...body } = input
      return updateVlan(id, body)
    },
    (v) => `Updated VLAN "${v.name}" (tag ${v.vlanId})`,
  )

export const useDeleteVlan = () =>
  useInventoryMutation(
    (id: string) => deleteVlan(id),
    () => 'VLAN deleted',
  )

/** Create a VM. Hands the returned `vm_create` task to <TaskWatcher> for polling. */
export function useCreateVm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: VmCreateBody) => createVm(body),
    onSuccess: ({ vm, task }) => {
      activeTasks.add(task.id)
      for (const key of INVENTORY_KEYS) {
        queryClient.invalidateQueries({ queryKey: key })
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      statusMessage.set(`Creating VM "${vm.name}"…`)
    },
    onError: (err) => {
      statusMessage.set(err instanceof ApiError ? err.message : String(err))
    },
  })
}

/** Clone an off VM / deploy a template. Hands the `vm_clone` task to <TaskWatcher>. */
export function useCloneVm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: VmCloneBody) => cloneVm(body),
    onSuccess: ({ vm, task }) => {
      activeTasks.add(task.id)
      for (const key of INVENTORY_KEYS) {
        queryClient.invalidateQueries({ queryKey: key })
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      statusMessage.set(`Creating VM "${vm.name}"…`)
    },
    onError: (err) => {
      statusMessage.set(err instanceof ApiError ? err.message : String(err))
    },
  })
}

export const useMoveVm = () =>
  useInventoryMutation(
    (input: { id: string; folderId: string | null }) =>
      moveVm(input.id, input.folderId),
    (v) => (v.folderId ? `Moved "${v.name}" to a folder` : `Removed "${v.name}" from its folder`),
  )

// ---- Tags ------------------------------------------------------------------

/** Tag catalog changes also touch VMs: deleting a tag (or a category, with its
 *  tags) removes it from every VM. */
const TAG_KEYS = [['tags'], ['tag-categories'], ['vms']] as const

function useTagMutation<TArgs, TData>(
  fn: (args: TArgs) => Promise<TData>,
  message: (data: TData, args: TArgs) => string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, args) => {
      for (const key of TAG_KEYS) {
        queryClient.invalidateQueries({ queryKey: key })
      }
      statusMessage.set(message(data, args))
    },
    onError: (err) => {
      statusMessage.set(err instanceof ApiError ? err.message : String(err))
    },
  })
}

export const useCreateTagCategory = () =>
  useTagMutation(
    (name: string) => createTagCategory({ name }),
    (c) => `Created tag category "${c.name}"`,
  )

export const useRenameTagCategory = () =>
  useTagMutation(
    (input: { id: string; name: string }) => renameTagCategory(input.id, input.name),
    (c) => `Renamed tag category to "${c.name}"`,
  )

export const useDeleteTagCategory = () =>
  useTagMutation(
    (input: { id: string; name: string }) => deleteTagCategory(input.id),
    (_, input) => `Deleted tag category "${input.name}" and its tags`,
  )

export const useCreateTag = () =>
  useTagMutation(
    (input: { name: string; categoryId: string | null; color: TagColor }) =>
      createTag(input),
    (t) => `Created tag "${t.name}"`,
  )

export const useUpdateTag = () =>
  useTagMutation(
    (input: { id: string; name: string; categoryId: string | null; color: TagColor }) =>
      updateTag(input.id, {
        name: input.name,
        categoryId: input.categoryId,
        color: input.color,
      }),
    (t) => `Updated tag "${t.name}"`,
  )

export const useDeleteTag = () =>
  useTagMutation(
    (input: { id: string; label: string }) => deleteTag(input.id),
    (_, input) => `Deleted tag "${input.label}"`,
  )

/** Replace a VM's tags. Writes the returned VM straight into its cache entry so
 *  the Tags box updates without waiting for the refetch. */
export function useSetVmTags() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { vmId: string; tagIds: string[]; message: string }) =>
      setVmTags(input.vmId, input.tagIds),
    onSuccess: (vm, input) => {
      queryClient.setQueryData(qk.vm(vm.id), vm)
      queryClient.invalidateQueries({ queryKey: ['vms'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      statusMessage.set(input.message)
    },
    onError: (err) => {
      statusMessage.set(err instanceof ApiError ? err.message : String(err))
    },
  })
}
