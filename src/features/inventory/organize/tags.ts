import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { tagCategoriesQuery, tagsQuery } from "~/api/queries";
import type { Tag, TagCategory } from "~/api/types";

/** Tag and category names: letters, digits, `_` and `-` - no spaces. Mirrors
 *  ovc-backend `services/tags.check_tag_name`. */
export const TAG_NAME_RE = /^[A-Za-z0-9_-]+$/;
export const TAG_NAME_MAX = 64;
export const TAG_NAME_HINT = 'Letters, digits, "_" and "-" only - no spaces.';

/** True for an empty draft too, so the hint only shows once there's input. */
export const tagNameOk = (name: string) =>
  name.trim() === "" ||
  (TAG_NAME_RE.test(name.trim()) && name.trim().length <= TAG_NAME_MAX);

/** "OS: Windows" for a category tag, "Windows" for a standalone one. */
export function tagLabel(
  tag: Tag,
  categoriesById: ReadonlyMap<string, TagCategory>,
): string {
  const category = tag.categoryId ? categoriesById.get(tag.categoryId) : null;
  return category ? `${category.name}: ${tag.name}` : tag.name;
}

/** The global tag catalog, in the backend's order (categorized tags by
 *  category, then standalone tags), with id lookups. */
export function useTagCatalog() {
  const tags = useQuery(tagsQuery());
  const categories = useQuery(tagCategoriesQuery());
  return React.useMemo(() => {
    const tagList = tags.data ?? [];
    const categoryList = categories.data ?? [];
    const categoriesById = new Map(categoryList.map((c) => [c.id, c]));
    return {
      tags: tagList,
      categories: categoryList,
      tagsById: new Map(tagList.map((t) => [t.id, t])),
      categoriesById,
      label: (tag: Tag) => tagLabel(tag, categoriesById),
      isLoading: tags.isLoading || categories.isLoading,
    };
  }, [tags.data, categories.data, tags.isLoading, categories.isLoading]);
}
