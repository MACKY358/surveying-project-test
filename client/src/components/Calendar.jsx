// Custom month / week / day / agenda calendar. Works with touch and keyboard.
import { useMemo } from 'react';
import {
  addDaysISO,
  dateLabel,
  dateShort,
  endOfWeekISO,
  monthLabel,
  startOfMonthISO,
  startOfWeekISO,
  todayISO,
  timeShort,
  weekdayShort,
  cn,
  MONTHS,
} from '../utils.js';
import { Icon } from './Icons.jsx';
import { StatusBadge } from './ui.jsx';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function eventDate(event) {
  return event.date || String(event.start || '').slice(0, 10);
}

function eventTime(event) {
  const raw = String(event.start || '');
  const time = raw.includes('T') ? raw.slice(11, 16) : raw.slice(11, 16);
  return time || '';
}

function EventRow({ event, onClick }) {
  return (
    <button type="button" className="event-row" onClick={() => onClick && onClick(event)}>
      <span className={cn('event-bar', `event-bar--${event.color || 'green'}`)} />
      <span className="event-row__time">
        {eventTime(event) ? timeShort(eventTime(event)) : 'All day'}
        {event.end ? <span className="muted tiny" style={{ display: 'block', fontWeight: 500 }}>{timeShort(String(event.end).slice(11, 16))}</span> : null}
      </span>
      <span className="event-row__body">
        <span className="event-row__title">{event.title}</span>
        {event.subtitle ? <span className="event-row__meta">{event.subtitle}</span> : null}
        {event.location ? (
          <span className="event-row__meta" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Icon name="pin" size={11} /> {event.location}
          </span>
        ) : null}
      </span>
      {event.status ? <StatusBadge status={event.status} /> : null}
    </button>
  );
}

