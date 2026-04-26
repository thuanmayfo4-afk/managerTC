const EDGE_FUNCTION_URL = 'https://atzcketgnawmqblovumr.supabase.co/functions/v1/generate-testcases';

async function generateTestCases(requirement) {
  const { data: { session } } = await supabaseClient.auth.getSession();

  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0emNrZXRnbmF3bXFibG92dW1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODg3MDMsImV4cCI6MjA5MjM2NDcwM30.OP6HmdcFoJCSsbyZXYfgT4cuC7P3_r29gB3qUv1JoOk'
    },
    body: JSON.stringify({ requirement })
  });

  const result = await res.json();
  if (result.error) throw new Error(result.message);
  return result.data;
}

function renderPreview(testCases) {
  // Group TC by group name
  const grouped = {};
  testCases.forEach(tc => {
    if (!grouped[tc.group]) grouped[tc.group] = [];
    grouped[tc.group].push(tc);
  });

  let html = '';
  Object.entries(grouped).forEach(([groupName, cases]) => {
    html += `
      <div class="ai-group" style="margin-bottom:16px">
        <div class="ai-group-header" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg3);border-radius:8px 8px 0 0;border:1px solid var(--border)">
          <input type="checkbox" class="ai-group-check" data-group="${groupName}" checked
            onchange="toggleGroupCheck(this)" style="cursor:pointer;width:14px;height:14px">
          <span style="font-family:var(--mono);font-size:11.5px;font-weight:600;color:var(--accent)">${groupName}</span>
          <span style="font-family:var(--mono);font-size:10px;background:var(--accent-dim);color:var(--accent);padding:2px 7px;border-radius:99px">${cases.length}</span>
        </div>
        <div style="border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;overflow:hidden">
          ${cases.map(tc => `
            <div class="ai-tc-item" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--bg)">
              <input type="checkbox" class="ai-tc-check" data-group="${groupName}" data-code="${tc.id}" checked
                style="margin-top:3px;cursor:pointer;width:14px;height:14px;flex-shrink:0">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <span style="font-family:var(--mono);font-size:11px;font-weight:600;color:var(--accent)">${tc.id}</span>
                  <span style="font-size:12.5px;font-weight:500;color:var(--text)">${tc.name}</span>
                </div>
                <div style="font-size:11.5px;color:var(--text3)">${tc.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
  });

  return { html, grouped };
}

function toggleGroupCheck(groupCheckbox) {
  const groupName = groupCheckbox.dataset.group;
  const checked = groupCheckbox.checked;
  document.querySelectorAll(`.ai-tc-check[data-group="${groupName}"]`)
    .forEach(cb => cb.checked = checked);
}

function getSelectedTestCases(grouped) {
  const selected = [];
  document.querySelectorAll('.ai-tc-check').forEach(cb => {
    if (cb.checked) {
      const groupName = cb.dataset.group;
      const tcCode = cb.dataset.code;  // ← đổi từ data-id sang data-code
      const tc = grouped[groupName]?.find(t => t.id === tcCode);
      if (tc) selected.push(tc);
    }
  });
  return selected;
}