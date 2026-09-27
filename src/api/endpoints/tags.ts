import { request } from '../client'
import type { Tag, TagCategory, TagColor } from '../types'

// The tag catalog is global. Reads are open to every role; create / rename /
// delete are admin-only (the backend answers 403 otherwise).

export const getTagCategories = (signal?: AbortSignal) =>
  request<TagCategory[]>('/tag-categories', { signal })

export const createTagCategory = (body: { name: string }) =>
  request<TagCategory>('/tag-categories', { method: 'POST', body })

export const renameTagCategory = (id: string, name: string) =>
  request<TagCategory>(`/tag-categories/${id}`, { method: 'PATCH', body: { name } })

/** Also deletes the category's tags, which removes them from every VM. */
export const deleteTagCategory = (id: string) =>
  request<void>(`/tag-categories/${id}`, { method: 'DELETE' })

export const getTags = (signal?: AbortSignal) => request<Tag[]>('/tags', { signal })

/** `categoryId: null` (or omitted) = a standalone tag. */
export const createTag = (body: {
  name: string
  categoryId: string | null
  color: TagColor
}) =>
  request<Tag>('/tags', { method: 'POST', body })

/** Any of `name` / `categoryId` (`null` = make it standalone) / `color`. */
export const updateTag = (
  id: string,
  body: { name?: string; categoryId?: string | null; color?: TagColor },
) => request<Tag>(`/tags/${id}`, { method: 'PATCH', body })

/** Removes the tag from every VM; the VMs stay. */
export const deleteTag = (id: string) =>
  request<void>(`/tags/${id}`, { method: 'DELETE' })
