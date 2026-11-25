import { useEffect, useMemo, useRef, useState } from "react";
import { api, setCsrfToken } from "./api.js";
import "./App.css";

const NAV_ITEMS = [
  { label: "Overview", icon: "grid" },
  { label: "Employees", icon: "users" },
  { label: "Leave Calendar", icon: "calendar" },
  { label: "Leave Records", icon: "rows" },
  { label: "Reports", icon: "chart" },
];
const DURATION_LABELS = {
  full_day: "Full day",
  first_half: "First half",
  second_half: "Second half",
  custom_hours: "Custom hours",
};
const DEFAULT_TIME = { start_time: "09:00", end_time: "18:00" };
const DEFAULT_CUSTOM_TIME = { start_time: "09:00", end_time: "13:00" };
const blankEmployee = {
  employee_code: "",
  full_name: "",
  email: "",
  designation: "",
  employment_status: "active",
};

function customTimeError(start, end) {
  if (!start || !end || start >= end) return "Enter a start and end time with the end after the start";
  if (start < "09:00" || end > "18:00") return "Custom hours must be within 9 AM and 6 PM";
  if (start < "14:00" && end > "13:00") return "Custom leave cannot include the 1 PM to 2 PM lunch break";
  return "";
}

const blankLeave = {
  employee_id: "",
  leave_type_id: "",
  status: "taken",
  reason: "",
  admin_remarks: "",
};

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value, options = { day: "numeric", month: "short", year: "numeric" }) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", options);
}

