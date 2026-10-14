// Import this first in a test that depends on local-day boundaries. Mexico
// City is UTC-6 all year (no DST), so local days never match UTC days.
process.env.TZ = 'America/Mexico_City';