export default function Calendar({
  events = [],
  date = todayISO(),
  view = 'month',
  onDateChange,
  onViewChange,
  onSelectEvent,
  onSelectDate,
  hideToolbar = false,
}) {
  const today = todayISO();

  const byDate = useMemo(() => {
    const map = new Map();
    events.forEach((event) => {
      const key = eventDate(event);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    });
    map.forEach((list) => list.sort((a, b) => String(a.start).localeCompare(String(b.start))));
    return map;
  }, [events]);

  const days = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeekISO(date);
      return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
    }
    if (view === 'day') return [date];
    const start = startOfWeekISO(startOfMonthISO(date));
    return Array.from({ length: 42 }, (_, i) => addDaysISO(start, i));
  }, [date, view]);

  const shift = (amount) => {
    if (!onDateChange) return;
    if (view === 'month') {
      const d = new Date(`${startOfMonthISO(date)}T00:00:00`);
      d.setMonth(d.getMonth() + amount);
      onDateChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    } else if (view === 'week') {
      onDateChange(addDaysISO(date, amount * 7));
    } else {
      onDateChange(addDaysISO(date, amount));
    }
  };

  const title =
    view === 'month'
      ? monthLabel(date)
      : view === 'week'
        ? `${dateShort(startOfWeekISO(date))} – ${dateShort(endOfWeekISO(date))}`
        : dateLabel(date);

  const agendaDays = useMemo(() => {
    const keys = Array.from(byDate.keys()).filter((key) => key >= date).sort();
    const source = keys.length ? keys : Array.from(byDate.keys()).sort();
    return source.slice(0, 20);
  }, [byDate, date]);

  return (
    <div className="cal">
      {!hideToolbar ? (
        <div className="cal__toolbar">
          <div className="cal__title">{title}</div>
          <div className="cal__nav">
            <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Previous period" style={{ width: 36, height: 36 }}>
              <Icon name="chevronLeft" size={18} />
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => onDateChange && onDateChange(today)}>
              Today
            </button>
            <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Next period" style={{ width: 36, height: 36 }}>
              <Icon name="chevronRight" size={18} />
            </button>
          </div>
          <div className="segmented" role="group" aria-label="Calendar view">
            {['month', 'week', 'day', 'agenda'].map((option) => (
              <button
                key={option}
                type="button"
                className={view === option ? 'active' : ''}
                onClick={() => onViewChange && onViewChange(option)}
              >
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {view === 'month' ? (
        <>
          <div className="cal__weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>
          <div className="cal__grid">
            {days.map((day) => {
              const dayEvents = byDate.get(day) || [];
              const isOut = day.slice(0, 7) !== date.slice(0, 7);
              return (
                <button
                  key={day}
                  type="button"
                  className={cn('cal__day', isOut && 'out', day === today && 'today', day === date && 'sel')}
                  onClick={() => {
                    if (onDateChange) onDateChange(day);
                    if (onSelectDate) onSelectDate(day);
                  }}
                  aria-label={`${dateLabel(day)}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
                >
                  <span className="cal__daynum">{Number(day.slice(8, 10))}</span>
                  <span className="cal__dots">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span key={event.id} className={cn('cal__event-pill', `c-${event.color || 'green'}`)}>
                        {eventTime(event) ? `${timeShort(eventTime(event))} ` : ''}
                        {event.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 ? <span className="cal__more">+{dayEvents.length - 3} more</span> : null}
                  </span>
                  {!dayEvents.length && day === today ? <span className="cal__count">Today</span> : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {view === 'week' ? (
        <div className="cal__week">
          {days.map((day) => {
            const dayEvents = byDate.get(day) || [];
            return (
              <div key={day} className={cn('cal__week-col', day === today && 'is-today')}>
                <h4>
                  {weekdayShort(day)} {Number(day.slice(8, 10))}
                  {day === today ? <span className="muted tiny"> · today</span> : null}
                </h4>
                {dayEvents.length ? (
                  dayEvents.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className="event-row"
                      style={{ padding: '.4rem', marginBottom: '.35rem', display: 'block' }}
                      onClick={() => onSelectEvent && onSelectEvent(event)}
                    >
                      <span className={cn('cal__event-pill', `c-${event.color || 'green'}`)} style={{ fontSize: '.66rem' }}>
                        {eventTime(event) ? `${timeShort(eventTime(event))} · ` : ''}
                        {event.title}
                      </span>
                      {event.subtitle ? <span className="event-row__meta" style={{ display: 'block', marginTop: 2 }}>{event.subtitle}</span> : null}
                    </button>
                  ))
                ) : (
                  <p className="muted tiny" style={{ margin: 0 }}>No entries</p>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {view === 'day' ? (
        <div className="cal__list">
          {byDate.get(date)?.length ? (
            byDate.get(date).map((event) => <EventRow key={event.id} event={event} onClick={onSelectEvent} />)
          ) : (
            <div className="empty" style={{ padding: '1.6rem 1rem' }}>
              <Icon name="calendar" size={34} />
              <h3>No schedule entries</h3>
              <p>{dateLabel(date)} is clear.</p>
            </div>
          )}
        </div>
      ) : null}

      {view === 'agenda' ? (
        <div className="cal__list">
          {agendaDays.length ? (
            agendaDays.map((day) => (
              <div className="cal__list-day" key={day}>
                <h4>{dateLabel(day)}</h4>
                {(byDate.get(day) || []).map((event) => (
                  <EventRow key={event.id} event={event} onClick={onSelectEvent} />
                ))}
              </div>
            ))
          ) : (
            <div className="empty" style={{ padding: '1.6rem 1rem' }}>
              <Icon name="calendar" size={34} />
              <h3>Nothing scheduled</h3>
              <p>There are no appointments or schedule entries in this period.</p>
            </div>
          )}
        </div>
      ) : null}

      <div className="cal__toolbar" style={{ borderTop: '1px solid var(--gray-200)', borderBottom: 0, justifyContent: 'space-between' }}>
        <span className="muted tiny">
          Showing {events.length} entr{events.length === 1 ? 'y' : 'ies'} · {MONTHS[Number(date.slice(5, 7)) - 1]} {date.slice(0, 4)}
        </span>
        {onSelectDate ? (
          <span className="muted tiny">Tap a date to see the day</span>
        ) : null}
      </div>
    </div>
  );
}
