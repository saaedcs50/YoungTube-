import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';
import db from '../db';
import { CURATION_CATEGORIES, KID_CATEGORIES, KidCategory } from '../categories';

/** Helper to generate a unique categoryId slug from a user label */
export function generateUniqueCategoryId(
  label: string,
  existingIds: Set<string>
): string {
  let base = label
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  if (!base) {
    base = 'custom_cat';
  }

  let candidate = base;
  let counter = 1;
  while (existingIds.has(candidate)) {
    candidate = `${base}_${counter}`;
    counter++;
  }
  return candidate;
}

export function useAllCategories() {
  const [customCats, setCustomCats] = useState<KidCategory[]>([]);

  useEffect(() => {
    const observable = liveQuery(() => db.customCategories.toArray());
    const subscription = observable.subscribe({
      next: (rows) => {
        const mapped: KidCategory[] = (rows || []).map((r) => ({
          id: r.categoryId,
          label: r.label,
          emoji: r.emoji,
          description: '',
        }));
        setCustomCats(mapped);
      },
      error: (err) => {
        console.error('Error in customCategories liveQuery:', err);
      },
    });
    return () => subscription.unsubscribe();
  }, []);

  const curationCategories: KidCategory[] = [...CURATION_CATEGORIES, ...customCats];
  const kidCategories: KidCategory[] = [KID_CATEGORIES[0], ...CURATION_CATEGORIES, ...customCats];

  return {
    curationCategories,
    kidCategories,
    customCategories: customCats,
  };
}
