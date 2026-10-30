import { createClient } from '@supabase/supabase-js';

const url = 'https://fqznaoiwainliizszcsd.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxem5hb2l3YWlubGlpenN6Y3NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0Njk1MjcsImV4cCI6MjEwNzA0NTUyN30.M_1o2k1_78GP_-OYXGIheGFuOkwndzuOU_hUNHPE0po';

const client = createClient(url, anonKey);

async function inspectMarketing() {
  const tables = [
    'marketing_members',
    'marketing_attendance',
    'marketing_breaks',
    'marketing_tasks',
    'marketing_content_posts',
    'marketing_daily_reports',
    'marketing_company_settings'
  ];

  for (const t of tables) {
    const { data, error } = await client.from(t).select('*').limit(2);
    if (error) {
      console.log(`Error querying ${t}:`, error.message);
    } else {
      console.log(`Table ${t} rows:`, data.length);
      if (data.length > 0) {
        console.log(`Sample row in ${t}:`, Object.keys(data[0]));
      } else {
        console.log(`Table ${t} is empty`);
      }
    }
  }
}

inspectMarketing();
