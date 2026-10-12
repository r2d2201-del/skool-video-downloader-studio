import { createClient } from '@supabase/supabase-js';
import DOMPurify from 'dompurify';
window.createCinematicCloudClient = createClient;
window.CinematicSanitize = html => DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
window.CinematicSanitizeNotes = html => DOMPurify.sanitize(html, {
  USE_PROFILES: { html: true }, ADD_ATTR: ['target'],
  FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'style', 'iframe', 'object', 'embed']
});
