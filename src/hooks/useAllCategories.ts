import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';
import db from '../db';
import { KidCategory, DEFAULT_KID_CATEGORIES } from '../categories';
import { getCachedCategories, fetchCategories } from '../services/categoriesService';

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
  const [baseCategories, setBaseCategories] = useState<KidCategory[]>(() => getCachedCategories());
  const [customCats, setCustomCats] = useState<KidCategory[]>([]);

  // 1. LiveQuery for custom categories created by parent
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

  // 2. Fetch dynamic categories asynchronously from the Worker API
  useEffect(() => {
    let isMounted = true;
    fetchCategories()
      .then((fresh) => {
        if (isMounted && Array.isArray(fresh) && fresh.length > 0) {
          setBaseCategories(fresh);
        }
      })
      .catch((err) => {
        console.warn('Could not refresh dynamic categories:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Ensure "all" is the first category in kidCategories
  const allCategory = baseCategories.find((c) => c.id === 'all') || DEFAULT_KID_CATEGORIES[0];
  const otherBase = baseCategories.filter((c) => c.id !== 'all');

  const curationCategories: KidCategory[] = [...otherBase, ...customCats];
  const kidCategories: KidCategory[] = [allCategory, ...otherBase, ...customCats];

  return {
    curationCategories,
    kidCategories,
    customCategories: customCats,
  };
}
