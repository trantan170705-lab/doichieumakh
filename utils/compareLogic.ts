import { ComparisonResult, ProcessedItem } from '../types';

export const cleanInput = (input: string): string[] => {
  return input.split(/\r?\n/).map(line => line.trim());
};

export const compareLists = (rawA: string, rawB: string): ComparisonResult => {
  const listA = cleanInput(rawA);
  const listB = cleanInput(rawB);

  // Create Sets for O(1) lookups based on non-empty values
  // We use a normalized set (uppercase) for comparison to be case-insensitive if desired,
  // but strictly speaking, codes might be case-sensitive. Let's assume case-sensitive for exact match
  // unless we want to be lenient. Let's do exact match but trim whitespace.
  const validSetA = new Set(listA.filter(Boolean));
  const validSetB = new Set(listB.filter(Boolean));

  // Determine duplicates
  const seenA = new Set<string>();
  const processedA: ProcessedItem[] = listA.map((val, idx) => {
    const isDup = seenA.has(val) && !!val;
    if (val) seenA.add(val);
    return {
      value: val,
      originalIndex: idx,
      existsInOther: validSetB.has(val),
      isValid: !!val,
      isDuplicate: isDup
    };
  });

  const seenB = new Set<string>();
  const processedB: ProcessedItem[] = listB.map((val, idx) => {
    const isDup = seenB.has(val) && !!val;
    if (val) seenB.add(val);
    return {
      value: val,
      originalIndex: idx,
      existsInOther: validSetA.has(val),
      isValid: !!val,
      isDuplicate: isDup
    };
  });

  // Calculate differences
  // Preserve duplicates in Missing/Extra lists as per user request
  const inAOnly = listA.filter(x => x && !validSetB.has(x));
  const inBOnly = listB.filter(x => x && !validSetA.has(x));

  // Intersection usually implies unique common items for summary
  const intersection = Array.from(validSetA).filter(x => validSetB.has(x));

  return {
    inAOnly,
    inBOnly,
    intersection,
    totalA: validSetA.size,
    totalB: validSetB.size,
    processedA,
    processedB
  };
};