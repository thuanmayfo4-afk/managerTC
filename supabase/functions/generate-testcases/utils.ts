export function cleanJSON(raw: string): string {
  // Remove markdown code blocks if any
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/```\s*$/i, '');
  return cleaned.trim();
}

export function validateTestCases(data: unknown): boolean {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return false;
  return data.every(tc =>
    typeof tc === 'object' &&
    tc !== null &&
    'id' in tc &&
    'name' in tc &&
    'group' in tc
  );
}

export function fallbackResponse() {
  return {
    error: true,
    message: 'Failed to generate test cases. Please try again.',
    data: []
  };
}