// Small shared presentation helpers used across the portal screens.

export function serviceIcon(service) {
  const text = `${service?.code || ''} ${service?.name || ''}`.toLowerCase();
  if (text.includes('topo')) return 'map';
  if (text.includes('subdiv') || text.includes('consolid')) return 'layers';
  if (text.includes('boundary') || text.includes('relocat')) return 'ruler';
  if (text.includes('title') || text.includes('document')) return 'file';
  if (text.includes('consult')) return 'compass';
  return 'clipboard';
}

export function projectPath(role, id) {
  if (role === 'admin') return `/admin/projects/${id}`;
  if (role === 'surveyor') return `/staff/projects/${id}`;
  return `/app/projects/${id}`;
}

export function appointmentPath(role, id) {
  if (role === 'admin') return `/admin/appointments/${id}`;
  return `/app/appointments/${id}`;
}

export function messagesPath(role, id) {
  const base = role === 'admin' ? '/admin/messages' : role === 'surveyor' ? '/staff/messages' : '/app/messages';
  return id ? `${base}/${id}` : base;
}

export function notificationsPath(role) {
  if (role === 'admin') return '/admin/notifications';
  if (role === 'surveyor') return '/staff/notifications';
  return '/app/notifications';
}

export function profilePath(role) {
  if (role === 'admin') return '/admin/profile';
  if (role === 'surveyor') return '/staff/profile';
  return '/app/profile';
}

export function docTone(status) {
  if (status === 'approved') return 'green';
  if (status === 'rejected') return 'red';
  if (status === 'superseded') return 'slate';
  if (status === 'under_review') return 'blue';
  if (status === 'submitted') return 'amber';
  return 'slate';
}

export function requirementIcon(status) {
  if (status === 'approved') return 'check';
  if (status === 'rejected') return 'alert';
  if (status === 'submitted' || status === 'under_review') return 'clock';
  return 'file';
}

export function mapsUrl(location) {
  if (!location) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