export default function App() {
  const [authStatus, setAuthStatus] = useState("checking");
  const [authError, setAuthError] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [page, setPage] = useState("Overview");
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [types, setTypes] = useState([]);
  const [collisions, setCollisions] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [preparingPdf, setPreparingPdf] = useState(false);
  const submissionLock = useRef(false);
  const exportLock = useRef(false);
  const noticeTimer = useRef(0);
  const [employeeModal, setEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [employeeForm, setEmployeeForm] = useState(blankEmployee);
  const [leaveModal, setLeaveModal] = useState(false);
  const [editingLeave, setEditingLeave] = useState(null);
  const [leaveEditForm, setLeaveEditForm] = useState(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeStatus, setEmployeeStatus] = useState("all");
  const [leaveSearch, setLeaveSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [month, setMonth] = useState(() => new Date());
  const [reportStart, setReportStart] = useState(() => `${localDate().slice(0, 7)}-01`);
  const [reportEnd, setReportEnd] = useState(() => {
    const today = new Date();
    return localDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  });
  const [selectedDates, setSelectedDates] = useState([]);
  const [leaveForm, setLeaveForm] = useState(blankLeave);
  const [dateSettings, setDateSettings] = useState({});
  const [bulkDuration, setBulkDuration] = useState("full_day");

  async function loadWorkspaceData() {
    return Promise.all([
      api("/employees/"),
      api("/leaves/"),
      api("/leaves/types"),
      api("/leaves/collisions"),
    ]);
  }

  async function retryWorkspaceLoad() {
    setLoading(true);
    setLoadError("");
    try {
      const [employeeData, leaveData, typeData, collisionData] = await loadWorkspaceData();
      setEmployees(employeeData);
      setLeaves(leaveData);
      setTypes(typeData);
      setCollisions(collisionData);
    } catch (requestError) {
      setLoadError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function refresh({ all = false, employeeList = false, leaveList = false, collisionList = false } = {}) {
    const shouldLoadEmployees = all || employeeList;
    const shouldLoadLeaves = all || leaveList;
    const shouldLoadCollisions = all || collisionList;
    const shouldLoadTypes = all;
    const requests = [];
    if (shouldLoadEmployees) requests.push(api("/employees/").then(setEmployees));
    if (shouldLoadLeaves) requests.push(api("/leaves/").then(setLeaves));
    if (shouldLoadTypes) requests.push(api("/leaves/types").then(setTypes));
    if (shouldLoadCollisions) requests.push(api("/leaves/collisions").then(setCollisions));
    if (!requests.length) return;
    setRefreshing(true);
    try {
      await Promise.all(requests);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    api("/auth/me")
      .then((session) => {
        if (!mounted) return;
        setCsrfToken(session.csrf_token);
        setAdminUsername(session.username);
        setAuthStatus("signed-in");
      })
      .catch((requestError) => {
        if (!mounted) return;
        if (requestError.status === 401) {
          setAuthStatus("signed-out");
        } else {
          setAuthError(requestError.message);
          setAuthStatus("error");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      setCsrfToken("");
      setAdminUsername("");
      setAuthStatus((current) => (current === "signed-in" ? "signed-out" : current));
      setError("");
      setLoadError("");
    }
    window.addEventListener("leavehq:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("leavehq:unauthorized", handleUnauthorized);
  }, []);

  useEffect(() => {
    if (authStatus !== "signed-in") return undefined;
    let mounted = true;
    loadWorkspaceData()
      .then(([employeeData, leaveData, typeData, collisionData]) => {
        if (!mounted) return;
        setEmployees(employeeData);
        setLeaves(leaveData);
        setTypes(typeData);
        setCollisions(collisionData);
      })
      .catch((requestError) => {
        if (mounted) setLoadError(requestError.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [authStatus]);

  async function signIn(credentials) {
    setLoadError("");
    const session = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    setCsrfToken(session.csrf_token);
    setAdminUsername(credentials.username);
    setAuthError("");
    setAuthStatus("signed-in");
  }

  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST" });
      setCsrfToken("");
      setAdminUsername("");
      setAuthStatus("signed-out");
    } catch (requestError) {
      if (requestError.status === 401) {
        setCsrfToken("");
        setAdminUsername("");
        setAuthStatus("signed-out");
      } else {
        setError(requestError.message);
      }
    }
  }

  function notify(message) {
    window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 3500);
  }

  function openAddEmployee() {
    setEditingEmployee(null);
    setEmployeeForm({ ...blankEmployee });
    setEmployeeModal(true);
  }

  function openEditEmployee(employee) {
    setEditingEmployee(employee.id);
    setEmployeeForm({ ...employee });
    setEmployeeModal(true);
  }

  function openLeave() {
    setPage("Leave Calendar");
    setSelectedDates([]);
    setDateSettings({});
    setBulkDuration("full_day");
    setLeaveForm({
      ...blankLeave,
      leave_type_id: types[0]?.id?.toString() || "",
    });
  }

  async function saveEmployee(event) {
    event.preventDefault();
    if (submissionLock.current) return;
    submissionLock.current = true;
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...employeeForm,
        email: employeeForm.email?.trim() || null,
        designation: employeeForm.designation?.trim() || null,
      };
      if (editingEmployee) {
        await api(`/employees/${editingEmployee}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/employees/", { method: "POST", body: JSON.stringify(payload) });
      }
      setEmployeeModal(false);
      await refresh({ employeeList: true });
      notify(editingEmployee ? "Employee details updated" : "Employee added");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      submissionLock.current = false;
      setSaving(false);
    }
  }

  function toggleDate(value) {
    setSelectedDates((current) =>
      current.includes(value)
        ? current.filter((date) => date !== value)
        : [...current, value].sort(),
    );
    setDateSettings((current) => ({
      ...current,
      [value]:
        current[value] ||
        { duration_type: bulkDuration === "individual" ? "full_day" : bulkDuration, ...DEFAULT_TIME },
    }));
  }

  function changeSetting(date, key, value) {
    setDateSettings((current) => {
      const currentSetting = current[date] || { ...DEFAULT_TIME };
      return {
        ...current,
        [date]: {
          ...currentSetting,
          ...(key === "duration_type" && value === "custom_hours" && currentSetting.duration_type !== "custom_hours"
            ? DEFAULT_CUSTOM_TIME
            : {}),
          [key]: value,
        },
      };
    });
  }

  function applyBulkDuration(value) {
    setBulkDuration(value);
    if (value === "individual") return;
    setDateSettings((current) => {
      const next = { ...current };
      selectedDates.forEach((date) => {
        next[date] = { ...next[date], duration_type: value, ...DEFAULT_TIME };
      });
      return next;
    });
  }

  async function saveLeaves(event) {
    event?.preventDefault();
    if (submissionLock.current) return;
    if (!selectedDates.length) {
      setError("Select at least one date to record leave.");
      return;
    }
    for (const date of selectedDates) {
      const setting = dateSettings[date] || {};
      if (setting.duration_type === "custom_hours") {
        const problem = customTimeError(setting.start_time, setting.end_time);
        if (problem) {
          setError(`${problem} (${formatDate(date)}).`);
          return;
        }
      }
    }
    submissionLock.current = true;
    setSaving(true);
    setError("");
    try {
      await api("/leaves/batch", {
        method: "POST",
        body: JSON.stringify({
          ...leaveForm,
          employee_id: Number(leaveForm.employee_id),
          leave_type_id: Number(leaveForm.leave_type_id),
          dates: selectedDates.map((date) => ({
            leave_date: date,
            duration_type: dateSettings[date].duration_type,
            start_time: dateSettings[date].duration_type === "custom_hours" ? dateSettings[date].start_time : null,
            end_time: dateSettings[date].duration_type === "custom_hours" ? dateSettings[date].end_time : null,
          })),
        }),
      });
      const savedCount = selectedDates.length;
      setSelectedDates([]);
      setDateSettings({});
      await refresh({ leaveList: true, collisionList: true });
      notify(`${savedCount} leave ${savedCount === 1 ? "date" : "dates"} recorded`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      submissionLock.current = false;
      setSaving(false);
    }
  }

  function openEditLeave(leave) {
    setEditingLeave(leave.id);
    setLeaveEditForm({
      employee_id: String(leave.employee_id),
      leave_type_id: String(leave.leave_type_id),
      leave_date: leave.start_date,
      duration_type: leave.duration_type,
      start_time: leave.start_time,
      end_time: leave.end_time,
      status: leave.status,
      reason: leave.reason || "",
      admin_remarks: leave.admin_remarks || "",
    });
    setLeaveModal(true);
  }

  async function saveLeaveEdit(event) {
    event.preventDefault();
    if (submissionLock.current || !editingLeave || !leaveEditForm) return;
    if (leaveEditForm.duration_type === "custom_hours") {
      const problem = customTimeError(leaveEditForm.start_time, leaveEditForm.end_time);
      if (problem) {
        setError(`${problem} (${formatDate(leaveEditForm.leave_date)}).`);
        return;
      }
    }
    submissionLock.current = true;
    setSaving(true);
    try {
      await api(`/leaves/${editingLeave}`, {
        method: "PUT",
        body: JSON.stringify({
          ...leaveEditForm,
          employee_id: Number(leaveEditForm.employee_id),
          leave_type_id: Number(leaveEditForm.leave_type_id),
          start_time: leaveEditForm.duration_type === "custom_hours" ? leaveEditForm.start_time : null,
          end_time: leaveEditForm.duration_type === "custom_hours" ? leaveEditForm.end_time : null,
        }),
      });
      setLeaveModal(false);
      setLeaveEditForm(null);
      await refresh({ leaveList: true, collisionList: true });
      notify("Leave record corrected");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      submissionLock.current = false;
      setSaving(false);
    }
  }

  async function cancelLeave(leave) {
    const description = leave.start_date === leave.end_date
      ? formatDate(leave.start_date)
      : `${formatDate(leave.start_date)} to ${formatDate(leave.end_date)}`;
    if (submissionLock.current || !window.confirm(`Cancel ${leave.employee_name}'s leave for ${description}? The record will remain in history.`)) return;
    submissionLock.current = true;
    setSaving(true);
    try {
      await api(`/leaves/${leave.id}/cancel`, { method: "PATCH" });
      await refresh({ leaveList: true, collisionList: true });
      notify("Leave cancelled; the record remains in history");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      submissionLock.current = false;
      setSaving(false);
    }
  }

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const todayKey = localDate(now);
  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.employment_status === "active"),
    [employees],
  );
  const awayToday = useMemo(
    () => leaves.filter(
      (leave) =>
        leave.status !== "cancelled" &&
        leave.start_date <= todayKey &&
        leave.end_date >= todayKey,
    ),
    [leaves, todayKey],
  );
  const upcoming = useMemo(
    () => leaves
      .filter((leave) => leave.status === "planned" && leave.start_date >= todayKey)
      .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [leaves, todayKey],
  );
  const totalHours = useMemo(
    () => leaves
      .filter((leave) => leave.status !== "cancelled")
      .reduce((sum, leave) => sum + (leave.total_hours || 0), 0),
    [leaves],
  );

  const filteredEmployees = useMemo(() => employees.filter((employee) => {
    const matchesSearch = [
      employee.full_name,
      employee.employee_code,
      employee.designation,
      employee.email,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(employeeSearch.toLowerCase());
    const matchesStatus =
      employeeStatus === "all" || employee.employment_status === employeeStatus;
    return matchesSearch && matchesStatus;
  }), [employees, employeeSearch, employeeStatus]);

  const filteredLeaves = useMemo(() => leaves.filter((leave) => {
    const matchesStatus = filter === "all" || leave.status === filter;
    const matchesSearch = [
      leave.employee_name,
      leave.employee_code,
      leave.leave_type,
      leave.reason,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(leaveSearch.toLowerCase());
    return matchesStatus && matchesSearch;
  }), [leaves, filter, leaveSearch]);

  const reportRangeValid = Boolean(reportStart && reportEnd && reportStart <= reportEnd);
  const reportLeaves = useMemo(() => reportRangeValid
    ? leaves.filter(
        (leave) =>
          leave.status !== "cancelled" &&
          leave.start_date <= reportEnd &&
          leave.end_date >= reportStart,
      )
    : [], [leaves, reportRangeValid, reportStart, reportEnd]);
  const reportSummary = useMemo(() => employees.map((employee) => {
    const ownLeaves = reportLeaves.filter((leave) => leave.employee_id === employee.id);
    return {
      employee,
      entries: ownLeaves.length,
      hours: ownLeaves.reduce((sum, leave) => sum + (leave.total_hours || 0), 0),
      days: ownLeaves.reduce((sum, leave) => sum + (leave.total_days || 0), 0),
    };
  }), [employees, reportLeaves]);
  const reportHours = useMemo(
    () => reportLeaves.reduce((sum, leave) => sum + (leave.total_hours || 0), 0),
    [reportLeaves],
  );
  const reportDays = useMemo(
    () => reportLeaves.reduce((sum, leave) => sum + (leave.total_days || 0), 0),
    [reportLeaves],
  );

  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [month]);

  const calendarLeavesByDate = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const monthStart = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    const monthEnd = localDate(new Date(year, monthIndex + 1, 0));
    const byDate = new Map();
    leaves.forEach((leave) => {
      if (leave.status === "cancelled" || leave.start_date > monthEnd || leave.end_date < monthStart) return;
      const firstDay = Math.max(1, Number(leave.start_date < monthStart ? 1 : leave.start_date.slice(8, 10)));
      const lastDay = Math.min(
        new Date(year, monthIndex + 1, 0).getDate(),
        Number(leave.end_date > monthEnd ? monthEnd.slice(8, 10) : leave.end_date.slice(8, 10)),
      );
      for (let day = firstDay; day <= lastDay; day += 1) {
        const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const entries = byDate.get(key) || [];
        entries.push(leave);
        byDate.set(key, entries);
      }
    });
    return byDate;
  }, [leaves, month]);

  const reportCollisions = useMemo(() => reportRangeValid
    ? collisions.filter((collision) => collision.date >= reportStart && collision.date <= reportEnd)
    : [], [collisions, reportRangeValid, reportStart, reportEnd]);

  async function exportCSV() {
    if (exportLock.current || !reportRangeValid) return;
    exportLock.current = true;
    setExportingCsv(true);
    setError("");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
    const rows = [
      ["Start date", "End date", "Employee", "Employee Code", "Leave Type", "Duration", "Start", "End", "Hours", "Days", "Status", "Reason", "Admin remarks"],
      ...reportLeaves.map((leave) => [
        leave.start_date,
        leave.end_date,
        leave.employee_name,
        leave.employee_code,
        leave.leave_type,
        DURATION_LABELS[leave.duration_type] || leave.duration_type,
        leave.start_time,
        leave.end_time,
        leave.total_hours,
        leave.total_days,
        leave.status,
        leave.reason,
        leave.admin_remarks,
      ]),
    ];
    const safeCell = (value) => {
      const text = String(value ?? "");
      return `"${(/^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text).replaceAll('"', '""')}"`;
    };
    const csv = rows
      .map((row) => row.map(safeCell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `LeaveHQ-report-${reportStart}-to-${reportEnd}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Exported ${reportLeaves.length} records overlapping ${reportStart} to ${reportEnd}`);
    } catch (exportError) {
      setError(`Unable to export CSV. ${exportError.message}`);
    } finally {
      exportLock.current = false;
      setExportingCsv(false);
    }
  }

  function exportPDF() {
    if (exportLock.current || !reportRangeValid) return;
    exportLock.current = true;
    setPreparingPdf(true);
    setError("");
    requestAnimationFrame(() => {
      let finished = false;
      const timeout = window.setTimeout(() => {
        if (finished) return;
        finished = true;
        exportLock.current = false;
        setPreparingPdf(false);
        setError("Print dialog did not finish. Export controls are available again.");
      }, 15000);
      const finish = (message) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        exportLock.current = false;
        setPreparingPdf(false);
        notify(message);
      };
      window.addEventListener("afterprint", () => finish("Report ready. The print dialog has closed."), { once: true });
      try {
        window.print();
      } catch (exportError) {
        finished = true;
        window.clearTimeout(timeout);
        exportLock.current = false;
        setPreparingPdf(false);
        setError(`Unable to prepare PDF report. ${exportError.message}`);
      }
    });
  }

  if (authStatus === "checking") {
    return <LoadingState message="Checking administrator session..." />;
  }
  if (authStatus === "error") {
    return <LoginPage error={authError} onRetry={() => {
      setAuthStatus("checking");
      setAuthError("");
      api("/auth/me")
        .then((session) => {
          setCsrfToken(session.csrf_token);
          setAdminUsername(session.username);
          setAuthStatus("signed-in");
        })
        .catch((requestError) => {
          setAuthStatus(requestError.status === 401 ? "signed-out" : "error");
          setAuthError(requestError.status === 401 ? "" : requestError.message);
        });
    }} />;
  }
  if (authStatus === "signed-out") {
    return <LoginPage onSubmit={signIn} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setPage("Overview"); }}>
          <span className="brand-name">Leave<span>HQ</span></span>
          <span className="brand-logo">
            <img src="/abacus-digital-logo.png" alt="Abacus Digital" />
          </span>
        </a>
        <div className="side-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.label}
              className={`nav-item ${page === item.label ? "active" : ""}`}
              aria-current={page === item.label ? "page" : undefined}
              onClick={() => setPage(item.label)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="admin-avatar" aria-hidden="true">A</div>
          <div><b>{adminUsername || "Administrator"}</b><small>Leave management</small></div>
          <button type="button" className="sidebar-signout" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="page-heading">
            <div className="eyebrow">LEAVE MANAGEMENT <span>/</span> {page.toUpperCase()}</div>
            <h1>{page}</h1>
          </div>
          <div className="top-actions">
            <span className="today-label">{now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
            <button type="button" className="mobile-signout" onClick={signOut}>Sign out</button>
            <Button onClick={openLeave}><Icon name="plus" /> Record leave</Button>
          </div>
        </header>

        <div className="feedback-region" aria-live="polite">
          {error && (
            <Alert
              kind="error"
              onClose={() => setError("")}
              action={<Button variant="secondary" size="small" onClick={() => refresh({ all: true })} disabled={refreshing}>Reload workspace</Button>}
            >
              {error}
            </Alert>
          )}
          {notice && <Alert kind="success" onClose={() => setNotice("")}>{notice}</Alert>}
        </div>
        {(refreshing || saving) && (
          <p className="operation-status" role="status">
            {saving
              ? page === "Leave Calendar"
                ? `Saving ${selectedDates.length} leave ${selectedDates.length === 1 ? "date" : "dates"}...`
                : page === "Employees"
                  ? "Saving employee details..."
                  : "Updating leave record..."
              : page === "Employees"
                ? "Refreshing employee records..."
                : page === "Leave Calendar"
                  ? "Refreshing leave calendar..."
                  : page === "Reports"
                    ? "Refreshing report data..."
                    : "Refreshing workspace data..."}
          </p>
        )}

        {loading ? (
          <div className="page-content"><WorkspaceSkeleton page={page} /></div>
        ) : (
          <div className="page-content">
            {loadError && (
              <div className="load-error" role="alert">
                <span>Unable to load workspace data. {loadError}</span>
                <Button variant="secondary" onClick={retryWorkspaceLoad} disabled={loading}>
                  Retry loading
                </Button>
              </div>
            )}
            {!loadError && <>
            {page === "Overview" && (
              <section aria-labelledby="overview-title">
                <PageIntro
                  id="overview-title"
                  title="Your team, at a glance"
                  description="A clear view of today's availability and upcoming leave."
                  action={<Button variant="secondary" onClick={() => refresh({ all: true })} disabled={refreshing}><Icon name="refresh" /> {refreshing ? "Refreshing..." : "Refresh"}</Button>}
                />
                <div className="stats-grid">
                  <Metric label="Active employees" value={activeEmployees.length} detail="Current workforce" icon="users" />
                  <Metric label="On leave today" value={awayToday.length} detail="Leave records today" icon="calendar" />
                  <Metric label="Upcoming leave" value={upcoming.length} detail="Planned leave records" icon="clock" />
                  <Metric label="Leave hours recorded" value={formatHours(totalHours)} detail="All time, excluding cancelled" icon="chart" />
                </div>
                <div className="overview-grid">
                  <Panel title="Away today" description={formatDate(todayKey, { weekday: "long", day: "numeric", month: "long" })}>
                    {awayToday.length ? (
                      <PeopleList leaves={awayToday} />
                    ) : (
                      <EmptyState title="Everyone is accounted for" description="No leave is recorded for today." />
                    )}
                  </Panel>
                  <Panel title="Coming up" description="Next planned absences">
                    {upcoming.length ? (
                      <PeopleList leaves={upcoming.slice(0, 6)} showDate />
                    ) : (
                      <EmptyState title="Nothing scheduled" description="Planned leave will appear here." />
                    )}
                  </Panel>
                </div>
                <Panel
                  title="Leave overlaps"
                  description="Employees with overlapping absence times"
                  action={<Button variant="text" onClick={() => setPage("Reports")}>View report <Icon name="arrow" /></Button>}
                >
                  {collisions.length ? (
                    <CollisionList collisions={collisions.slice(0, 5)} />
                  ) : (
                    <EmptyState title="No overlapping absences" description="No time collisions were found in recorded leave." />
                  )}
                </Panel>
              </section>
            )}

            {page === "Employees" && (
              <section aria-labelledby="employees-title">
                <PageIntro
                  id="employees-title"
                  title="Employee directory"
                  description="Manage the people included in leave planning."
                  action={<Button onClick={openAddEmployee}><Icon name="plus" /> Add employee</Button>}
                />
                <Panel>
                  <div className="table-toolbar">
                    <label className="search-control">
                      <Icon name="search" />
                      <input
                        type="search"
                        aria-label="Search employees"
                        placeholder="Search name, code, email or role"
                        value={employeeSearch}
                        onChange={(event) => setEmployeeSearch(event.target.value)}
                      />
                    </label>
                    <div className="toolbar-end">
                      <label className="filter-control">
                        <span className="sr-only">Employment status</span>
                        <select value={employeeStatus} onChange={(event) => setEmployeeStatus(event.target.value)}>
                          <option value="all">All statuses</option>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </label>
                      <span className="result-count">{filteredEmployees.length} employees</span>
                    </div>
                  </div>
                  {filteredEmployees.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>EMPLOYEE</th><th>EMPLOYEE CODE</th><th>EMAIL</th><th>DESIGNATION</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>
                          {filteredEmployees.map((employee) => (
                            <tr key={employee.id}>
                              <td><div className="employee-name"><Avatar name={employee.full_name} /><b>{employee.full_name}</b></div></td>
                              <td>{employee.employee_code}</td>
                              <td>{employee.email || <span className="table-muted">Not provided</span>}</td>
                              <td>{employee.designation || <span className="table-muted">Not provided</span>}</td>
                              <td><StatusBadge status={employee.employment_status} /></td>
                              <td className="actions-cell"><Button variant="secondary" size="small" onClick={() => openEditEmployee(employee)}>Edit</Button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState title="No employees found" description="Try another search or add an employee." />
                  )}
                </Panel>
              </section>
            )}

            {page === "Leave Calendar" && (
              <section aria-labelledby="calendar-title">
                <PageIntro
                  id="calendar-title"
                  title="Team leave calendar"
                  description="Select one or more dates, then record leave in a single workflow."
                />
                <Panel className="assignment-panel">
                  <div className="assignment-heading">
                    <div><h2>Record leave</h2><p>Choose an employee and dates to get started.</p></div>
                    <span className="selection-count">{selectedDates.length} selected</span>
                  </div>
                  <div className="quick-controls">
                    <Field label="Employee">
                      <select value={leaveForm.employee_id} onChange={(event) => setLeaveForm({ ...leaveForm, employee_id: event.target.value })}>
                        <option value="">Choose employee</option>
                        {activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} ({employee.employee_code})</option>)}
                      </select>
                    </Field>
                    <Field label="Leave type">
                      <select value={leaveForm.leave_type_id} onChange={(event) => setLeaveForm({ ...leaveForm, leave_type_id: event.target.value })}>
                        <option value="">Choose leave type</option>
                        {types.filter((type) => type.is_active !== false).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Status">
                      <select value={leaveForm.status} onChange={(event) => setLeaveForm({ ...leaveForm, status: event.target.value })}>
                        <option value="taken">Taken</option><option value="planned">Planned</option>
                      </select>
                    </Field>
                    <Field label="Default duration for selected dates">
                      <select value={bulkDuration} onChange={(event) => applyBulkDuration(event.target.value)}>
                        <option value="full_day">Full day</option>
                        <option value="first_half">First half</option>
                        <option value="second_half">Second half</option>
                        <option value="individual">Keep individual settings</option>
                      </select>
                    </Field>
                  </div>

                  <div className="calendar-toolbar">
                    <div className="month-navigation">
                      <IconButton label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="chevronLeft" /></IconButton>
                      <h3>{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h3>
                      <IconButton label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="chevronRight" /></IconButton>
                    </div>
                    <Button variant="secondary" size="small" onClick={() => setMonth(new Date())}>Today</Button>
                  </div>
                  <div className="calendar-scroll" tabIndex="0" aria-label="Monthly leave calendar. Select dates to assign leave.">
                    <div className="calendar-grid">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => <div className="weekday" key={weekday}>{weekday}</div>)}
                      {calendarDays.map((day, index) => {
                        const date = day
                          ? `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                          : null;
                        const chosen = date && selectedDates.includes(date);
                        const dayLeaves = date ? calendarLeavesByDate.get(date) || [] : [];
                        return (
                          <div className={`calendar-cell ${date === todayKey ? "is-today" : ""}`} key={`${month.getMonth()}-${index}`}>
                            {day && (
                              <>
                                <button
                                  type="button"
                                  className={`day-select ${chosen ? "selected" : ""}`}
                                  aria-pressed={Boolean(chosen)}
                                  aria-label={`${formatDate(date, { weekday: "long", day: "numeric", month: "long" })}${chosen ? ", selected" : ", select date"}`}
                                  onClick={() => toggleDate(date)}
                                >
                                  <span className="day-number">{day}</span>
                                  {chosen && <span className="selected-mark"><Icon name="check" /></span>}
                                </button>
                                <div className="day-leaves">
                                  {dayLeaves.slice(0, 2).map((leave) => (
                                    <div className={`calendar-event ${leave.status}`} key={leave.id} title={`${leave.employee_name} · ${leave.start_time?.slice(0, 5)}–${leave.end_time?.slice(0, 5)}`}>
                                      <span className="event-dot" />
                                      <span>{leave.employee_name}</span>
                                    </div>
                                  ))}
                                  {dayLeaves.length > 2 && <span className="more-events">+{dayLeaves.length - 2} more</span>}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="calendar-legend"><span><i className="legend-dot taken" />Taken</span><span><i className="legend-dot planned" />Planned</span><span className="legend-help">Select dates to assign leave</span></div>

                  {selectedDates.length > 0 && (
                    <div className="selected-dates">
                      <div className="selected-heading">
                        <div><h3>Selected dates</h3><p>Adjust a date below to override the default duration.</p></div>
                        <Button variant="text" onClick={() => { setSelectedDates([]); setDateSettings({}); }}>Clear all</Button>
                      </div>
                      <div className="date-settings-list">
                        {selectedDates.map((date) => (
                          <div className="date-setting" key={date}>
                            <b>{formatDate(date)}</b>
                            <Field label={`Duration for ${formatDate(date)}`}>
                              <select value={dateSettings[date]?.duration_type || bulkDuration} onChange={(event) => changeSetting(date, "duration_type", event.target.value)}>
                                {Object.entries(DURATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                            </Field>
                            {dateSettings[date]?.duration_type === "custom_hours" && (
                              <div className="time-range">
                                <Field label="Start time"><input type="time" value={dateSettings[date]?.start_time || DEFAULT_TIME.start_time} onChange={(event) => changeSetting(date, "start_time", event.target.value)} /></Field>
                                <Field label="End time"><input type="time" value={dateSettings[date]?.end_time || DEFAULT_TIME.end_time} onChange={(event) => changeSetting(date, "end_time", event.target.value)} /></Field>
                              </div>
                            )}
                            <IconButton label={`Remove ${formatDate(date)}`} onClick={() => toggleDate(date)}><Icon name="close" /></IconButton>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="quick-controls optional-fields">
                    <Field label="Reason (optional)"><input value={leaveForm.reason} onChange={(event) => setLeaveForm({ ...leaveForm, reason: event.target.value })} placeholder="Reason for leave" /></Field>
                    <Field label="Admin remarks (optional)"><input value={leaveForm.admin_remarks} onChange={(event) => setLeaveForm({ ...leaveForm, admin_remarks: event.target.value })} placeholder="Internal notes" /></Field>
                  </div>
                  <div className="assignment-footer">
                    <p role={saving && page === "Leave Calendar" ? "status" : undefined}>
                      {saving && page === "Leave Calendar"
                        ? `Saving ${selectedDates.length} leave ${selectedDates.length === 1 ? "date" : "dates"}...`
                        : selectedDates.length
                          ? `${selectedDates.length} date${selectedDates.length === 1 ? "" : "s"} ready to save.`
                          : "Select dates on the calendar to continue."}
                    </p>
                    <Button onClick={saveLeaves} disabled={saving || !selectedDates.length || !leaveForm.employee_id || !leaveForm.leave_type_id}>
                      {saving && page === "Leave Calendar" ? "Saving..." : `Save ${selectedDates.length || ""} leave ${selectedDates.length === 1 ? "date" : "dates"}`}
                    </Button>
                  </div>
                </Panel>
              </section>
            )}

            {page === "Leave Records" && (
              <section aria-labelledby="records-title">
                <PageIntro id="records-title" title="Leave records" description="Search and review recorded employee leave." />
                <Panel>
                  <div className="table-toolbar">
                    <label className="search-control">
                      <Icon name="search" />
                      <input type="search" aria-label="Search leave records" placeholder="Search employee, code, type or reason" value={leaveSearch} onChange={(event) => setLeaveSearch(event.target.value)} />
                    </label>
                    <div className="toolbar-end">
                      <label className="filter-control">
                        <span className="sr-only">Leave status</span>
                        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                          <option value="all">All statuses</option><option value="taken">Taken</option><option value="planned">Planned</option><option value="cancelled">Cancelled</option>
                        </select>
                      </label>
                      <span className="result-count">{filteredLeaves.length} records</span>
                    </div>
                  </div>
                  <LeaveTable
                    leaves={filteredLeaves}
                    onEdit={openEditLeave}
                    onCancel={cancelLeave}
                    disabled={saving}
                  />
                </Panel>
              </section>
            )}

            {page === "Reports" && (
              <section className="reports-page" aria-labelledby="reports-title">
                <div className="report-screen">
                  <PageIntro
                    id="reports-title"
                    title="Management reports"
                    description="Leave records overlapping a date range. Legacy multi-day records contribute their full recorded totals."
                    action={
                      <div className="report-actions">
                        <Field label="From"><input type="date" value={reportStart} onChange={(event) => setReportStart(event.target.value)} /></Field>
                        <Field label="To"><input type="date" value={reportEnd} onChange={(event) => setReportEnd(event.target.value)} /></Field>
                        <Button variant="secondary" onClick={exportCSV} disabled={!reportRangeValid || exportingCsv || preparingPdf}>
                          <Icon name="download" /> {exportingCsv ? "Preparing CSV..." : "Export CSV"}
                        </Button>
                        <Button onClick={exportPDF} disabled={!reportRangeValid || exportingCsv || preparingPdf}>
                          <Icon name="print" /> {preparingPdf ? "Preparing PDF..." : "Export PDF"}
                        </Button>
                      </div>
                    }
                  />
                  <p className="report-scope">Reports and CSV include non-cancelled records overlapping the selected dates. Legacy multi-day records contribute their full recorded hours.</p>
                  {(exportingCsv || preparingPdf) && (
                    <p className="export-status" role="status">
                      {exportingCsv ? "Preparing CSV report..." : "Preparing PDF report. Choose Save as PDF in the print dialog."}
                    </p>
                  )}
                  <div className="stats-grid report-stats">
                    <Metric label="Employees" value={employees.length} detail="All employee records" icon="users" />
                    <Metric label="Leave entries" value={reportLeaves.length} detail="Records overlapping the selected period" icon="rows" />
                    <Metric label="Leave hours" value={formatHours(reportHours)} detail="Full-record total; cancelled excluded" icon="clock" />
                    <Metric label="Collision dates" value={reportCollisions.length} detail="Within the selected period" icon="alert" />
                  </div>
                  {!reportRangeValid && <p className="range-error" role="alert">Choose a valid reporting range.</p>}
                  <Panel title="Overlapping absences" description={`Collision dates from ${reportStart} to ${reportEnd}`}>
                    <CollisionList collisions={reportCollisions} emptyTitle="No collisions in this period" />
                  </Panel>
                  <Panel title="Employee leave summary" description="Records overlapping the selected period; full-record hours are included for legacy multi-day records.">
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>EMPLOYEE</th><th>ENTRIES</th><th>LEAVE HOURS</th><th>LEAVE DAYS</th></tr></thead>
                        <tbody>
                          {reportSummary.map(({ employee, entries, hours, days }) => (
                            <tr key={employee.id}>
                              <td><div className="employee-name"><Avatar name={employee.full_name} /><span><b>{employee.full_name}</b><small className="cell-sub">{employee.employee_code}</small></span></div></td>
                              <td>{entries}</td><td>{formatHours(hours)}</td><td>{days.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!employees.length && <EmptyState title="No employees to report" description="Employee summaries will appear here." />}
                  </Panel>
                </div>
                <PrintableReport
                  employees={reportSummary}
                  leaves={reportLeaves}
                  collisions={reportCollisions}
                  startDate={reportStart}
                  endDate={reportEnd}
                  totalHours={reportHours}
                  totalDays={reportDays}
                  generatedAt={now}
                />
              </section>
            )}
            </>}
          </div>
        )}
        <footer>LeaveHQ <span>·</span> Internal leave management</footer>
      </main>

      {employeeModal && (
        <Modal title={editingEmployee ? "Edit employee" : "Add employee"} close={() => setEmployeeModal(false)}>
          <form onSubmit={saveEmployee}>
            <Field label="Employee code"><input required value={employeeForm.employee_code} onChange={(event) => setEmployeeForm({ ...employeeForm, employee_code: event.target.value })} /></Field>
            <Field label="Full name"><input required value={employeeForm.full_name} onChange={(event) => setEmployeeForm({ ...employeeForm, full_name: event.target.value })} /></Field>
            <Field label="Email"><input type="email" value={employeeForm.email || ""} onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })} /></Field>
            <Field label="Designation"><input value={employeeForm.designation || ""} onChange={(event) => setEmployeeForm({ ...employeeForm, designation: event.target.value })} /></Field>
            <Field label="Employment status">
              <select value={employeeForm.employment_status} onChange={(event) => setEmployeeForm({ ...employeeForm, employment_status: event.target.value })}>
                <option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
            </Field>
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={() => setEmployeeModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving employee..." : "Save employee"}</Button>
            </div>
          </form>
        </Modal>
      )}
      {leaveModal && leaveEditForm && (
        <Modal title="Correct leave record" close={() => setLeaveModal(false)}>
          <form onSubmit={saveLeaveEdit}>
            <Field label="Employee">
              <select required value={leaveEditForm.employee_id} onChange={(event) => setLeaveEditForm({ ...leaveEditForm, employee_id: event.target.value })}>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} ({employee.employee_code})</option>)}
              </select>
            </Field>
            <Field label="Leave type">
              <select required value={leaveEditForm.leave_type_id} onChange={(event) => setLeaveEditForm({ ...leaveEditForm, leave_type_id: event.target.value })}>
                {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
            </Field>
            <Field label="Date"><input type="date" required value={leaveEditForm.leave_date} onChange={(event) => setLeaveEditForm({ ...leaveEditForm, leave_date: event.target.value })} /></Field>
            <Field label="Duration">
              <select value={leaveEditForm.duration_type} onChange={(event) => setLeaveEditForm({
                ...leaveEditForm,
                duration_type: event.target.value,
                ...(event.target.value === "custom_hours" && leaveEditForm.duration_type !== "custom_hours"
                  ? DEFAULT_CUSTOM_TIME
                  : {}),
              })}>
                {Object.entries(DURATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            {leaveEditForm.duration_type === "custom_hours" && (
              <div className="time-range">
                <Field label="Start time"><input type="time" required value={leaveEditForm.start_time} onChange={(event) => setLeaveEditForm({ ...leaveEditForm, start_time: event.target.value })} /></Field>
                <Field label="End time"><input type="time" required value={leaveEditForm.end_time} onChange={(event) => setLeaveEditForm({ ...leaveEditForm, end_time: event.target.value })} /></Field>
              </div>
            )}
            <Field label="Status">
              <select value={leaveEditForm.status} onChange={(event) => setLeaveEditForm({ ...leaveEditForm, status: event.target.value })}>
                <option value="planned">Planned</option><option value="taken">Taken</option>
              </select>
            </Field>
            <Field label="Reason"><input value={leaveEditForm.reason} onChange={(event) => setLeaveEditForm({ ...leaveEditForm, reason: event.target.value })} /></Field>
            <Field label="Admin remarks"><input value={leaveEditForm.admin_remarks} onChange={(event) => setLeaveEditForm({ ...leaveEditForm, admin_remarks: event.target.value })} /></Field>
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={() => setLeaveModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving correction..." : "Save correction"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function formatHours(hours) {
  return Number.isInteger(hours) ? String(hours) : Number(hours).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function LoginPage({ onSubmit, onRetry, error: initialError = "" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!onSubmit) {
      onRetry?.();
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({ username, password });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-name">Leave<span>HQ</span></span>
          <span className="brand-caption">ABACUS DIGITAL</span>
        </div>
        <h1 id="login-title">Administrator sign in</h1>
        <p>Use your authorised LeaveHQ administrator account.</p>
        {error && <div className="login-error" role="alert">{error}</div>}
        {onSubmit ? (
          <form onSubmit={submit}>
            <Field label="Username">
              <input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} />
            </Field>
            <Field label="Password">
              <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
            <Button type="submit" disabled={submitting}>{submitting ? "Signing in..." : "Sign in"}</Button>
          </form>
        ) : (
          <Button onClick={submit}>Retry connection</Button>
        )}
      </section>
    </main>
  );
}

function Icon({ name }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    rows: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-5 5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.64 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.36-3" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><path d="m10.3 3.86-8.1 14A2 2 0 0 0 4 20.86h16a2 2 0 0 0 1.8-3l-8.1-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
    print: <><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6" /><path d="M10 11v5m4-5v5" /></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Button({ children, variant = "primary", size = "default", ...props }) {
  return <button className={`button button-${variant} ${size === "small" ? "button-small" : ""}`} {...props}>{children}</button>;
}

function IconButton({ label, children, ...props }) {
  return <button type="button" className="icon-button" aria-label={label} {...props}>{children}</button>;
}

function PageIntro({ id, title, description, action }) {
  return <div className="page-intro"><div><h2 id={id}>{title}</h2><p>{description}</p></div>{action && <div className="page-intro-action">{action}</div>}</div>;
}

function Panel({ title, description, action, className = "", children }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && <div className="panel-heading">{title && <div><h2>{title}</h2>{description && <p>{description}</p>}</div>}{action}</div>}
      {children}
    </section>
  );
}

function Metric({ label, value, detail, icon }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon name={icon} /></span></div><strong>{value}</strong><small>{detail}</small></article>;
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Alert({ kind, onClose, action, children }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span>{children}</span>
      <div className="alert-actions">{action}<IconButton label="Dismiss message" onClick={onClose}><Icon name="close" /></IconButton></div>
    </div>
  );
}

function LoadingState({ message = "Loading your workspace..." }) {
  return <div className="loading-state" role="status"><span className="loading-spinner" /><span>{message}</span></div>;
}

function EmptyState({ title, description }) {
  return <div className="empty-state"><span className="empty-mark"><Icon name="check" /></span><b>{title}</b><p>{description}</p></div>;
}

function WorkspaceSkeleton({ page }) {
  const skeletonRows = Array.from({ length: 6 }, (_, index) => (
    <div className="skeleton-row" key={index}>
      <span className="skeleton-block skeleton-avatar" />
      <span className="skeleton-block skeleton-cell" />
      <span className="skeleton-block skeleton-cell" />
      <span className="skeleton-block skeleton-cell short" />
    </div>
  ));
  if (page === "Leave Calendar") {
    return (
      <div className="workspace-skeleton" role="status" aria-label="Loading leave calendar">
        <p>Loading leave calendar...</p>
        <div className="skeleton-calendar">
          {Array.from({ length: 42 }, (_, index) => <span className="skeleton-block" key={index} />)}
        </div>
      </div>
    );
  }
  if (page === "Employees" || page === "Leave Records") {
    return (
      <div className="panel workspace-skeleton" role="status" aria-label={`Loading ${page.toLowerCase()}`}>
        <p>{page === "Employees" ? "Loading employee records..." : "Loading leave records..."}</p>
        <div className="skeleton-table">{skeletonRows}</div>
      </div>
    );
  }
  return (
    <div className="workspace-skeleton" role="status" aria-label={`Loading ${page.toLowerCase()}`}>
      <p>{page === "Reports" ? "Loading report data..." : "Loading dashboard data..."}</p>
      <div className="skeleton-metrics">
        {Array.from({ length: 4 }, (_, index) => <span className="skeleton-block" key={index} />)}
      </div>
      <div className="skeleton-table">{skeletonRows}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{status}</span>;
}

function Avatar({ name = "" }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className="avatar" aria-hidden="true">{initials || "?"}</span>;
}

function PeopleList({ leaves, showDate = false }) {
  return <div className="people-list">{leaves.map((leave) => (
    <div className="person-row" key={leave.id}>
      <Avatar name={leave.employee_name} />
      <div className="person-info"><b>{leave.employee_name}</b><small>{showDate ? formatDate(leave.start_date) : leave.leave_type} · {leave.start_time?.slice(0, 5)}–{leave.end_time?.slice(0, 5)}</small></div>
      <span className="person-meta">{formatHours(leave.total_hours || 0)}h</span>
    </div>
  ))}</div>;
}

function CollisionList({ collisions, emptyTitle = "No overlaps found" }) {
  if (!collisions.length) return <EmptyState title={emptyTitle} description="There are no overlapping recorded absences for this period." />;
  return <div className="collision-list">{collisions.map((collision, index) => (
    <div className="collision-row" key={`${collision.leave_id_1}-${collision.leave_id_2}-${index}`}>
      <span className="collision-marker"><Icon name="alert" /></span>
      <div><b>{collision.employee_1} <span>and</span> {collision.employee_2}</b><small>{formatDate(collision.date)} · {collision.overlap_start?.slice(0, 5)}–{collision.overlap_end?.slice(0, 5)}</small></div>
      <StatusBadge status="overlap" />
    </div>
  ))}</div>;
}

function formatDateRange(startDate, endDate) {
  return startDate === endDate
    ? formatDate(startDate)
    : `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

function PrintableReport({
  employees,
  leaves,
  collisions,
  startDate,
  endDate,
  totalHours,
  totalDays,
  generatedAt,
}) {
  const entryCount = leaves.length;
  const employeeEntryTotal = employees.reduce((sum, item) => sum + item.entries, 0);
  const employeeHourTotal = employees.reduce((sum, item) => sum + item.hours, 0);
  const employeeDayTotal = employees.reduce((sum, item) => sum + item.days, 0);
  const reconciles = entryCount === employeeEntryTotal &&
    Math.abs(totalHours - employeeHourTotal) < 0.01 &&
    Math.abs(totalDays - employeeDayTotal) < 0.01;

  return (
    <article className="print-report">
      <header className="print-report-header">
        <div className="print-brand">
          <img src="/abacus-digital-logo.png" alt="Abacus Digital" />
          <span>INTERNAL BUSINESS APPLICATION</span>
        </div>
        <div className="print-report-meta">INTERNAL · CONFIDENTIAL</div>
        <h1>Employee Leave Report</h1>
        <p className="print-report-period">{formatDateRange(startDate, endDate)}</p>
        <p className="print-generated">Generated {generatedAt.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}</p>
      </header>

      <section className="print-report-section">
        <h2>At a glance</h2>
        <div className="print-metrics">
          <div><span>Employees</span><strong>{employees.length}</strong></div>
          <div><span>Leave entries</span><strong>{entryCount}</strong></div>
          <div><span>Leave hours</span><strong>{formatHours(totalHours)}</strong></div>
          <div><span>Leave days</span><strong>{totalDays.toFixed(2)}</strong></div>
          <div><span>Collision dates</span><strong>{collisions.length}</strong></div>
        </div>
      </section>

      <section className="print-report-section">
        <h2>Employee summary</h2>
        {employees.length ? (
          <table className="print-table">
            <thead><tr><th>Employee</th><th>Code</th><th>Entries</th><th>Leave days</th><th>Leave hours</th></tr></thead>
            <tbody>
              {employees.map(({ employee, entries, hours, days }) => (
                <tr key={employee.id}>
                  <td>{employee.full_name}</td>
                  <td>{employee.employee_code}</td>
                  <td>{entries}</td>
                  <td>{days.toFixed(2)}</td>
                  <td>{formatHours(hours)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th colSpan="2">Total</th><th>{employeeEntryTotal}</th><th>{employeeDayTotal.toFixed(2)}</th><th>{formatHours(employeeHourTotal)}</th></tr>
            </tfoot>
          </table>
        ) : <p className="print-empty">No employees are available for this report.</p>}
      </section>

      <section className="print-report-section print-detail-section">
        <h2>Detailed leave records</h2>
        {leaves.length ? (
          <table className="print-table print-detail-table">
            <thead>
              <tr><th>Date(s)</th><th>Employee</th><th>Leave type</th><th>Duration / time</th><th>Days</th><th>Hours</th><th>Status</th><th>Reason / remarks</th></tr>
            </thead>
            <tbody>
              {leaves.map((leave) => (
                <tr key={leave.id}>
                  <td>{formatDateRange(leave.start_date, leave.end_date)}</td>
                  <td>{leave.employee_name}<small>{leave.employee_code}</small></td>
                  <td>{leave.leave_type}</td>
                  <td>{DURATION_LABELS[leave.duration_type] || leave.duration_type}<small>{leave.start_time?.slice(0, 5)}–{leave.end_time?.slice(0, 5)}</small></td>
                  <td>{Number(leave.total_days || 0).toFixed(2)}</td>
                  <td>{formatHours(leave.total_hours || 0)}</td>
                  <td>{leave.status}</td>
                  <td>{leave.reason || "—"}{leave.admin_remarks && <small>Admin: {leave.admin_remarks}</small>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th colSpan="4">Total</th><th>{totalDays.toFixed(2)}</th><th>{formatHours(totalHours)}</th><th colSpan="2">{leaves.length} entries</th></tr>
            </tfoot>
          </table>
        ) : <p className="print-empty">No non-cancelled leave records overlap this reporting period.</p>}
      </section>

      <section className="print-report-section">
        <h2>Collision review</h2>
        {collisions.length ? (
          <table className="print-table">
            <thead><tr><th>Date</th><th>Employee</th><th>Employee</th><th>Overlap time</th></tr></thead>
            <tbody>
              {collisions.map((collision, index) => (
                <tr key={`${collision.leave_id_1}-${collision.leave_id_2}-${collision.date}-${index}`}>
                  <td>{formatDate(collision.date)}</td>
                  <td>{collision.employee_1}</td>
                  <td>{collision.employee_2}</td>
                  <td>{collision.overlap_start?.slice(0, 5)}–{collision.overlap_end?.slice(0, 5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="print-empty">No overlapping absences were reported for this period.</p>}
      </section>

      <section className="print-methodology">
        <h2>Method and calculation notes</h2>
        <p>Included entries are non-cancelled leave records whose date range intersects the selected reporting period. Each matching legacy multi-day record contributes its complete stored hours and days; totals are not prorated to the selected dates.</p>
        <p>Employee totals reconcile with the detailed entries: {reconciles ? "verified." : "review required."} Leave days use the stored record totals. Collision rows represent employee pairs and dates reported by the collision query.</p>
      </section>
    </article>
  );
}

function LeaveTable({ leaves, onEdit, onCancel, disabled }) {
  if (!leaves.length) return <EmptyState title="No leave records found" description="Try changing your search or filters, or record leave for your team." />;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>EMPLOYEE</th><th>LEAVE TYPE</th><th>DATE</th><th>DURATION</th><th>HOURS</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {leaves.map((leave) => (
            <tr key={leave.id}>
              <td><div className="employee-name"><Avatar name={leave.employee_name} /><span><b>{leave.employee_name}</b><small className="cell-sub">{leave.employee_code}</small></span></div></td>
              <td>{leave.leave_type}</td>
              <td>{leave.start_date === leave.end_date ? formatDate(leave.start_date) : `${formatDate(leave.start_date)} – ${formatDate(leave.end_date)}`}</td>
              <td><span>{DURATION_LABELS[leave.duration_type] || leave.duration_type}</span><small className="cell-sub">{leave.start_time?.slice(0, 5)}–{leave.end_time?.slice(0, 5)}</small></td>
              <td>{formatHours(leave.total_hours || 0)}h</td>
              <td><StatusBadge status={leave.status} /></td>
              <td className="actions-cell">
                {leave.status !== "cancelled" && (
                  <>
                    {leave.start_date === leave.end_date && <Button variant="secondary" size="small" disabled={disabled} onClick={() => onEdit(leave)}>Edit</Button>}
                    <Button variant="text" size="small" disabled={disabled} onClick={() => onCancel(leave)}>Cancel</Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ title, close, children }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(close);

  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const focusable = () =>
      dialogRef.current?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ) || [];
    focusable()[0]?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="modal-heading"><h2 id="dialog-title">{title}</h2><IconButton label="Close dialog" onClick={close}><Icon name="close" /></IconButton></div>
        {children}
      </section>
    </div>
  );
}
