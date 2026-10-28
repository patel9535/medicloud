import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import { api } from './api.js';
import './styles.css';
import './auth.css';
import './patient.css';
import './doctors.css';
import './appointments.css';

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function localDateString() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function scheduleFormFromAvailability(availability = []) {
  return Object.fromEntries(WEEKDAYS.map((day) => {
    const slots = availability.find((entry) => entry.day === day)?.slots ?? [];
    if (!slots.length) return [day, { enabled: false, start: '09:00', end: '17:00' }];
    return [day, { enabled: true, start: slots[0], end: minutesToTime(timeToMinutes(slots.at(-1)) + 30) }];
  }));
}

function availabilityFromSchedule(schedule) {
  return WEEKDAYS.flatMap((day) => {
    const item = schedule[day];
    if (!item.enabled) return [];
    const start = timeToMinutes(item.start);
    const end = timeToMinutes(item.end);
    const slots = [];
    for (let time = start; time < end; time += 30) slots.push(minutesToTime(time));
    return [{ day, slots }];
  });
}

function Home() {
  return <main className="shell">
    <header><span className="brand-mark">M</span><span className="brand-name">MediCloud</span><span className="badge">EDUCATIONAL DEMO</span><Link className="header-link" to="/doctors">Find a doctor</Link><Link className="header-link" to="/login">Sign in</Link></header>
    <section className="hero">
      <div className="eyebrow">CARE THAT CONNECTS</div><h1>Your health, <span>in good hands.</span></h1>
      <p>Request a visit with a doctor and check your appointment status in your patient dashboard.</p>
      <Link className="primary-link" to="/register">Create a patient account <span aria-hidden="true">→</span></Link>
      <div className="hero-art" aria-hidden="true"><div className="sun"/><div className="arch"><div className="cross">+</div><div className="arch-line"/></div><div className="leaf leaf-one"/><div className="leaf leaf-two"/></div>
      <div className="hero-note"><span className="note-icon">✳</span><div><strong>Care, made clearer.</strong><small>One step at a time.</small></div></div>
    </section>
    <section className="cards" aria-label="Platform highlights">
      <article><span className="card-icon lilac">◷</span><h2>Appointments</h2><p>Plan your next visit with a care team that fits your needs.</p><span className="card-label">BOOK WITH EASE</span></article>
      <article><span className="card-icon peach">✓</span><h2>Doctor response</h2><p>See whether your request is pending, accepted, or declined.</p><span className="card-label">CLEAR STATUS</span></article>
      <article><span className="card-icon mint">✓</span><h2>In-app updates</h2><p>See when your doctor accepts or declines your request.</p><span className="card-label">STATUS IN YOUR DASHBOARD</span></article>
    </section>
    <footer>For demonstration only · Use synthetic data · <Link to="/about">About this project</Link></footer>
  </main>;
}

