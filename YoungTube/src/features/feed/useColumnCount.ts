import { useState, useEffect } from 'react';

export function useColumnCount(): number {
  const [cols, setCols] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const width = window.innerWidth;
    if (width >= 1024) return 4;
    if (width >= 768) return 3;
    if (width >= 640) return 2;
    return 1;
  });

  useEffect(() => {
    const onResize = () => {
      const width = window.innerWidth;
      let newCols = 1;
      if (width >= 1024) newCols = 4;
      else if (width >= 768) newCols = 3;
      else if (width >= 640) newCols = 2;
      else newCols = 1;
      setCols(newCols);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return cols;
}

export default useColumnCount;
