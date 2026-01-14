
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://urohufpnorwbntpdmjuo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyb2h1ZnBub3J3Ym50cGRtanVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NzY1ODksImV4cCI6MjA4MzU1MjU4OX0.pUcIwhBFJSRBDhDsQ_jNb2YMmab1VwtUrXVzyScCorw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