function AuthForm({ registering = false }) {
  const { signIn, appIdConfigured, appIdReady, appIdError } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setError(''); setBusy(true);
    try {
      const user = await signIn();
      navigate(user.role === 'PATIENT' ? '/patient' : user.role === 'DOCTOR' ? '/doctor' : '/admin');
    } catch (err) { setError(err.response?.data?.message ?? err.message ?? 'Could not connect. Check App ID and the API, then try again.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><Link className="brand-name auth-brand" to="/">← MediCloud</Link><section className="auth-card">
    <div className="eyebrow">{registering ? 'GET STARTED' : 'WELCOME BACK'}</div><h1>{registering ? 'Create your account' : 'Sign in to MediCloud'}</h1>
    <p className="auth-subtitle">Continue securely with IBM App ID. New App ID users are added as patients.</p>
    {(error || appIdError || !appIdConfigured) && <div className="form-error" role="alert">{error || appIdError || 'IBM App ID is not configured. Add its SPA client ID and discovery endpoint to frontend/.env.'}</div>}
    <button className="primary-link form-submit" onClick={submit} disabled={busy || !appIdConfigured || !appIdReady}>{busy ? 'Connecting…' : !appIdConfigured ? 'App ID setup required' : appIdReady ? 'Continue with IBM App ID' : 'Initializing App ID'} <span aria-hidden="true">→</span></button>
    <div className="auth-switch">{registering ? 'Already have an account?' : 'New to MediCloud?'} <Link to={registering ? '/login' : '/register'}>{registering ? 'Sign in' : 'Create a patient account'}</Link></div>
  </section><p className="auth-disclaimer">Educational demonstration · Never use real patient information</p></main>;
}

function ProtectedPage({ role, title, description }) {
  const { user, signOut } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) {
    const destination = user.role === 'PATIENT' ? '/patient' : user.role === 'DOCTOR' ? '/doctor' : '/admin';
    return <main className="auth-shell"><section className="auth-card"><div className="eyebrow">ACCESS RESTRICTED</div><h1>Not authorized</h1><p>Your account does not have permission to view this page.</p><Link to={destination}>Go to your dashboard</Link></section></main>;
  }
  return <main className="dashboard-shell"><header><Link className="brand-name" to="/">MediCloud</Link><button className="text-button" onClick={signOut}>Sign out</button></header><section className="dashboard-card"><div className="eyebrow">{user.role} DASHBOARD</div><h1>{title}, {user.name.split(' ')[0]}.</h1><p>{description}</p><div className="phase-note">System management features will be added in a later phase.</div></section></main>;
}

function PatientDashboard() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!user || user.role !== 'PATIENT') return undefined;
    let current = true;
    Promise.all([api.get('/patients/me'), api.get('/patients/me/dashboard')])
      .then(([profileResponse, dashboardResponse]) => {
        if (!current) return;
        setProfile(profileResponse.data.data.profile);
        setDashboard(dashboardResponse.data.data);
      })
      .catch((requestError) => { if (current) setError(requestError.response?.data?.message ?? 'Could not load your patient dashboard.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [user?.id, user?.role, reload]);

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'PATIENT') return <ProtectedPage role="PATIENT" title="Welcome" description="Patient dashboard." />;

  const displayName = profile?.name ?? user.name;
  return <main className="dashboard-shell patient-dashboard">
    <header><Link className="brand-name" to="/">MediCloud</Link><div className="patient-header"><span>{displayName}</span><button className="text-button" onClick={signOut}>Sign out</button></div></header>
    <section className="patient-welcome"><div><div className="eyebrow">PATIENT DASHBOARD</div><h1>Welcome back, {displayName.split(' ')[0]}.</h1><p>Book appointments and track your doctor's response.</p></div><span className="privacy-pill">Private patient view</span></section>
    {error && <div className="patient-alert" role="alert">{error}</div>}
    {notice && <div className="patient-notice" role="status">{notice}</div>}
    {loading ? <div className="dashboard-card patient-loading">Loading your dashboard…</div> : <div className="patient-grid">
      <section className="patient-content">
        <article className="patient-section"><div className="section-heading"><div><div className="eyebrow">YOUR SCHEDULE</div><h2>Upcoming appointments</h2></div><div className="section-actions"><Link to="/appointments">View history</Link><span className="section-count">{dashboard?.upcomingAppointments.length ?? 0}</span></div></div>
          {dashboard?.upcomingAppointments.length ? <ul className="patient-list">{dashboard.upcomingAppointments.map((item) => <li key={item.id}><span className="list-symbol appointment-symbol">◷</span><div className="list-copy"><strong>Dr. {item.doctorName}</strong><span>{item.specialization} · {new Date(`${item.date}T00:00:00`).toLocaleDateString()} at {String(item.time).slice(0, 5)}</span></div><span className={`status-tag ${item.status.toLowerCase()}`}>{item.status}</span></li>)}</ul> : <p className="empty-state">No upcoming appointments. <Link to="/doctors">Browse the doctor directory</Link>.</p>}
        </article>
        {dashboard?.recentAppointmentDecisions?.length > 0 && <article className="patient-section appointment-responses"><div className="section-heading"><div><div className="eyebrow">APPOINTMENT UPDATES</div><h2>Recent doctor responses</h2></div><Link to="/appointments">View history</Link></div><ul className="patient-list">{dashboard.recentAppointmentDecisions.map((item) => <li key={item.id}><span className="list-symbol appointment-symbol">◷</span><div className="list-copy"><strong>Dr. {item.doctorName}</strong><span>{item.specialization} · {new Date(`${item.date}T00:00:00`).toLocaleDateString()} at {String(item.time).slice(0, 5)}</span><span>{item.status === 'CONFIRMED' ? 'Your appointment was accepted.' : item.status === 'REJECTED' ? 'Your appointment request was declined. Choose another available time or doctor.' : 'Your visit is marked complete.'}</span></div><span className={`status-tag ${item.status.toLowerCase()}`}>{item.status === 'CONFIRMED' ? 'ACCEPTED' : item.status === 'REJECTED' ? 'REJECTED' : 'COMPLETED'}</span></li>)}</ul></article>}
      </section>
    </div>}
    <footer>Educational demonstration · Use synthetic data · <Link to="/about">About this project</Link></footer>
  </main>;
}

function DoctorDirectory() {
  const [specialization, setSpecialization] = useState('');
  const [search, setSearch] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    api.get('/doctors', { params: search ? { specialization: search } : {} })
      .then(({ data }) => { if (current) setDoctors(data.data.doctors); })
      .catch(() => { if (current) setError('Could not load the doctor directory. Please try again.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [search]);

  function submitSearch(event) { event.preventDefault(); setSearch(specialization.trim()); }
  return <main className="dashboard-shell directory-page">
    <header><Link className="brand-name" to="/">MediCloud</Link><div className="patient-header"><Link className="header-link" to="/login">Sign in</Link></div></header>
    <section className="directory-heading"><div className="eyebrow">CARE TEAM</div><h1>Find your doctor.</h1><p>Browse the MediCloud care team by specialization.</p></section>
    <form className="doctor-search" onSubmit={submitSearch}><label htmlFor="specialization-search">Specialization</label><input id="specialization-search" value={specialization} maxLength="80" placeholder="For example, cardiology" onChange={(event) => setSpecialization(event.target.value)} /><button className="primary-link form-submit">Search doctors <span aria-hidden="true">→</span></button></form>
    {error && <div className="patient-alert" role="alert">{error}</div>}
    {loading ? <div className="dashboard-card patient-loading">Loading doctors…</div> : doctors.length ? <section className="doctor-grid" aria-label="Doctors">{doctors.map((doctor) => <article className="doctor-card" key={doctor.id}><div className="doctor-avatar" aria-hidden="true">{doctor.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div><div className="eyebrow">{doctor.specialization}</div><h2>{doctor.name}</h2><p>{doctor.department ?? 'MediCloud Care Team'}</p><div className="doctor-experience">{doctor.experienceYears} years of experience</div><Link className="doctor-card-link" to={`/doctors/${doctor.id}`}>View profile <span aria-hidden="true">→</span></Link></article>)}</section> : <div className="directory-empty"><span className="card-icon lilac">⌕</span><h2>No doctors found</h2><p>Try a different specialization or check back later.</p></div>}
    <footer>For demonstration only · Use synthetic data · <Link to="/about">About this project</Link></footer>
  </main>;
}

function DoctorDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [doctor, setDoctor] = useState(null);
  const [error, setError] = useState('');
  const [date, setDate] = useState(localDateString());
  const [slots, setSlots] = useState([]);
  const [selectedTime, setSelectedTime] = useState('');
  const [reason, setReason] = useState('');
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingNotice, setBookingNotice] = useState('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotRefresh, setSlotRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    api.get(`/doctors/${id}`).then(({ data }) => { if (current) setDoctor(data.data.doctor); })
      .catch(() => { if (current) setError('Doctor profile could not be found.'); });
    return () => { current = false; };
  }, [id]);
  useEffect(() => {
    let current = true;
    setSlotsLoading(true); setBookingError(''); setSelectedTime('');
    api.get(`/doctors/${id}/availability`, { params: { date } })
      .then(({ data }) => { if (current) setSlots(data.data.slots); })
      .catch((requestError) => { if (current) { setSlots([]); setBookingError(requestError.response?.data?.message ?? 'Could not load available times.'); } })
      .finally(() => { if (current) setSlotsLoading(false); });
    return () => { current = false; };
  }, [date, id, slotRefresh]);

  async function bookAppointment(event) {
    event.preventDefault(); setBookingBusy(true); setBookingError(''); setBookingNotice('');
    try {
      await api.post('/appointments', { doctorId: id, date, time: selectedTime, reason });
      setBookingNotice('Appointment requested. It will appear as pending until the doctor responds.');
      setReason(''); setSelectedTime(''); setSlotRefresh((value) => value + 1);
    } catch (requestError) {
      setBookingError(requestError.response?.data?.message ?? 'Could not book this appointment.');
      setSlotRefresh((value) => value + 1);
    } finally { setBookingBusy(false); }
  }

  const today = localDateString();
  return <main className="dashboard-shell directory-page"><header><Link className="brand-name" to="/">MediCloud</Link><Link className="header-link" to="/doctors">Doctor directory</Link></header>
    {error ? <div className="directory-empty"><h1>Profile unavailable</h1><p>{error}</p><Link to="/doctors">Return to directory</Link></div> : !doctor ? <div className="dashboard-card patient-loading">Loading profile…</div> : <section className="doctor-detail-card"><div className="doctor-avatar doctor-avatar-large">{doctor.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div><div className="eyebrow">{doctor.specialization}</div><h1>{doctor.name}</h1><p>{doctor.department ?? 'MediCloud Care Team'} · {doctor.experienceYears} years of experience</p><h2>Weekly availability</h2>{Array.isArray(doctor.availability) && doctor.availability.length ? <ul className="availability-list">{doctor.availability.map((schedule) => <li key={schedule.day}>{schedule.day}: {schedule.slots.join(', ')}</li>)}</ul> : <p>Availability will appear here when the doctor publishes a schedule.</p>}
      <div className="booking-panel"><div className="eyebrow">REQUEST A VISIT</div><h2>Choose a time</h2>{user?.role === 'PATIENT' ? <form onSubmit={bookAppointment} className="booking-form"><label>Date<input type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} required /></label><div className="slot-picker"><span className="form-label">Available times</span>{slotsLoading ? <p className="empty-state">Checking availability…</p> : slots.length ? <div className="slot-options">{slots.map((slot) => <button type="button" className={`slot-option ${selectedTime === slot ? 'selected' : ''}`} key={slot} onClick={() => setSelectedTime(slot)}>{slot}</button>)}</div> : <p className="empty-state">No times are available for this date.</p>}</div><label>Reason for visit <span className="optional-label">Optional</span><textarea rows="2" maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="A short note for the care team" /></label>{bookingError && <div className="patient-alert" role="alert">{bookingError}</div>}{bookingNotice && <div className="patient-notice" role="status">{bookingNotice}</div>}<button className="primary-link form-submit" disabled={!selectedTime || slotsLoading || bookingBusy}>{bookingBusy ? 'Requesting…' : 'Request appointment'} <span aria-hidden="true">→</span></button></form> : <div className="booking-sign-in"><p>Sign in with a patient account to request an appointment.</p><Link className="primary-link" to="/login">Sign in <span aria-hidden="true">→</span></Link></div>}</div>
    </section>}
  </main>;
}

function PatientAppointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!user || user.role !== 'PATIENT') return undefined;
    let current = true;
    api.get('/appointments').then(({ data }) => { if (current) setAppointments(data.data.appointments); })
      .catch((requestError) => { if (current) setError(requestError.response?.data?.message ?? 'Could not load appointment history.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [user?.id, user?.role, reload]);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'PATIENT') return <Navigate to={user.role === 'DOCTOR' ? '/doctor' : '/admin'} replace />;

  return <main className="dashboard-shell directory-page"><header><Link className="brand-name" to="/">MediCloud</Link><Link className="header-link" to="/patient">Back to dashboard</Link></header><section className="directory-heading"><div className="eyebrow">PATIENT ACCOUNT</div><h1>Appointment history.</h1><p>Review past and upcoming visits. CONFIRMED means accepted; REJECTED means the doctor declined the request; PENDING is waiting for a response.</p></section>
    {error && <div className="patient-alert" role="alert">{error}</div>}
    {loading ? <div className="dashboard-card patient-loading">Loading appointments…</div> : appointments.length ? <section className="patient-section appointment-history"><ul className="patient-list">{appointments.map((item) => <li key={item.id}><span className="list-symbol appointment-symbol">◷</span><div className="list-copy"><strong>Dr. {item.doctorName}</strong><span>{item.specialization} · {new Date(`${item.date}T00:00:00`).toLocaleDateString()} at {String(item.time).slice(0, 5)}</span>{item.reason && <span>Reason: {item.reason}</span>}</div><span className={`status-tag ${item.status.toLowerCase()}`}>{item.status}</span></li>)}</ul></section> : <div className="directory-empty"><span className="card-icon lilac">◷</span><h2>No appointments yet</h2><p>Browse the doctor directory to request a visit.</p><Link to="/doctors">Find a doctor</Link></div>}
  </main>;
}

function DoctorWorkspace() {
  const { user, signOut } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [schedule, setSchedule] = useState(() => scheduleFormFromAvailability());
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [busyAppointment, setBusyAppointment] = useState('');
  useEffect(() => {
    if (!user || user.role !== 'DOCTOR') return undefined;
    let current = true;
    const refreshTimer = setInterval(() => setReload((value) => value + 1), 60_000);
    api.get('/doctors/me/dashboard').then(({ data }) => {
      if (current) {
        setDashboard(data.data);
        setSchedule(scheduleFormFromAvailability(data.data.doctorAvailability));
      }
    })
      .catch((requestError) => { if (current) setError(requestError.response?.data?.message ?? 'Could not load the doctor workspace.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; clearInterval(refreshTimer); };
  }, [user?.id, user?.role, reload]);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'DOCTOR') return <ProtectedPage role="DOCTOR" title="Welcome" description="Doctor workspace." />;

  function updateSchedule(day, field, value) {
    setSchedule((previous) => ({ ...previous, [day]: { ...previous[day], [field]: value } }));
  }

  async function saveAvailability(event) {
    event.preventDefault(); setError(''); setNotice(''); setScheduleSaving(true);
    const availability = availabilityFromSchedule(schedule);
    if (availability.some((entry) => !entry.slots.length) || availability.some((entry) => entry.slots.length > 32)) {
      setError('Each enabled day needs a start time before its end time, with no more than 32 half-hour slots.');
      setScheduleSaving(false); return;
    }
    try {
      const { data } = await api.put('/doctors/me/availability', { availability });
      setDashboard((current) => ({ ...current, doctorAvailability: data.data.availability }));
      setNotice('Your availability has been published.');
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? 'Could not update availability.');
    } finally { setScheduleSaving(false); }
  }

  async function changeAppointmentStatus(id, status) {
    setBusyAppointment(id); setError(''); setNotice('');
    try {
      await api.patch(`/appointments/${id}/status`, { status });
      setNotice(status === 'CONFIRMED'
        ? 'Appointment accepted. The patient can see the update in their dashboard.'
        : `Appointment ${status.toLowerCase()}.`);
      setReload((value) => value + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? 'Could not update this appointment.');
    } finally { setBusyAppointment(''); }
  }

  return <main className="dashboard-shell doctor-workspace"><header><Link className="brand-name" to="/">MediCloud</Link><div className="patient-header"><span>{user.name}</span><button className="text-button" onClick={signOut}>Sign out</button></div></header>
    <section className="directory-heading"><div className="eyebrow">DOCTOR WORKSPACE</div><h1>Good day, Dr. {user.name.split(' ').at(-1)}.</h1><p>Your assigned schedule at a glance.</p></section>
    {error && <div className="patient-alert" role="alert">{error}</div>}
    {notice && <div className="patient-notice" role="status">{notice}</div>}
    {loading ? <div className="dashboard-card patient-loading">Loading your appointments…</div> : dashboard && <>
      <section className="doctor-metrics"><article><span>Today</span><strong>{dashboard.todayCount}</strong><small>appointments</small></article><article><span>Upcoming</span><strong>{dashboard.upcomingCount}</strong><small>appointments</small></article></section>
      <section className="doctor-workspace-grid">
        <div className="patient-section doctor-appointments"><div className="section-heading"><div><div className="eyebrow">YOUR SCHEDULE</div><h2>Appointment requests</h2></div></div>{dashboard.upcomingAppointments.length ? <ul className="patient-list">{dashboard.upcomingAppointments.map((item) => <li key={item.id}><span className="list-symbol appointment-symbol">◷</span><div className="list-copy"><strong>{item.patientName}</strong><span>{new Date(`${item.date}T00:00:00`).toLocaleDateString()} at {String(item.time).slice(0, 5)}</span></div><span className={`status-tag ${item.status.toLowerCase()}`}>{item.status}</span><div className="appointment-actions">{item.status === 'PENDING' && <><button disabled={busyAppointment === item.id} onClick={() => changeAppointmentStatus(item.id, 'CONFIRMED')}>Accept</button><button className="reject-action" disabled={busyAppointment === item.id} onClick={() => changeAppointmentStatus(item.id, 'REJECTED')}>Reject</button></>}</div></li>)}</ul> : <p className="empty-state">No appointment requests are assigned to you yet.</p>}</div>
        <form className="doctor-schedule-card" onSubmit={saveAvailability}><div className="eyebrow">PUBLISH YOUR HOURS</div><h2>Weekly availability</h2><p>Each selected time becomes a 30-minute appointment slot. The end time is exclusive.</p><div className="schedule-days">{WEEKDAYS.map((day) => <div className={`schedule-day ${schedule[day].enabled ? 'enabled' : ''}`} key={day}><label className="day-toggle"><input type="checkbox" checked={schedule[day].enabled} onChange={(event) => updateSchedule(day, 'enabled', event.target.checked)} /><span>{day.slice(0, 3)}</span></label>{schedule[day].enabled && <div className="schedule-time-fields"><label>From<input type="time" step="1800" value={schedule[day].start} onChange={(event) => updateSchedule(day, 'start', event.target.value)} required /></label><label>Until<input type="time" step="1800" value={schedule[day].end} onChange={(event) => updateSchedule(day, 'end', event.target.value)} required /></label></div>}</div>)}</div><button className="primary-link form-submit" disabled={scheduleSaving}>{scheduleSaving ? 'Publishing…' : 'Save availability'} <span aria-hidden="true">→</span></button></form>
      </section>
    </>}
  </main>;
}

function About() {
  return <main className="shell about"><header><Link className="brand-name" to="/">← MediCloud</Link></header><div className="eyebrow">ABOUT THE PROJECT</div><h1>Care, connected.</h1><p>MediCloud is an educational demonstration of a secure, cloud-native hospital appointments and medical records platform. It is not a medical service.</p><Link className="primary-link" to="/">Back to home <span aria-hidden="true">→</span></Link></main>;
}

function App() {
  return <AuthProvider><BrowserRouter><Routes>
    <Route path="/" element={<Home />} /><Route path="/about" element={<About />} />
    <Route path="/login" element={<AuthForm />} /><Route path="/register" element={<AuthForm registering />} />
    <Route path="/patient" element={<PatientDashboard />} />
    <Route path="/appointments" element={<PatientAppointments />} />
    <Route path="/doctors" element={<DoctorDirectory />} />
    <Route path="/doctors/:id" element={<DoctorDetails />} />
    <Route path="/doctor" element={<DoctorWorkspace />} />
    <Route path="/admin" element={<ProtectedPage role="ADMIN" title="Welcome" description="Your administrator account is ready." />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter></AuthProvider>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
