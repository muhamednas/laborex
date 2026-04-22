import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000";

// ─── Design tokens ────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #0e0e0e;
    --bg2:       #161616;
    --bg3:       #1f1f1f;
    --border:    #2a2a2a;
    --amber:     #f59e0b;
    --amber-dim: #92600a;
    --red:       #ef4444;
    --green:     #22c55e;
    --text:      #e5e5e5;
    --muted:     #6b6b6b;
    --font-head: 'Bebas Neue', sans-serif;
    --font-mono: 'IBM Plex Mono', monospace;
    --font-body: 'IBM Plex Sans', sans-serif;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* Ticker */
  .ticker-wrap {
    background: var(--amber);
    color: #000;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    overflow: hidden;
    white-space: nowrap;
    padding: 6px 0;
  }
  .ticker-inner {
    display: inline-block;
    animation: ticker 28s linear infinite;
  }
  @keyframes ticker {
    from { transform: translateX(100vw); }
    to   { transform: translateX(-100%); }
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    background: var(--bg2);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .logo {
    font-family: var(--font-head);
    font-size: 28px;
    letter-spacing: 0.12em;
    color: var(--amber);
    line-height: 1;
  }
  .logo span { color: var(--text); }
  .status-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 6px var(--green);
    display: inline-block;
    margin-right: 6px;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .api-status {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* Nav tabs */
  .nav {
    display: flex;
    gap: 2px;
    padding: 12px 20px 0;
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
  }
  .nav-tab {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .nav-tab:hover { color: var(--text); }
  .nav-tab.active {
    color: var(--amber);
    border-bottom-color: var(--amber);
  }

  /* Main layout */
  .main { padding: 20px; max-width: 960px; margin: 0 auto; }

  /* Section heading */
  .section-head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 16px;
  }
  .section-title {
    font-family: var(--font-head);
    font-size: 32px;
    letter-spacing: 0.08em;
    color: var(--text);
    line-height: 1;
  }
  .section-count {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--amber);
    background: rgba(245,158,11,0.1);
    border: 1px solid var(--amber-dim);
    padding: 2px 8px;
    border-radius: 2px;
  }

  /* Filter bar */
  .filter-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .filter-input {
    background: var(--bg3);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 8px 12px;
    border-radius: 3px;
    outline: none;
    flex: 1;
    min-width: 140px;
    transition: border-color 0.15s;
  }
  .filter-input:focus { border-color: var(--amber); }
  .filter-input::placeholder { color: var(--muted); }
  .btn {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 8px 16px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .btn-primary {
    background: var(--amber);
    color: #000;
  }
  .btn-primary:hover { background: #fbbf24; }
  .btn-primary:disabled { background: var(--border); color: var(--muted); cursor: not-allowed; }
  .btn-ghost {
    background: var(--bg3);
    color: var(--text);
    border: 1px solid var(--border);
  }
  .btn-ghost:hover { border-color: var(--amber); color: var(--amber); }

  /* Cards */
  .card-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 16px;
    transition: border-color 0.15s;
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .card:hover { border-color: #3a3a3a; }
  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 10px;
  }
  .card-title {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
  }
  .card-employer {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
    margin-top: 3px;
  }
  .card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .tag {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 2px;
  }
  .tag-skill  { background: rgba(245,158,11,0.08); color: var(--amber); border: 1px solid var(--amber-dim); }
  .tag-dist   { background: rgba(255,255,255,0.04); color: var(--muted); border: 1px solid var(--border); }
  .tag-wage   { background: rgba(34,197,94,0.08);  color: var(--green); border: 1px solid rgba(34,197,94,0.3); }
  .tag-match  { background: rgba(245,158,11,0.12); color: var(--amber); border: 1px solid var(--amber-dim); }
  .tag-info   { background: var(--bg3); color: var(--muted); border: 1px solid var(--border); }

  /* Score badge */
  .score-badge {
    font-family: var(--font-head);
    font-size: 22px;
    letter-spacing: 0.05em;
    line-height: 1;
    flex-shrink: 0;
  }
  .score-high  { color: var(--green); }
  .score-mid   { color: var(--amber); }
  .score-low   { color: var(--muted); }

  /* Trust bar */
  .trust-bar-wrap {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .trust-bar-bg {
    flex: 1;
    height: 3px;
    background: var(--bg3);
    border-radius: 2px;
    overflow: hidden;
  }
  .trust-bar-fill {
    height: 100%;
    background: var(--amber);
    border-radius: 2px;
    transition: width 0.6s ease;
  }
  .trust-label {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    flex-shrink: 0;
  }

  /* Empty / loading */
  .empty {
    text-align: center;
    padding: 60px 20px;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--muted);
    border: 1px dashed var(--border);
    border-radius: 4px;
  }
  .empty-icon { font-size: 32px; margin-bottom: 12px; }
  .loading {
    display: flex;
    gap: 4px;
    justify-content: center;
    padding: 40px;
  }
  .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--amber);
    animation: bounce 0.8s infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.15s; }
  .dot:nth-child(3) { animation-delay: 0.3s; }
  @keyframes bounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
    40% { transform: translateY(-8px); opacity: 1; }
  }

  /* Form */
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  @media (max-width: 580px) { .form-grid { grid-template-columns: 1fr; } }
  .form-col-2 { grid-column: 1 / -1; }
  .form-group { display: flex; flex-direction: column; gap: 6px; }
  .form-label {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .form-input {
    background: var(--bg3);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 13px;
    padding: 10px 12px;
    border-radius: 3px;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
  }
  .form-input:focus { border-color: var(--amber); }
  .form-input::placeholder { color: var(--muted); }
  .form-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 20px;
    margin-bottom: 12px;
  }
  .form-section-title {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--amber);
    margin-bottom: 14px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  .alert {
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 10px 14px;
    border-radius: 3px;
    margin-bottom: 12px;
  }
  .alert-success { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.3); color: var(--green); }
  .alert-error   { background: rgba(239,68,68,0.08);  border: 1px solid rgba(239,68,68,0.3);  color: var(--red); }

  /* Stats row */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 20px;
  }
  .stat-box {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 14px 16px;
  }
  .stat-val {
    font-family: var(--font-head);
    font-size: 36px;
    letter-spacing: 0.04em;
    color: var(--amber);
    line-height: 1;
  }
  .stat-label {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    margin-top: 4px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* Verified badge */
  .verified { color: var(--green); font-size: 11px; }

  /* Source badge */
  .source-badge {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    margin-bottom: 10px;
  }
  .source-badge span {
    background: var(--bg3);
    border: 1px solid var(--border);
    padding: 2px 6px;
    border-radius: 2px;
  }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
`;

// ─── Helpers ──────────────────────────────────────────────────────

function scoreClass(s) {
  if (s >= 60) return "score-high";
  if (s >= 30) return "score-mid";
  return "score-low";
}

function Loading() {
  return (
    <div className="loading">
      <div className="dot" /><div className="dot" /><div className="dot" />
    </div>
  );
}

function Empty({ icon = "📭", msg = "No results found" }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      {msg}
    </div>
  );
}

// ─── Jobs Tab ─────────────────────────────────────────────────────

function JobsTab() {
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource]   = useState("");
  const [lat, setLat]         = useState("6.9271");
  const [lon, setLon]         = useState("79.8612");
  const [skills, setSkills]   = useState("");
  const [maxKm, setMaxKm]     = useState("25");
  const [minWage, setMinWage] = useState("");
  const [error, setError]     = useState("");

  const fetchJobs = useCallback(async () => {
    if (!lat || !lon) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ lat, lon, max_km: maxKm });
      if (skills)  params.append("skills", skills);
      if (minWage) params.append("min_wage", minWage);
      const res  = await fetch(`${API}/jobs?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "API error");
      setJobs(data.jobs || []);
      setSource(data.source || "");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [lat, lon, skills, maxKm, minWage]);

  useEffect(() => { fetchJobs(); }, []);

  return (
    <div>
      <div className="stats-row">
        <div className="stat-box">
          <div className="stat-val">{jobs.length}</div>
          <div className="stat-label">Jobs Found</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">{jobs.filter(j => j.match_score > 0).length}</div>
          <div className="stat-label">Skill Matches</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">{maxKm}<span style={{fontSize:16}}>km</span></div>
          <div className="stat-label">Search Radius</div>
        </div>
      </div>

      <div className="filter-bar">
        <input className="filter-input" placeholder="Latitude"      value={lat}     onChange={e => setLat(e.target.value)}     style={{maxWidth:120}} />
        <input className="filter-input" placeholder="Longitude"     value={lon}     onChange={e => setLon(e.target.value)}     style={{maxWidth:120}} />
        <input className="filter-input" placeholder="Skills (masonry,tiling)" value={skills}  onChange={e => setSkills(e.target.value)}  style={{flex:2}} />
        <input className="filter-input" placeholder="Max km"        value={maxKm}   onChange={e => setMaxKm(e.target.value)}   style={{maxWidth:90}} />
        <input className="filter-input" placeholder="Min wage"      value={minWage} onChange={e => setMinWage(e.target.value)} style={{maxWidth:110}} />
        <button className="btn btn-primary" onClick={fetchJobs} disabled={loading}>
          {loading ? "..." : "Search"}
        </button>
      </div>

      {error && <div className="alert alert-error">⚠ {error}</div>}
      {source && <div className="source-badge">Source: <span>{source}</span></div>}

      {loading ? <Loading /> : jobs.length === 0
        ? <Empty icon="🏗️" msg="No open jobs in this area" />
        : (
          <div className="card-grid">
            {jobs.map(job => (
              <div className="card" key={job.id}>
                <div className="card-top">
                  <div>
                    <div className="card-title">{job.title}</div>
                    <div className="card-employer">
                      {job.employer_name} · Trust {job.employer_trust_score?.toFixed(0)}
                    </div>
                  </div>
                  <div className={`score-badge ${scoreClass(job.match_score)}`}>
                    {job.match_score > 0 ? `${job.match_score}%` : "—"}
                  </div>
                </div>
                <div className="card-meta">
                  <span className="tag tag-wage">Rs. {job.daily_wage?.toLocaleString()}/day</span>
                  <span className="tag tag-dist">📍 {job.distance_km} km</span>
                  <span className="tag tag-info">👷 {job.workers_needed - job.workers_hired} slots</span>
                  <span className="tag tag-info">📅 {job.start_date}</span>
                  {job.includes_epf_etf && <span className="tag tag-skill">EPF/ETF</span>}
                  {job.includes_meals   && <span className="tag tag-info">🍱 Meals</span>}
                  {job.includes_transport && <span className="tag tag-info">🚌 Transport</span>}
                </div>
                {job.required_skills?.length > 0 && (
                  <div className="card-meta" style={{marginTop:6}}>
                    {job.required_skills.map(s => (
                      <span className="tag tag-skill" key={s}>{s}</span>
                    ))}
                  </div>
                )}
                {job.job_address_text && (
                  <div style={{marginTop:8, fontSize:11, color:"var(--muted)", fontFamily:"var(--font-mono)"}}>
                    {job.job_address_text}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ─── Workers Tab ──────────────────────────────────────────────────

function WorkersTab() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource]   = useState("");
  const [lat, setLat]         = useState("6.9271");
  const [lon, setLon]         = useState("79.8612");
  const [skills, setSkills]   = useState("");
  const [radiusKm, setRadius] = useState("20");
  const [maxWage, setMaxWage] = useState("");
  const [error, setError]     = useState("");

  const fetchWorkers = useCallback(async () => {
    if (!lat || !lon) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ lat, lon, radius_km: radiusKm });
      if (skills)  params.append("skills", skills);
      if (maxWage) params.append("max_wage", maxWage);
      const res  = await fetch(`${API}/workers/nearby?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "API error");
      setWorkers(data.workers || []);
      setSource(data.source || "");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [lat, lon, skills, radiusKm, maxWage]);

  useEffect(() => { fetchWorkers(); }, []);

  return (
    <div>
      <div className="stats-row">
        <div className="stat-box">
          <div className="stat-val">{workers.length}</div>
          <div className="stat-label">Available</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">{workers.filter(w => w.is_verified).length}</div>
          <div className="stat-label">Verified</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">{workers.filter(w => w.match_score > 0).length}</div>
          <div className="stat-label">Skill Match</div>
        </div>
      </div>

      <div className="filter-bar">
        <input className="filter-input" placeholder="Latitude"  value={lat}      onChange={e => setLat(e.target.value)}      style={{maxWidth:120}} />
        <input className="filter-input" placeholder="Longitude" value={lon}      onChange={e => setLon(e.target.value)}      style={{maxWidth:120}} />
        <input className="filter-input" placeholder="Skills needed (masonry,tiling)" value={skills}   onChange={e => setSkills(e.target.value)}   style={{flex:2}} />
        <input className="filter-input" placeholder="Radius km" value={radiusKm} onChange={e => setRadius(e.target.value)}  style={{maxWidth:100}} />
        <input className="filter-input" placeholder="Max wage"  value={maxWage}  onChange={e => setMaxWage(e.target.value)} style={{maxWidth:110}} />
        <button className="btn btn-primary" onClick={fetchWorkers} disabled={loading}>
          {loading ? "..." : "Search"}
        </button>
      </div>

      {error && <div className="alert alert-error">⚠ {error}</div>}
      {source && <div className="source-badge">Source: <span>{source}</span></div>}

      {loading ? <Loading /> : workers.length === 0
        ? <Empty icon="👷" msg="No available workers in this area" />
        : (
          <div className="card-grid">
            {workers.map(w => (
              <div className="card" key={w.id}>
                <div className="card-top">
                  <div>
                    <div className="card-title">
                      {w.full_name || "Unknown Worker"}
                      {w.is_verified && <span className="verified"> ✓ verified</span>}
                    </div>
                    <div className="card-employer">
                      {w.total_jobs_completed} jobs completed
                      {w.avg_rating > 0 && ` · ★ ${w.avg_rating}`}
                    </div>
                  </div>
                  <div className={`score-badge ${scoreClass(w.match_score)}`}>
                    {w.match_score > 0 ? `${w.match_score}%` : "—"}
                  </div>
                </div>
                <div className="card-meta">
                  <span className="tag tag-wage">Rs. {w.min_daily_wage?.toLocaleString()}/day</span>
                  {w.distance_km != null && <span className="tag tag-dist">📍 {w.distance_km} km</span>}
                  {w.home_address_text && <span className="tag tag-info">{w.home_address_text}</span>}
                  <span className="tag tag-info">{w.preferred_language?.toUpperCase()}</span>
                </div>
                {w.skills?.length > 0 && (
                  <div className="card-meta" style={{marginTop:6}}>
                    {w.skills.map(s => (
                      <span className="tag tag-skill" key={s}>{s}</span>
                    ))}
                  </div>
                )}
                <div className="trust-bar-wrap">
                  <div className="trust-label">Trust</div>
                  <div className="trust-bar-bg">
                    <div className="trust-bar-fill" style={{width: `${w.trust_score || 0}%`}} />
                  </div>
                  <div className="trust-label">{w.trust_score?.toFixed(0)}</div>
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ─── Post Job Tab ─────────────────────────────────────────────────

function PostJobTab() {
  const [form, setForm] = useState({
    employer_id: "",
    title: "",
    description: "",
    required_skills: "",
    lat: "6.9271",
    lon: "79.8612",
    job_address_text: "",
    daily_wage: "",
    workers_needed: "1",
    start_date: "",
    includes_epf_etf: false,
    includes_meals: false,
    includes_transport: false,
  });
  const [status, setStatus]   = useState(null); // {type, msg}
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.employer_id || !form.title || !form.daily_wage || !form.start_date) {
      setStatus({ type: "error", msg: "Fill in all required fields." });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const body = {
        employer_id:       form.employer_id,
        title:             form.title,
        description:       form.description || null,
        required_skills:   form.required_skills.split(",").map(s => s.trim()).filter(Boolean),
        lat:               parseFloat(form.lat),
        lon:               parseFloat(form.lon),
        job_address_text:  form.job_address_text,
        daily_wage:        parseInt(form.daily_wage),
        workers_needed:    parseInt(form.workers_needed),
        start_date:        form.start_date,
        includes_epf_etf:  form.includes_epf_etf,
        includes_meals:    form.includes_meals,
        includes_transport:form.includes_transport,
      };
      const res  = await fetch(`${API}/jobs`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to post job");
      setStatus({ type: "success", msg: `✓ Job posted! ID: ${data.id}` });
      setForm(f => ({ ...f, title:"", description:"", required_skills:"", daily_wage:"", workers_needed:"1", start_date:"" }));
    } catch (e) {
      setStatus({ type: "error", msg: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {status && (
        <div className={`alert alert-${status.type}`}>{status.msg}</div>
      )}

      <div className="form-card">
        <div className="form-section-title">Employer</div>
        <div className="form-grid">
          <div className="form-group form-col-2">
            <label className="form-label">Employer ID *</label>
            <input className="form-input" placeholder="UUID from employers table" value={form.employer_id} onChange={e => set("employer_id", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="form-card">
        <div className="form-section-title">Job Details</div>
        <div className="form-grid">
          <div className="form-group form-col-2">
            <label className="form-label">Job Title *</label>
            <input className="form-input" placeholder="e.g. Mason needed for 3-storey building" value={form.title} onChange={e => set("title", e.target.value)} />
          </div>
          <div className="form-group form-col-2">
            <label className="form-label">Description</label>
            <input className="form-input" placeholder="Additional details..." value={form.description} onChange={e => set("description", e.target.value)} />
          </div>
          <div className="form-group form-col-2">
            <label className="form-label">Required Skills (comma-separated)</label>
            <input className="form-input" placeholder="masonry, tiling, carpentry" value={form.required_skills} onChange={e => set("required_skills", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Daily Wage (LKR) *</label>
            <input className="form-input" type="number" placeholder="3500" value={form.daily_wage} onChange={e => set("daily_wage", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Workers Needed</label>
            <input className="form-input" type="number" min="1" value={form.workers_needed} onChange={e => set("workers_needed", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Start Date *</label>
            <input className="form-input" type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="form-card">
        <div className="form-section-title">Location</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Latitude</label>
            <input className="form-input" value={form.lat} onChange={e => set("lat", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Longitude</label>
            <input className="form-input" value={form.lon} onChange={e => set("lon", e.target.value)} />
          </div>
          <div className="form-group form-col-2">
            <label className="form-label">Address Text</label>
            <input className="form-input" placeholder="Nugegoda, Colombo" value={form.job_address_text} onChange={e => set("job_address_text", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="form-card">
        <div className="form-section-title">Benefits</div>
        <div style={{display:"flex", gap:16, flexWrap:"wrap"}}>
          {[["includes_epf_etf","EPF / ETF"], ["includes_meals","Meals"], ["includes_transport","Transport"]].map(([k, label]) => (
            <label key={k} style={{display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontFamily:"var(--font-mono)", fontSize:12, color:"var(--text)"}}>
              <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)}
                style={{accentColor:"var(--amber)", width:14, height:14}} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" onClick={submit} disabled={loading} style={{width:"100%", padding:"12px", fontSize:13}}>
        {loading ? "Posting..." : "Post Job"}
      </button>

      <div style={{marginTop:12, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>
        * Note: The /jobs POST endpoint will be added in the next iteration. This form demonstrates the UI flow.
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────

const TABS = [
  { id: "jobs",    label: "📋 Open Jobs" },
  { id: "workers", label: "👷 Workers" },
  { id: "post",    label: "+ Post Job" },
];

export default function App() {
  const [tab, setTab]         = useState("jobs");
  const [apiOk, setApiOk]     = useState(null);

  useEffect(() => {
    fetch(`${API}/health`)
      .then(r => r.ok ? setApiOk(true) : setApiOk(false))
      .catch(() => setApiOk(false));
  }, []);

  return (
    <>
      <style>{css}</style>

      {/* Ticker */}
      <div className="ticker-wrap">
        <span className="ticker-inner">
          LABOREX PLATFORM &nbsp;·&nbsp; BLUE-COLLAR LABOR EXCHANGE &nbsp;·&nbsp;
          CONNECTING WORKERS WITH EMPLOYERS ACROSS SRI LANKA &nbsp;·&nbsp;
          EPF 8% &nbsp;·&nbsp; ETF 3% AUTO-CALCULATED &nbsp;·&nbsp;
          ZERO-CV PROFILES VIA WHATSAPP &nbsp;·&nbsp;
          POSTGIS RADIUS MATCHING &nbsp;·&nbsp; TRUST SCORE SYSTEM &nbsp;·&nbsp;
          LABOREX PLATFORM &nbsp;·&nbsp; BLUE-COLLAR LABOR EXCHANGE &nbsp;·&nbsp;
        </span>
      </div>

      {/* Header */}
      <div className="header">
        <div className="logo">LABOR<span>EX</span></div>
        <div className="api-status">
          <span className="status-dot" style={apiOk === false ? {background:"var(--red)", boxShadow:"0 0 6px var(--red)"} : {}} />
          {apiOk === null ? "connecting..." : apiOk ? "API LIVE" : "API OFFLINE"}
        </div>
      </div>

      {/* Nav */}
      <div className="nav">
        {TABS.map(t => (
          <button key={t.id} className={`nav-tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="main">
        <div className="section-head">
          <div className="section-title">
            {tab === "jobs"    && "OPEN JOBS"}
            {tab === "workers" && "NEARBY WORKERS"}
            {tab === "post"    && "POST A JOB"}
          </div>
        </div>

        {tab === "jobs"    && <JobsTab />}
        {tab === "workers" && <WorkersTab />}
        {tab === "post"    && <PostJobTab />}
      </div>
    </>
  );
}
