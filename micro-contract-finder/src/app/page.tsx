"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  RefreshCw,
  Settings,
  AlertCircle,
  Clock,
  Building2,
  DollarSign,
  ExternalLink,
  Filter,
  Mail,
  CheckCircle2,
  XCircle,
  Loader2,
  TrendingUp,
} from "lucide-react";

interface ScoredOpportunity {
  noticeId: string;
  title: string;
  fullParentPathName?: string;
  department?: string;
  awardCeiling?: string | number;
  baseAndAllOptionsValue?: string | number;
  naicsCode?: string;
  typeOfSetAside?: string;
  typeOfSetAsideDescription?: string;
  responseDeadLine?: string;
  postedDate?: string;
  solicitationNumber?: string;
  type?: string;
  description?: string;
  uiLink?: string;
  placeOfPerformance?: {
    city?: { name?: string };
    state?: { name?: string };
  };
  score: number;
  hoursToDeadline: number | null;
  scoreReasons: string[];
}

interface PursuingItem {
  noticeId: string;
  title: string;
  agency?: string | null;
  addedAt: string;
}

interface AgencyIntel {
  totalAwards: number;
  totalValue: number;
  avgValue: number;
  topRecipients: { name: string; count: number; totalValue: number }[];
}

export default function Dashboard() {
  const [opportunities, setOpportunities] = useState<ScoredOpportunity[]>([]);
  const [pursuing, setPursuing] = useState<PursuingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const [filters, setFilters] = useState({
    maxValue: 15000,
    deadlineDays: 7,
    keywords: "web design,website,web development,UX,WordPress,landing page",
    naics: "541511,541512,541430,541810",
    setAsideOnly: false,
    minScore: 0,
  });

  const [selectedOpp, setSelectedOpp] = useState<ScoredOpportunity | null>(null);
  const [agencyIntel, setAgencyIntel] = useState<AgencyIntel | null>(null);
  const [loadingIntel, setLoadingIntel] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const pursuingIds = useMemo(
    () => new Set(pursuing.map((p) => p.noticeId)),
    [pursuing]
  );

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        maxValue: String(filters.maxValue),
        deadlineDays: String(filters.deadlineDays),
        keywords: filters.keywords,
        naics: filters.naics,
        setAsideOnly: String(filters.setAsideOnly),
      });
      const res = await fetch(`/api/opportunities?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      setOpportunities(data.opportunities || []);
      setLastFetch(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchPursuing = useCallback(async () => {
    try {
      const res = await fetch("/api/pursuing");
      const data = await res.json();
      setPursuing(data.items || []);
    } catch (err) {
      console.error("Failed to load pursuing:", err);
    }
  }, []);

  useEffect(() => {
    fetchOpportunities();
    fetchPursuing();
    // Real-time on page load — also refresh every 5 min while tab is open
    const interval = setInterval(fetchOpportunities, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchOpportunities, fetchPursuing]);

  const togglePursuing = async (opp: ScoredOpportunity) => {
    if (pursuingIds.has(opp.noticeId)) {
      await fetch(`/api/pursuing?noticeId=${opp.noticeId}`, { method: "DELETE" });
    } else {
      await fetch("/api/pursuing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noticeId: opp.noticeId,
          title: opp.title,
          agency: opp.fullParentPathName || opp.department,
          awardCeiling: opp.awardCeiling,
          responseDeadline: opp.responseDeadLine,
          uiLink: opp.uiLink,
        }),
      });
    }
    fetchPursuing();
  };

  const loadAgencyIntel = async (opp: ScoredOpportunity) => {
    if (!opp.department || !opp.naicsCode) return;
    setLoadingIntel(true);
    setAgencyIntel(null);
    try {
      const res = await fetch(
        `/api/enrichment?agency=${encodeURIComponent(opp.department)}&naics=${opp.naicsCode}`
      );
      const data = await res.json();
      setAgencyIntel(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingIntel(false);
    }
  };

  const filteredOpps = useMemo(
    () => opportunities.filter((o) => o.score >= filters.minScore),
    [opportunities, filters.minScore]
  );

  const stats = useMemo(
    () => ({
      total: filteredOpps.length,
      hot: filteredOpps.filter((o) => o.score >= 70).length,
      closing24h: filteredOpps.filter(
        (o) => o.hoursToDeadline !== null && o.hoursToDeadline < 24
      ).length,
      pursuing: pursuing.length,
    }),
    [filteredOpps, pursuing]
  );

  const formatCurrency = (val: string | number | undefined) => {
    const n = Number(val || 0);
    if (n === 0) return "Not specified";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  };

  const formatDeadline = (hours: number | null) => {
    if (hours === null) return "No deadline";
    if (hours < 0) return "Expired";
    if (hours < 24) return `${hours}h left`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-red-100 text-red-800 border-red-300";
    if (score >= 65) return "bg-orange-100 text-orange-800 border-orange-300";
    if (score >= 50) return "bg-yellow-100 text-yellow-800 border-yellow-300";
    return "bg-gray-100 text-gray-700 border-gray-300";
  };

  const getDeadlineColor = (hours: number | null) => {
    if (hours === null) return "text-gray-500";
    if (hours < 24) return "text-red-600 font-semibold";
    if (hours < 72) return "text-orange-600 font-medium";
    return "text-gray-700";
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Micro-Contract Finder
            </h1>
            <p className="text-sm text-gray-600">
              Web design opportunities under ${filters.maxValue.toLocaleString()} — closing soon
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50"
            >
              <Filter className="w-4 h-4" /> Filters
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50"
            >
              <Settings className="w-4 h-4" /> Settings
            </button>
            <button
              onClick={fetchOpportunities}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-300"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Refresh
            </button>
          </div>
        </div>
        {lastFetch && (
          <p className="text-xs text-gray-500 mt-2">
            Last updated: {lastFetch.toLocaleTimeString()} •{" "}
            {opportunities.length} opportunities • auto-refreshes every 5 min
          </p>
        )}
      </div>

      {error && (
        <div className="max-w-7xl mx-auto mb-4">
          <div className="bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">
                Error fetching data
              </p>
              <p className="text-sm text-red-700">{error}</p>
              <p className="text-xs text-red-600 mt-1">
                Check your SAM_GOV_API_KEY in .env.local
              </p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="max-w-7xl mx-auto mb-4 bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4" /> Email alerts
          </h3>
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-900">
            <p className="mb-1">
              <strong>Alerts are configured in .env.local:</strong>
            </p>
            <ul className="text-xs space-y-1 font-mono">
              <li>RESEND_API_KEY — your Resend API key</li>
              <li>ALERT_TO_EMAIL — where to send alerts</li>
              <li>ALERT_MIN_SCORE — threshold (default 70)</li>
            </ul>
            <p className="text-xs mt-2">
              The /api/cron endpoint runs on schedule (see vercel.json) and
              emails new opportunities scoring above the threshold. To test now:{" "}
              <code className="bg-blue-100 px-1 rounded">
                curl http://localhost:3000/api/cron?secret=YOUR_CRON_SECRET
              </code>
            </p>
          </div>
        </div>
      )}

      {showFilters && (
        <div className="max-w-7xl mx-auto mb-4 bg-white border border-gray-200 rounded-lg p-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Max value ($)
              </label>
              <input
                type="number"
                value={filters.maxValue}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    maxValue: parseInt(e.target.value) || 0,
                  }))
                }
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Deadline within (days)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={filters.deadlineDays}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    deadlineDays: parseInt(e.target.value) || 7,
                  }))
                }
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Min score ({filters.minScore}+)
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={filters.minScore}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    minScore: parseInt(e.target.value),
                  }))
                }
                className="w-full"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.setAsideOnly}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, setAsideOnly: e.target.checked }))
                  }
                  className="rounded"
                />
                Small-business set-asides only
              </label>
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <label className="block text-xs text-gray-600 mb-1">
                Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={filters.keywords}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, keywords: e.target.value }))
                }
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <label className="block text-xs text-gray-600 mb-1">
                NAICS codes (comma-separated)
              </label>
              <input
                type="text"
                value={filters.naics}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, naics: e.target.value }))
                }
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
              />
            </div>
          </div>
          <button
            onClick={fetchOpportunities}
            className="mt-3 px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Apply & refresh
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total matches"
          value={stats.total}
          icon={<Search className="w-4 h-4" />}
        />
        <StatCard
          label="Hot (score ≥70)"
          value={stats.hot}
          icon={<AlertCircle className="w-4 h-4" />}
          accent="red"
        />
        <StatCard
          label="Closing in 24h"
          value={stats.closing24h}
          icon={<Clock className="w-4 h-4" />}
          accent="orange"
        />
        <StatCard
          label="Pursuing"
          value={stats.pursuing}
          icon={<CheckCircle2 className="w-4 h-4" />}
          accent="green"
        />
      </div>

      <div className="max-w-7xl mx-auto space-y-2">
        {loading && opportunities.length === 0 && (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">
              Fetching opportunities from SAM.gov…
            </p>
          </div>
        )}

        {!loading && filteredOpps.length === 0 && !error && (
          <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
            <Search className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600">
              No matching opportunities right now.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Try widening the deadline window or loosening keyword filters.
            </p>
          </div>
        )}

        {filteredOpps.map((opp) => (
          <div
            key={opp.noticeId}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition cursor-pointer"
            onClick={() => {
              const next =
                selectedOpp?.noticeId === opp.noticeId ? null : opp;
              setSelectedOpp(next);
              setAgencyIntel(null);
              if (next) loadAgencyIntel(next);
            }}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded border font-medium ${getScoreColor(opp.score)}`}
                  >
                    Score {opp.score}
                  </span>
                  <span
                    className={`text-xs flex items-center gap-1 ${getDeadlineColor(opp.hoursToDeadline)}`}
                  >
                    <Clock className="w-3 h-3" />
                    {formatDeadline(opp.hoursToDeadline)}
                  </span>
                  {opp.typeOfSetAside && (
                    <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                      {opp.typeOfSetAsideDescription || opp.typeOfSetAside}
                    </span>
                  )}
                </div>
                <h3 className="font-medium text-gray-900 mb-1">{opp.title}</h3>
                <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    {opp.fullParentPathName || opp.department || "Unknown agency"}
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    {formatCurrency(opp.awardCeiling || opp.baseAndAllOptionsValue)}
                  </span>
                  {opp.naicsCode && (
                    <span className="font-mono">NAICS {opp.naicsCode}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePursuing(opp);
                  }}
                  className={`text-xs px-2 py-1 rounded border ${
                    pursuingIds.has(opp.noticeId)
                      ? "bg-green-100 text-green-800 border-green-300"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {pursuingIds.has(opp.noticeId) ? "✓ Pursuing" : "+ Pursue"}
                </button>
                {opp.uiLink && (
                  <a
                    href={opp.uiLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center gap-1 text-gray-700"
                  >
                    SAM.gov <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {selectedOpp?.noticeId === opp.noticeId && (
              <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                <div className="text-xs text-gray-700 grid md:grid-cols-2 gap-2">
                  <p>
                    <span className="font-medium">Solicitation #:</span>{" "}
                    <span className="font-mono">
                      {opp.solicitationNumber || "N/A"}
                    </span>
                  </p>
                  <p>
                    <span className="font-medium">Posted:</span>{" "}
                    {opp.postedDate || "N/A"}
                  </p>
                  <p>
                    <span className="font-medium">Deadline:</span>{" "}
                    {opp.responseDeadLine
                      ? new Date(opp.responseDeadLine).toLocaleString()
                      : "N/A"}
                  </p>
                  <p>
                    <span className="font-medium">Type:</span> {opp.type || "N/A"}
                  </p>
                  {opp.placeOfPerformance && (
                    <p className="md:col-span-2">
                      <span className="font-medium">Location:</span>{" "}
                      {[
                        opp.placeOfPerformance.city?.name,
                        opp.placeOfPerformance.state?.name,
                      ]
                        .filter(Boolean)
                        .join(", ") || "N/A"}
                    </p>
                  )}
                </div>

                {opp.description && (
                  <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded max-h-40 overflow-y-auto">
                    {opp.description.slice(0, 800)}
                    {opp.description.length > 800 ? "..." : ""}
                  </div>
                )}

                {opp.scoreReasons.length > 0 && (
                  <div className="text-xs text-blue-700 bg-blue-50 p-2 rounded">
                    <strong>Why this scored {opp.score}:</strong>{" "}
                    {opp.scoreReasons.join(" • ")}
                  </div>
                )}

                <div className="bg-purple-50 border border-purple-200 rounded p-3">
                  <h4 className="text-xs font-semibold text-purple-900 mb-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Agency intel (last 12 months)
                  </h4>
                  {loadingIntel && (
                    <p className="text-xs text-purple-700">
                      Loading from USAspending.gov…
                    </p>
                  )}
                  {agencyIntel && agencyIntel.totalAwards === 0 && (
                    <p className="text-xs text-purple-700">
                      No similar awards found. Could mean a fresh opportunity or
                      the agency rarely buys this category.
                    </p>
                  )}
                  {agencyIntel && agencyIntel.totalAwards > 0 && (
                    <div className="text-xs text-purple-900 space-y-1">
                      <p>
                        <strong>{agencyIntel.totalAwards}</strong> similar
                        awards, avg{" "}
                        <strong>
                          {formatCurrency(agencyIntel.avgValue)}
                        </strong>
                      </p>
                      <p className="font-medium">Top recipients:</p>
                      <ul className="ml-3 space-y-0.5">
                        {agencyIntel.topRecipients.slice(0, 3).map((r) => (
                          <li key={r.name}>
                            • {r.name} ({r.count} award
                            {r.count > 1 ? "s" : ""},{" "}
                            {formatCurrency(r.totalValue)})
                          </li>
                        ))}
                      </ul>
                      {agencyIntel.topRecipients[0] &&
                        agencyIntel.topRecipients[0].count >= 3 && (
                          <p className="text-amber-700 mt-1">
                            ⚠️ This agency has a repeat vendor — expect them to
                            bid.
                          </p>
                        )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="max-w-7xl mx-auto mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500 text-center">
        Data from SAM.gov Opportunities API v2 + USAspending.gov • Email alerts
        via Resend
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent = "blue",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: "blue" | "red" | "orange" | "green";
}) {
  const colors = {
    blue: "text-blue-600 bg-blue-50",
    red: "text-red-600 bg-red-50",
    orange: "text-orange-600 bg-orange-50",
    green: "text-green-600 bg-green-50",
  };
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600">{label}</span>
        <span
          className={`w-6 h-6 rounded flex items-center justify-center ${colors[accent]}`}
        >
          {icon}
        </span>
      </div>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
