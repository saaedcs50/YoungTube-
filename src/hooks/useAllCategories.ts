import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';
import db from '../db';
import { KidCategory, DEFAULT_KID_CATEGORIES, OPT_IN_CATEGORY_IDS } from '../categories';
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
  const [enabledOptInCats, setEnabledOptInCats] = useState<string[]>([]);

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

  // 2. LiveQuery for parent settings (opt-in categories)
  useEffect(() => {
    const observable = liveQuery(() => db.settings.get('main'));
    const subscription = observable.subscribe({
      next: (settings) => {
        setEnabledOptInCats(settings?.enabledOptInCategories || []);
      },
      error: (err) => {
        console.error('Error in settings liveQuery in useAllCategories:', err);
      },
    });
    return () => subscription.unsubscribe();
  }, []);

  // 3. Fetch dynamic categories asynchronously from the Worker API
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

  // Ensure "all" is the first category in kidCategories and never filtered out
  const allCategory = baseCategories.find((c) => c.id === 'all') || DEFAULT_KID_CATEGORIES[0];
  const otherBase = baseCategories.filter((c) => c.id !== 'all');

  // Filter out any category requiring parent opt-in unless explicitly enabled
  const isCategoryAllowed = (catId: string) => {
    if (!OPT_IN_CATEGORY_IDS.includes(catId)) return true;
    return enabledOptInCats.includes(catId);
  };

  const filteredOtherBase = otherBase.filter((c) => isCategoryAllowed(c.id));
  const filteredCustomCats = customCats.filter((c) => isCategoryAllowed(c.id));

  const curationCategories: KidCategory[] = [...filteredOtherBase, ...filteredCustomCats];
  const kidCategories: KidCategory[] = [allCategory, ...filteredOtherBase, ...filteredCustomCats];

  return {
    curationCategories,
    kidCategories,
    customCategories: customCats,
  };
}
