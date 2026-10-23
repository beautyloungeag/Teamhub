export function mailScopes(settings: Record<string, unknown>) {
  const enabled = settings.mail_enabled === true
  return {
    enabled,
    facilityEnabled: enabled && settings.facility_mail_enabled !== false,
    eventEnabled: enabled && settings.event_mail_enabled !== false,
  }
}
