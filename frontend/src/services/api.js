const API_BASE = '/api';

export async function fetchSystemStatus() {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new Error(`Status HTTP ${res.status}`);
  return res.json();
}

export async function fetchPresets() {
  const res = await fetch(`${API_BASE}/presets`);
  if (!res.ok) throw new Error(`Presets HTTP ${res.status}`);
  return res.json();
}

export async function detectScriptInCommand(command) {
  try {
    const res = await fetch(`${API_BASE}/analyze/detect-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    if (!res.ok) return { has_script: false, script_name: null };
    return res.json();
  } catch {
    return { has_script: false, script_name: null };
  }
}

export async function analyzeCommand(command, cwd = '', options = {}) {
  const payload = { command, cwd };
  if (options.provider) payload.provider = options.provider;
  if (options.model) payload.model = options.model;
  if (options.apiKey) payload.api_key = options.apiKey;
  if (options.scriptContent) payload.script_content = options.scriptContent;
  if (options.scriptName) payload.script_name = options.scriptName;

  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || 'Analysis request failed');
  }
  return res.json();
}

export async function fetchHistory(filters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.append('search', filters.search);
  if (filters.risk) params.append('risk', filters.risk);
  if (filters.status) params.append('status', filters.status);
  
  const res = await fetch(`${API_BASE}/history?${params.toString()}`);
  if (!res.ok) throw new Error(`History HTTP ${res.status}`);
  return res.json();
}

export async function clearHistory() {
  const res = await fetch(`${API_BASE}/history`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Clear history HTTP ${res.status}`);
  return res.json();
}

export async function deleteHistoryItem(id) {
  const res = await fetch(`${API_BASE}/history/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete item HTTP ${res.status}`);
  return res.json();
}

export async function fetchManpage(command) {
  const res = await fetch(`${API_BASE}/manpage/${encodeURIComponent(command)}`);
  if (!res.ok) throw new Error(`Manpage HTTP ${res.status}`);
  return res.json();
}

export async function updateSettings(settings) {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Settings HTTP ${res.status}`);
  return res.json();
}
