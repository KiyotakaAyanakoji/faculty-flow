import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { AcademicEvent, EventCategory, EligibleFaculty } from '../types/event';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Video,
  Plus,
  Users,
  FileText,
  Download,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  UploadCloud,
  X,
  List,
  CalendarDays,
  Tag,
  Building,
} from 'lucide-react';

const CATEGORIES: EventCategory[] = [
  'Exam',
  'Meeting',
  'Holiday',
  'Submission',
  'Conference',
  'Workshop',
];

const CATEGORY_COLORS: Record<EventCategory, { bg: string; text: string; border: string }> = {
  Exam: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' },
  Meeting: { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' },
  Holiday: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' },
  Submission: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' },
  Conference: { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' },
  Workshop: { bg: 'rgba(236, 72, 153, 0.15)', text: '#f472b6', border: 'rgba(236, 72, 153, 0.3)' },
};

// Indian date formatting: "22 October 2026"
export function formatIndianDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

// Indian time formatting: "10:30 AM"
export function formatIndianTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

export const CalendarManagementView: React.FC = () => {
  const { user } = useAuth();

  const [events, setEvents] = useState<AcademicEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // View mode: 'calendar' or 'list'
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [selectedEvent, setSelectedEvent] = useState<AcademicEvent | null>(null);
  const [eligibleFaculty, setEligibleFaculty] = useState<EligibleFaculty[]>([]);

  // Create Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState<EventCategory>('Meeting');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formIsAllDay, setFormIsAllDay] = useState(false);
  const [formLocation, setFormLocation] = useState('');
  const [formMeetingLink, setFormMeetingLink] = useState('');
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<number[]>([]);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Upload PDF State in Details Modal
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Can user create events? HOD, Professor, System Admin
  const canCreate = user?.role === 'HOD' || user?.role === 'PROFESSOR' || user?.role === 'SYSTEM_ADMIN';

  // Fetch Events
  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }

      const res = await fetch(`/api/events?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch academic events');
      }

      const data = await res.json();
      setEvents(data.events || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while loading events');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  // Fetch Eligible Faculty
  const fetchEligibleFaculty = useCallback(async () => {
    try {
      const res = await fetch('/api/events/eligible-participants', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setEligibleFaculty(data.faculty || []);
      }
    } catch (err) {
      console.error('Failed to load eligible participants', err);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    fetchEligibleFaculty();
  }, [fetchEvents, fetchEligibleFaculty]);

  // Fetch full details of an event
  const openEventDetails = async (event: AcademicEvent) => {
    try {
      setSelectedEvent(event);
      setUploadError(null);
      setUploadFile(null);

      const res = await fetch(`/api/events/${event.id}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (res.ok) {
        const detailed = await res.json();
        setSelectedEvent(detailed);
      }
    } catch (err) {
      console.error('Failed to load event details', err);
    }
  };

  // Handle Create Event Submission
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formTitle.trim()) {
      setFormError('Please enter an event title');
      return;
    }
    if (!formStartTime || !formEndTime) {
      setFormError('Start and end date/times are required');
      return;
    }

    const start = new Date(formStartTime).getTime();
    const end = new Date(formEndTime).getTime();
    if (end < start) {
      setFormError('End time cannot be earlier than start time');
      return;
    }

    try {
      setFormSubmitting(true);
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          category: formCategory,
          startTime: new Date(formStartTime).toISOString(),
          endTime: new Date(formEndTime).toISOString(),
          isAllDay: formIsAllDay,
          location: formLocation.trim() || null,
          meetingLink: formMeetingLink.trim() || null,
          participantIds: selectedParticipantIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create academic event');
      }

      setSuccessMessage('Academic event created successfully');
      setIsCreateModalOpen(false);
      resetForm();
      fetchEvents();

      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'Error creating event');
    } finally {
      setFormSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormCategory('Meeting');
    setFormStartTime('');
    setFormEndTime('');
    setFormIsAllDay(false);
    setFormLocation('');
    setFormMeetingLink('');
    setSelectedParticipantIds([]);
    setFormError(null);
  };

  // Handle Event Deletion
  const handleDeleteEvent = async (eventId: number) => {
    if (!window.confirm('Are you sure you want to delete this academic event? All attached documents will be removed.')) {
      return;
    }

    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete event');
      }

      setSuccessMessage('Academic event deleted successfully');
      setSelectedEvent(null);
      fetchEvents();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Failed to delete event');
    }
  };

  // Handle Secure PDF Upload
  const handlePdfUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent || !uploadFile) {
      setUploadError('Please select a PDF document to upload');
      return;
    }

    if (uploadFile.size > 10 * 1024 * 1024) {
      setUploadError('File size exceeds the 10 MB limit');
      return;
    }

    if (!uploadFile.name.toLowerCase().endsWith('.pdf') && uploadFile.type !== 'application/pdf') {
      setUploadError('Only PDF files are accepted');
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);

      const formData = new FormData();
      formData.append('file', uploadFile);

      const res = await fetch(`/api/events/${selectedEvent.id}/documents`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to upload PDF');
      }

      setSuccessMessage('PDF document attached successfully');
      setUploadFile(null);
      // Reload event details
      openEventDetails(selectedEvent);
      fetchEvents();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Handle Document Download
  const handleDownload = async (docId: number, originalName: string) => {
    if (!selectedEvent) return;

    try {
      const res = await fetch(`/api/events/${selectedEvent.id}/documents/${docId}/download`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to download document');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = originalName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Download failed');
    }
  };

  // Handle Document Deletion
  const handleDeleteDocument = async (docId: number) => {
    if (!selectedEvent) return;
    if (!window.confirm('Delete this attached document?')) return;

    try {
      const res = await fetch(`/api/events/${selectedEvent.id}/documents/${docId}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete document');
      }

      openEventDetails(selectedEvent);
      fetchEvents();
    } catch (err: any) {
      alert(err.message || 'Failed to delete document');
    }
  };

  // Calendar Grid Calculations
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days = [];
    // Padding before 1st of month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    // Days of month
    for (let d = 1; d <= totalDays; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }, [currentMonth]);

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const todayMonth = () => {
    setCurrentMonth(new Date());
  };

  // Filter events for calendar day
  const getEventsForDay = (date: Date) => {
    const dateStr = date.toISOString().slice(0, 10);
    return events.filter(e => {
      const eventStartStr = new Date(e.startTime).toISOString().slice(0, 10);
      const eventEndStr = new Date(e.endTime).toISOString().slice(0, 10);
      return dateStr >= eventStartStr && dateStr <= eventEndStr;
    });
  };

  return (
    <div className="calendar-view-container">
      {/* Header & Controls */}
      <div className="view-header">
        <div>
          <h2>Academic Calendar & Events</h2>
          <p className="subtitle">
            Institutional examinations, faculty meetings, academic deadlines, and secure documents
          </p>
        </div>

        <div className="view-header-actions">
          {canCreate && (
            <button
              id="btn-schedule-event"
              className="btn btn-primary"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus size={16} /> Schedule Academic Event
            </button>
          )}
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="alert-banner success">
          <CheckCircle size={18} /> {successMessage}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="alert-banner error">
          <AlertCircle size={18} /> {error}
          <button className="btn btn-sm btn-secondary" onClick={fetchEvents} style={{ marginLeft: 'auto' }}>
            Retry
          </button>
        </div>
      )}

      {/* Filter and View Switcher Bar */}
      <div className="calendar-controls-bar">
        {/* Category Pills */}
        <div className="category-pills">
          <button
            className={`pill-btn ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            All Events
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`pill-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              <span
                className="category-dot"
                style={{ backgroundColor: CATEGORY_COLORS[cat].text }}
              />
              {cat}
            </button>
          ))}
        </div>

        {/* Search & View Mode Switcher */}
        <div className="calendar-toolbar-right">
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search title, location..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="view-mode-toggle">
            <button
              className={`mode-btn ${viewMode === 'calendar' ? 'active' : ''}`}
              onClick={() => setViewMode('calendar')}
              title="Calendar Grid View"
            >
              <CalendarDays size={16} />
            </button>
            <button
              className={`mode-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="loading-state-container">
          <div className="spinner" />
          <p>Loading academic events and schedule...</p>
        </div>
      ) : viewMode === 'calendar' ? (
        <div className="calendar-grid-card">
          {/* Calendar Month Navigation */}
          <div className="calendar-month-header">
            <h3>
              {currentMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="month-nav-btns">
              <button className="btn btn-sm btn-secondary" onClick={prevMonth}>
                <ChevronLeft size={16} /> Prev
              </button>
              <button className="btn btn-sm btn-secondary" onClick={todayMonth}>
                Today
              </button>
              <button className="btn btn-sm btn-secondary" onClick={nextMonth}>
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="calendar-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="weekday-label">
                {d}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="calendar-days-grid">
            {calendarDays.map((day, idx) => {
              if (!day) {
                return <div key={`empty-${idx}`} className="calendar-day-cell empty" />;
              }

              const isToday =
                new Date().toISOString().slice(0, 10) === day.toISOString().slice(0, 10);
              const dayEvents = getEventsForDay(day);

              return (
                <div
                  key={day.toISOString()}
                  className={`calendar-day-cell ${isToday ? 'today' : ''}`}
                >
                  <div className="day-number">{day.getDate()}</div>
                  <div className="day-events-list">
                    {dayEvents.map(e => {
                      const color = CATEGORY_COLORS[e.category] || CATEGORY_COLORS.Meeting;
                      return (
                        <div
                          key={e.id}
                          className="calendar-event-chip"
                          style={{
                            backgroundColor: color.bg,
                            color: color.text,
                            borderColor: color.border,
                          }}
                          onClick={() => openEventDetails(e)}
                          title={`${e.title} (${e.category})`}
                        >
                          <span className="chip-time">{formatIndianTime(e.startTime)}</span>
                          <span className="chip-title">{e.title}</span>
                          {e.documentCount && e.documentCount > 0 ? (
                            <FileText size={11} className="chip-icon" />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* List View */
        <div className="events-list-container">
          {events.length === 0 ? (
            <div className="empty-state-box">
              <CalendarIcon size={44} className="empty-icon" />
              <h3>No Academic Events Scheduled</h3>
              <p>No events match the selected criteria or current department schedule.</p>
              {canCreate && (
                <button
                  className="btn btn-primary"
                  onClick={() => setIsCreateModalOpen(true)}
                  style={{ marginTop: '1rem' }}
                >
                  <Plus size={16} /> Create First Event
                </button>
              )}
            </div>
          ) : (
            <div className="events-cards-grid">
              {events.map(event => {
                const color = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.Meeting;
                return (
                  <div
                    key={event.id}
                    className="event-card"
                    onClick={() => openEventDetails(event)}
                  >
                    <div className="event-card-header">
                      <span
                        className="badge category-badge"
                        style={{
                          backgroundColor: color.bg,
                          color: color.text,
                          border: `1px solid ${color.border}`,
                        }}
                      >
                        <Tag size={12} /> {event.category}
                      </span>
                      {event.isAllDay ? (
                        <span className="badge neutral">All Day</span>
                      ) : (
                        <span className="badge secondary">
                          <Clock size={12} /> {formatIndianTime(event.startTime)}
                        </span>
                      )}
                    </div>

                    <h4 className="event-card-title">{event.title}</h4>
                    {event.description && (
                      <p className="event-card-desc">{event.description}</p>
                    )}

                    <div className="event-card-meta">
                      <div className="meta-item">
                        <CalendarIcon size={14} />
                        <span>{formatIndianDate(event.startTime)}</span>
                      </div>
                      {event.location && (
                        <div className="meta-item">
                          <MapPin size={14} />
                          <span>{event.location}</span>
                        </div>
                      )}
                      {event.meetingLink && (
                        <div className="meta-item">
                          <Video size={14} />
                          <span className="meta-link">Virtual Meeting</span>
                        </div>
                      )}
                    </div>

                    <div className="event-card-footer">
                      <div className="footer-left">
                        {event.departmentName ? (
                          <span className="dept-tag">
                            <Building size={12} /> {event.departmentName}
                          </span>
                        ) : (
                          <span className="dept-tag institutional">Institute-Wide</span>
                        )}
                      </div>

                      <div className="footer-right">
                        {event.participantCount !== undefined && event.participantCount > 0 && (
                          <span className="attendee-count">
                            <Users size={12} /> {event.participantCount}
                          </span>
                        )}
                        {event.documentCount !== undefined && event.documentCount > 0 && (
                          <span className="doc-count">
                            <FileText size={12} /> {event.documentCount} PDF
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create Event Modal */}
      {isCreateModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-card wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Schedule Academic Event</h3>
              <button
                className="btn-icon-close"
                onClick={() => setIsCreateModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="alert-banner error" style={{ margin: '1rem' }}>
                <AlertCircle size={16} /> {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="modal-form">
              <div className="form-group">
                <label htmlFor="event-title">Event Title *</label>
                <input
                  id="event-title"
                  type="text"
                  required
                  placeholder="e.g. End Semester Operating Systems Exam"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  className="form-control"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="event-category">Category *</label>
                  <select
                    id="event-category"
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value as EventCategory)}
                    className="form-control"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group checkbox-group">
                  <label htmlFor="event-allday" className="checkbox-label">
                    <input
                      id="event-allday"
                      type="checkbox"
                      checked={formIsAllDay}
                      onChange={e => setFormIsAllDay(e.target.checked)}
                    />
                    <span>All-Day Event</span>
                  </label>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="event-start">Start Date & Time (IST) *</label>
                  <input
                    id="event-start"
                    type="datetime-local"
                    required
                    value={formStartTime}
                    onChange={e => setFormStartTime(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="event-end">End Date & Time (IST) *</label>
                  <input
                    id="event-end"
                    type="datetime-local"
                    required
                    value={formEndTime}
                    onChange={e => setFormEndTime(e.target.value)}
                    className="form-control"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="event-location">Location / Classroom</label>
                  <input
                    id="event-location"
                    type="text"
                    placeholder="e.g. Hall 402 or Main Auditorium"
                    value={formLocation}
                    onChange={e => setFormLocation(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="event-link">Online Meeting Link (Optional)</label>
                  <input
                    id="event-link"
                    type="url"
                    placeholder="https://meet.google.com/..."
                    value={formMeetingLink}
                    onChange={e => setFormMeetingLink(e.target.value)}
                    className="form-control"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="event-desc">Description & Agenda</label>
                <textarea
                  id="event-desc"
                  rows={3}
                  placeholder="Provide context, required preparation, or guidelines..."
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="form-control"
                />
              </div>

              {/* Faculty Participants Selector */}
              <div className="form-group">
                <label>Department Attendees / Faculty Participants</label>
                <p className="form-help-text">
                  Select faculty members from your department to invite to this academic event
                </p>
                <div className="participant-selector-box">
                  {eligibleFaculty.map(f => {
                    const isSelected = selectedParticipantIds.includes(f.id);
                    return (
                      <label key={f.id} className={`participant-checkbox-item ${isSelected ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedParticipantIds([...selectedParticipantIds, f.id]);
                            } else {
                              setSelectedParticipantIds(
                                selectedParticipantIds.filter(id => id !== f.id)
                              );
                            }
                          }}
                        />
                        <div className="participant-info">
                          <span className="p-name">{f.fullName}</span>
                          <span className="p-role">{f.role}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={formSubmitting}
                >
                  {formSubmitting ? 'Creating Event...' : 'Create Academic Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event Details & PDF Upload Modal */}
      {selectedEvent && (
        <div className="modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="modal-card wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-with-badge">
                <span
                  className="badge category-badge"
                  style={{
                    backgroundColor: (CATEGORY_COLORS[selectedEvent.category] || CATEGORY_COLORS.Meeting).bg,
                    color: (CATEGORY_COLORS[selectedEvent.category] || CATEGORY_COLORS.Meeting).text,
                  }}
                >
                  {selectedEvent.category}
                </span>
                <h3>{selectedEvent.title}</h3>
              </div>
              <button className="btn-icon-close" onClick={() => setSelectedEvent(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="event-details-body">
              {/* Date & Location Highlights */}
              <div className="event-info-strip">
                <div className="info-item">
                  <CalendarIcon size={16} />
                  <div>
                    <strong>Date</strong>
                    <span>{formatIndianDate(selectedEvent.startTime)}</span>
                  </div>
                </div>

                <div className="info-item">
                  <Clock size={16} />
                  <div>
                    <strong>Time</strong>
                    <span>
                      {selectedEvent.isAllDay
                        ? 'All Day'
                        : `${formatIndianTime(selectedEvent.startTime)} – ${formatIndianTime(selectedEvent.endTime)}`}
                    </span>
                  </div>
                </div>

                {selectedEvent.location && (
                  <div className="info-item">
                    <MapPin size={16} />
                    <div>
                      <strong>Location</strong>
                      <span>{selectedEvent.location}</span>
                    </div>
                  </div>
                )}

                {selectedEvent.meetingLink && (
                  <div className="info-item">
                    <Video size={16} />
                    <div>
                      <strong>Virtual Link</strong>
                      <a
                        href={selectedEvent.meetingLink}
                        target="_blank"
                        rel="noreferrer"
                        className="external-link"
                      >
                        Join Meeting
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {selectedEvent.description && (
                <div className="event-desc-section">
                  <h5>Description & Details</h5>
                  <p>{selectedEvent.description}</p>
                </div>
              )}

              {/* Participants Section */}
              <div className="event-participants-section">
                <h5>Faculty Attendees ({selectedEvent.participants?.length || 0})</h5>
                {selectedEvent.participants && selectedEvent.participants.length > 0 ? (
                  <div className="participants-chips">
                    {selectedEvent.participants.map(p => (
                      <div key={p.id} className="participant-chip">
                        <Users size={12} />
                        <span className="p-chip-name">{p.userName || p.userEmail}</span>
                        <span className="p-chip-status">{p.status}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-subtext">No attendees explicitly registered</p>
                )}
              </div>

              {/* Secure PDF Documents Section */}
              <div className="event-documents-section">
                <div className="docs-header">
                  <h5>Attached PDF Documents ({selectedEvent.documents?.length || 0})</h5>
                  <span className="file-limit-note">Maximum file size: 10 MB (PDF only)</span>
                </div>

                {/* Document List */}
                {selectedEvent.documents && selectedEvent.documents.length > 0 ? (
                  <div className="documents-list">
                    {selectedEvent.documents.map(doc => (
                      <div key={doc.id} className="document-item">
                        <div className="doc-icon">
                          <FileText size={20} color="#f87171" />
                        </div>
                        <div className="doc-meta">
                          <span className="doc-name">{doc.originalName}</span>
                          <span className="doc-size">
                            {(doc.fileSize / 1024).toFixed(1)} KB • Uploaded by {doc.uploaderName || 'Faculty'}
                          </span>
                        </div>

                        <div className="doc-actions">
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleDownload(doc.id, doc.originalName)}
                            title="Download Secure PDF"
                          >
                            <Download size={14} /> Download
                          </button>

                          {(user?.id === doc.uploaderId ||
                            user?.id === selectedEvent.creatorId ||
                            user?.role === 'HOD') && (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleDeleteDocument(doc.id)}
                              title="Delete Document"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-subtext">No PDF documents attached yet.</p>
                )}

                {/* Upload Form */}
                <form onSubmit={handlePdfUpload} className="pdf-upload-box">
                  {uploadError && (
                    <div className="alert-banner error" style={{ marginBottom: '0.75rem' }}>
                      <AlertCircle size={15} /> {uploadError}
                    </div>
                  )}

                  <div className="upload-input-row">
                    <label className="file-input-label">
                      <UploadCloud size={16} />
                      <span>{uploadFile ? uploadFile.name : 'Select PDF Document (Max 10 MB)'}</span>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={e => {
                          if (e.target.files && e.target.files[0]) {
                            setUploadFile(e.target.files[0]);
                            setUploadError(null);
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>

                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={!uploadFile || uploading}
                    >
                      {uploading ? 'Validating & Uploading...' : 'Upload PDF'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Modal Footer Actions */}
              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                {(user?.id === selectedEvent.creatorId ||
                  user?.role === 'HOD' ||
                  user?.role === 'SYSTEM_ADMIN') && (
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDeleteEvent(selectedEvent.id)}
                  >
                    <Trash2 size={15} /> Delete Event
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelectedEvent(null)}
                  style={{ marginLeft: 'auto' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
