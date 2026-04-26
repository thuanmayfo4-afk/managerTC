export function buildPrompt(requirement: string): string {
  return `You are a senior QA engineer. Generate structured and realistic test cases based on the requirement.

REQUIREMENT:
${requirement}

IMPORTANT:
- Return ONLY valid JSON
- DO NOT include markdown, explanation, or extra text  
- Ensure JSON is COMPLETE and NOT truncated
- Generate as many test cases as possible to cover ALL scenarios
- NEVER stop mid-JSON — always close the array with ]
- If approaching token limit, finish the current test case and close the array

Format:
[
  {
    "group": "Feature group name",
    "id": "TC-001",
    "name": "Short test case name",
    "desc": "Objective: What this test verifies. Precondition: Required state before testing.",
    "data": "Test data 1 | Test data 2",
    "steps": "Log in as Super Admin | Navigate to Agency Module | Click Create Agency",
    "expected": "Agency created successfully | Status shows Active",
    "actual": "",
    "status": "Not Run"
  }
]

Rules:
- Generate as many test cases as possible to cover ALL scenarios
- Group logically by feature
- Include happy path, validation, edge cases, and error scenarios
- Keep each field concise but clear
- Steps, Expected, Data MUST use " | " as separator between items
- Steps MUST NOT include numbers like "1.", "2.", "3." — write plain text only, numbers will be added automatically
- Expected MUST NOT include bullet points or dashes — write plain text only
- Ensure output is VALID JSON array and properly closed with ]
- ID format: TC-001, TC-002, TC-003...
- Return ONLY JSON.`;
}